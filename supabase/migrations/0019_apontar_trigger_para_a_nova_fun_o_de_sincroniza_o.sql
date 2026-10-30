DROP TRIGGER trg_sincronizar_transferencia_aprovada ON public.lancamentos_financeiros;
CREATE TRIGGER trg_sincronizar_transferencia_com_titulos
AFTER UPDATE ON public.lancamentos_financeiros
FOR EACH ROW
WHEN (new.transferencia_id IS NOT NULL)
EXECUTE FUNCTION public.sincronizar_transferencia_com_titulos();