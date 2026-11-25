CREATE INDEX IF NOT EXISTS lancamentos_financeiros_saldo_idx
ON public.lancamentos_financeiros (conta_bancaria_id)
INCLUDE (status_pagamento, status_aprovacao, tipo, valor_recebido, valor_previsto, transferencia_id, transferencia_cofre_id);