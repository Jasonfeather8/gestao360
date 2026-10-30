CREATE OR REPLACE FUNCTION public.sincronizar_transferencia_com_titulos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer public.transferencias_bancarias;
  v_pendentes integer;
BEGIN
  IF NEW.transferencia_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_transfer
  FROM public.transferencias_bancarias
  WHERE id = NEW.transferencia_id
  FOR UPDATE;
  IF NOT FOUND OR v_transfer.status = 'estornada' THEN
    RETURN NEW;
  END IF;

  -- Título estornado pelo Master no Financeiro: o saldo operacional volta, o título
  -- fica aberto e a transferência retorna para "Aguardando Confirmação" — os dados
  -- precisam ser confirmados de novo antes de os títulos voltarem ao Financeiro.
  IF NEW.status_pagamento = 'aberto'::public.status_pagamento
     AND NEW.status_aprovacao = 'digital'::public.status_aprovacao
     AND COALESCE(NEW.valor_recebido, 0) = 0
     AND OLD.status_pagamento IN (
       'pago'::public.status_pagamento,
       'pago_parcial'::public.status_pagamento,
       'quitação_pendente'::public.status_pagamento,
       'bpi'::public.status_pagamento
     ) THEN
    UPDATE public.transferencias_bancarias
    SET status = 'aberta',
        confirmado_por = NULL,
        confirmado_em = NULL,
        aprovado_por = NULL,
        aprovado_em = NULL,
        reprovado_por = NULL,
        reprovado_em = NULL,
        motivo_reprovacao = NULL,
        updated_at = now()
    WHERE id = v_transfer.id;
    RETURN NEW;
  END IF;

  -- Título reprovado pelo Master no Financeiro: a transferência aparece como reprovada.
  IF NEW.status_aprovacao = 'reprovado'::public.status_aprovacao
     AND OLD.status_aprovacao IS DISTINCT FROM 'reprovado'::public.status_aprovacao THEN
    UPDATE public.transferencias_bancarias
    SET status = 'aberta',
        aprovado_por = NULL,
        aprovado_em = NULL,
        reprovado_por = COALESCE(auth.uid(), reprovado_por),
        reprovado_em = now(),
        motivo_reprovacao = COALESCE(motivo_reprovacao, 'Reprovada no Financeiro'),
        updated_at = now()
    WHERE id = v_transfer.id;
    RETURN NEW;
  END IF;

  IF NEW.status_pagamento <> 'pago'::public.status_pagamento
     OR NEW.status_aprovacao <> 'confirmado_master'::public.status_aprovacao THEN
    RETURN NEW;
  END IF;

  -- A transferência só é considerada aprovada quando todos os títulos dela
  -- (origem, destino e tarifa, quando existir) estiverem pagos e confirmados.
  SELECT count(*) INTO v_pendentes
  FROM unnest(ARRAY[v_transfer.lancamento_saida_id, v_transfer.lancamento_entrada_id, v_transfer.tarifa_lancamento_id]) AS ids(id)
  WHERE ids.id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.lancamentos_financeiros l
      WHERE l.id = ids.id
        AND l.status_pagamento = 'pago'::public.status_pagamento
        AND l.status_aprovacao = 'confirmado_master'::public.status_aprovacao
    );
  IF v_pendentes > 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.transferencias_bancarias
  SET status = 'conciliada',
      aprovado_por = COALESCE(auth.uid(), aprovado_por),
      aprovado_em = now(),
      reprovado_por = NULL,
      reprovado_em = NULL,
      motivo_reprovacao = NULL,
      updated_at = now()
  WHERE id = v_transfer.id;

  UPDATE public.notifications
  SET read = true,
      message = message || ' Status: aprovada no Financeiro.'
  WHERE origem = 'transferencia_bancaria'
    AND read = false
    AND message LIKE '%' || v_transfer.id::text || '%';

  RETURN NEW;
END;
$function$