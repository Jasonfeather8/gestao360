DO $$
BEGIN
  DELETE FROM public.notifications;

  -- Log de auditoria é imutável por gatilho: desabilita apenas durante a limpeza.
  EXECUTE 'ALTER TABLE public.auditoria_logs DISABLE TRIGGER protect_auditoria_logs_mutation';
  DELETE FROM public.auditoria_logs;
  EXECUTE 'ALTER TABLE public.auditoria_logs ENABLE TRIGGER protect_auditoria_logs_mutation';

  -- Reinicia os códigos sequenciais (próximo lançamento/entidade volta a ser 1)
  PERFORM setval('public.lancamento_operacao_seq', 1, false);
  PERFORM setval('public.entidades_negocio_codigo_sequencial_seq', 1, false);
END $$;