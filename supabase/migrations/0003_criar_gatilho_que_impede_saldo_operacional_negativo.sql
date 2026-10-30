CREATE OR REPLACE FUNCTION public.proteger_saldo_operacional_lancamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_debito_novo numeric := 0;
  v_debito_anterior numeric := 0;
  v_saldo_disponivel numeric;
  v_saldo_apos numeric;
BEGIN
  IF NEW.conta_bancaria_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Débito efetivo da linha no saldo operacional da conta (mesma regra de get_contas_saldos_reais).
  IF NEW.tipo = 'saida'
     AND NEW.status_pagamento IN ('pago'::public.status_pagamento, 'quitação_pendente'::public.status_pagamento)
     AND (NEW.transferencia_id IS NULL OR EXISTS (
            SELECT 1 FROM public.transferencias_bancarias t
            WHERE t.id = NEW.transferencia_id AND t.status = 'conciliada'))
     AND (NEW.transferencia_cofre_id IS NULL OR EXISTS (
            SELECT 1 FROM public.transferencias_cofre tc
            WHERE tc.id = NEW.transferencia_cofre_id AND tc.status = 'aprovada' AND tc.lancamento_bancario_id = NEW.id))
  THEN
    v_debito_novo := COALESCE(NEW.valor_recebido, NEW.valor_previsto, 0);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.tipo = 'saida'
       AND OLD.status_pagamento IN ('pago'::public.status_pagamento, 'quitação_pendente'::public.status_pagamento)
       AND (OLD.transferencia_id IS NULL OR EXISTS (
              SELECT 1 FROM public.transferencias_bancarias t
              WHERE t.id = OLD.transferencia_id AND t.status = 'conciliada'))
       AND (OLD.transferencia_cofre_id IS NULL OR EXISTS (
              SELECT 1 FROM public.transferencias_cofre tc
              WHERE tc.id = OLD.transferencia_cofre_id AND tc.status = 'aprovada' AND tc.lancamento_bancario_id = OLD.id))
    THEN
      v_debito_anterior := COALESCE(OLD.valor_recebido, OLD.valor_previsto, 0);
    END IF;
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

  IF v_saldo_apos < -0.005 THEN
    v_saldo_disponivel := v_saldo_apos + v_debito_novo;
    RAISE EXCEPTION 'Saldo insuficiente na conta selecionada. Saldo disponível: R$ %. Valor necessário: R$ %.',
      replace(to_char(v_saldo_disponivel, 'FM999999999990.00'), '.', ','),
      replace(to_char(v_debito_novo, 'FM999999999990.00'), '.', ',');
  END IF;

  RETURN NEW;
END;
$$;