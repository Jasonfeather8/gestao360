CREATE OR REPLACE FUNCTION public.manter_ordem_dia_do_extrato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- A posição manual vale dentro de um dia: se o dia do pagamento muda, ela deixa de valer.
  IF NEW.data_pagamento IS DISTINCT FROM OLD.data_pagamento THEN
    NEW.ordem_dia := NULL;
  END IF;

  -- A posição só existe dentro do Extrato: ao sair da confirmação do Master o título volta
  -- a ficar sem posição, para não reaparecer no meio de um dia já ordenado.
  IF OLD.status_aprovacao = 'confirmado_master'::public.status_aprovacao
     AND NEW.status_aprovacao IS DISTINCT FROM 'confirmado_master'::public.status_aprovacao THEN
    NEW.ordem_dia := NULL;
  END IF;

  RETURN NEW;
END;
$$;