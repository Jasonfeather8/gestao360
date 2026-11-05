DO $do$
DECLARE
  v_antes text;
  v_depois text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_antes
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'importar_lancamentos';

  v_depois := replace(v_antes,
$q$  IF public.current_user_role() NOT IN ('master', 'gerente') THEN
    RAISE EXCEPTION 'Somente Master ou Gerente podem importar lançamentos';
  END IF;$q$,
$q$  IF public.current_user_role() NOT IN ('master', 'gerente') THEN
    RAISE EXCEPTION 'Somente Master ou Gerente podem importar lançamentos';
  END IF;

  -- Carga de histórico já quitado: autoriza a gravação de lançamentos já recebidos
  -- (ver proteger_previsao_sinalizada) sem abrir a aprovação para outros perfis.
  PERFORM set_config('app.importacao_operacao', 'on', true);$q$);

  IF v_depois = v_antes THEN
    RAISE EXCEPTION 'Nenhuma alteração aplicada em importar_lancamentos';
  END IF;

  EXECUTE v_depois;
END
$do$