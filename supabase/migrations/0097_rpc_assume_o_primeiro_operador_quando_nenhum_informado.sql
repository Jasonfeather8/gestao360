CREATE OR REPLACE FUNCTION public.get_movimentacao_operadores(
  p_inicio date DEFAULT NULL,
  p_fim date DEFAULT NULL,
  p_operador_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_operadores jsonb;
  v_resumo jsonb;
  v_itens jsonb;
  v_operador uuid;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'master' THEN
    RAISE EXCEPTION 'Acesso restrito ao Master';
  END IF;

  WITH criacoes AS (
    SELECT l.usuario_criador_id AS uid,
           count(*) AS criados,
           COALESCE(sum(CASE WHEN l.tipo = 'entrada' THEN abs(l.valor_previsto) ELSE 0 END), 0) AS entradas_valor,
           COALESCE(sum(CASE WHEN l.tipo = 'saida' THEN abs(l.valor_previsto) ELSE 0 END), 0) AS saidas_valor
    FROM public.lancamentos_financeiros l
    WHERE l.usuario_criador_id IS NOT NULL
      AND (p_inicio IS NULL OR l.created_at::date >= p_inicio)
      AND (p_fim IS NULL OR l.created_at::date <= p_fim)
    GROUP BY l.usuario_criador_id
  ),
  execucoes AS (
    SELECT a.usuario_id AS uid, count(*) AS acoes
    FROM public.auditoria_logs a
    WHERE a.usuario_id IS NOT NULL
      AND a.tabela_afetada IN ('lancamentos_financeiros', 'conciliacoes')
      AND a.acao <> 'Novo Lançamento'
      AND NOT (a.tabela_afetada = 'lancamentos_financeiros' AND a.origem_alteracao = 'conciliacao_bancaria')
      AND (p_inicio IS NULL OR a.data_hora::date >= p_inicio)
      AND (p_fim IS NULL OR a.data_hora::date <= p_fim)
    GROUP BY a.usuario_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'nome', COALESCE(NULLIF(btrim(p.nome), ''), p.email, 'Sem nome'),
           'email', p.email,
           'role', p.role::text,
           'criados', COALESCE(c.criados, 0),
           'entradas_valor', COALESCE(c.entradas_valor, 0),
           'saidas_valor', COALESCE(c.saidas_valor, 0),
           'acoes', COALESCE(e.acoes, 0)
         ) ORDER BY COALESCE(NULLIF(btrim(p.nome), ''), p.email, 'Sem nome')), '[]'::jsonb)
  INTO v_operadores
  FROM public.profiles p
  LEFT JOIN criacoes c ON c.uid = p.id
  LEFT JOIN execucoes e ON e.uid = p.id
  WHERE p.role <> 'master' AND COALESCE(p.status, true);

  -- Sem operador informado, assume o primeiro da lista: a tela nunca abre vazia e o
  -- cliente não precisa disparar uma segunda consulta só para escolher a seleção inicial.
  v_operador := p_operador_id;
  IF v_operador IS NULL THEN
    SELECT p.id INTO v_operador
    FROM public.profiles p
    WHERE p.role <> 'master' AND COALESCE(p.status, true)
    ORDER BY COALESCE(NULLIF(btrim(p.nome), ''), p.email, 'Sem nome')
    LIMIT 1;
  END IF;

  IF v_operador IS NULL THEN
    RETURN jsonb_build_object('operadores', v_operadores, 'resumo', NULL, 'itens', '[]'::jsonb);
  END IF;

  WITH mov AS (
    SELECT 'criacao'::text AS categoria,
           'Novo Lançamento'::text AS acao,
           l.id AS lancamento_id,
           l.created_at AS data_hora,
           l.tipo::text AS tipo,
           abs(l.valor_previsto) AS valor,
           l.observacoes AS descricao,
           l.status_pagamento::text AS status_pagamento,
           l.codigo_sequencial
    FROM public.lancamentos_financeiros l
    WHERE l.usuario_criador_id = v_operador
      AND (p_inicio IS NULL OR l.created_at::date >= p_inicio)
      AND (p_fim IS NULL OR l.created_at::date <= p_fim)

    UNION ALL

    SELECT CASE
             WHEN a.tabela_afetada = 'conciliacoes' THEN 'conciliacao'
             WHEN a.acao LIKE 'Aprovação Master%' THEN 'aprovacao'
             WHEN a.acao = 'Reprovação Master' THEN 'reprovacao'
             WHEN a.acao = 'Estorno' THEN 'estorno'
             WHEN a.acao LIKE 'AVR%' THEN 'ajuste'
             WHEN a.acao LIKE 'Ajuste%' THEN 'ajuste'
             WHEN a.acao LIKE 'BPI%' THEN 'baixa'
             WHEN a.acao LIKE 'Exclusão%' THEN 'exclusao'
             WHEN a.status_novo LIKE 'quitação_pendente%' OR a.status_novo LIKE 'pago%' THEN 'baixa'
             ELSE 'outro'
           END AS categoria,
           a.acao,
           a.lancamento_id,
           a.data_hora,
           l.tipo::text AS tipo,
           COALESCE(NULLIF(l.valor_recebido, 0), abs(l.valor_previsto),
                    NULLIF((a.dados_novos->>'valor_recebido')::numeric, 0),
                    abs((a.dados_novos->>'valor_previsto')::numeric), 0) AS valor,
           l.observacoes AS descricao,
           COALESCE(l.status_pagamento::text, a.status_novo) AS status_pagamento,
           l.codigo_sequencial
    FROM public.auditoria_logs a
    LEFT JOIN public.lancamentos_financeiros l ON l.id = a.lancamento_id
    WHERE a.usuario_id = v_operador
      AND a.tabela_afetada IN ('lancamentos_financeiros', 'conciliacoes')
      AND a.acao <> 'Novo Lançamento'
      AND NOT (a.tabela_afetada = 'lancamentos_financeiros' AND a.origem_alteracao = 'conciliacao_bancaria')
      AND (p_inicio IS NULL OR a.data_hora::date >= p_inicio)
      AND (p_fim IS NULL OR a.data_hora::date <= p_fim)
  )
  SELECT jsonb_build_object(
           'entradas_valor', COALESCE(sum(CASE WHEN categoria = 'criacao' AND tipo = 'entrada' THEN valor ELSE 0 END), 0),
           'entradas_qtd', count(*) FILTER (WHERE categoria = 'criacao' AND tipo = 'entrada'),
           'saidas_valor', COALESCE(sum(CASE WHEN categoria = 'criacao' AND tipo = 'saida' THEN valor ELSE 0 END), 0),
           'saidas_qtd', count(*) FILTER (WHERE categoria = 'criacao' AND tipo = 'saida'),
           'baixas_valor', COALESCE(sum(CASE WHEN categoria = 'baixa' THEN valor ELSE 0 END), 0),
           'baixas_qtd', count(*) FILTER (WHERE categoria = 'baixa'),
           'conciliacoes_qtd', count(*) FILTER (WHERE categoria = 'conciliacao'),
           'aprovacoes_qtd', count(*) FILTER (WHERE categoria = 'aprovacao'),
           'ajustes_qtd', count(*) FILTER (WHERE categoria = 'ajuste'),
           'estornos_qtd', count(*) FILTER (WHERE categoria = 'estorno'),
           'outras_qtd', count(*) FILTER (WHERE categoria IN ('outro', 'exclusao', 'reprovacao')),
           'total_acoes', count(*) FILTER (WHERE categoria <> 'criacao'),
           'total_movimentos', count(*)
         ),
         COALESCE(jsonb_agg(jsonb_build_object(
           'categoria', categoria,
           'acao', acao,
           'lancamento_id', lancamento_id,
           'data_hora', data_hora,
           'tipo', tipo,
           'valor', valor,
           'descricao', descricao,
           'status_pagamento', status_pagamento,
           'codigo_sequencial', codigo_sequencial
         ) ORDER BY data_hora DESC) FILTER (WHERE data_hora IS NOT NULL), '[]'::jsonb)
  INTO v_resumo, v_itens
  FROM mov;

  RETURN jsonb_build_object('operadores', v_operadores, 'resumo', v_resumo, 'itens', v_itens);
END;
$function$;