CREATE OR REPLACE FUNCTION public.saldo_operacional_conta(p_conta_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_saldo numeric;
BEGIN
  IF p_conta_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Mesmo cálculo de saldo operacional de get_contas_saldos_reais(), restrito à conta
  -- pedida. O gatilho de saldo chama esta função uma vez por linha importada; recalcular
  -- todas as contas a cada chamada era o que estourava o tempo limite na importação.
  SELECT c.saldo_inicial + COALESCE(SUM(
    CASE
      WHEN public.lancamento_saldo_operacional(l.id) THEN
        CASE WHEN l.tipo = 'entrada'
             THEN COALESCE(l.valor_recebido, l.valor_previsto)
             ELSE -COALESCE(l.valor_recebido, l.valor_previsto) END
      ELSE 0
    END
  ), 0) INTO v_saldo
  FROM public.contas_bancarias c
  LEFT JOIN public.lancamentos_financeiros l
    ON l.conta_bancaria_id = c.id AND l.status_pagamento <> 'bpi'
  WHERE c.status <> 'excluido' AND c.id = p_conta_id
  GROUP BY c.id, c.saldo_inicial;

  RETURN v_saldo;
END;
$function$;