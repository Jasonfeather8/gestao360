CREATE OR REPLACE FUNCTION public.proteger_saldo_operacional_lancamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_debito_novo numeric := 0;
  v_debito_anterior numeric := 0;
  v_saldo_disponivel numeric;
  v_saldo_apos numeric;
  v_permite_negativo boolean := false;
  v_limite_negativo numeric;
BEGIN
  IF NEW.conta_bancaria_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Débito efetivo da linha no saldo operacional da conta: usa a mesma regra de
  -- public.lancamento_saldo_operacional, sem duplicar a condição.
  IF NEW.tipo = 'saida'
     AND public.lancamento_conta_saldo_operacional(NEW.status_pagamento, NEW.transferencia_id, NEW.transferencia_cofre_id, NEW.id)
  THEN
    v_debito_novo := COALESCE(NEW.valor_recebido, NEW.valor_previsto, 0);
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.tipo = 'saida'
     AND public.lancamento_conta_saldo_operacional(OLD.status_pagamento, OLD.transferencia_id, OLD.transferencia_cofre_id, OLD.id)
  THEN
    v_debito_anterior := COALESCE(OLD.valor_recebido, OLD.valor_previsto, 0);
  END IF;

  -- Só valida quando a linha aumenta o débito da conta.
  IF v_debito_novo <= v_debito_anterior + 0.005 THEN
    RETURN NEW;
  END IF;

  -- A conciliação bancária é a prova de que o pagamento já saiu do banco: nunca é bloqueada.
  IF EXISTS (SELECT 1 FROM public.conciliacoes c WHERE c.lancamento_id = NEW.id)
     OR current_setting('app.conciliacao_operacao', true) = 'on'
     OR current_setting('app.transferencia_conciliacao', true) = 'on'
  THEN
    RETURN NEW;
  END IF;

  v_saldo_apos := public.saldo_operacional_conta(NEW.conta_bancaria_id);
  IF v_saldo_apos IS NULL THEN
    RETURN NEW;
  END IF;

  -- Contas marcadas com "permite saldo negativo" operam abaixo de zero. Com limite
  -- cadastrado, o piso é -limite; sem limite cadastrado, não há piso.
  SELECT c.permite_saldo_negativo, c.limite_saldo_negativo
    INTO v_permite_negativo, v_limite_negativo
  FROM public.contas_bancarias c
  WHERE c.id = NEW.conta_bancaria_id;

  IF v_permite_negativo
     AND (v_limite_negativo IS NULL OR v_saldo_apos >= -v_limite_negativo - 0.005)
  THEN
    RETURN NEW;
  END IF;

  IF v_saldo_apos < -0.005 THEN
    v_saldo_disponivel := v_saldo_apos + v_debito_novo;
    IF v_permite_negativo THEN
      RAISE EXCEPTION 'Saldo insuficiente na conta selecionada. Limite de saldo negativo: R$ %. Saldo disponível: R$ %. Valor necessário: R$ %.',
        replace(to_char(v_limite_negativo, 'FM999999999990.00'), '.', ','),
        replace(to_char(v_saldo_disponivel, 'FM999999999990.00'), '.', ','),
        replace(to_char(v_debito_novo, 'FM999999999990.00'), '.', ',');
    END IF;
    RAISE EXCEPTION 'Saldo insuficiente na conta selecionada. Saldo disponível: R$ %. Valor necessário: R$ %.',
      replace(to_char(v_saldo_disponivel, 'FM999999999990.00'), '.', ','),
      replace(to_char(v_debito_novo, 'FM999999999990.00'), '.', ',');
  END IF;

  RETURN NEW;
END;
$function$