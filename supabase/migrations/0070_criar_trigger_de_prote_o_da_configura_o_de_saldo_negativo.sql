CREATE OR REPLACE FUNCTION public.proteger_config_saldo_negativo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_role text;
begin
  -- Só há o que proteger quando a conta fica configurada para operar negativa.
  if coalesce(new.permite_saldo_negativo, false) = false and coalesce(new.limite_saldo_negativo, 0) = 0 then
    return new;
  end if;

  -- Em UPDATE só barra quando a configuração realmente muda: o app reenvia os
  -- valores atuais em toda edição da conta.
  if tg_op = 'UPDATE'
     and new.permite_saldo_negativo is not distinct from old.permite_saldo_negativo
     and new.limite_saldo_negativo is not distinct from old.limite_saldo_negativo then
    return new;
  end if;

  v_role := public.current_user_role();

  -- Sem sessão (service_role e rotinas administrativas) a escrita é confiada;
  -- com sessão de usuário, somente o Master libera saldo negativo na conta.
  if v_role is not null and v_role <> 'master' then
    raise exception 'Apenas o Master pode permitir saldo negativo na conta bancária.';
  end if;

  return new;
end;
$function$