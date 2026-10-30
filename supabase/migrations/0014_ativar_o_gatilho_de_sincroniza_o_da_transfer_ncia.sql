DROP TRIGGER IF EXISTS trg_sincronizar_transferencia_aprovada ON public.lancamentos_financeiros;
CREATE TRIGGER trg_sincronizar_transferencia_aprovada
AFTER UPDATE ON public.lancamentos_financeiros
FOR EACH ROW
WHEN (NEW.transferencia_id IS NOT NULL)
EXECUTE FUNCTION public.sincronizar_transferencia_aprovada();