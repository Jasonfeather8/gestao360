create or replace function public.proteger_saldo_inicial_negativo()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
begin
  if new.saldo_inicial is null or new.saldo_inicial >= 0 then
    return new;
  end if;

  -- Em UPDATE só barra quando o saldo inicial realmente muda: o app reenvia o
  -- saldo atual em toda edição, e o Gerente precisa continuar editando os outros
  -- campos de uma conta que já está negativa.
  if tg_op = 'UPDATE' and new.saldo_inicial is not distinct from old.saldo_inicial then
    return new;
  end if;

  v_role := public.current_user_role();

  -- Sem sessão (service_role e rotinas administrativas) a escrita é confiada;
  -- com sessão de usuário, somente o Master pode gravar saldo inicial negativo.
  if v_role is not null and v_role <> 'master' then
    raise exception 'Apenas o Master pode definir saldo inicial negativo na conta bancária.';
  end if;

  return new;
end;
$$;