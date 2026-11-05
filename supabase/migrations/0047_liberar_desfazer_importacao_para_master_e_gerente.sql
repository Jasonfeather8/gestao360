DO $do$
DECLARE
  v_antes text;
  v_depois text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_antes
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'desfazer_importacao';

  v_depois := replace(v_antes, $q$IF public.current_user_role() IS DISTINCT FROM 'master' THEN$q$, $q$IF public.current_user_role() NOT IN ('master', 'gerente') THEN$q$);
  v_depois := replace(v_depois, $q$'Somente o Master pode desfazer uma importação'$q$, $q$'Somente Master ou Gerente podem desfazer uma importação'$q$);

  IF v_depois = v_antes THEN
    RAISE EXCEPTION 'Guardas de perfil não encontradas em desfazer_importacao';
  END IF;

  EXECUTE v_depois;
END
$do$