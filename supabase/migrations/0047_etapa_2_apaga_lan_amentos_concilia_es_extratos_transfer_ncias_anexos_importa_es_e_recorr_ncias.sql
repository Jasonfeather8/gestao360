DO $$
BEGIN
  -- Liga as "chaves de operação" que os gatilhos de proteção exigem para permitir a limpeza.
  PERFORM set_config('app.conciliacao_operacao', 'on', true);
  PERFORM set_config('app.transferencia_conciliacao', 'on', true);
  PERFORM set_config('app.transferencia_operacao', 'on', true);
  PERFORM set_config('app.cofre_operacao', 'on', true);

  DELETE FROM public.diferencas_financeiras;
  DELETE FROM public.conciliacoes;
  DELETE FROM public.lancamento_anexos;
  DELETE FROM public.importacoes_dados_itens;
  DELETE FROM public.importacoes_dados;
  DELETE FROM public.fechamentos_conciliacao;
  DELETE FROM public.transferencias_bancarias;
  DELETE FROM public.transferencias_cofre;
  DELETE FROM public.movimentacoes_cofre;

  -- A transação bancária é protegida por gatilho de imutabilidade: desabilita só durante a limpeza.
  EXECUTE 'ALTER TABLE public.transacoes_banco DISABLE TRIGGER protect_transacao_banco_immutable_trigger';
  DELETE FROM public.transacoes_banco;
  EXECUTE 'ALTER TABLE public.transacoes_banco ENABLE TRIGGER protect_transacao_banco_immutable_trigger';

  -- Lotes de extrato têm auto-referência RESTRICT: apaga das folhas para a raiz.
  LOOP
    DELETE FROM public.extratos_bancarios AS e
    WHERE e.lote_origem_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.extratos_bancarios AS c WHERE c.lote_origem_id = e.id);
    EXIT WHEN NOT FOUND;
  END LOOP;
  DELETE FROM public.extratos_bancarios;

  DELETE FROM public.lancamentos_financeiros;
  DELETE FROM public.recorrencias;
END $$;