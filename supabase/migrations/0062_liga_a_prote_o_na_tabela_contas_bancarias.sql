create trigger trg_proteger_saldo_inicial_negativo
before insert or update on public.contas_bancarias
for each row execute function public.proteger_saldo_inicial_negativo();