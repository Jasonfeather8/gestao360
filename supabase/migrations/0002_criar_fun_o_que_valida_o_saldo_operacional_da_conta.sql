CREATE OR REPLACE FUNCTION public.assert_saldo_operacional(p_conta_id uuid, p_valor numeric, p_saldo_adicional numeric DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_saldo numeric;
BEGIN
  IF p_conta_id IS NULL OR p_valor IS NULL OR p_valor <= 0 THEN
    RETURN;
  END IF;

  v_saldo := public.saldo_operacional_conta(p_conta_id);
  IF v_saldo IS NULL THEN
    RETURN;
  END IF;

  v_saldo := v_saldo + COALESCE(p_saldo_adicional, 0);

  IF p_valor > v_saldo + 0.005 THEN
    RAISE EXCEPTION 'Saldo insuficiente na conta selecionada. Saldo disponível: R$ %. Valor necessário: R$ %.',
      replace(to_char(v_saldo, 'FM999999999990.00'), '.', ','),
      replace(to_char(p_valor, 'FM999999999990.00'), '.', ',');
  END IF;
END;
$$;