CREATE OR REPLACE FUNCTION public.proteger_previsao_sinalizada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conciliacao_autorizada boolean := current_setting('app.conciliacao_operacao', true) = 'on'
    OR current_setting('app.transferencia_conciliacao', true) = 'on'
    OR current_setting('app.cofre_operacao', true) = 'on';
  v_importacao_autorizada boolean := current_setting('app.importacao_operacao', true) = 'on';
  v_sinalizada boolean := COALESCE(NEW.ja_recebido, false) OR (TG_OP = 'UPDATE' AND COALESCE(OLD.ja_recebido, false));
  v_aprovacao_master boolean := NEW.status_aprovacao = 'confirmado_master'::public.status_aprovacao
    AND public.current_user_role() = 'master';
  v_tem_conciliacao boolean := TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM public.conciliacoes c WHERE c.lancamento_id = NEW.id
  );
  v_valor_final_centavos bigint := public.valor_lancamento_ajustado_centavos(NEW.valor_previsto, NEW.desconto_valor, NEW.desconto_tipo, NEW.acrescimo_valor, NEW.acrescimo_tipo);
  v_valor_financeiro_alterado boolean := TG_OP = 'INSERT'
    OR OLD.status_pagamento IS DISTINCT FROM NEW.status_pagamento
    OR OLD.valor_recebido IS DISTINCT FROM NEW.valor_recebido
    OR OLD.desconto_valor IS DISTINCT FROM NEW.desconto_valor
    OR OLD.desconto_tipo IS DISTINCT FROM NEW.desconto_tipo
    OR OLD.acrescimo_valor IS DISTINCT FROM NEW.acrescimo_valor
    OR OLD.acrescimo_tipo IS DISTINCT FROM NEW.acrescimo_tipo;
BEGIN
  -- Reordenação manual do Extrato: quando a única mudança da linha é a posição no dia
  -- não há alteração financeira a validar. Sem esta saída, um Gerente não conseguiria
  -- reordenar um dia com previsão sinalizada (a checagem abaixo exige o Master).
  IF TG_OP = 'UPDATE'
     AND NEW.ordem_dia IS DISTINCT FROM OLD.ordem_dia
     AND (to_jsonb(NEW) - 'ordem_dia') = (to_jsonb(OLD) - 'ordem_dia') THEN
    RETURN NEW;
  END IF;

  IF NEW.status_pagamento = 'quitação_pendente'::public.status_pagamento
    AND NEW.status_aprovacao IS DISTINCT FROM 'digital'::public.status_aprovacao THEN
    RAISE EXCEPTION 'Quitação pendente exige aprovação digital até a confirmação do Master';
  END IF;

  IF NEW.status_pagamento = 'quitação_pendente'::public.status_pagamento
    AND (TG_OP = 'INSERT' OR OLD.status_pagamento IS DISTINCT FROM NEW.status_pagamento)
    AND NOT v_conciliacao_autorizada THEN
    RAISE EXCEPTION 'Quitação pendente só pode ser criada pela conciliação bancária ou operação autorizada do cofre';
  END IF;

  IF NEW.status_aprovacao = 'confirmado_master'::public.status_aprovacao
    AND (TG_OP = 'INSERT' OR OLD.status_aprovacao IS DISTINCT FROM NEW.status_aprovacao)
    AND public.current_user_role() IS DISTINCT FROM 'master'
    AND NOT v_importacao_autorizada THEN
    RAISE EXCEPTION 'Somente o Master pode confirmar o lançamento';
  END IF;

  IF NEW.status_pagamento = ANY (ARRAY['pago', 'pago_parcial']::public.status_pagamento[])
    AND NEW.status_aprovacao IS DISTINCT FROM 'confirmado_master'::public.status_aprovacao THEN
    RAISE EXCEPTION 'Pagamento definitivo exige confirmação do Master';
  END IF;

  IF v_valor_financeiro_alterado AND NEW.status_pagamento = 'pago'::public.status_pagamento
    AND ROUND(COALESCE(NEW.valor_recebido, 0) * 100)::bigint <> v_valor_final_centavos THEN
    RAISE EXCEPTION 'O valor recebido deve corresponder ao valor final ajustado do lançamento';
  END IF;

  IF v_valor_financeiro_alterado AND NEW.status_pagamento = 'pago_parcial'::public.status_pagamento
    AND (COALESCE(NEW.valor_recebido, 0) <= 0 OR ROUND(NEW.valor_recebido * 100)::bigint > v_valor_final_centavos) THEN
    RAISE EXCEPTION 'O pagamento parcial deve estar entre zero e o valor final ajustado';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status_pagamento = ANY (ARRAY['pago', 'pago_parcial']::public.status_pagamento[])
      AND NOT v_aprovacao_master
      AND NOT v_importacao_autorizada THEN
      RAISE EXCEPTION 'Uma baixa definitiva só pode ser criada pelo fluxo Master';
    END IF;
    IF COALESCE(NEW.ja_recebido, false)
      AND NEW.status_pagamento = ANY (ARRAY['pago', 'pago_parcial']::public.status_pagamento[]) THEN
      RAISE EXCEPTION 'Uma previsão sinalizada só pode ser confirmada após conciliação bancária e decisão do Master';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT v_sinalizada THEN
    RETURN NEW;
  END IF;

  IF NEW.status_pagamento = ANY (ARRAY['pago', 'pago_parcial']::public.status_pagamento[]) THEN
    IF NOT v_aprovacao_master OR NOT v_tem_conciliacao THEN
      RAISE EXCEPTION 'A previsão sinalizada só pode ser confirmada pelo Master após conciliação bancária';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$