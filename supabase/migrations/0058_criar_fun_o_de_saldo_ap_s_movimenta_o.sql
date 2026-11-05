CREATE OR REPLACE FUNCTION public.get_saldos_operacionais_lancamentos(p_lancamento_ids uuid[])
RETURNS TABLE(lancamento_id uuid, saldo_apos numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH alvo AS (
    SELECT l.id, l.conta_bancaria_id
    FROM public.lancamentos_financeiros l
    WHERE l.id = ANY(p_lancamento_ids)
      AND l.conta_bancaria_id IS NOT NULL
  ),
  contas AS (
    SELECT DISTINCT conta_bancaria_id FROM alvo
  ),
  mov AS (
    SELECT l.id, l.conta_bancaria_id, l.data_pagamento, l.created_at,
           CASE WHEN l.tipo = 'entrada'
                THEN COALESCE(l.valor_recebido, l.valor_previsto)
                ELSE -COALESCE(l.valor_recebido, l.valor_previsto) END AS delta
    FROM public.lancamentos_financeiros l
    JOIN contas c ON c.conta_bancaria_id = l.conta_bancaria_id
    WHERE l.status_pagamento <> 'bpi'
      AND public.lancamento_saldo_operacional(l.id)
  ),
  acumulado AS (
    SELECT m.id, m.conta_bancaria_id,
           SUM(m.delta) OVER (
             PARTITION BY m.conta_bancaria_id
             ORDER BY m.data_pagamento, m.created_at, m.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS total
    FROM mov m
  )
  SELECT a.id AS lancamento_id,
         (cb.saldo_inicial + ac.total)::numeric AS saldo_apos
  FROM alvo a
  JOIN acumulado ac ON ac.id = a.id
  JOIN public.contas_bancarias cb ON cb.id = a.conta_bancaria_id;
$$;