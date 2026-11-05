CREATE OR REPLACE FUNCTION public.get_contas_saldos_reais()
 RETURNS TABLE(conta_id uuid, saldo_confirmado numeric, saldo_operacional numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.conta_id,
    CASE WHEN public.current_user_role() = 'master' THEN s.saldo_confirmado ELSE NULL END AS saldo_confirmado,
    s.saldo_operacional
  FROM (
    SELECT
      c.id AS conta_id,
      c.saldo_inicial + COALESCE(SUM(
        CASE
          WHEN public.lancamento_saldo_real_confirmado(l.id) THEN
            CASE WHEN l.tipo = 'entrada' THEN COALESCE(l.valor_recebido, l.valor_previsto) ELSE -COALESCE(l.valor_recebido, l.valor_previsto) END
          ELSE 0
        END
      ), 0) AS saldo_confirmado,
      c.saldo_inicial + COALESCE(SUM(
        CASE
          WHEN public.lancamento_saldo_operacional(l.id) THEN
            CASE WHEN l.tipo = 'entrada' THEN COALESCE(l.valor_recebido, l.valor_previsto) ELSE -COALESCE(l.valor_recebido, l.valor_previsto) END
          ELSE 0
        END
      ), 0) AS saldo_operacional
    FROM public.contas_bancarias c
    LEFT JOIN public.lancamentos_financeiros l ON l.conta_bancaria_id = c.id AND l.status_pagamento <> 'bpi'
    WHERE c.status <> 'excluido'
    GROUP BY c.id, c.saldo_inicial
  ) s;
$function$;