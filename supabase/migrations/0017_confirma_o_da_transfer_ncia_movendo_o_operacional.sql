CREATE OR REPLACE FUNCTION public.confirmar_transferencia_bancaria(p_transferencia_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := public.current_user_role();
  v_transfer public.transferencias_bancarias;
  v_row public.transferencias_bancarias;
  v_tarifa numeric := 0;
BEGIN
  IF v_user_id IS NULL OR v_role NOT IN ('master','gerente') THEN
    RAISE EXCEPTION 'Apenas o Master ou o gerente podem confirmar os dados da transferência';
  END IF;
  IF p_transferencia_id IS NULL THEN
    RAISE EXCEPTION 'Transferência é obrigatória';
  END IF;

  SELECT * INTO v_transfer FROM public.transferencias_bancarias WHERE id = p_transferencia_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transferência não encontrada'; END IF;
  IF v_transfer.status = 'estornada' THEN RAISE EXCEPTION 'A transferência está estornada'; END IF;
  IF v_transfer.confirmado_em IS NOT NULL THEN RAISE EXCEPTION 'Os dados da transferência já foram confirmados'; END IF;

  SELECT COALESCE(valor_previsto, 0) INTO v_tarifa
  FROM public.lancamentos_financeiros
  WHERE id = v_transfer.tarifa_lancamento_id;
  v_tarifa := COALESCE(v_tarifa, 0);

  -- A confirmação é o momento em que o dinheiro é comprometido: exige saldo operacional.
  PERFORM public.assert_saldo_operacional(v_transfer.conta_origem_id, v_transfer.valor + v_tarifa);

  PERFORM set_config('app.origem_alteracao', 'transferencia_bancaria', true);

  -- Move APENAS o saldo operacional: os títulos passam a baixa pendente e entram no
  -- Financeiro como 'Pend. Gestor'. O saldo confirmado só muda na aprovação do Master.
  UPDATE public.lancamentos_financeiros
  SET status_pagamento = 'quitação_pendente'::public.status_pagamento,
      status_aprovacao = 'digital'::public.status_aprovacao,
      valor_recebido = valor_previsto,
      data_pagamento = v_transfer.data_transferencia,
      updated_at = now()
  WHERE id IN (v_transfer.lancamento_saida_id, v_transfer.lancamento_entrada_id, v_transfer.tarifa_lancamento_id);

  UPDATE public.transferencias_bancarias
  SET confirmado_por = v_user_id,
      confirmado_em = now(),
      updated_at = now()
  WHERE id = p_transferencia_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;