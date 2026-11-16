CREATE OR REPLACE FUNCTION public.estornar_lancamento_atomico(p_lancamento_id uuid, p_manter_baixa boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := public.current_user_role();
  v_lanc public.lancamentos_financeiros;
  v_valor numeric := 0;
  v_conciliacoes integer := 0;
  v_transacoes integer := 0;
  v_residuo boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF v_role IS DISTINCT FROM 'master' THEN
    RAISE EXCEPTION 'Somente o Master pode estornar títulos';
  END IF;

  SELECT * INTO v_lanc
  FROM public.lancamentos_financeiros
  WHERE id = p_lancamento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado';
  END IF;

  IF v_lanc.status_pagamento NOT IN (
    'pago'::public.status_pagamento,
    'pago_parcial'::public.status_pagamento,
    'quitação_pendente'::public.status_pagamento,
    'bpi'::public.status_pagamento
  ) THEN
    RAISE EXCEPTION 'Somente títulos pagos, parciais, aguardando confirmação do Master ou em baixa por inatividade podem ser estornados';
  END IF;

  v_valor := COALESCE(v_lanc.valor_recebido, 0);
  v_residuo := v_lanc.vinculo_residuo_id IS NOT NULL;

  PERFORM set_config('app.conciliacao_operacao', 'on', true);
  PERFORM set_config('app.origem_alteracao', 'estorno_lancamento', true);

  -- Desfaz a conciliação bancária do título e devolve a transação do extrato para conciliar novamente.
  UPDATE public.transacoes_banco t
  SET status_conciliacao = false
  WHERE t.id IN (
    SELECT c.transacao_banco_id FROM public.conciliacoes c WHERE c.lancamento_id = p_lancamento_id
  );
  GET DIAGNOSTICS v_transacoes = ROW_COUNT;

  DELETE FROM public.diferencas_financeiras d
  WHERE d.conciliacao_id IN (
    SELECT c.id FROM public.conciliacoes c WHERE c.lancamento_id = p_lancamento_id
  );

  DELETE FROM public.conciliacoes c WHERE c.lancamento_id = p_lancamento_id;
  GET DIAGNOSTICS v_conciliacoes = ROW_COUNT;

  IF v_residuo THEN
    -- Resíduo de baixa parcial: devolve o valor ao título original e remove a linha do resíduo.
    UPDATE public.lancamentos_financeiros
    SET valor_previsto = valor_previsto + v_lanc.valor_previsto,
        updated_at = now()
    WHERE id = v_lanc.vinculo_residuo_id;

    DELETE FROM public.lancamentos_financeiros WHERE id = p_lancamento_id;
  ELSIF p_manter_baixa THEN
    -- Estorno feito na aba Extrato (regra 6): o título volta para o Financeiro mantendo a
    -- baixa registrada, porém SEM a confirmação do Master e SEM a conciliação. A baixa por
    -- inatividade (BPI) conserva o status 'bpi' e volta à fila para nova confirmação.
    UPDATE public.lancamentos_financeiros
    SET status_pagamento = CASE
          WHEN status_pagamento = 'bpi'::public.status_pagamento THEN 'bpi'::public.status_pagamento
          ELSE 'quitação_pendente'::public.status_pagamento
        END,
        status_aprovacao = 'digital'::public.status_aprovacao,
        data_aprovacao = NULL,
        usuario_aprovador_id = NULL,
        updated_at = now()
    WHERE id = p_lancamento_id;
  ELSE
    -- Devolve o título ao estado de origem: pronto para nova baixa, visível nas telas de origem.
    -- Em baixa por inatividade (BPI) o estorno também limpa bpi_em e o centro de custo BPI.
    UPDATE public.lancamentos_financeiros
    SET status_pagamento = 'aberto'::public.status_pagamento,
        status_aprovacao = 'digital'::public.status_aprovacao,
        valor_recebido = 0,
        data_pagamento = NULL,
        hora_pagamento = NULL,
        data_aprovacao = NULL,
        usuario_aprovador_id = NULL,
        tipo_baixa = 'financeira',
        bpi_em = NULL,
        centro_custo_id = CASE
          WHEN centro_custo_id = (SELECT id FROM public.centros_custo WHERE nome = 'BPI' LIMIT 1) THEN NULL
          ELSE centro_custo_id
        END,
        updated_at = now()
    WHERE id = p_lancamento_id;
  END IF;

  UPDATE public.notifications
  SET read = true,
      message = message || ' Status: estornado pelo Master.'
  WHERE link = '/aprovacao-master'
    AND message LIKE '%' || p_lancamento_id::text || '%';

  RETURN jsonb_build_object(
    'lancamento_id', p_lancamento_id,
    'valor_estornado', v_valor,
    'residuo', v_residuo,
    'manteve_baixa', COALESCE(p_manter_baixa, false),
    'conciliacoes_liberadas', v_conciliacoes,
    'transacoes_liberadas', v_transacoes
  );
END;
$function$