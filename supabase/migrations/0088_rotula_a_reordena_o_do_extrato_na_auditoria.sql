CREATE OR REPLACE FUNCTION public.process_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_action_label text;
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new jsonb := CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  v_lancamento_id uuid;
  v_transacao_bancaria_id uuid;
  v_transferencia_cofre_id uuid;
  v_status_anterior text;
  v_status_novo text;
  v_origem text;
  v_justificativa text;
  v_queue_entry boolean := false;
  v_real_effect boolean := false;
  v_rejection boolean := false;
  v_estorno boolean := false;
BEGIN
  v_lancamento_id := NULLIF(COALESCE(v_new->>'lancamento_id', v_old->>'lancamento_id'), '')::uuid;
  v_transacao_bancaria_id := NULLIF(COALESCE(v_new->>'transacao_banco_id', v_old->>'transacao_banco_id', v_new->>'transacao_id', v_old->>'transacao_id'), '')::uuid;
  v_transferencia_cofre_id := NULLIF(COALESCE(v_new->>'transferencia_cofre_id', v_old->>'transferencia_cofre_id'), '')::uuid;

  IF TG_TABLE_NAME = 'lancamentos_financeiros' THEN
    v_lancamento_id := COALESCE(NULLIF(v_new->>'id', '')::uuid, NULLIF(v_old->>'id', '')::uuid);
    v_transferencia_cofre_id := COALESCE(v_transferencia_cofre_id, NULLIF(v_new->>'transferencia_cofre_id', '')::uuid, NULLIF(v_old->>'transferencia_cofre_id', '')::uuid);
  ELSIF TG_TABLE_NAME = 'transferencias_cofre' THEN
    v_lancamento_id := NULLIF(COALESCE(v_new->>'lancamento_bancario_id', v_old->>'lancamento_bancario_id'), '')::uuid;
    v_transacao_bancaria_id := NULLIF(COALESCE(v_new->>'transacao_banco_id', v_old->>'transacao_banco_id'), '')::uuid;
    v_transferencia_cofre_id := COALESCE(v_transferencia_cofre_id, NULLIF(COALESCE(v_new->>'id', v_old->>'id'), '')::uuid);
  ELSIF TG_TABLE_NAME = 'movimentacoes_cofre' AND v_transferencia_cofre_id IS NOT NULL THEN
    SELECT t.lancamento_bancario_id, t.transacao_banco_id
    INTO v_lancamento_id, v_transacao_bancaria_id
    FROM public.transferencias_cofre t
    WHERE t.id = v_transferencia_cofre_id;
  ELSIF TG_TABLE_NAME = 'conciliacoes' AND v_lancamento_id IS NOT NULL THEN
    SELECT l.transferencia_cofre_id
    INTO v_transferencia_cofre_id
    FROM public.lancamentos_financeiros l
    WHERE l.id = v_lancamento_id;
  END IF;

  IF v_lancamento_id IS NOT NULL AND v_transacao_bancaria_id IS NULL THEN
    SELECT c.transacao_banco_id INTO v_transacao_bancaria_id
    FROM public.conciliacoes c
    WHERE c.lancamento_id = v_lancamento_id
    ORDER BY c.data_conciliacao DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF TG_TABLE_NAME = 'diferencas_financeiras' AND v_lancamento_id IS NULL THEN
    SELECT c.lancamento_id, c.transacao_banco_id INTO v_lancamento_id, v_transacao_bancaria_id
    FROM public.diferencas_financeiras d
    JOIN public.conciliacoes c ON c.id = d.conciliacao_id
    WHERE d.id = COALESCE(NULLIF(v_new->>'id', '')::uuid, NULLIF(v_old->>'id', '')::uuid);
  END IF;

  v_status_anterior := CASE
    WHEN v_old ? 'status_pagamento' THEN concat_ws('/', v_old->>'status_pagamento', NULLIF(v_old->>'status_aprovacao', ''))
    WHEN v_old ? 'status' THEN v_old->>'status'
    ELSE NULL
  END;
  v_status_novo := CASE
    WHEN v_new ? 'status_pagamento' THEN concat_ws('/', v_new->>'status_pagamento', NULLIF(v_new->>'status_aprovacao', ''))
    WHEN v_new ? 'status' THEN v_new->>'status'
    ELSE NULL
  END;

  v_origem := NULLIF(btrim(current_setting('app.origem_alteracao', true)), '');
  v_justificativa := NULLIF(btrim(current_setting('app.justificativa', true)), '');
  IF v_justificativa IS NULL THEN
    v_justificativa := NULLIF(btrim(COALESCE(v_new->>'motivo_reprovacao', v_new->>'motivo_estorno', v_new->>'observacao_justificativa', v_new->>'motivo_ajuste', v_old->>'motivo_reprovacao', v_old->>'motivo_estorno', v_old->>'observacao_justificativa', v_old->>'motivo_ajuste')), '');
  END IF;

  v_queue_entry :=
    (TG_TABLE_NAME = 'lancamentos_financeiros'
      AND v_new->>'status_pagamento' = 'quitação_pendente'
      AND v_new->>'status_aprovacao' = 'digital'
      AND NULLIF(v_new->>'transferencia_id', '') IS NULL
      AND NULLIF(v_new->>'transferencia_cofre_id', '') IS NULL
      AND EXISTS (SELECT 1 FROM public.conciliacoes c WHERE c.lancamento_id = (v_new->>'id')::uuid)
      AND (TG_OP = 'INSERT' OR v_old->>'status_pagamento' IS DISTINCT FROM 'quitação_pendente' OR v_old->>'status_aprovacao' IS DISTINCT FROM 'digital'))
    OR (TG_TABLE_NAME = 'fechamentos_conciliacao'
      AND v_new->>'status' = 'aguardando_master'
      AND (TG_OP = 'INSERT' OR v_old->>'status' IS DISTINCT FROM 'aguardando_master'))
    OR (TG_TABLE_NAME = 'transferencias_bancarias'
      AND v_new->>'status' IN ('aberta', 'aguardando_destino', 'conciliada_pendente_master')
      AND NULLIF(v_new->>'reprovado_em', '') IS NULL
      AND (TG_OP = 'INSERT' OR v_old->>'status' IS DISTINCT FROM v_new->>'status')
      AND (TG_OP = 'INSERT' OR v_old->>'reprovado_em' IS NOT DISTINCT FROM v_new->>'reprovado_em'))
    OR (TG_TABLE_NAME = 'movimentacoes_cofre'
      AND v_new->>'status' = 'aguardando_master'
      AND NULLIF(v_new->>'transferencia_cofre_id', '') IS NULL
      AND v_new->>'origem' IN ('manual', 'baixa_direta')
      AND (TG_OP = 'INSERT' OR v_old->>'status' IS DISTINCT FROM 'aguardando_master'))
    OR (TG_TABLE_NAME = 'transferencias_cofre'
      AND v_new->>'status' = 'aguardando_master'
      AND v_new->>'status_bancario' = 'conciliada'
      AND NULLIF(v_new->>'recebido_por', '') IS NOT NULL
      AND (TG_OP = 'INSERT' OR v_old->>'status' IS DISTINCT FROM 'aguardando_master' OR v_old->>'status_bancario' IS DISTINCT FROM 'conciliada' OR v_old->>'recebido_por' IS DISTINCT FROM v_new->>'recebido_por'));

  v_real_effect :=
    (TG_TABLE_NAME = 'lancamentos_financeiros'
      AND v_new->>'status_pagamento' = 'pago'
      AND v_new->>'status_aprovacao' = 'confirmado_master'
      AND (TG_OP = 'INSERT' OR v_old->>'status_pagamento' IS DISTINCT FROM 'pago' OR v_old->>'status_aprovacao' IS DISTINCT FROM 'confirmado_master'))
    OR (TG_TABLE_NAME = 'fechamentos_conciliacao' AND v_new->>'status' = 'aprovado' AND v_old->>'status' IS DISTINCT FROM 'aprovado')
    OR (TG_TABLE_NAME = 'transferencias_bancarias' AND v_new->>'status' = 'conciliada' AND v_old->>'status' IS DISTINCT FROM 'conciliada')
    OR (TG_TABLE_NAME = 'movimentacoes_cofre' AND v_new->>'status' = 'aprovado' AND v_old->>'status' IS DISTINCT FROM 'aprovado')
    OR (TG_TABLE_NAME = 'transferencias_cofre' AND v_new->>'status' = 'aprovada' AND v_old->>'status' IS DISTINCT FROM 'aprovada');

  v_rejection :=
    (TG_TABLE_NAME = 'lancamentos_financeiros'
      AND v_origem = 'aprovacao_master'
      AND v_new->>'status_pagamento' = 'aberto'
      AND v_old->>'status_pagamento' IS DISTINCT FROM 'aberto') OR
    (v_new->>'status_aprovacao' = 'reprovado' AND v_old->>'status_aprovacao' IS DISTINCT FROM 'reprovado')
    OR (v_new->>'status' IN ('reprovado', 'reprovada') AND v_old->>'status' IS DISTINCT FROM v_new->>'status')
    OR (TG_TABLE_NAME = 'transferencias_bancarias'
      AND NULLIF(v_new->>'reprovado_em', '') IS NOT NULL
      AND v_old->>'reprovado_em' IS DISTINCT FROM v_new->>'reprovado_em');

  v_estorno := COALESCE(v_origem LIKE 'estorno%', false)
    OR v_new->>'status' IN ('estornado', 'estornada')
    OR (TG_TABLE_NAME = 'lancamentos_financeiros'
      AND v_old->>'status_pagamento' IN ('pago', 'pago_parcial')
      AND v_new->>'status_pagamento' = 'aberto'
      AND COALESCE((v_new->>'valor_recebido')::numeric, 0) = 0)
    OR (TG_OP = 'DELETE' AND TG_TABLE_NAME = 'lancamentos_financeiros' AND v_old->>'tipo_baixa' IN ('financeira', 'avr'));

  IF v_queue_entry THEN
    v_action_label := 'Entrada na fila de aprovação Master';
  ELSIF v_estorno THEN
    v_action_label := 'Estorno';
  ELSIF TG_TABLE_NAME = 'lancamentos_financeiros'
    AND v_origem = 'aprovacao_master'
    AND v_new->>'status_pagamento' = 'bpi'
    AND v_new->>'status_aprovacao' = 'confirmado_master'
    AND v_old->>'status_aprovacao' IS DISTINCT FROM 'confirmado_master' THEN
    v_action_label := 'Aprovação Master — BPI';
  ELSIF v_real_effect THEN
    v_action_label := 'Aprovação Master — efeito no saldo real';
  ELSIF v_rejection THEN
    v_action_label := 'Reprovação Master';
  ELSIF TG_OP = 'DELETE' THEN
    v_action_label := CASE WHEN TG_TABLE_NAME = 'fechamentos_conciliacao' THEN 'Exclusão de fechamento de conciliação' ELSE 'Exclusão de ' || TG_TABLE_NAME END;
  ELSIF TG_OP = 'INSERT' THEN
    v_action_label := 'Novo Registro em ' || TG_TABLE_NAME;
    IF TG_TABLE_NAME = 'lancamentos_financeiros' THEN v_action_label := 'Novo Lançamento'; END IF;
    IF TG_TABLE_NAME = 'contas_bancarias' THEN v_action_label := 'Nova Conta Criada'; END IF;
  ELSE
    v_action_label := 'Alteração de estado em ' || TG_TABLE_NAME;
    IF TG_TABLE_NAME = 'lancamentos_financeiros' THEN
      IF v_origem = 'reordenacao_extrato' THEN
        v_action_label := 'Reordenação do Extrato';
      ELSIF (v_old->>'status_aprovacao') IS DISTINCT FROM (v_new->>'status_aprovacao') AND v_new->>'status_aprovacao' = 'confirmado_master' THEN
        v_action_label := 'Aprovação Master';
      ELSIF (v_old->>'status_pagamento') IS DISTINCT FROM (v_new->>'status_pagamento') AND v_new->>'status_pagamento' = 'pago' THEN
        v_action_label := 'Conciliação Bancária';
      ELSIF v_new->>'tipo_baixa' = 'avr' THEN
        v_action_label := 'AVR - Ajuste do Valor Real';
      ELSIF v_new->>'tipo_baixa' = 'bpi' THEN
        v_action_label := 'BPI - Baixa por Inatividade';
      ELSIF (v_old->>'desconto_valor') IS DISTINCT FROM (v_new->>'desconto_valor') OR (v_old->>'desconto_tipo') IS DISTINCT FROM (v_new->>'desconto_tipo') OR (v_old->>'acrescimo_valor') IS DISTINCT FROM (v_new->>'acrescimo_valor') OR (v_old->>'acrescimo_tipo') IS DISTINCT FROM (v_new->>'acrescimo_tipo') THEN
        v_action_label := 'Ajuste Financeiro';
      ELSIF (v_old->>'valor_previsto') IS DISTINCT FROM (v_new->>'valor_previsto') THEN
        v_action_label := 'Ajuste de Valor';
      END IF;
    END IF;
  END IF;

  IF v_origem IS NULL THEN
    v_origem := CASE
      WHEN v_queue_entry THEN CASE
        WHEN TG_TABLE_NAME = 'lancamentos_financeiros' THEN 'conciliacao_bancaria'
        WHEN TG_TABLE_NAME = 'fechamentos_conciliacao' THEN 'fechamento_conciliacao'
        WHEN TG_TABLE_NAME = 'transferencias_bancarias' THEN 'transferencia_bancaria'
        WHEN TG_TABLE_NAME = 'transferencias_cofre' THEN 'cofre_transferencia'
        ELSE CASE WHEN COALESCE(v_new->>'origem', v_old->>'origem') = 'baixa_direta' THEN 'cofre_baixa_direta' ELSE 'cofre_manual' END
      END
      WHEN v_estorno THEN CASE WHEN TG_TABLE_NAME = 'transferencias_bancarias' THEN 'estorno_transferencia' ELSE 'estorno_cofre' END
      WHEN v_action_label LIKE 'Aprovação Master%' THEN 'aprovacao_master'
      WHEN TG_TABLE_NAME = 'movimentacoes_cofre' AND COALESCE(v_new->>'origem', v_old->>'origem') = 'manual' THEN 'cofre_manual'
      WHEN TG_TABLE_NAME = 'movimentacoes_cofre' AND COALESCE(v_new->>'origem', v_old->>'origem') = 'baixa_direta' THEN 'cofre_baixa_direta'
      WHEN TG_TABLE_NAME IN ('movimentacoes_cofre', 'transferencias_cofre') THEN 'cofre_transferencia'
      WHEN TG_TABLE_NAME = 'conciliacoes' AND v_transferencia_cofre_id IS NOT NULL THEN 'cofre_conciliacao_bancaria'
      WHEN TG_TABLE_NAME = 'lancamentos_financeiros' AND v_transferencia_cofre_id IS NOT NULL THEN 'cofre_transferencia'
      WHEN TG_TABLE_NAME IN ('conciliacoes', 'diferencas_financeiras') THEN 'conciliacao_bancaria'
      WHEN TG_TABLE_NAME = 'transacoes_banco' THEN 'importacao_extrato'
      WHEN TG_TABLE_NAME = 'fechamentos_conciliacao' THEN 'fechamento_conciliacao'
      WHEN TG_TABLE_NAME = 'transferencias_bancarias' THEN 'transferencia_bancaria'
      ELSE TG_TABLE_NAME
    END;
  END IF;

  INSERT INTO public.auditoria_logs (
    tabela_afetada, registro_id, usuario_id, acao,
    dados_anteriores, dados_novos, origem_alteracao,
    lancamento_id, transacao_bancaria_id, status_anterior, status_novo, justificativa
  ) VALUES (
    TG_TABLE_NAME,
    COALESCE(NULLIF(v_new->>'id', '')::uuid, NULLIF(v_old->>'id', '')::uuid),
    v_user_id,
    v_action_label,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN v_old ELSE NULL END,
    CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN v_new ELSE NULL END,
    v_origem,
    v_lancamento_id,
    v_transacao_bancaria_id,
    v_status_anterior,
    v_status_novo,
    v_justificativa
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$