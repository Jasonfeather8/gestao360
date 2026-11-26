CREATE OR REPLACE FUNCTION public.validar_fluxo_categoria_lancamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo_categoria public.tipo_movimento;
  v_nome_categoria text;
BEGIN
  IF NEW.categoria_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Só valida quando o par (tipo, categoria) muda. Sem esta saída, um título legado
  -- inconsistente não poderia nem ser reordenado no Extrato, nem estornado.
  IF TG_OP = 'UPDATE'
     AND NEW.tipo IS NOT DISTINCT FROM OLD.tipo
     AND NEW.categoria_id IS NOT DISTINCT FROM OLD.categoria_id THEN
    RETURN NEW;
  END IF;

  SELECT c.tipo, c.nome
  INTO v_tipo_categoria, v_nome_categoria
  FROM public.categorias_financeiras c
  WHERE c.id = NEW.categoria_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A categoria informada não foi encontrada';
  END IF;

  IF v_tipo_categoria IS DISTINCT FROM NEW.tipo THEN
    RAISE EXCEPTION 'A categoria "%" é de % e não pode ser usada em um lançamento de %.',
      v_nome_categoria,
      CASE WHEN v_tipo_categoria = 'entrada' THEN 'entrada' ELSE 'saída' END,
      CASE WHEN NEW.tipo = 'entrada' THEN 'entrada' ELSE 'saída' END;
  END IF;

  RETURN NEW;
END;
$function$