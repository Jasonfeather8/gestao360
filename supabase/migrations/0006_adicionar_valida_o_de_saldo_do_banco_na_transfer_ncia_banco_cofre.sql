CREATE OR REPLACE FUNCTION public.criar_transferencia_cofre(p_direcao text, p_conta_bancaria_id uuid, p_cofre_id uuid, p_valor_centavos bigint, p_data_transferencia date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_role text := public.current_user_role();
  v_account public.contas_bancarias;
  v_cofre public.cofres_locais;
  v_transfer_id uuid := gen_random_uuid();
  v_launch_id uuid;
  v_mov_id uuid;
  v_value numeric := p_valor_centavos::numeric / 100;
  v_row public.transferencias_cofre;
  v_physical numeric;
  v_committed numeric;
  v_available numeric;
  v_tipo public.tipo_movimento;
  v_mov_tipo text;
BEGIN
  IF v_user IS NULL OR v_role NOT IN ('master','gerente','colaborador') THEN
    RAISE EXCEPTION 'Usuário não autorizado a transferir com o cofre';
  END IF;
  IF p_direcao NOT IN ('banco_para_cofre','cofre_para_banco')
    OR p_valor_centavos IS NULL
    OR p_valor_centavos <= 0
    OR p_data_transferencia IS NULL THEN
    RAISE EXCEPTION 'Dados da transferência banco/cofre inválidos';
  END IF;

  SELECT * INTO v_account
  FROM public.contas_bancarias
  WHERE id = p_conta_bancaria_id AND status <> 'excluido'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta bancária ativa não encontrada'; END IF;

  SELECT * INTO v_cofre
  FROM public.cofres_locais
  WHERE id = p_cofre_id AND status = 'ativo'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cofre ativo não encontrado'; END IF;

  SELECT v_cofre.saldo_inicial + COALESCE((
    SELECT SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END)
    FROM public.movimentacoes_cofre
    WHERE cofre_id = p_cofre_id AND status = 'aprovado'
  ), 0) INTO v_physical;
  SELECT COALESCE(SUM(valor), 0) INTO v_committed
  FROM public.movimentacoes_cofre
  WHERE cofre_id = p_cofre_id AND status = 'aguardando_master' AND tipo = 'saida';
  v_available := v_physical - v_committed;
  IF p_direcao = 'cofre_para_banco' AND v_value > v_available + 0.005 THEN
    RAISE EXCEPTION 'Saldo físico disponível insuficiente no cofre';
  END IF;

  -- A conta bancária de origem também precisa ter saldo: nada sai do banco sem cobertura.
  IF p_direcao = 'banco_para_cofre' THEN
    PERFORM public.assert_saldo_operacional(v_account.id, v_value);
  END IF;

  PERFORM set_config('app.origem_alteracao', 'cofre_transferencia', true);
  PERFORM set_config('app.cofre_operacao', 'on', true);
  INSERT INTO public.transferencias_cofre (
    id, direcao, conta_bancaria_id, cofre_id, valor, data_transferencia,
    status, status_bancario, criado_por
  ) VALUES (
    v_transfer_id, p_direcao, p_conta_bancaria_id, p_cofre_id, v_value,
    p_data_transferencia, 'aguardando_recebimento', 'aguardando_conciliacao', v_user
  );

  v_tipo := CASE WHEN p_direcao = 'banco_para_cofre' THEN 'saida'::public.tipo_movimento ELSE 'entrada'::public.tipo_movimento END;
  v_mov_tipo := CASE WHEN p_direcao = 'banco_para_cofre' THEN 'entrada' ELSE 'saida' END;

  INSERT INTO public.lancamentos_financeiros (
    user_id, usuario_criador_id, tipo, valor_previsto, valor_original,
    data_vencimento, data_emissao, data_competencia, conta_bancaria_id,
    observacoes, status_aprovacao, status_pagamento, valor_recebido,
    tipo_baixa, transferencia_cofre_id, transferencia_cofre_lado
  ) VALUES (
    v_user, v_user, v_tipo, v_value, v_value, p_data_transferencia,
    p_data_transferencia, p_data_transferencia, p_conta_bancaria_id,
    'Transferência banco/cofre ' || v_transfer_id::text,
    'digital'::public.status_aprovacao, 'aberto'::public.status_pagamento,
    0, 'financeira', v_transfer_id, 'banco'
  ) RETURNING id INTO v_launch_id;

  INSERT INTO public.movimentacoes_cofre (
    cofre_id, tipo, valor, data_movimentacao, descricao, origem,
    transferencia_cofre_id, responsavel_id, status
  ) VALUES (
    p_cofre_id, v_mov_tipo, v_value, p_data_transferencia,
    CASE WHEN p_direcao = 'banco_para_cofre'
      THEN 'Recebimento de transferência bancária '
      ELSE 'Envio de transferência para banco '
    END || v_transfer_id::text,
    'transferencia', v_transfer_id, v_user, 'aguardando_master'
  ) RETURNING id INTO v_mov_id;

  UPDATE public.transferencias_cofre
  SET lancamento_bancario_id = v_launch_id,
      movimentacao_cofre_id = v_mov_id,
      updated_at = now()
  WHERE id = v_transfer_id
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$function$;