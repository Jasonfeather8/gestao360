DO $$
DECLARE
  v_master uuid := '5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3';
  v_removidos integer;
  v_restantes integer;
BEGIN
  DELETE FROM auth.users WHERE id <> v_master;
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  SELECT count(*) INTO v_restantes FROM auth.users;
  RAISE NOTICE 'Usuarios removidos: %, restantes: %', v_removidos, v_restantes;
END $$;