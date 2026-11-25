CREATE OR REPLACE FUNCTION public.importar_lancamentos(p_lote jsonb, p_conciliar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '60s'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_lote_id uuid;
  v_linha jsonb;
  v_linhas jsonb := COALESCE(p_lote -> 'linhas', '[]'::jsonb);
  v_finalizar boolean := COALESCE((p_lote ->> 'finalizar')::boolean, true);
  v_importadas integer := 0;
  v_importadas_lote integer := 0;
  v_conciliadas integer := 0;
  v_erros jsonb := '[]'::jsonb;
  v_valor_total numeric := 0;
  v_lancamento_id uuid;
  v_transacao_id uuid;
  v_tipo public.tipo_movimento;
  v_valor numeric;
  v_valor_assinado numeric;
  v_valor_centavos bigint;
  v_tipo_mov text;
  v_vencimento date;
  v_emissao date;
  v_competencia date;
  v_recebido boolean;
  v_pagamento date;
  v_obs text;
  v_arquivo text;
  v_linha_num integer;
  v_erro text;
  v_conta_id uuid;
  v_conta_nome text;
  v_permite_negativo boolean;
  v_limite_negativo numeric;
  v_saldo_apos numeric;
  v_contas_debito uuid[] := '{}';
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Importação exige usuário autenticado';
  END IF;
  IF public.current_user_role() NOT IN ('master', 'gerente') THEN
    RAISE EXCEPTION 'Somente Master ou Gerente podem importar lançamentos';
  END IF;

  -- Carga de histórico já quitado: autoriza a gravação de lançamentos já recebidos
  -- (ver proteger_previsao_sinalizada) sem abrir a aprovação para outros perfis.
  -- A mesma flag desliga a checagem de saldo linha a linha do gatilho
  -- trg_proteger_saldo_operacional: ela é refeita uma vez por conta, ao fim de cada lote.
  PERFORM set_config('app.importacao_operacao', 'on', true);
  IF jsonb_array_length(v_linhas) = 0 THEN
    RAISE EXCEPTION 'Nenhuma linha informada para importação';
  END IF;

  v_arquivo := NULLIF(btrim(COALESCE(p_lote ->> 'arquivo_nome', '')), '');

  -- Importação fatiada: a primeira chamada cria o lote e devolve o id; as seguintes
  -- recebem esse id em p_lote->>'lote_id' e apenas acrescentam itens. O lote continua
  -- sendo um só, então "Desfazer" remove a importação inteira de uma vez.
  v_lote_id := NULLIF(btrim(COALESCE(p_lote ->> 'lote_id', '')), '')::uuid;

  IF v_lote_id IS NULL THEN
    INSERT INTO public.importacoes_dados (user_id, arquivo_nome, arquivo_hash, total_linhas)
    VALUES (v_user, v_arquivo, NULLIF(btrim(COALESCE(p_lote ->> 'arquivo_hash', '')), ''), jsonb_array_length(v_linhas))
    RETURNING id INTO v_lote_id;
  ELSE
    UPDATE public.importacoes_dados
    SET total_linhas = total_linhas + jsonb_array_length(v_linhas)
    WHERE id = v_lote_id AND user_id = v_user AND status <> 'desfeita';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lote de importação não encontrado para este usuário';
    END IF;
  END IF;

  FOR v_linha IN SELECT value FROM jsonb_array_elements(v_linhas) LOOP
    v_linha_num := COALESCE((v_linha ->> 'linha')::integer, 0);
    v_erro := NULL;

    BEGIN
      v_tipo := (v_linha ->> 'tipo')::public.tipo_movimento;
      v_valor := ROUND((v_linha ->> 'valor')::numeric, 2);
      v_vencimento := (v_linha ->> 'vencimento')::date;
      v_emissao := COALESCE(NULLIF(v_linha ->> 'emissao', '')::date, v_vencimento);
      v_competencia := NULLIF(v_linha ->> 'competencia', '')::date;
      v_recebido := COALESCE((v_linha ->> 'recebido')::boolean, false);
      v_pagamento := NULLIF(v_linha ->> 'data_pagamento', '')::date;

      IF v_tipo IS NULL THEN RAISE EXCEPTION 'Tipo (entrada/saída) não definido'; END IF;
      IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
      IF v_vencimento IS NULL THEN RAISE EXCEPTION 'Data de vencimento obrigatória'; END IF;
      IF NULLIF(v_linha ->> 'conta_id', '') IS NULL THEN RAISE EXCEPTION 'Conta não informada'; END IF;
      IF NULLIF(v_linha ->> 'entidade_id', '') IS NULL THEN RAISE EXCEPTION 'Cliente/Fornecedor não informado'; END IF;
      IF NULLIF(v_linha ->> 'categoria_id', '') IS NULL THEN RAISE EXCEPTION 'Categoria não informada'; END IF;
      IF NULLIF(v_linha ->> 'centro_custo_id', '') IS NULL THEN RAISE EXCEPTION 'Centro de custo não informado'; END IF;

      v_obs := NULLIF(btrim(concat_ws(' | ',
        NULLIF(btrim(COALESCE(v_linha ->> 'descricao', '')), ''),
        NULLIF(btrim(COALESCE(v_linha ->> 'anotacoes', '')), '')
      )), '');

      INSERT INTO public.lancamentos_financeiros (
        user_id, tipo, valor_previsto, data_vencimento, data_emissao, data_competencia,
        entidade_id, centro_custo_id, categoria_id, conta_bancaria_id,
        observacoes, documento_numero, status_aprovacao, status_pagamento,
        valor_recebido, data_pagamento, ja_recebido, usuario_criador_id,
        data_aprovacao, usuario_aprovador_id, tipo_baixa, condicao,
        desconto_valor, desconto_tipo, acrescimo_valor, acrescimo_tipo
      ) VALUES (
        v_user, v_tipo, v_valor, v_vencimento, v_emissao, v_competencia,
        (v_linha ->> 'entidade_id')::uuid,
        (v_linha ->> 'centro_custo_id')::uuid,
        (v_linha ->> 'categoria_id')::uuid,
        (v_linha ->> 'conta_id')::uuid,
        v_obs,
        NULLIF(btrim(COALESCE(v_linha ->> 'ref', '')), ''),
        CASE WHEN v_recebido THEN 'confirmado_master'::public.status_aprovacao ELSE 'digital'::public.status_aprovacao END,
        CASE WHEN v_recebido THEN 'pago'::public.status_pagamento ELSE 'aberto'::public.status_pagamento END,
        CASE WHEN v_recebido THEN v_valor ELSE 0 END,
        CASE WHEN v_recebido THEN COALESCE(v_pagamento, v_vencimento) ELSE NULL END,
        false,
        v_user,
        CASE WHEN v_recebido THEN now() ELSE NULL END,
        CASE WHEN v_recebido THEN v_user ELSE NULL END,
        'financeira',
        'a_prazo',
        0, 'valor', 0, 'valor'
      ) RETURNING id INTO v_lancamento_id;

      INSERT INTO public.importacoes_dados_itens (lote_id, lancamento_id, linha_origem)
      VALUES (v_lote_id, v_lancamento_id, NULLIF(v_linha_num, 0));

      v_importadas := v_importadas + 1;
      v_valor_total := v_valor_total + v_valor;

      -- Linha de saída já paga aumenta o débito da conta. Guardamos a conta para
      -- conferir o saldo uma única vez, depois de todas as linhas do lote (o gatilho de
      -- saldo não roda durante a importação).
      IF v_tipo = 'saida' AND v_recebido THEN
        v_conta_id := (v_linha ->> 'conta_id')::uuid;
        IF NOT (v_conta_id = ANY (v_contas_debito)) THEN
          v_contas_debito := v_contas_debito || v_conta_id;
        END IF;
      END IF;

      -- Conciliação opcional: quando a planilha já é o extrato (verdade bancária), o título
      -- entra com o selo "Conciliado". Cada linha recebida ganha a transação bancária
      -- correspondente e o vínculo de conciliação, evitando reimportar o extrato depois.
      IF p_conciliar AND v_recebido THEN
        v_valor_centavos := ROUND(v_valor * 100)::bigint;
        IF v_tipo = 'entrada' THEN
          v_tipo_mov := 'credito';
          v_valor_assinado := v_valor;
        ELSE
          v_tipo_mov := 'debito';
          v_valor_centavos := -v_valor_centavos;
          v_valor_assinado := -v_valor;
        END IF;

        INSERT INTO public.transacoes_banco (
          conta_bancaria_id, data_transacao, valor, descricao_banco,
          tipo_movimento, hash_transacao, status_conciliacao,
          data_original, descricao_original, valor_centavos, arquivo_nome
        ) VALUES (
          (v_linha ->> 'conta_id')::uuid,
          COALESCE(v_pagamento, v_vencimento),
          v_valor_assinado,
          COALESCE(NULLIF(v_obs, ''), 'Migração de dados'),
          v_tipo_mov,
          'migracao:' || v_lote_id::text || ':' || COALESCE(v_linha_num, 0)::text,
          true,
          to_char(COALESCE(v_pagamento, v_vencimento), 'DD/MM/YYYY'),
          COALESCE(NULLIF(v_obs, ''), 'Migração de dados'),
          v_valor_centavos,
          v_arquivo
        ) RETURNING id INTO v_transacao_id;

        PERFORM set_config('app.conciliacao_operacao', 'on', true);
        INSERT INTO public.conciliacoes (
          lancamento_id, transacao_banco_id, usuario_conciliador_id, grupo_conciliacao_id
        ) VALUES (
          v_lancamento_id, v_transacao_id, v_user, gen_random_uuid()
        );
        PERFORM set_config('app.conciliacao_operacao', 'off', true);

        v_conciliadas := v_conciliadas + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_erro := SQLERRM;
    END;

    IF v_erro IS NOT NULL THEN
      v_erros := v_erros || jsonb_build_object('linha', v_linha_num, 'motivo', v_erro);
    END IF;
  END LOOP;

  -- Regra de saldo da importação: uma conferência por conta afetada, depois de todas as
  -- linhas. Antes o gatilho refazia a conta inteira a cada linha de saída, o que fazia uma
  -- planilha de 403 saídas passar de 100 s e estourar o tempo limite da operação.
  FOREACH v_conta_id IN ARRAY v_contas_debito LOOP
    v_saldo_apos := public.saldo_operacional_conta(v_conta_id);
    CONTINUE WHEN v_saldo_apos IS NULL;

    SELECT c.nome, c.permite_saldo_negativo, c.limite_saldo_negativo
      INTO v_conta_nome, v_permite_negativo, v_limite_negativo
    FROM public.contas_bancarias c
    WHERE c.id = v_conta_id;

    -- Mesmo piso do gatilho: conta que aceita saldo negativo opera abaixo de zero; com
    -- limite cadastrado, o piso é -limite.
    CONTINUE WHEN v_permite_negativo
      AND (v_limite_negativo IS NULL OR v_saldo_apos >= -v_limite_negativo - 0.005);
    CONTINUE WHEN v_saldo_apos >= -0.005;

    RAISE EXCEPTION 'A importação deixaria a conta "%" com saldo negativo: R$ %. Ajuste o saldo inicial da conta ou autorize saldo negativo antes de importar.',
      COALESCE(v_conta_nome, 'sem nome'),
      replace(to_char(v_saldo_apos, 'FM999999999990.00'), '.', ',');
  END LOOP;

  -- Totais do lote acumulam entre os lotes da mesma importação.
  UPDATE public.importacoes_dados
  SET importadas = importadas + v_importadas,
      erros = erros + jsonb_array_length(v_erros),
      valor_total = valor_total + v_valor_total,
      status = CASE WHEN erros + jsonb_array_length(v_erros) > 0 THEN 'parcial' ELSE 'concluida' END
  WHERE id = v_lote_id
  RETURNING importadas INTO v_importadas_lote;

  -- Troca a enxurrada de notificações individuais por um resumo único do lote.
  DELETE FROM public.notifications n
  WHERE n.origem = 'lancamento_novo'
    AND n.link IN (
      SELECT '/lancamentos?id=' || i.lancamento_id::text
      FROM public.importacoes_dados_itens i
      WHERE i.lote_id = v_lote_id
    );

  IF v_arquivo IS NULL THEN
    SELECT d.arquivo_nome INTO v_arquivo FROM public.importacoes_dados d WHERE d.id = v_lote_id;
  END IF;

  -- O resumo só sai no último lote da importação; senão cada lote geraria uma notificação.
  IF v_finalizar AND v_importadas_lote > 0 THEN
    INSERT INTO public.notifications (user_id, title, message, type, link, origem)
    SELECT p.id,
           'Importação de dados concluída',
           v_importadas_lote || ' lançamento(s) importados de ' || COALESCE(v_arquivo, 'arquivo') || '.',
           'info', '/conciliacao', 'importacao_dados'
    FROM public.profiles p
    WHERE p.role = 'master' AND COALESCE(p.status, true);
  END IF;

  RETURN jsonb_build_object(
    'lote_id', v_lote_id,
    'importadas', v_importadas,
    'conciliadas', v_conciliadas,
    'erros', v_erros,
    'valor_total', v_valor_total
  );
END;
$function$;