CREATE OR REPLACE FUNCTION public.saldo_operacional_conta(p_conta_id uuid)
 RETURNS numeric
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Mesmo cálculo de saldo operacional de get_contas_saldos_reais(), restrito à conta
  -- pedida. A subconsulta correlacionada (em vez de LEFT JOIN + GROUP BY) é de propósito:
  -- no formato antigo o planejador varria a tabela de lançamentos inteira a cada chamada
  -- (1.070 buffers até numa conta sem lançamento). Aqui ele lê só a conta pedida, pelo
  -- índice lancamentos_financeiros_saldo_idx.
  SELECT c.saldo_inicial + COALESCE((
    SELECT SUM(
      CASE
        WHEN l.status_pagamento IN ('pago'::public.status_pagamento, 'quitação_pendente'::public.status_pagamento)
          AND (l.transferencia_id IS NULL OR EXISTS (
                SELECT 1 FROM public.transferencias_bancarias t
                WHERE t.id = l.transferencia_id AND t.status <> 'estornada'))
          AND (l.transferencia_cofre_id IS NULL OR EXISTS (
                SELECT 1 FROM public.transferencias_cofre t
                WHERE t.id = l.transferencia_cofre_id AND t.status = 'aprovada' AND t.lancamento_bancario_id = l.id))
        THEN CASE WHEN l.tipo = 'entrada'
                  THEN COALESCE(l.valor_recebido, l.valor_previsto)
                  ELSE -COALESCE(l.valor_recebido, l.valor_previsto) END
        ELSE 0
      END
    )
    FROM public.lancamentos_financeiros l
    WHERE l.conta_bancaria_id = c.id
      AND l.status_pagamento <> 'bpi'
  ), 0)
  FROM public.contas_bancarias c
  WHERE c.status <> 'excluido' AND c.id = p_conta_id;
$function$;