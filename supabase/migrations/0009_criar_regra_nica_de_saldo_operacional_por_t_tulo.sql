CREATE OR REPLACE FUNCTION public.lancamento_conta_saldo_operacional(
  p_status_pagamento public.status_pagamento,
  p_transferencia_id uuid,
  p_transferencia_cofre_id uuid,
  p_lancamento_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT p_status_pagamento IN ('pago'::public.status_pagamento, 'quitação_pendente'::public.status_pagamento)
    AND (
      p_transferencia_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.transferencias_bancarias t
        WHERE t.id = p_transferencia_id
          AND t.status <> 'estornada'
      )
    )
    AND (
      p_transferencia_cofre_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.transferencias_cofre t
        WHERE t.id = p_transferencia_cofre_id
          AND t.status = 'aprovada'
          AND t.lancamento_bancario_id = p_lancamento_id
      )
    );
$$;