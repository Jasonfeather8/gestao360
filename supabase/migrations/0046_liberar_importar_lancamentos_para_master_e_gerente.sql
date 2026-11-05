DO $do$
DECLARE
  v_antes text;
  v_depois text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_antes
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'importar_lancamentos';

  v_depois := replace(v_antes, $q$IF public.current_user_role() IS DISTINCT FROM 'master' THEN$q$, $q$IF public.current_user_role() NOT IN ('master', 'gerente') THEN$q$);
  v_depois := replace(v_depois, $q$'Somente o Master pode importar lançamentos'$q$, $q$'Somente Master ou Gerente podem importar lançamentos'$q$);

  IF v_depois = v_antes THEN
    RAISE EXCEPTION 'Guardas de perfil não encontradas em importar_lancamentos';
  END IF;

  EXECUTE v_depois;
END
$do$