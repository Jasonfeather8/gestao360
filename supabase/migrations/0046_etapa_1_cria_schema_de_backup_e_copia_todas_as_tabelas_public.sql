DO $$
DECLARE
  v_schema text := 'bkp_zeragem_20261104';
  r record;
BEGIN
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);

  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I.%I', v_schema, r.relname);
    EXECUTE format('CREATE TABLE %I.%I AS TABLE public.%I', v_schema, r.relname, r.relname);
  END LOOP;

  BEGIN
    EXECUTE format('DROP TABLE IF EXISTS %I.storage_objects_bkp', v_schema);
    EXECUTE format('CREATE TABLE %I.storage_objects_bkp AS SELECT bucket_id, name, owner_id, metadata, created_at FROM storage.objects', v_schema);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Falha ao copiar storage.objects: %', SQLERRM;
  END;

  BEGIN
    EXECUTE format('DROP TABLE IF EXISTS %I.auth_users_bkp', v_schema);
    EXECUTE format('CREATE TABLE %I.auth_users_bkp AS SELECT id, email, raw_user_meta_data, raw_app_meta_data, created_at, last_sign_in_at FROM auth.users', v_schema);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Falha ao copiar auth.users: %', SQLERRM;
  END;

  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC, anon, authenticated', v_schema);
END $$;