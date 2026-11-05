DO $do$
DECLARE
  v_antes text;
  v_depois text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_antes
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'proteger_previsao_sinalizada';

  v_depois := replace(v_antes,
$q$  v_sinalizada boolean := COALESCE(NEW.ja_recebido, false) OR (TG_OP = 'UPDATE' AND COALESCE(OLD.ja_recebido, false));$q$,
$q$  v_importacao_autorizada boolean := current_setting('app.importacao_operacao', true) = 'on';
  v_sinalizada boolean := COALESCE(NEW.ja_recebido, false) OR (TG_OP = 'UPDATE' AND COALESCE(OLD.ja_recebido, false));$q$);

  v_depois := replace(v_depois,
$q$    AND public.current_user_role() IS DISTINCT FROM 'master' THEN$q$,
$q$    AND public.current_user_role() IS DISTINCT FROM 'master'
    AND NOT v_importacao_autorizada THEN$q$);

  v_depois := replace(v_depois,
$q$      AND NOT v_aprovacao_master THEN$q$,
$q$      AND NOT v_aprovacao_master
      AND NOT v_importacao_autorizada THEN$q$);

  IF v_depois = v_antes THEN
    RAISE EXCEPTION 'Nenhuma alteração aplicada em proteger_previsao_sinalizada';
  END IF;

  EXECUTE v_depois;
END
$do$