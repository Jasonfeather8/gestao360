CREATE OR REPLACE FUNCTION public.corrigir_categoria_tarifa_entrada()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_categoria_saida uuid := '87bdc0f3-39e6-49f4-b007-f9b354f30446';
  v_categoria_entrada uuid := '6d5cb235-0970-4e1a-9148-b7cbbb4217d9';
  v_total integer;
BEGIN
  -- Correção única e auditada: títulos de entrada que ficaram com a categoria de saída
  -- TARIFA passam a usar a categoria de entrada "Tarifa Banheiro".
  PERFORM set_config('app.origem_alteracao', 'correcao_fluxo_categoria', true);

  UPDATE public.lancamentos_financeiros
  SET categoria_id = v_categoria_entrada,
      updated_at = now()
  WHERE categoria_id = v_categoria_saida
    AND tipo = 'entrada';

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$function$