DROP TRIGGER IF EXISTS trg_proteger_saldo_operacional ON public.lancamentos_financeiros;
CREATE TRIGGER trg_proteger_saldo_operacional
AFTER INSERT OR UPDATE ON public.lancamentos_financeiros
FOR EACH ROW
EXECUTE FUNCTION public.proteger_saldo_operacional_lancamento();