CREATE TRIGGER trg_manter_ordem_dia_do_extrato
BEFORE UPDATE ON public.lancamentos_financeiros
FOR EACH ROW
EXECUTE FUNCTION public.manter_ordem_dia_do_extrato();