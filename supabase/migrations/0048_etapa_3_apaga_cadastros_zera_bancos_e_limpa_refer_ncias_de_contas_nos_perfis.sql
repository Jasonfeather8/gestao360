DO $$
DECLARE
  v_master uuid := '5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3';
BEGIN
  -- 1) Zera as referências de conta nos perfis (arrays apontariam para contas inexistentes)
  UPDATE public.profiles
  SET contas_liberadas = '{}'::uuid[],
      contas_bloqueadas = '{}'::uuid[];

  -- 2) Reatribui as contas mantidas ao Master (a FK de auth.users tem CASCADE)
  UPDATE public.contas_bancarias
  SET user_id = v_master
  WHERE status <> 'excluido';

  -- 3) Remove as 2 contas-resíduo de teste ("Banco bloqueado/liberado <uuid>", status 'excluido')
  DELETE FROM public.contas_bancarias WHERE status = 'excluido';

  -- 4) Zera o saldo inicial dos bancos mantidos
  UPDATE public.contas_bancarias
  SET saldo_inicial = 0
  WHERE status <> 'excluido';

  -- 5) Cadastros
  DELETE FROM public.entidade_documentos;
  DELETE FROM public.entidades_negocio;
  DELETE FROM public.categorias_financeiras;
  DELETE FROM public.centros_custo;
  DELETE FROM public.categorias_ajuste;
  DELETE FROM public.cofres_locais;
END $$;