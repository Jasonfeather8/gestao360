CREATE OR REPLACE FUNCTION public.get_dashboard_indicadores(
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
  v_is_master boolean;
  v_saldo_inicial numeric;
  v_saldos json;
  v_cobertura json;
  v_carteira json;
  v_periodo json;
  v_centros json;
  v_meses json;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  v_is_master := COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), public.current_user_role()) = 'master';

  SELECT COALESCE(SUM(saldo_inicial), 0) INTO v_saldo_inicial
  FROM public.contas_bancarias
  WHERE status = 'ativo';

  -- Saldos de caixa: posição atual da empresa. Não reage ao período, ao centro de custo nem à
  -- conta, porque caixa é uma posição global (o saldo por conta tem bloco próprio).
  WITH base AS (
    SELECT
      CASE WHEN l.tipo = 'entrada' THEN COALESCE(l.valor_recebido, l.valor_previsto) ELSE -COALESCE(l.valor_recebido, l.valor_previsto) END AS movimento_real,
      CASE WHEN l.tipo = 'entrada' THEN l.valor_previsto ELSE -l.valor_previsto END AS movimento_simulado,
      public.lancamento_saldo_real_confirmado(l.id) AS real_ok,
      public.lancamento_saldo_operacional(l.id) AS oper_ok,
      public.lancamento_saldo_simulado(l.id) AS sim_ok
    FROM public.lancamentos_financeiros l
    WHERE (l.transferencia_id IS NULL OR (l.transferencia_lado = 'tarifa' AND EXISTS (SELECT 1 FROM public.transferencias_bancarias t WHERE t.id = l.transferencia_id AND t.status = 'conciliada')))
      AND l.transferencia_cofre_lado IS NULL
  )
  SELECT json_build_object(
    'real', v_saldo_inicial + COALESCE(SUM(movimento_real) FILTER (WHERE real_ok), 0),
    'operacional', v_saldo_inicial + COALESCE(SUM(movimento_real) FILTER (WHERE oper_ok), 0),
    'simulado', v_saldo_inicial + COALESCE(SUM(movimento_simulado) FILTER (WHERE sim_ok), 0)
  ) INTO v_saldos
  FROM base;

  -- Provisões: reage ao centro de custo e à conta. A cobertura continua sendo medida contra o
  -- caixa real da empresa (não existe caixa por centro de custo ou por conta).
  WITH provisoes AS (
    SELECT
      l.id,
      COALESCE(NULLIF(l.observacoes, ''), 'Lançamento sem descrição') AS descricao,
      e.nome_razao_social AS entidade,
      l.data_vencimento,
      l.codigo_sequencial,
      l.valor_previsto AS valor
    FROM public.lancamentos_financeiros l
    LEFT JOIN public.entidades_negocio e ON e.id = l.entidade_id
    WHERE l.tipo = 'saida'
      AND NOT public.lancamento_saldo_real_confirmado(l.id)
      AND l.status_pagamento <> 'bpi'
      AND (p_centro_custo_id IS NULL OR l.centro_custo_id = p_centro_custo_id)
      AND (p_conta_bancaria_id IS NULL OR l.conta_bancaria_id = p_conta_bancaria_id)
      AND (l.transferencia_id IS NULL OR (l.transferencia_lado = 'tarifa' AND EXISTS (SELECT 1 FROM public.transferencias_bancarias t WHERE t.id = l.transferencia_id AND t.status = 'conciliada')))
      AND l.transferencia_cofre_lado IS NULL
  ), acumuladas AS (
    SELECT p.*, SUM(p.valor) OVER (ORDER BY p.data_vencimento ASC NULLS LAST, p.codigo_sequencial ASC) AS acumulado
    FROM provisoes p
  ), avaliadas AS (
    SELECT a.*, (a.acumulado <= (v_saldos ->> 'real')::numeric) AS coberto
    FROM acumuladas a
  )
  SELECT json_build_object(
    'total_provisoes', COALESCE((SELECT SUM(valor) FROM avaliadas), 0),
    'total_coberto', COALESCE((SELECT SUM(valor) FROM avaliadas WHERE coberto), 0),
    'total_descoberto', COALESCE((SELECT SUM(valor) FROM avaliadas WHERE NOT coberto), 0),
    'percentual_coberto', COALESCE((
      SELECT CASE WHEN SUM(valor) > 0 THEN ROUND((SUM(valor) FILTER (WHERE coberto) / SUM(valor)) * 100, 1) ELSE 0 END
      FROM avaliadas
    ), 0),
    'itens', COALESCE((
      SELECT json_agg(json_build_object(
        'id', id, 'descricao', descricao, 'entidade', entidade,
        'vencimento', data_vencimento, 'valor', valor, 'acumulado', acumulado, 'coberto', coberto
      ))
      FROM (SELECT * FROM avaliadas ORDER BY data_vencimento ASC NULLS LAST, codigo_sequencial ASC LIMIT 300) i
    ), '[]'::json),
    'ponto_estouro', (
      SELECT json_build_object(
        'vencimento', data_vencimento, 'descricao', descricao, 'entidade', entidade,
        'valor', valor, 'acumulado', acumulado, 'faltando', acumulado - (v_saldos ->> 'real')::numeric
      )
      FROM avaliadas
      WHERE NOT coberto
      ORDER BY data_vencimento ASC NULLS LAST, codigo_sequencial ASC
      LIMIT 1
    )
  ) INTO v_cobertura;

  -- Carteira a receber: reage ao período (vencimento), ao centro de custo e à conta.
  WITH receber AS (
    SELECT
      l.status_pagamento,
      l.data_vencimento,
      COALESCE(l.valor_recebido, public.valor_lancamento_ajustado_centavos(l.valor_previsto, l.desconto_valor, l.desconto_tipo, l.acrescimo_valor, l.acrescimo_tipo) / 100.0) AS valor,
      public.lancamento_saldo_real_confirmado(l.id) AS real_ok
    FROM public.lancamentos_financeiros l
    JOIN public.entidades_negocio e ON e.id = l.entidade_id AND e.tipo IN ('cliente', 'ambos')
    WHERE l.tipo = 'entrada'
      AND (p_inicio IS NULL OR l.data_vencimento >= p_inicio)
      AND (p_fim IS NULL OR l.data_vencimento <= p_fim)
      AND (p_centro_custo_id IS NULL OR l.centro_custo_id = p_centro_custo_id)
      AND (p_conta_bancaria_id IS NULL OR l.conta_bancaria_id = p_conta_bancaria_id)
      AND (l.transferencia_id IS NULL OR (l.transferencia_lado = 'tarifa' AND EXISTS (SELECT 1 FROM public.transferencias_bancarias t WHERE t.id = l.transferencia_id AND t.status = 'conciliada')))
      AND l.transferencia_cofre_lado IS NULL
  )
  SELECT json_build_object(
    'pago_regular', COALESCE(SUM(valor) FILTER (WHERE status_pagamento <> 'bpi' AND (real_ok OR data_vencimento >= CURRENT_DATE)), 0),
    'atrasado', COALESCE(SUM(valor) FILTER (WHERE status_pagamento <> 'bpi' AND NOT real_ok AND data_vencimento < CURRENT_DATE), 0),
    'baixa_inatividade', COALESCE(SUM(valor) FILTER (WHERE status_pagamento = 'bpi'), 0),
    'total', COALESCE(SUM(valor), 0)
  ) INTO v_carteira
  FROM receber;

  -- Indicadores do período: reagem ao período, ao centro de custo e à conta.
  WITH base AS (
    SELECT
      l.tipo,
      l.data_vencimento,
      l.categoria_id,
      l.entidade_id,
      l.status_pagamento,
      public.valor_lancamento_ajustado_centavos(l.valor_previsto, l.desconto_valor, l.desconto_tipo, l.acrescimo_valor, l.acrescimo_tipo) / 100.0 AS valor,
      COALESCE(l.valor_recebido, public.valor_lancamento_ajustado_centavos(l.valor_previsto, l.desconto_valor, l.desconto_tipo, l.acrescimo_valor, l.acrescimo_tipo) / 100.0) AS valor_efetivo,
      public.lancamento_saldo_real_confirmado(l.id) AS real_ok
    FROM public.lancamentos_financeiros l
    WHERE (p_inicio IS NULL OR l.data_vencimento >= p_inicio)
      AND (p_fim IS NULL OR l.data_vencimento <= p_fim)
      AND (p_centro_custo_id IS NULL OR l.centro_custo_id = p_centro_custo_id)
      AND (p_conta_bancaria_id IS NULL OR l.conta_bancaria_id = p_conta_bancaria_id)
      AND (l.transferencia_id IS NULL OR (l.transferencia_lado = 'tarifa' AND EXISTS (SELECT 1 FROM public.transferencias_bancarias t WHERE t.id = l.transferencia_id AND t.status = 'conciliada')))
      AND l.transferencia_cofre_lado IS NULL
  ), agg AS (
    SELECT
      COALESCE(SUM(valor_efetivo) FILTER (WHERE tipo = 'entrada' AND real_ok), 0) AS realizado_entrada,
      COALESCE(SUM(valor_efetivo) FILTER (WHERE tipo = 'saida' AND real_ok), 0) AS realizado_saida,
      COALESCE(SUM(valor) FILTER (WHERE tipo = 'entrada' AND NOT real_ok AND status_pagamento <> 'bpi'), 0) AS previsto_entrada,
      COALESCE(SUM(valor) FILTER (WHERE tipo = 'saida' AND NOT real_ok AND status_pagamento <> 'bpi'), 0) AS previsto_saida
    FROM base
  )
  SELECT json_build_object(
    'inicio', p_inicio,
    'fim', p_fim,
    'kpis', json_build_object(
      'realizado_entrada', a.realizado_entrada,
      'realizado_saida', a.realizado_saida,
      'previsto_entrada', a.previsto_entrada,
      'previsto_saida', a.previsto_saida,
      'resultado_realizado', a.realizado_entrada - a.realizado_saida,
      'saldo_projetado', (a.realizado_entrada + a.previsto_entrada) - (a.realizado_saida + a.previsto_saida),
      'margem', CASE
        WHEN a.realizado_entrada > 0 THEN ROUND(((a.realizado_entrada - a.realizado_saida) / a.realizado_entrada) * 100, 1)
        ELSE 0
      END
    ),
    'fluxo_diario', COALESCE((
      SELECT json_agg(json_build_object('data', d.dia, 'realizado', d.realizado, 'previsto', d.previsto) ORDER BY d.dia)
      FROM (
        SELECT
          data_vencimento AS dia,
          COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor_efetivo ELSE -valor_efetivo END) FILTER (WHERE real_ok), 0) AS realizado,
          COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor_efetivo ELSE -valor_efetivo END) FILTER (WHERE real_ok), 0)
            + COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END) FILTER (WHERE NOT real_ok AND status_pagamento <> 'bpi'), 0) AS previsto
        FROM base
        WHERE data_vencimento IS NOT NULL
        GROUP BY data_vencimento
      ) d
    ), '[]'::json),
    'saidas_por_categoria', COALESCE((
      SELECT json_agg(json_build_object('categoria', k.nome, 'valor', k.valor) ORDER BY k.valor DESC)
      FROM (
        SELECT COALESCE(cf.nome, 'Sem categoria') AS nome, SUM(b.valor) AS valor
        FROM base b
        LEFT JOIN public.categorias_financeiras cf ON cf.id = b.categoria_id
        WHERE b.tipo = 'saida' AND b.status_pagamento <> 'bpi'
        GROUP BY COALESCE(cf.nome, 'Sem categoria')
        ORDER BY SUM(b.valor) DESC
        LIMIT 8
      ) k
    ), '[]'::json),
    'receita_por_cliente', COALESCE((
      SELECT json_agg(json_build_object('cliente', k.nome, 'valor', k.valor) ORDER BY k.valor DESC)
      FROM (
        SELECT e.nome_razao_social AS nome, SUM(b.valor_efetivo) AS valor
        FROM base b
        JOIN public.entidades_negocio e ON e.id = b.entidade_id AND e.tipo IN ('cliente', 'ambos')
        WHERE b.tipo = 'entrada' AND b.real_ok
        GROUP BY e.nome_razao_social
        ORDER BY SUM(b.valor_efetivo) DESC
        LIMIT 5
      ) k
    ), '[]'::json)
  ) INTO v_periodo
  FROM agg a;

  IF v_is_master THEN
    WITH base AS (
      SELECT
        l.centro_custo_id,
        CASE WHEN l.tipo = 'entrada' THEN COALESCE(l.valor_recebido, public.valor_lancamento_ajustado_centavos(l.valor_previsto, l.desconto_valor, l.desconto_tipo, l.acrescimo_valor, l.acrescimo_tipo) / 100.0) ELSE 0 END AS receita,
        CASE WHEN l.tipo = 'saida' THEN COALESCE(l.valor_recebido, public.valor_lancamento_ajustado_centavos(l.valor_previsto, l.desconto_valor, l.desconto_tipo, l.acrescimo_valor, l.acrescimo_tipo) / 100.0) ELSE 0 END AS despesa
      FROM public.lancamentos_financeiros l
      WHERE public.lancamento_saldo_real_confirmado(l.id)
        AND (p_inicio IS NULL OR l.data_vencimento >= p_inicio)
        AND (p_fim IS NULL OR l.data_vencimento <= p_fim)
        AND (p_centro_custo_id IS NULL OR l.centro_custo_id = p_centro_custo_id)
        AND (p_conta_bancaria_id IS NULL OR l.conta_bancaria_id = p_conta_bancaria_id)
        AND (l.transferencia_id IS NULL OR (l.transferencia_lado = 'tarifa' AND EXISTS (SELECT 1 FROM public.transferencias_bancarias t WHERE t.id = l.transferencia_id AND t.status = 'conciliada')))
        AND l.transferencia_cofre_lado IS NULL
    ), por_centro AS (
      SELECT
        c.id,
        c.nome,
        COALESCE(SUM(b.receita), 0) AS receitas,
        COALESCE(SUM(b.despesa), 0) AS despesas,
        COALESCE(SUM(b.receita), 0) - COALESCE(SUM(b.despesa), 0) AS resultado
      FROM public.centros_custo c
      LEFT JOIN base b ON b.centro_custo_id = c.id
      WHERE COALESCE(c.status, 'ativo') <> 'excluido'
        AND (p_centro_custo_id IS NULL OR c.id = p_centro_custo_id)
      GROUP BY c.id, c.nome
    )
    SELECT json_build_object(
      'total_receitas', COALESCE((SELECT SUM(receitas) FROM por_centro), 0),
      'total_despesas', COALESCE((SELECT SUM(despesas) FROM por_centro), 0),
      'resultado', COALESCE((SELECT SUM(resultado) FROM por_centro), 0),
      'melhores', COALESCE((
        SELECT json_agg(json_build_object('id', id, 'nome', nome, 'receitas', receitas, 'despesas', despesas, 'resultado', resultado))
        FROM (SELECT * FROM por_centro WHERE resultado > 0 ORDER BY resultado DESC LIMIT 5) m
      ), '[]'::json),
      'deficitarios', COALESCE((
        SELECT json_agg(json_build_object('id', id, 'nome', nome, 'receitas', receitas, 'despesas', despesas, 'resultado', resultado))
        FROM (SELECT * FROM por_centro WHERE resultado < 0 ORDER BY resultado ASC LIMIT 5) m
      ), '[]'::json)
    ) INTO v_centros;
  END IF;

  SELECT COALESCE(json_agg(m.mes ORDER BY m.mes), '[]'::json) INTO v_meses
  FROM (
    SELECT DISTINCT to_char(l.data_vencimento, 'YYYY-MM') AS mes
    FROM public.lancamentos_financeiros l
    WHERE l.data_vencimento IS NOT NULL
  ) m;

  RETURN json_build_object(
    'saldos', v_saldos,
    'cobertura', v_cobertura,
    'carteira', v_carteira,
    'periodo', v_periodo,
    'centros_custo', v_centros,
    'meses', v_meses
  );
END;
$function$