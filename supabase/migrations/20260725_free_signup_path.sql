-- 20260725_free_signup_path.sql
--
-- ETAPA 6 / Fatia 3 — Jornada de cadastro FREE.
--
-- ⚠️ ARQUIVO NOVO — precisa ser rodado no SQL Editor do Supabase pelo Rafael.
--    NÃO altera a migration 20260724 (já aplicada). Idempotente/reexecutável.
--
-- Problema: o gate BEFORE INSERT em auth.users
-- (enforce_paid_signup_precondition, instalado por 20260722) recusa QUALQUER
-- criação de usuário sem assinatura AbacatePay paga para o e-mail
-- (paid_subscription_required). Isso bloqueia o cadastro grátis.
--
-- Correção: SEPARAR os caminhos (não enfraquecer o pago). Adiciona um ramo
-- FREE EXPLÍCITO no topo da função e mantém o ramo PAGO IDÊNTICO ao de
-- 20260722. O ramo free é habilitado apenas quando a linha traz o marcador
-- raw_user_meta_data->>'signup_kind' = 'free', gravado só pela rota
-- service-role /api/auth/free-signup.
--
-- Por que isso NÃO é um bypass do pago (ver relatório):
--   • O ramo free NÃO linka assinatura e NÃO concede 'pro'. A conta nasce com
--     entitlement 'free' (default do banco / trigger profiles_entitlement_default).
--   • Nenhum caminho free reivindica assinatura alheia: o claim
--     (claim_on_email_confirmation / claim_paid_signup_for_user) só age quando
--     app_metadata.origin = 'paid_passwordless'. Cadastro free não tem esse
--     marcador, então não dispara claim nenhum.
--   • raw_user_meta_data é o ÚNICO metadado legível no BEFORE INSERT (app_metadata
--     só materializa em UPDATE pós-insert — foi o bug do marcador em 20260721).
--     Como o signup público está desligado, só a rota service-role cria usuários,
--     então o marcador não é forjável por cliente anônimo.
--   • Pior caso de abuso do ramo free: criar uma CONTA GRÁTIS — que já é um
--     recurso público. Não há escalonamento para pago.

begin;

create or replace function public.enforce_paid_signup_precondition()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,auth as $$
begin
  -- ── Caminho FREE (novo, explícito e isolado) ─────────────────────────────
  -- Só a rota service-role de cadastro grátis marca signup_kind='free'.
  -- Libera a criação SEM tocar em subscriptions e SEM conceder pro.
  if new.raw_user_meta_data->>'signup_kind' = 'free' then
    return new;
  end if;

  -- ── Caminho PAGO (INALTERADO — idêntico a 20260722) ──────────────────────
  -- Exige assinatura AbacatePay ativa e não reivindicada para o e-mail
  -- (linha gravada pela rota passwordless/start antes do createUser).
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

-- Trigger permanece o mesmo objeto de 20260722 (recria por idempotência).
drop trigger if exists enforce_paid_signup_precondition_trg on auth.users;
create trigger enforce_paid_signup_precondition_trg before insert on auth.users for each row execute function public.enforce_paid_signup_precondition();

commit;
