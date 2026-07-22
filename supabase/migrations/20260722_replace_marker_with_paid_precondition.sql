-- 20260722_replace_marker_with_paid_precondition.sql
--
-- Standalone e idempotente. A produção JÁ rodou 20260721, que instalou o gate
-- BEFORE INSERT `enforce_paid_passwordless_marker_trg`. Esse marcador é
-- inaplicável: o GoTrue só materializa `app_metadata` custom num UPDATE
-- PÓS-insert, então no BEFORE INSERT `raw_app_meta_data->>'origin'` nunca é
-- 'paid_passwordless' e 100% das criações de usuário falhavam com
-- `paid_passwordless_marker_required` (prod: POST /admin/users -> 500 Database
-- error creating new user).
--
-- Este script troca o marcador pela precondição de assinatura paga: só permite
-- criar o usuário se já existir uma assinatura AbacatePay ativa e ainda não
-- reivindicada (user_id null) para o mesmo e-mail — linha que a rota
-- passwordless/start grava ANTES de chamar createUser. Rode no SQL Editor do
-- Supabase. Seguro reexecutar.
begin;

-- Remove o marcador antigo (função + trigger).
drop trigger if exists enforce_paid_passwordless_marker_trg on auth.users;
drop function if exists public.enforce_paid_passwordless_marker();

-- Precondição correta: assinatura paga ativa e não reivindicada para o e-mail.
create or replace function public.enforce_paid_signup_precondition()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,auth as $$
begin
  if not exists (
    select 1 from public.subscriptions
    where provider='abacatepay' and status='active' and user_id is null
      and lower(email)=lower(new.email)
  ) then
    raise exception 'paid_subscription_required' using errcode='P0001';
  end if;
  return new;
end; $$;
revoke all on function public.enforce_paid_signup_precondition() from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='supabase_auth_admin') then execute 'grant execute on function public.enforce_paid_signup_precondition() to supabase_auth_admin'; end if; end $$;

drop trigger if exists enforce_paid_signup_precondition_trg on auth.users;
create trigger enforce_paid_signup_precondition_trg before insert on auth.users for each row execute function public.enforce_paid_signup_precondition();

commit;
