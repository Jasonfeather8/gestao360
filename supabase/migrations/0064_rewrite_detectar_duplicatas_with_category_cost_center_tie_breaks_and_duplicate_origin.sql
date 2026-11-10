CREATE OR REPLACE FUNCTION public.detectar_duplicatas(p_chaves jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH chaves AS (
    SELECT
      (chave ->> 'indice')::integer AS ordem,
      NULLIF(chave ->> 'conta_id', '')::uuid AS conta_id,
      NULLIF(chave ->> 'vencimento', '')::date AS vencimento,
      ROUND(COALESCE((chave ->> 'valor')::numeric, 0), 2) AS valor,
      lower(regexp_replace(btrim(COALESCE(chave ->> 'observacoes', '')), '\s+', ' ', 'g')) AS observacoes,
      NULLIF(chave ->> 'categoria_id', '')::uuid AS categoria_id,
      NULLIF(chave ->> 'centro_custo_id', '')::uuid AS centro_custo_id
    FROM jsonb_array_elements(COALESCE(p_chaves, '[]'::jsonb)) AS chave
  ),
  correspondencias AS (
    SELECT
      c.ordem,
      o.arquivo_nome,
      o.importado_em
    FROM chaves c
    JOIN LATERAL (
      SELECT l.id
      FROM public.lancamentos_financeiros l
      WHERE c.conta_id IS NOT NULL
        AND c.vencimento IS NOT NULL
        AND l.conta_bancaria_id = c.conta_id
        AND l.data_vencimento = c.vencimento
        AND ROUND(l.valor_previsto, 2) = c.valor
        AND lower(regexp_replace(btrim(COALESCE(l.observacoes, '')), '\s+', ' ', 'g')) = c.observacoes
        AND (c.categoria_id IS NULL OR l.categoria_id = c.categoria_id)
        AND (c.centro_custo_id IS NULL OR l.centro_custo_id = c.centro_custo_id)
      ORDER BY l.created_at, l.id
      LIMIT 1
    ) AS l ON true
    LEFT JOIN LATERAL (
      SELECT d.arquivo_nome, d.created_at AS importado_em
      FROM public.importacoes_dados_itens i
      JOIN public.importacoes_dados d ON d.id = i.lote_id
      WHERE i.lancamento_id = l.id
      ORDER BY d.created_at, d.id
      LIMIT 1
    ) AS o ON true
  )
  SELECT jsonb_build_object(
    'duplicados', COALESCE((SELECT jsonb_agg(ordem ORDER BY ordem) FROM correspondencias), '[]'::jsonb),
    'origens', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('indice', ordem, 'arquivo_nome', arquivo_nome, 'importado_em', importado_em) ORDER BY ordem)
      FROM correspondencias
    ), '[]'::jsonb)
  )
$function$