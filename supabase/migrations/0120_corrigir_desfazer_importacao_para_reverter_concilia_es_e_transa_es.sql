CREATE OR REPLACE FUNCTION public.desfazer_importacao(p_lote_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_status text;
  v_removidos integer := 0;
  v_transacoes integer := 0;
  v_prefixo text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Operação exige usuário autenticado';
  END IF;
  IF public.current_user_role() NOT IN ('master', 'gerente') THEN
    RAISE EXCEPTION 'Somente Master ou Gerente podem desfazer uma importação';
  END IF;

  SELECT status INTO v_status
  FROM public.importacoes_dados
  WHERE id = p_lote_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Lote de importação não encontrado';
  END IF;
  IF v_status = 'desfeita' THEN
    RAISE EXCEPTION 'Este lote já foi desfeito';
  END IF;

  -- O desfazer é a operação autorizada de conciliação: a importação cria as conciliações e as
  -- transações bancárias do lote, e o gatilho bloquear_conciliacao_generica_de_transferencia
  -- só permite removê-las com esta liberação (mesma chave usada em importar_lancamentos).
  PERFORM set_config('app.conciliacao_operacao', 'on', true);

  v_prefixo := 'migracao:' || p_lote_id::text || ':';

  -- O selo de conciliado precisa sair antes da exclusão: protect_transacao_banco_immutable
  -- recusa excluir transação confirmada. E o hash_transacao é único, então deixar as transações
  -- do lote para trás impediria reimportar o mesmo arquivo.
  UPDATE public.transacoes_banco
  SET status_conciliacao = false
  WHERE starts_with(hash_transacao, v_prefixo)
    AND status_conciliacao;

  WITH removidas AS (
    DELETE FROM public.transacoes_banco
    WHERE starts_with(hash_transacao, v_prefixo)
    RETURNING id
  )
  SELECT count(*) INTO v_transacoes FROM removidas;

  WITH removidos AS (
    DELETE FROM public.lancamentos_financeiros
    WHERE id IN (
      SELECT i.lancamento_id FROM public.importacoes_dados_itens i WHERE i.lote_id = p_lote_id
    )
    RETURNING id
  )
  SELECT count(*) INTO v_removidos FROM removidos;

  UPDATE public.importacoes_dados
  SET status = 'desfeita', desfeita_em = now(), desfeita_por = v_user
  WHERE id = p_lote_id;

  RETURN jsonb_build_object('lote_id', p_lote_id, 'removidos', v_removidos, 'transacoes', v_transacoes);
END;
$function$;