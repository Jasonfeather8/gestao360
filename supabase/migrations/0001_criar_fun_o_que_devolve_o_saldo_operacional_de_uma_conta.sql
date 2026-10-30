CREATE OR REPLACE FUNCTION public.saldo_operacional_conta(p_conta_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_saldo numeric;
BEGIN
  IF p_conta_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.saldo_operacional INTO v_saldo
  FROM public.get_contas_saldos_reais() s
  WHERE s.conta_id = p_conta_id;

  RETURN v_saldo;
END;
$$;