CREATE OR REPLACE FUNCTION public.confirmar_transferencia_bancaria(p_transferencia_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := public.current_user_role();
  v_row public.transferencias_bancarias;
BEGIN
  IF v_user_id IS NULL OR v_role IS DISTINCT FROM 'master' THEN
    RAISE EXCEPTION 'Apenas o Master pode confirmar os dados da transferência';
  END IF;
  IF p_transferencia_id IS NULL THEN
    RAISE EXCEPTION 'Transferência é obrigatória';
  END IF;

  SELECT * INTO v_row FROM public.transferencias_bancarias WHERE id = p_transferencia_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transferência não encontrada'; END IF;
  IF v_row.status = 'estornada' THEN RAISE EXCEPTION 'A transferência está estornada'; END IF;

  -- Confirmação dos dados da transferência: registra quem conferiu e quando.
  -- Não movimenta saldo e não aprova nada: a aprovação é feita no Financeiro,
  -- onde os títulos da transferência aparecem como 'Pend. Gestor'.
  PERFORM set_config('app.origem_alteracao', 'transferencia_bancaria', true);
  UPDATE public.transferencias_bancarias
  SET confirmado_por = v_user_id,
      confirmado_em = now(),
      updated_at = now()
  WHERE id = p_transferencia_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;