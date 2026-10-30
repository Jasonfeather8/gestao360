CREATE OR REPLACE FUNCTION public.criar_transferencia_atomica(p_conta_origem_id uuid, p_conta_destino_id uuid, p_valor_centavos bigint, p_data_transferencia date, p_tarifa_centavos bigint DEFAULT 0, p_tarifa_categoria_id uuid DEFAULT NULL::uuid, p_tarifa_centro_custo_id uuid DEFAULT NULL::uuid, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := public.current_user_role();
  v_origem uuid;
  v_destino uuid;
  v_origem_nome text;
  v_destino_nome text;
  v_transferencia_id uuid := gen_random_uuid();
  v_saida_id uuid;
  v_entrada_id uuid;
  v_tarifa_id uuid;
  v_valor numeric(12,2);
  v_tarifa numeric(12,2);
  v_aprovacao public.status_aprovacao;
  v_row public.transferencias_bancarias;
  v_obs text := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_sufixo text := CASE WHEN NULLIF(btrim(COALESCE(p_observacao, '')), '') IS NOT NULL
    THEN ' • ' || btrim(p_observacao) ELSE '' END;
  v_descricao text;
  v_descricao_tarifa text;
BEGIN
  IF v_user_id IS NULL OR v_role NOT IN ('master','gerente','colaborador') THEN RAISE EXCEPTION 'Usuário não autorizado a criar transferência'; END IF;
  IF p_conta_origem_id IS NULL OR p_conta_destino_id IS NULL OR p_conta_origem_id = p_conta_destino_id THEN RAISE EXCEPTION 'As contas de origem e destino devem ser diferentes'; END IF;
  IF p_valor_centavos IS NULL OR p_valor_centavos <= 0 THEN RAISE EXCEPTION 'O valor da transferência deve ser maior que zero'; END IF;
  IF p_data_transferencia IS NULL THEN RAISE EXCEPTION 'A data da transferência é obrigatória'; END IF;
  IF COALESCE(p_tarifa_centavos,0) < 0 THEN RAISE EXCEPTION 'A tarifa não pode ser negativa'; END IF;
  SELECT id, COALESCE(NULLIF(btrim(nome_banco), ''), nome) INTO v_origem, v_origem_nome FROM public.contas_bancarias WHERE id = p_conta_origem_id AND status <> 'excluido' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta de origem não encontrada ou inativa'; END IF;
  SELECT id, COALESCE(NULLIF(btrim(nome_banco), ''), nome) INTO v_destino, v_destino_nome FROM public.contas_bancarias WHERE id = p_conta_destino_id AND status <> 'excluido' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta de destino não encontrada ou inativa'; END IF;
  v_valor := (p_valor_centavos::numeric / 100);
  v_tarifa := (COALESCE(p_tarifa_centavos,0)::numeric / 100);
  PERFORM public.assert_saldo_operacional(v_origem, v_valor + v_tarifa);
  v_aprovacao := CASE WHEN v_role = 'master' THEN 'confirmado_master'::public.status_aprovacao ELSE 'digital'::public.status_aprovacao END;
  v_descricao := 'Transferência entre contas: ' || v_origem_nome || ' → ' || v_destino_nome || ' · Cód. ' || v_transferencia_id::text;
  v_descricao_tarifa := 'Tarifa da transferência entre contas: ' || v_origem_nome || ' → ' || v_destino_nome || ' · Cód. ' || v_transferencia_id::text;
  INSERT INTO public.transferencias_bancarias (id, conta_origem_id, conta_destino_id, valor, data_transferencia, status, criado_por) VALUES (v_transferencia_id, v_origem, v_destino, v_valor, p_data_transferencia, 'aberta', v_user_id);
  INSERT INTO public.lancamentos_financeiros (user_id, usuario_criador_id, tipo, valor_previsto, valor_original, data_vencimento, data_emissao, data_competencia, conta_bancaria_id, observacoes, status_aprovacao, status_pagamento, valor_recebido, data_pagamento, tipo_baixa, transferencia_id, transferencia_lado) VALUES (v_user_id, v_user_id, 'saida'::public.tipo_movimento, v_valor, v_valor, p_data_transferencia, p_data_transferencia, p_data_transferencia, v_origem, v_descricao || v_sufixo, v_aprovacao, 'aberto'::public.status_pagamento, 0, NULL, 'financeira', v_transferencia_id, 'origem') RETURNING id INTO v_saida_id;
  INSERT INTO public.lancamentos_financeiros (user_id, usuario_criador_id, tipo, valor_previsto, valor_original, data_vencimento, data_emissao, data_competencia, conta_bancaria_id, observacoes, status_aprovacao, status_pagamento, valor_recebido, data_pagamento, tipo_baixa, transferencia_id, transferencia_lado) VALUES (v_user_id, v_user_id, 'entrada'::public.tipo_movimento, v_valor, v_valor, p_data_transferencia, p_data_transferencia, p_data_transferencia, v_destino, v_descricao || v_sufixo, v_aprovacao, 'aberto'::public.status_pagamento, 0, NULL, 'financeira', v_transferencia_id, 'destino') RETURNING id INTO v_entrada_id;
  IF COALESCE(p_tarifa_centavos,0) > 0 THEN INSERT INTO public.lancamentos_financeiros (user_id, usuario_criador_id, tipo, valor_previsto, valor_original, data_vencimento, data_emissao, data_competencia, conta_bancaria_id, categoria_id, centro_custo_id, observacoes, status_aprovacao, status_pagamento, valor_recebido, data_pagamento, tipo_baixa, transferencia_id, transferencia_lado) VALUES (v_user_id, v_user_id, 'saida'::public.tipo_movimento, v_tarifa, v_tarifa, p_data_transferencia, p_data_transferencia, p_data_transferencia, v_origem, p_tarifa_categoria_id, p_tarifa_centro_custo_id, v_descricao_tarifa || v_sufixo, v_aprovacao, 'aberto'::public.status_pagamento, 0, NULL, 'financeira', v_transferencia_id, 'tarifa') RETURNING id INTO v_tarifa_id; END IF;
  UPDATE public.transferencias_bancarias SET lancamento_saida_id = v_saida_id, lancamento_entrada_id = v_entrada_id, tarifa_lancamento_id = v_tarifa_id, updated_at = now() WHERE id = v_transferencia_id RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$function$;