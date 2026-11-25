CREATE OR REPLACE FUNCTION public.saldo_operacional_conta(p_conta_id uuid)
 RETURNS numeric
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Mesmo cálculo de saldo operacional de get_contas_saldos_reais(), restrito à conta
  -- pedida. A condição de public.lancamento_conta_saldo_operacional está embutida de
  -- propósito: chamá-la uma vez por lançamento da conta custava 268 ms por conta, e o
  -- gatilho de saldo avalia uma conta por linha de saída importada.
  SELECT c.saldo_inicial + COALESCE(SUM(
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
  ), 0)
  FROM public.contas_bancarias c
  LEFT JOIN public.lancamentos_financeiros l
    ON l.conta_bancaria_id = c.id AND l.status_pagamento <> 'bpi'
  WHERE c.status <> 'excluido' AND c.id = p_conta_id
  GROUP BY c.id, c.saldo_inicial;
$function$;