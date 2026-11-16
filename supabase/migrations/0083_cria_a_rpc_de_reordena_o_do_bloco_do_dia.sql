CREATE OR REPLACE FUNCTION public.reordenar_extrato_dia(
  p_data date,
  p_lancamento_ids uuid[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := public.current_user_role();
  v_total integer;
  v_validos integer;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('master', 'gerente') THEN
    RAISE EXCEPTION 'Apenas Master e Gerente podem reordenar o extrato';
  END IF;

  IF p_data IS NULL THEN
    RAISE EXCEPTION 'Informe a data do bloco a reordenar';
  END IF;

  IF p_lancamento_ids IS NULL OR cardinality(p_lancamento_ids) = 0 THEN
    RAISE EXCEPTION 'Informe os títulos na nova ordem';
  END IF;

  v_total := cardinality(p_lancamento_ids);

  SELECT count(*) INTO v_validos
  FROM public.lancamentos_financeiros l
  JOIN (SELECT DISTINCT id FROM unnest(p_lancamento_ids) AS t(id)) s ON s.id = l.id
  WHERE l.data_pagamento = p_data;

  IF v_validos <> v_total THEN
    RAISE EXCEPTION 'A reordenação só pode mover títulos da mesma data (%)',
      to_char(p_data, 'DD/MM/YYYY');
  END IF;

  PERFORM set_config('app.origem_alteracao', 'reordenacao_extrato', true);

  UPDATE public.lancamentos_financeiros l
  SET ordem_dia = posicao.ordinalidade - 1
  FROM (
    SELECT t.id, t.ordinality AS ordinalidade
    FROM unnest(p_lancamento_ids) WITH ORDINALITY AS t(id, ordinality)
  ) AS posicao
  WHERE l.id = posicao.id;
END;
$$;