-- ============================================================
-- ETAPA 6 — Fatia 1: entitlement explícito free|pro (backend)
--
-- Migration ADITIVA e transacional. NÃO reexecuta credits-and-flow.sql nem
-- redefine RLS/RPCs endurecidos (consume_credits, webhook, delete-carousel,
-- proxy). Cria uma superfície nova de "plano" sem afrouxar a de IA.
--
-- Decisões de design (justificadas no relatório):
--   • O plano mora em uma TABELA PRÓPRIA (public.user_entitlements), não numa
--     coluna de profiles: a policy profiles_self é `for all with check
--     (auth.uid() = id)`, ou seja, o usuário edita a própria linha de profiles
--     (onboarding). Um `plan` ali seria auto-escalável para 'pro'. Aqui a RLS
--     só permite SELECT do próprio; não há policy de INSERT/UPDATE para
--     authenticated, então só os triggers SECURITY DEFINER / service role
--     escrevem o plano.
--   • 'free' é um estado de PRIMEIRA CLASSE, nunca "assinatura ausente":
--     toda conta nova nasce com uma linha explícita plan='free'; cancelar
--     assinatura faz DOWNGRADE para 'free' (dados preservados), nunca lockout.
--   • Free NÃO tem créditos: nenhuma linha em user_credits. Já é o invariante
--     do sistema (user_credits só é provisionado para assinatura paga), então
--     este arquivo apenas NÃO cria linha para free — e o guard de IA nega o
--     free ANTES de qualquer consume_credits.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Tabela de entitlement (fonte da verdade do plano)
-- ------------------------------------------------------------
create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',
  updated_at timestamptz not null default now(),
  constraint user_entitlements_plan_check check (plan in ('free', 'pro'))
);

alter table public.user_entitlements enable row level security;

-- Só SELECT do próprio. SEM policy de INSERT/UPDATE para authenticated: o
-- usuário NÃO pode escrever o próprio plano. Escrita só via triggers SECURITY
-- DEFINER (abaixo) ou service role.
drop policy if exists user_entitlements_select_own on public.user_entitlements;
create policy user_entitlements_select_own on public.user_entitlements
  for select using (auth.uid() = user_id);

drop trigger if exists set_user_entitlements_updated on public.user_entitlements;
create trigger set_user_entitlements_updated before update on public.user_entitlements
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 2. Recomputa o plano de um usuário a partir de subscriptions.
--    'pro' sse existe assinatura active|trialing; senão 'free'.
--    Cancelamento (status vira canceled/unpaid/...) cai para 'free' aqui:
--    é o DOWNGRADE — a linha do entitlement continua, os dados continuam.
-- ------------------------------------------------------------
create or replace function public.sync_user_entitlement(p_user uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_pro boolean;
begin
  if p_user is null then
    return;
  end if;

  select exists (
    select 1 from public.subscriptions
     where user_id = p_user
       and status in ('active', 'trialing')
  ) into v_pro;

  insert into public.user_entitlements (user_id, plan)
  values (p_user, case when v_pro then 'pro' else 'free' end)
  on conflict (user_id) do update
    set plan = excluded.plan,
        updated_at = now();
end;
$$;

revoke all on function public.sync_user_entitlement(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Trigger em subscriptions: mantém o entitlement em sync em qualquer
--    mudança (ativação, claim de signup, cancelamento). Aditivo — não toca
--    o trigger de dedupe do webhook nem protect_subscription_claim.
-- ------------------------------------------------------------
create or replace function public.subscriptions_entitlement_sync()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_user_entitlement(old.user_id);
    return old;
  end if;

  perform public.sync_user_entitlement(new.user_id);
  -- Se o dono mudou (claim de signup), recomputa também o antigo.
  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform public.sync_user_entitlement(old.user_id);
  end if;
  return new;
end;
$$;

revoke all on function public.subscriptions_entitlement_sync() from public, anon, authenticated;

drop trigger if exists subscriptions_entitlement_sync_trg on public.subscriptions;
create trigger subscriptions_entitlement_sync_trg
  after insert or update or delete on public.subscriptions
  for each row execute function public.subscriptions_entitlement_sync();

-- ------------------------------------------------------------
-- 4. Conta nova nasce free EXPLÍCITO. handle_new_user (intocável) insere uma
--    linha em profiles para todo usuário, então penduramos aqui o default.
--    ON CONFLICT DO NOTHING: se o claim de assinatura já marcou 'pro' antes
--    (claim_paid_signup roda antes de handle_new_user), o 'pro' é preservado.
-- ------------------------------------------------------------
create or replace function public.profiles_entitlement_default()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.user_entitlements (user_id, plan)
  values (new.id, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.profiles_entitlement_default() from public, anon, authenticated;

drop trigger if exists profiles_entitlement_default_trg on public.profiles;
create trigger profiles_entitlement_default_trg
  after insert on public.profiles
  for each row execute function public.profiles_entitlement_default();

-- ------------------------------------------------------------
-- 5. Backfill: toda conta existente vira free EXPLÍCITO; quem tem assinatura
--    active|trialing sobe para pro. Idempotente (ON CONFLICT / WHERE EXISTS).
-- ------------------------------------------------------------
insert into public.user_entitlements (user_id, plan)
select id, 'free' from auth.users
on conflict (user_id) do nothing;

update public.user_entitlements e
   set plan = 'pro', updated_at = now()
 where e.plan <> 'pro'
   and exists (
     select 1 from public.subscriptions s
      where s.user_id = e.user_id
        and s.status in ('active', 'trialing')
   );

-- ------------------------------------------------------------
-- 6. Limite de 5 projetos salvos no plano free. Enforcement SERVER-SIDE:
--    carousels são inseridos DIRETO pelo client (policy carousels_owner é
--    `for all`), então o único ponto que o client não burla é um trigger no
--    banco. SECURITY DEFINER para ler user_entitlements/carousels sem esbarrar
--    na RLS. Falha fechada: entitlement não resolvido => tratado como free.
--    Pro não tem limite. Nada é apagado — só recusa o INSERT excedente.
-- ------------------------------------------------------------
create or replace function public.enforce_free_carousel_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan text;
  v_count int;
begin
  select plan into v_plan
    from public.user_entitlements
   where user_id = new.user_id;

  if v_plan is null then
    v_plan := 'free';
  end if;

  if v_plan = 'pro' then
    return new;
  end if;

  select count(*) into v_count
    from public.carousels
   where user_id = new.user_id;

  if v_count >= 5 then
    raise exception 'free_project_limit'
      using errcode = 'P0001',
            hint = 'O plano gratuito permite salvar até 5 projetos. Faça upgrade para salvar mais.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_free_carousel_limit() from public, anon, authenticated;

drop trigger if exists enforce_free_carousel_limit_trg on public.carousels;
create trigger enforce_free_carousel_limit_trg
  before insert on public.carousels
  for each row execute function public.enforce_free_carousel_limit();

commit;
