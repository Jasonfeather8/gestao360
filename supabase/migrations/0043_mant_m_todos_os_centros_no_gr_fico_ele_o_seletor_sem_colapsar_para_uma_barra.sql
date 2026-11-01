CREATE OR REPLACE FUNCTION public.get_dashboard_performance(
  p_inicio date DEFAULT NULL,
  p_fim date DEFAULT NULL,
  p_centro_custo_id uuid DEFAULT NULL,
  p_conta_bancaria_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_centros json;
  v_desempenho json;
  v_eficiencia json;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  -- Performance por centro de custo: mesma base do bloco "Saúde por Centro de Custo"
  -- (valores realizados/confirmados), para que os dois blocos reconciliem entre si.
  -- A lista NÃO é restrita ao centro selecionado: este gráfico é o seletor de centros, então
  -- continua mostrando todos eles (o selecionado fica destacado) para permitir comparação.
  WITH base AS (
    SELECT
      l.centro_custo_id,
      CASE WHEN l.tipo = 'entrada' THEN COALESCE(l.valor_recebido, public.valor_lancamento_ajustado_centavos(l.valor_previsto, l.desconto_valor, l.desconto_tipo, l.acrescimo_valor, l.acrescimo_tipo) / 100.0) ELSE 0 END AS receita,
      CASE WHEN l.tipo = 'saida' THEN COALESCE(l.valor_recebido, public.valor_lancamento_ajustado_centavos(l.valor_previsto, l.desconto_valor, l.desconto_tipo, l.acrescimo_valor, l.acrescimo_tipo) / 100.0) ELSE 0 END AS despesa
    FROM public.lancamentos_financeiros l
    WHERE public.lancamento_saldo_real_confirmado(l.id)
      AND (p_inicio IS NULL OR l.data_vencimento >= p_inicio)
      AND (p_fim IS NULL OR l.data_vencimento <= p_fim)
      AND (p_conta_bancaria_id IS NULL OR l.conta_bancaria_id = p_conta_bancaria_id)
      AND (l.transferencia_id IS NULL OR (l.transferencia_lado = 'tarifa' AND EXISTS (SELECT 1 FROM public.transferencias_bancarias t WHERE t.id = l.transferencia_id AND t.status = 'conciliada')))
      AND l.transferencia_cofre_lado IS NULL
  ), por_centro AS (
    SELECT
      c.id,
      c.nome,
      COALESCE(SUM(b.receita), 0) AS entradas,
      COALESCE(SUM(b.despesa), 0) AS saidas,
      COALESCE(SUM(b.receita), 0) - COALESCE(SUM(b.despesa), 0) AS resultado
    FROM public.centros_custo c
    LEFT JOIN base b ON b.centro_custo_id = c.id
    WHERE COALESCE(c.status, 'ativo') <> 'excluido'
    GROUP BY c.id, c.nome
  )
  SELECT COALESCE(json_agg(json_build_object(
    'id', id, 'nome', nome, 'entradas', entradas, 'saidas', saidas, 'resultado', resultado
  ) ORDER BY (entradas + saidas) DESC, nome ASC), '[]'::json)
  INTO v_centros
  FROM por_centro;

  -- Juros e descontos sobre a base completa (antes: só as 50 linhas carregadas na tela).
  WITH base AS (
    SELECT
      l.tipo,
      CASE WHEN l.acrescimo_tipo = 'porcentagem' THEN l.valor_previsto * COALESCE(l.acrescimo_valor, 0) / 100 ELSE COALESCE(l.acrescimo_valor, 0) END AS acrescimo,
      CASE WHEN l.desconto_tipo = 'porcentagem' THEN l.valor_previsto * COALESCE(l.desconto_valor, 0) / 100 ELSE COALESCE(l.desconto_valor, 0) END AS desconto
    FROM public.lancamentos_financeiros l
    WHERE l.status_pagamento = 'pago'
      AND (p_inicio IS NULL OR l.data_vencimento >= p_inicio)
      AND (p_fim IS NULL OR l.data_vencimento <= p_fim)
      AND (p_centro_custo_id IS NULL OR l.centro_custo_id = p_centro_custo_id)
      AND (p_conta_bancaria_id IS NULL OR l.conta_bancaria_id = p_conta_bancaria_id)
      AND (l.transferencia_id IS NULL OR (l.transferencia_lado = 'tarifa' AND EXISTS (SELECT 1 FROM public.transferencias_bancarias t WHERE t.id = l.transferencia_id AND t.status = 'conciliada')))
      AND l.transferencia_cofre_lado IS NULL
  )
  SELECT json_build_object(
    'juros_pagos', COALESCE(SUM(acrescimo) FILTER (WHERE tipo = 'saida'), 0),
    'descontos_obtidos', COALESCE(SUM(desconto) FILTER (WHERE tipo = 'saida'), 0),
    'juros_recebidos', COALESCE(SUM(acrescimo) FILTER (WHERE tipo = 'entrada'), 0),
    'descontos_concedidos', COALESCE(SUM(desconto) FILTER (WHERE tipo = 'entrada'), 0)
  ) INTO v_desempenho
  FROM base;

  -- Eficiência de pagamento: títulos de saída liquidados sobre o total de saídas do escopo.
  WITH base AS (
    SELECT l.status_pagamento
    FROM public.lancamentos_financeiros l
    WHERE l.tipo = 'saida'
      AND (p_inicio IS NULL OR l.data_vencimento >= p_inicio)
      AND (p_fim IS NULL OR l.data_vencimento <= p_fim)
      AND (p_centro_custo_id IS NULL OR l.centro_custo_id = p_centro_custo_id)
      AND (p_conta_bancaria_id IS NULL OR l.conta_bancaria_id = p_conta_bancaria_id)
      AND (l.transferencia_id IS NULL OR (l.transferencia_lado = 'tarifa' AND EXISTS (SELECT 1 FROM public.transferencias_bancarias t WHERE t.id = l.transferencia_id AND t.status = 'conciliada')))
      AND l.transferencia_cofre_lado IS NULL
  ), resumo AS (
    SELECT
      (COUNT(*) FILTER (WHERE status_pagamento = 'pago'))::int AS liquidadas,
      (COUNT(*) FILTER (WHERE status_pagamento <> 'pago' AND status_pagamento <> 'bpi'))::int AS abertas,
      (COUNT(*) FILTER (WHERE status_pagamento = 'bpi'))::int AS bpi,
      (COUNT(*))::int AS total
    FROM base
  )
  SELECT json_build_object(
    'liquidadas', liquidadas,
    'abertas', abertas,
    'bpi', bpi,
    'total', total,
    'percentual', CASE WHEN total > 0 THEN ROUND((liquidadas::numeric / total) * 100, 1) ELSE 0 END
  ) INTO v_eficiencia
  FROM resumo;

  RETURN json_build_object(
    'centros', v_centros,
    'desempenho', v_desempenho,
    'eficiencia', v_eficiencia
  );
END;
$function$