CREATE OR REPLACE FUNCTION public.get_contas_saldos_reais()
 RETURNS TABLE(conta_id uuid, saldo_confirmado numeric, saldo_operacional numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- As condições de public.lancamento_saldo_real_confirmado() e de
  -- public.lancamento_saldo_operacional() estão embutidas de propósito: chamá-las uma
  -- vez por lançamento fazia esta consulta (Dashboard e Contas) varrer a tabela
  -- inteira lançamento por lançamento.
  SELECT
    s.conta_id,
    CASE WHEN public.current_user_role() = 'master' THEN s.saldo_confirmado ELSE NULL END AS saldo_confirmado,
    s.saldo_operacional
  FROM (
    SELECT
      c.id AS conta_id,
      c.saldo_inicial + COALESCE(SUM(
        CASE
          WHEN l.status_pagamento = 'pago'::public.status_pagamento
            AND l.status_aprovacao = 'confirmado_master'::public.status_aprovacao
            AND (l.transferencia_id IS NULL OR EXISTS (
                  SELECT 1 FROM public.transferencias_bancarias t
                  WHERE t.id = l.transferencia_id AND t.status = 'conciliada'))
            AND (l.transferencia_cofre_id IS NULL OR EXISTS (
                  SELECT 1 FROM public.transferencias_cofre t
                  WHERE t.id = l.transferencia_cofre_id AND t.status = 'aprovada' AND t.lancamento_bancario_id = l.id))
          THEN CASE WHEN l.tipo = 'entrada' THEN COALESCE(l.valor_recebido, l.valor_previsto) ELSE -COALESCE(l.valor_recebido, l.valor_previsto) END
          ELSE 0
        END
      ), 0) AS saldo_confirmado,
      c.saldo_inicial + COALESCE(SUM(
        CASE
          WHEN l.status_pagamento IN ('pago'::public.status_pagamento, 'quitação_pendente'::public.status_pagamento)
            AND (l.transferencia_id IS NULL OR EXISTS (
                  SELECT 1 FROM public.transferencias_bancarias t
                  WHERE t.id = l.transferencia_id AND t.status <> 'estornada'))
            AND (l.transferencia_cofre_id IS NULL OR EXISTS (
                  SELECT 1 FROM public.transferencias_cofre t
                  WHERE t.id = l.transferencia_cofre_id AND t.status = 'aprovada' AND t.lancamento_bancario_id = l.id))
          THEN CASE WHEN l.tipo = 'entrada' THEN COALESCE(l.valor_recebido, l.valor_previsto) ELSE -COALESCE(l.valor_recebido, l.valor_previsto) END
          ELSE 0
        END
      ), 0) AS saldo_operacional
    FROM public.contas_bancarias c
    LEFT JOIN public.lancamentos_financeiros l
      ON l.conta_bancaria_id = c.id AND l.status_pagamento <> 'bpi'
    WHERE c.status <> 'excluido'
    GROUP BY c.id, c.saldo_inicial
  ) s;
$function$;