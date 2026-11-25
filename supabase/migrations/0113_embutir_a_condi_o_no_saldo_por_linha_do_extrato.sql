CREATE OR REPLACE FUNCTION public.get_saldos_operacionais_lancamentos(p_lancamento_ids uuid[])
 RETURNS TABLE(lancamento_id uuid, saldo_apos numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- A condição de public.lancamento_saldo_operacional() está embutida de propósito:
    -- chamá-la uma vez por lançamento da conta fazia esta consulta (saldo por linha do
    -- Extrato) varrer a conta inteira lançamento por lançamento.
    SELECT l.id, l.conta_bancaria_id, l.data_pagamento, l.created_at,
           CASE WHEN l.tipo = 'entrada'
                THEN COALESCE(l.valor_recebido, l.valor_previsto)
                ELSE -COALESCE(l.valor_recebido, l.valor_previsto) END AS delta
    FROM public.lancamentos_financeiros l
    JOIN contas c ON c.conta_bancaria_id = l.conta_bancaria_id
    WHERE l.status_pagamento <> 'bpi'
      AND l.status_pagamento IN ('pago'::public.status_pagamento, 'quitação_pendente'::public.status_pagamento)
      AND (l.transferencia_id IS NULL OR EXISTS (
            SELECT 1 FROM public.transferencias_bancarias t
            WHERE t.id = l.transferencia_id AND t.status <> 'estornada'))
      AND (l.transferencia_cofre_id IS NULL OR EXISTS (
            SELECT 1 FROM public.transferencias_cofre t
            WHERE t.id = l.transferencia_cofre_id AND t.status = 'aprovada' AND t.lancamento_bancario_id = l.id))
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
$function$;