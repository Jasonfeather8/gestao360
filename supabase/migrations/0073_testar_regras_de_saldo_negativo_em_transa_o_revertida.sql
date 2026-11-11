DO $teste$
DECLARE
  v_conta uuid;
  v_saldo numeric;
BEGIN
  BEGIN
    -- Conta descartável com saldo operacional negativo (-1000). Tudo é revertido no fim.
    INSERT INTO public.contas_bancarias (nome, nome_banco, agencia, conta, saldo_inicial, data_abertura, permite_saldo_negativo, limite_saldo_negativo)
    VALUES ('__teste_saldo_negativo__', '__teste_saldo_negativo__', '0001', '00000-0', -1000, now(), false, NULL)
    RETURNING id INTO v_conta;

    v_saldo := public.saldo_operacional_conta(v_conta);
    RAISE NOTICE 'conta=% saldo_operacional=%', v_conta, v_saldo;

    EXECUTE 'CREATE TEMP TABLE tmp_teste_saldo (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tipo text, valor_previsto numeric, valor_recebido numeric, status_pagamento text, conta_bancaria_id uuid, transferencia_id uuid, transferencia_cofre_id uuid) ON COMMIT DROP';
    EXECUTE 'CREATE TRIGGER trg_tmp_teste AFTER INSERT OR UPDATE ON tmp_teste_saldo FOR EACH ROW EXECUTE FUNCTION public.proteger_saldo_operacional_lancamento()';

    -- C1: conta sem permissao -> saida deve ser bloqueada
    BEGIN
      INSERT INTO tmp_teste_saldo (tipo, valor_previsto, valor_recebido, status_pagamento, conta_bancaria_id)
      VALUES ('saida', 10, 10, 'pago', v_conta);
      RAISE NOTICE 'C1 sem permissao: PASSOU <== INESPERADO';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'C1 sem permissao: BLOQUEOU -> %', SQLERRM;
    END;

    -- C2: permissao ligada, sem limite -> deve passar
    UPDATE public.contas_bancarias SET permite_saldo_negativo = true, limite_saldo_negativo = NULL WHERE id = v_conta;
    BEGIN
      INSERT INTO tmp_teste_saldo (tipo, valor_previsto, valor_recebido, status_pagamento, conta_bancaria_id)
      VALUES ('saida', 10, 10, 'pago', v_conta);
      RAISE NOTICE 'C2 sem limite: PASSOU (esperado)';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'C2 sem limite: BLOQUEOU <== INESPERADO -> %', SQLERRM;
    END;

    -- C3: limite de 500 com saldo -1000 -> deve bloquear
    UPDATE public.contas_bancarias SET limite_saldo_negativo = 500 WHERE id = v_conta;
    BEGIN
      INSERT INTO tmp_teste_saldo (tipo, valor_previsto, valor_recebido, status_pagamento, conta_bancaria_id)
      VALUES ('saida', 10, 10, 'pago', v_conta);
      RAISE NOTICE 'C3 limite 500 com saldo -1000: PASSOU <== INESPERADO';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'C3 limite 500 com saldo -1000: BLOQUEOU (esperado) -> %', SQLERRM;
    END;

    -- C4: limite de 2000 com saldo -1000 -> deve passar
    UPDATE public.contas_bancarias SET limite_saldo_negativo = 2000 WHERE id = v_conta;
    BEGIN
      INSERT INTO tmp_teste_saldo (tipo, valor_previsto, valor_recebido, status_pagamento, conta_bancaria_id)
      VALUES ('saida', 10, 10, 'pago', v_conta);
      RAISE NOTICE 'C4 limite 2000 com saldo -1000: PASSOU (esperado)';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'C4 limite 2000 com saldo -1000: BLOQUEOU <== INESPERADO -> %', SQLERRM;
    END;

    -- C5: assert_saldo_operacional sem permissao -> bloqueia
    UPDATE public.contas_bancarias SET permite_saldo_negativo = false, limite_saldo_negativo = NULL WHERE id = v_conta;
    BEGIN
      PERFORM public.assert_saldo_operacional(v_conta, 1, 0);
      RAISE NOTICE 'C5 assert sem permissao: PASSOU <== INESPERADO';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'C5 assert sem permissao: BLOQUEOU (esperado)';
    END;

    -- C6: assert com permissao e sem limite -> passa
    UPDATE public.contas_bancarias SET permite_saldo_negativo = true WHERE id = v_conta;
    BEGIN
      PERFORM public.assert_saldo_operacional(v_conta, 999999999, 0);
      RAISE NOTICE 'C6 assert sem limite: PASSOU (esperado)';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'C6 assert sem limite: BLOQUEOU <== INESPERADO';
    END;

    -- C7: assert com limite 2000 (teto 1000) -> 500 passa, 1500 bloqueia
    UPDATE public.contas_bancarias SET limite_saldo_negativo = 2000 WHERE id = v_conta;
    BEGIN
      PERFORM public.assert_saldo_operacional(v_conta, 500, 0);
      RAISE NOTICE 'C7a assert valor 500 (teto 1000): PASSOU (esperado)';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'C7a assert valor 500: BLOQUEOU <== INESPERADO -> %', SQLERRM;
    END;
    BEGIN
      PERFORM public.assert_saldo_operacional(v_conta, 1500, 0);
      RAISE NOTICE 'C7b assert valor 1500 (teto 1000): PASSOU <== INESPERADO';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'C7b assert valor 1500 (teto 1000): BLOQUEOU (esperado) -> %', SQLERRM;
    END;

    RAISE EXCEPTION '__fim_do_teste__';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'encerrando o teste e revertendo tudo: %', SQLERRM;
  END;
END
$teste$