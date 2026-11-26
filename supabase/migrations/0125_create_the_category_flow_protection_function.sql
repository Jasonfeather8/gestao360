CREATE OR REPLACE FUNCTION public.proteger_fluxo_categoria_financeira()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_em_uso integer;
BEGIN
  IF NEW.tipo IS NOT DISTINCT FROM OLD.tipo THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_em_uso
  FROM public.lancamentos_financeiros l
  WHERE l.categoria_id = NEW.id;

  IF v_em_uso > 0 THEN
    RAISE EXCEPTION 'A categoria "%" já está em uso em % lançamento(s) e não pode mudar de fluxo. Cadastre uma nova categoria para o outro fluxo.', NEW.nome, v_em_uso;
  END IF;

  RETURN NEW;
END;
$function$