CREATE OR REPLACE FUNCTION public.conciliar_transacao_atomica(p_transacao_id uuid, p_lancamento_ids uuid[], p_tipo_diferenca text DEFAULT NULL::text, p_justificativa text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := public.current_user_role();
  v_tx public.transacoes_banco;
  v_group_id uuid := gen_random_uuid();
  v_link_ids uuid[];
  v_requested_ids uuid[];
  v_existing_ids uuid[];
  v_existing_group_id uuid;
  v_count integer;
  v_difference_cents bigint;
  v_valor_lancamentos_cents bigint;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('master', 'gerente', 'colaborador') THEN RAISE EXCEPTION 'Perfil não autorizado a conciliar'; END IF;
  IF p_transacao_id IS NULL THEN RAISE EXCEPTION 'Transação bancária é obrigatória'; END IF;
  IF p_lancamento_ids IS NULL OR cardinality(p_lancamento_ids) = 0 THEN RAISE EXCEPTION 'Selecione ao menos um lançamento'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_lancamento_ids) AS selected(id) WHERE selected.id IS NULL) THEN RAISE EXCEPTION 'A lista de lançamentos contém identificador inválido'; END IF;
  SELECT COUNT(*) INTO v_count FROM unnest(p_lancamento_ids) AS selected(id);
  IF v_count <> (SELECT COUNT(DISTINCT selected.id) FROM unnest(p_lancamento_ids) AS selected(id)) THEN RAISE EXCEPTION 'O mesmo lançamento foi selecionado mais de uma vez'; END IF;
  v_requested_ids := ARRAY(SELECT selected.id FROM unnest(p_lancamento_ids) AS selected(id) ORDER BY selected.id);

  SELECT * INTO v_tx FROM public.transacoes_banco WHERE id = p_transacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transação bancária não encontrada'; END IF;

  SELECT ARRAY_AGG(c.lancamento_id ORDER BY c.lancamento_id), (array_agg(c.grupo_conciliacao_id ORDER BY c.grupo_conciliacao_id))[1]
  INTO v_existing_ids, v_existing_group_id
  FROM public.conciliacoes c WHERE c.transacao_banco_id = p_transacao_id;
  IF v_existing_ids IS NOT NULL THEN
    IF v_existing_ids = v_requested_ids THEN
      RETURN jsonb_build_object(
        'grupo_conciliacao_id', v_existing_group_id,
        'conciliacoes', (SELECT jsonb_agg(to_jsonb(c)) FROM public.conciliacoes c WHERE c.transacao_banco_id = p_transacao_id),
        'diferenca_centavos', COALESCE((SELECT ROUND(SUM(d.valor_diferenca) * 100)::bigint FROM public.diferencas_financeiras d JOIN public.conciliacoes c ON c.id = d.conciliacao_id WHERE c.transacao_banco_id = p_transacao_id), 0),
        'lancamentos_iniciados', 0
      );
    END IF;
    RAISE EXCEPTION 'A transação bancária já possui vínculo com outro conjunto de lançamentos';
  END IF;
  IF COALESCE(v_tx.status_conciliacao, false) THEN RAISE EXCEPTION 'A transação bancária já está conciliada'; END IF;

  PERFORM 1 FROM public.lancamentos_financeiros l WHERE l.id = ANY(p_lancamento_ids) FOR UPDATE;
  SELECT COUNT(*) INTO v_count FROM public.lancamentos_financeiros l WHERE l.id = ANY(p_lancamento_ids);
  IF v_count <> cardinality(p_lancamento_ids) THEN RAISE EXCEPTION 'Um ou mais lançamentos não foram encontrados'; END IF;
  -- Lançamentos já baixados (pago / pago_parcial) e pendentes do gestor (quitação_pendente)
  -- podem ser conciliados: nesse caso o vínculo é criado sem alterar o lançamento, preservando
  -- a baixa registrada. A revisão do Master acontece depois da conciliação.
  -- BPI (baixa por inatividade) segue bloqueado: é encerramento sem movimentação bancária.
  IF EXISTS (
    SELECT 1 FROM public.lancamentos_financeiros l
    WHERE l.id = ANY(p_lancamento_ids)
      AND l.status_pagamento = 'bpi'::public.status_pagamento
  ) THEN
    RAISE EXCEPTION 'Lançamentos em baixa por inatividade (BPI) não podem ser conciliados';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.lancamentos_financeiros l
    WHERE l.id = ANY(p_lancamento_ids)
      AND (l.conta_bancaria_id IS DISTINCT FROM v_tx.conta_bancaria_id
        OR (v_tx.valor > 0 AND l.tipo <> 'entrada'::public.tipo_movimento)
        OR (v_tx.valor < 0 AND l.tipo <> 'saida'::public.tipo_movimento))
  ) THEN RAISE EXCEPTION 'Conta ou natureza incompatível com a transação bancária'; END IF;
  IF EXISTS (SELECT 1 FROM public.conciliacoes c WHERE c.lancamento_id = ANY(p_lancamento_ids)) THEN RAISE EXCEPTION 'Um ou mais lançamentos já estão conciliados'; END IF;

  -- Valor efetivo do lançamento: o recebido quando já existe baixa registrada, senão o previsto ajustado.
  SELECT COALESCE(SUM(CASE WHEN l.tipo = 'entrada'::public.tipo_movimento THEN 1 ELSE -1 END *
    CASE
      WHEN l.status_pagamento IN ('pago'::public.status_pagamento, 'pago_parcial'::public.status_pagamento, 'quitação_pendente'::public.status_pagamento)
        AND COALESCE(l.valor_recebido, 0) > 0
      THEN ROUND(l.valor_recebido * 100)::bigint
      ELSE public.valor_lancamento_ajustado_centavos(l.valor_previsto, l.desconto_valor, l.desconto_tipo, l.acrescimo_valor, l.acrescimo_tipo)
    END), 0)
  INTO v_valor_lancamentos_cents
  FROM public.lancamentos_financeiros l WHERE l.id = ANY(p_lancamento_ids);
  v_difference_cents := ROUND(v_tx.valor * 100)::bigint - v_valor_lancamentos_cents;
  IF v_difference_cents <> 0 THEN
    IF p_tipo_diferenca IS NULL OR p_tipo_diferenca NOT IN ('juros', 'multa', 'desconto', 'tarifa', 'pagamento_parcial', 'ajuste_manual') THEN RAISE EXCEPTION 'Classifique a diferença antes de confirmar a conciliação'; END IF;
    IF NULLIF(btrim(COALESCE(p_justificativa, '')), '') IS NULL THEN RAISE EXCEPTION 'A justificativa da diferença é obrigatória'; END IF;
  ELSIF NULLIF(btrim(COALESCE(p_tipo_diferenca, '')), '') IS NOT NULL OR NULLIF(btrim(COALESCE(p_justificativa, '')), '') IS NOT NULL THEN
    RAISE EXCEPTION 'Não há diferença para classificar';
  END IF;

  PERFORM set_config('app.conciliacao_operacao', 'on', true);
  PERFORM set_config('app.origem_alteracao', 'conciliacao_bancaria', true);
  WITH inserted AS (
    INSERT INTO public.conciliacoes (lancamento_id, transacao_banco_id, grupo_conciliacao_id, usuario_conciliador_id, data_conciliacao)
    SELECT l.id, p_transacao_id, v_group_id, v_user_id, now() FROM public.lancamentos_financeiros l WHERE l.id = ANY(p_lancamento_ids) RETURNING id
  ) SELECT array_agg(id) INTO v_link_ids FROM inserted;

  -- Somente lançamentos em aberto são iniciados pela conciliação (entram na fila do Master).
  -- Títulos já baixados ou pendentes do gestor apenas ganham o vínculo bancário.
  -- A conciliação é uma baixa financeira: registra a marca 'financeira', de modo que um
  -- ajuste AVR anterior deixa de prevalecer sobre a baixa efetivamente realizada.
  UPDATE public.lancamentos_financeiros l
  SET status_pagamento = 'quitação_pendente'::public.status_pagamento,
      status_aprovacao = 'digital'::public.status_aprovacao,
      data_pagamento = v_tx.data_transacao,
      valor_recebido = public.valor_lancamento_ajustado_centavos(l.valor_previsto, l.desconto_valor, l.desconto_tipo, l.acrescimo_valor, l.acrescimo_tipo)::numeric / 100,
      tipo_baixa = 'financeira',
      updated_at = now()
  WHERE l.id = ANY(p_lancamento_ids)
    AND l.status_pagamento = 'aberto'::public.status_pagamento;

  UPDATE public.transacoes_banco SET status_conciliacao = true WHERE id = p_transacao_id;
  IF v_difference_cents <> 0 THEN
    INSERT INTO public.diferencas_financeiras (conciliacao_id, tipo_diferenca, valor_diferenca, observacao_justificativa)
    VALUES (v_link_ids[1], p_tipo_diferenca, (v_difference_cents::numeric / 100), btrim(p_justificativa));
  END IF;
  RETURN jsonb_build_object(
    'grupo_conciliacao_id', v_group_id,
    'conciliacoes', (SELECT jsonb_agg(to_jsonb(c)) FROM public.conciliacoes c WHERE c.id = ANY(v_link_ids)),
    'diferenca_centavos', v_difference_cents,
    'lancamentos_iniciados', (SELECT COUNT(*) FROM public.lancamentos_financeiros l WHERE l.id = ANY(p_lancamento_ids) AND l.status_pagamento = 'quitação_pendente'::public.status_pagamento)
  );
END;
$function$