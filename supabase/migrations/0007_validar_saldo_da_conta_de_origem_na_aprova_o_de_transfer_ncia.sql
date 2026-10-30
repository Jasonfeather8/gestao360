CREATE OR REPLACE FUNCTION public.decidir_transferencia_bancaria(p_transferencia_id uuid, p_aprovado boolean, p_justificativa text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := public.current_user_role();
  v_transfer public.transferencias_bancarias;
  v_row public.transferencias_bancarias;
  v_conciliacao_ids uuid[];
BEGIN
  IF v_user_id IS NULL OR v_role IS DISTINCT FROM 'master' THEN RAISE EXCEPTION 'Apenas o Master pode aprovar ou reprovar transferências bancárias'; END IF;
  IF p_transferencia_id IS NULL THEN RAISE EXCEPTION 'Transferência é obrigatória'; END IF;
  IF NOT p_aprovado AND NULLIF(btrim(COALESCE(p_justificativa, '')), '') IS NULL THEN RAISE EXCEPTION 'A justificativa da reprovação é obrigatória'; END IF;
  SELECT * INTO v_transfer FROM public.transferencias_bancarias WHERE id = p_transferencia_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transferência não encontrada'; END IF;
  IF v_transfer.status = 'estornada' THEN RAISE EXCEPTION 'A transferência está estornada'; END IF;
  IF v_transfer.status = 'conciliada' THEN RAISE EXCEPTION 'A transferência já foi aprovada'; END IF;

  -- A conciliação com o extrato é opcional e pode ser feita depois da decisão.
  -- A integridade só é exigida para os lados que já estiverem vinculados.
  IF v_transfer.transacao_origem_id IS NOT NULL THEN
    IF v_transfer.lancamento_saida_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.conciliacoes c WHERE c.lancamento_id = v_transfer.lancamento_saida_id AND c.transacao_banco_id = v_transfer.transacao_origem_id) THEN
      RAISE EXCEPTION 'O vínculo de origem não está íntegro';
    END IF;
    IF NOT public.transacao_bancaria_pronta_para_master(v_transfer.transacao_origem_id) THEN
      RAISE EXCEPTION 'A transação de origem precisa estar confirmada, conciliada e com origem verificável';
    END IF;
  END IF;
  IF v_transfer.transacao_destino_id IS NOT NULL THEN
    IF v_transfer.lancamento_entrada_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.conciliacoes c WHERE c.lancamento_id = v_transfer.lancamento_entrada_id AND c.transacao_banco_id = v_transfer.transacao_destino_id) THEN
      RAISE EXCEPTION 'O vínculo de destino não está íntegro';
    END IF;
    IF NOT public.transacao_bancaria_pronta_para_master(v_transfer.transacao_destino_id) THEN
      RAISE EXCEPTION 'A transação de destino precisa estar confirmada, conciliada e com origem verificável';
    END IF;
  END IF;

  PERFORM set_config('app.origem_alteracao', 'aprovacao_master', true);
  PERFORM set_config('app.justificativa', NULLIF(btrim(p_justificativa), ''), true);
  IF p_aprovado THEN
    -- A aprovação é o momento em que o dinheiro efetivamente sai da conta de origem:
    -- sem saldo operacional suficiente, a transferência não pode ser aprovada.
    PERFORM public.assert_saldo_operacional(
      v_transfer.conta_origem_id,
      v_transfer.valor + COALESCE((
        SELECT l.valor_previsto FROM public.lancamentos_financeiros l WHERE l.id = v_transfer.tarifa_lancamento_id
      ), 0)
    );
    UPDATE public.lancamentos_financeiros l
    SET status_aprovacao = 'confirmado_master'::public.status_aprovacao,
        status_pagamento = 'pago'::public.status_pagamento,
        data_aprovacao = now(),
        usuario_aprovador_id = v_user_id,
        data_pagamento = COALESCE(data_pagamento, v_transfer.data_transferencia),
        valor_recebido = ABS(valor_previsto),
        updated_at = now()
    WHERE id IN (v_transfer.lancamento_saida_id, v_transfer.lancamento_entrada_id, v_transfer.tarifa_lancamento_id);
    UPDATE public.transferencias_bancarias
    SET status = 'conciliada', aprovado_por = v_user_id, aprovado_em = now(), reprovado_por = NULL, reprovado_em = NULL, motivo_reprovacao = NULL, updated_at = now()
    WHERE id = p_transferencia_id RETURNING * INTO v_row;
  ELSE
    SELECT array_agg(c.id) INTO v_conciliacao_ids
    FROM public.conciliacoes c
    WHERE c.lancamento_id IN (v_transfer.lancamento_saida_id, v_transfer.lancamento_entrada_id)
      AND c.transacao_banco_id IN (v_transfer.transacao_origem_id, v_transfer.transacao_destino_id);
    PERFORM set_config('app.transferencia_conciliacao', 'on', true);
    IF v_conciliacao_ids IS NOT NULL THEN
      DELETE FROM public.diferencas_financeiras WHERE conciliacao_id = ANY(v_conciliacao_ids);
      DELETE FROM public.conciliacoes WHERE id = ANY(v_conciliacao_ids);
    END IF;
    UPDATE public.transacoes_banco SET status_conciliacao = false WHERE id IN (v_transfer.transacao_origem_id, v_transfer.transacao_destino_id);
    UPDATE public.lancamentos_financeiros l
    SET status_aprovacao = 'reprovado'::public.status_aprovacao, status_pagamento = 'aberto'::public.status_pagamento, data_aprovacao = NULL, usuario_aprovador_id = NULL, data_pagamento = NULL, valor_recebido = 0, updated_at = now()
    WHERE id IN (v_transfer.lancamento_saida_id, v_transfer.lancamento_entrada_id);
    UPDATE public.transferencias_bancarias
    SET status = 'aberta', transacao_origem_id = NULL, transacao_destino_id = NULL, aprovado_por = NULL, aprovado_em = NULL, reprovado_por = v_user_id, reprovado_em = now(), motivo_reprovacao = btrim(p_justificativa), updated_at = now()
    WHERE id = p_transferencia_id RETURNING * INTO v_row;
  END IF;
  RETURN to_jsonb(v_row);
END;
$function$;