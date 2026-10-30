CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_saldo_inicial numeric;
  v_total_consolidado numeric;
  v_total_operacional numeric;
  v_total_simulado numeric;
  v_quitacao_pendente_count integer;
BEGIN
  SELECT COALESCE(SUM(saldo_inicial), 0) INTO v_saldo_inicial FROM public.contas_bancarias WHERE status = 'ativo';
  SELECT COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN COALESCE(valor_recebido, valor_previsto) ELSE -COALESCE(valor_recebido, valor_previsto) END), 0)
  INTO v_total_consolidado
  FROM public.lancamentos_financeiros l
  WHERE public.lancamento_saldo_real_confirmado(l.id)
    AND (l.transferencia_id IS NULL OR (l.transferencia_lado = 'tarifa' AND EXISTS (SELECT 1 FROM public.transferencias_bancarias t WHERE t.id = l.transferencia_id AND t.status = 'conciliada')))
    AND l.transferencia_cofre_lado IS NULL;
  SELECT COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN COALESCE(valor_recebido, valor_previsto) ELSE -COALESCE(valor_recebido, valor_previsto) END), 0)
  INTO v_total_operacional
  FROM public.lancamentos_financeiros l
  WHERE public.lancamento_saldo_operacional(l.id)
    AND (l.transferencia_id IS NULL OR (l.transferencia_lado = 'tarifa' AND EXISTS (SELECT 1 FROM public.transferencias_bancarias t WHERE t.id = l.transferencia_id AND t.status = 'conciliada')))
    AND l.transferencia_cofre_lado IS NULL;
  SELECT COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor_previsto ELSE -valor_previsto END), 0)
  INTO v_total_simulado
  FROM public.lancamentos_financeiros l
  WHERE public.lancamento_saldo_simulado(l.id)
    AND (l.transferencia_id IS NULL OR (l.transferencia_lado = 'tarifa' AND EXISTS (SELECT 1 FROM public.transferencias_bancarias t WHERE t.id = l.transferencia_id AND t.status = 'conciliada')))
    AND l.transferencia_cofre_lado IS NULL;
  SELECT COUNT(*) INTO v_quitacao_pendente_count
  FROM public.lancamentos_financeiros l
  WHERE l.status_pagamento = 'quitação_pendente'
    AND public.lancamento_saldo_operacional(l.id)
    AND (l.transferencia_id IS NULL OR (l.transferencia_lado = 'tarifa' AND EXISTS (SELECT 1 FROM public.transferencias_bancarias t WHERE t.id = l.transferencia_id AND t.status = 'conciliada')))
    AND l.transferencia_cofre_lado IS NULL;
  RETURN json_build_object(
    'total_consolidado', v_saldo_inicial + v_total_consolidado,
    'total_operacional', v_saldo_inicial + v_total_operacional,
    'total_simulado', v_saldo_inicial + v_total_simulado,
    'quitacao_pendente_count', v_quitacao_pendente_count,
    'transferencias_pendentes_count', (SELECT COUNT(*) FROM public.transferencias_bancarias t WHERE t.status IN ('aberta', 'aguardando_destino', 'conciliada_pendente_master') AND t.reprovado_em IS NULL),
    'transferencias_pendentes_valor', (SELECT COALESCE(SUM(t.valor), 0) FROM public.transferencias_bancarias t WHERE t.status IN ('aberta', 'aguardando_destino', 'conciliada_pendente_master') AND t.reprovado_em IS NULL),
    'pendente_saida_valor', (SELECT COALESCE(SUM(valor_previsto), 0) FROM public.lancamentos_financeiros l WHERE l.tipo = 'saida' AND NOT public.lancamento_saldo_real_confirmado(l.id) AND l.status_pagamento <> 'bpi' AND (l.transferencia_id IS NULL OR (l.transferencia_lado = 'tarifa' AND EXISTS (SELECT 1 FROM public.transferencias_bancarias t WHERE t.id = l.transferencia_id AND t.status = 'conciliada'))) AND l.transferencia_cofre_lado IS NULL),
    'pendente_saida_count', (SELECT COUNT(*) FROM public.lancamentos_financeiros l WHERE l.tipo = 'saida' AND NOT public.lancamento_saldo_real_confirmado(l.id) AND l.status_pagamento <> 'bpi' AND (l.transferencia_id IS NULL OR (l.transferencia_lado = 'tarifa' AND EXISTS (SELECT 1 FROM public.transferencias_bancarias t WHERE t.id = l.transferencia_id AND t.status = 'conciliada'))) AND l.transferencia_cofre_lado IS NULL),
    'pendente_entrada_valor', (SELECT COALESCE(SUM(valor_previsto), 0) FROM public.lancamentos_financeiros l WHERE l.tipo = 'entrada' AND NOT public.lancamento_saldo_real_confirmado(l.id) AND l.status_pagamento <> 'bpi' AND (l.transferencia_id IS NULL OR (l.transferencia_lado = 'tarifa' AND EXISTS (SELECT 1 FROM public.transferencias_bancarias t WHERE t.id = l.transferencia_id AND t.status = 'conciliada'))) AND l.transferencia_cofre_lado IS NULL),
    'pendente_entrada_count', (SELECT COUNT(*) FROM public.lancamentos_financeiros l WHERE l.tipo = 'entrada' AND NOT public.lancamento_saldo_real_confirmado(l.id) AND l.status_pagamento <> 'bpi' AND (l.transferencia_id IS NULL OR (l.transferencia_lado = 'tarifa' AND EXISTS (SELECT 1 FROM public.transferencias_bancarias t WHERE t.id = l.transferencia_id AND t.status = 'conciliada'))) AND l.transferencia_cofre_lado IS NULL)
  );
END;
$function$