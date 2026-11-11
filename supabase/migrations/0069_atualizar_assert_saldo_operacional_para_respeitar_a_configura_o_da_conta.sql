CREATE OR REPLACE FUNCTION public.assert_saldo_operacional(p_conta_id uuid, p_valor numeric, p_saldo_adicional numeric DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_saldo numeric;
  v_teto numeric;
  v_permite_negativo boolean := false;
  v_limite_negativo numeric;
BEGIN
  IF p_conta_id IS NULL OR p_valor IS NULL OR p_valor <= 0 THEN
    RETURN;
  END IF;

  v_saldo := public.saldo_operacional_conta(p_conta_id);
  IF v_saldo IS NULL THEN
    RETURN;
  END IF;

  v_saldo := v_saldo + COALESCE(p_saldo_adicional, 0);

  -- Contas marcadas com "permite saldo negativo" operam abaixo de zero: sem limite
  -- cadastrado não há bloqueio; com limite, o teto do gasto é saldo + limite.
  SELECT c.permite_saldo_negativo, c.limite_saldo_negativo
    INTO v_permite_negativo, v_limite_negativo
  FROM public.contas_bancarias c
  WHERE c.id = p_conta_id;

  IF v_permite_negativo AND v_limite_negativo IS NULL THEN
    RETURN;
  END IF;

  v_teto := v_saldo + CASE WHEN v_permite_negativo THEN COALESCE(v_limite_negativo, 0) ELSE 0 END;

  IF p_valor > v_teto + 0.005 THEN
    IF v_permite_negativo THEN
      RAISE EXCEPTION 'Saldo insuficiente na conta selecionada. Limite de saldo negativo: R$ %. Saldo disponível: R$ %. Valor necessário: R$ %.',
        replace(to_char(v_limite_negativo, 'FM999999999990.00'), '.', ','),
        replace(to_char(v_saldo, 'FM999999999990.00'), '.', ','),
        replace(to_char(p_valor, 'FM999999999990.00'), '.', ',');
    END IF;
    RAISE EXCEPTION 'Saldo insuficiente na conta selecionada. Saldo disponível: R$ %. Valor necessário: R$ %.',
      replace(to_char(v_saldo, 'FM999999999990.00'), '.', ','),
      replace(to_char(p_valor, 'FM999999999990.00'), '.', ',');
  END IF;
END;
$function$