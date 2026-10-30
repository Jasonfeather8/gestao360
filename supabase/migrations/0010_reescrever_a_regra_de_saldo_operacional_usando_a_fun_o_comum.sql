CREATE OR REPLACE FUNCTION public.lancamento_saldo_operacional(p_lancamento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE((
    SELECT public.lancamento_conta_saldo_operacional(l.status_pagamento, l.transferencia_id, l.transferencia_cofre_id, l.id)
    FROM public.lancamentos_financeiros l
    WHERE l.id = p_lancamento_id
  ), false);
$$;