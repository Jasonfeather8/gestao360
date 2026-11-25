CREATE OR REPLACE FUNCTION public.saldo_operacional_conta(p_conta_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_saldo_inicial numeric;
  v_soma numeric;
BEGIN
  IF p_conta_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.saldo_inicial INTO v_saldo_inicial
  FROM public.contas_bancarias c
  WHERE c.status <> 'excluido' AND c.id = p_conta_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- A soma fica numa consulta própria, filtrando pela conta: assim o planejador lê só os
  -- lançamentos dessa conta (índice lancamentos_financeiros_saldo_idx) em vez de varrer a
  -- tabela inteira a cada chamada. A condição de public.lancamento_conta_saldo_operacional
  -- está embutida de propósito: chamá-la por lançamento custava 268 ms por conta.
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
  ) INTO v_soma
  FROM public.lancamentos_financeiros l
  WHERE l.conta_bancaria_id = p_conta_id
    AND l.status_pagamento <> 'bpi';

  RETURN v_saldo_inicial + COALESCE(v_soma, 0);
END;
$function$;