-- ============================================================
-- PostFlow/Creatools — Fluxo "pagamento primeiro" + créditos
-- Idempotente. Rodar APÓS supabase/schema.sql, supabase/subscriptions-schema.sql
-- e supabase/stripe-schema.sql.
-- ============================================================

-- 1) subscriptions: pode existir antes do usuário (criada no checkout sem auth)
alter table public.subscriptions alter column user_id drop not null;
alter table public.subscriptions add column if not exists email text;
create index if not exists idx_subscriptions_email on public.subscriptions (lower(email));

-- 2) Créditos por usuário
create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance int not null default 0,
  monthly_allowance int not null default 0,
  period_start timestamptz not null default now(),
  period_end timestamptz not null default (now() + interval '1 month'),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_user_credits_updated on public.user_credits;
create trigger set_user_credits_updated before update on public.user_credits
  for each row execute function public.set_updated_at();

alter table public.user_credits enable row level security;
-- Dono lê o próprio saldo. Escrita só via service role / funções security definer.
drop policy if exists user_credits_select_own on public.user_credits;
create policy user_credits_select_own on public.user_credits
  for select using (auth.uid() = user_id);

-- 3) Allowance por plano (centraliza os números do produto)
create or replace function public.plan_allowance(p_price_id text, p_interval text)
returns int
language sql
immutable
as $$
  select case when p_interval = 'year' then 300 else 200 end;
$$;

-- 4) Consome créditos com reset mensal preguiçoso. Retorna o novo saldo.
--    Lança 'insufficient_credits' (P0001) quando não há saldo / linha.
create or replace function public.consume_credits(p_user uuid, p_cost int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.user_credits%rowtype;
begin
  select * into v from public.user_credits where user_id = p_user for update;
  if not found then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  -- Recarga mensal (cobre mensal E anual com um só mecanismo)
  if now() >= v.period_end then
    v.balance := v.monthly_allowance;
    v.period_start := now();
    v.period_end := now() + interval '1 month';
  end if;

  if v.balance < p_cost then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  update public.user_credits
     set balance = v.balance - p_cost,
         period_start = v.period_start,
         period_end = v.period_end
   where user_id = p_user
   returning balance into v.balance;

  return v.balance;
end;
$$;

-- 5) Recarrega/ajusta o allowance (usado no webhook em renovação e upgrade)
create or replace function public.refresh_credits(p_user uuid, p_allowance int, p_reset boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_credits (user_id, balance, monthly_allowance, period_start, period_end)
  values (p_user, p_allowance, p_allowance, now(), now() + interval '1 month')
  on conflict (user_id) do update
    set monthly_allowance = p_allowance,
        balance = case
          when p_reset then p_allowance
          else greatest(public.user_credits.balance, p_allowance)
        end,
        period_start = case when p_reset then now() else public.user_credits.period_start end,
        period_end = case when p_reset then now() + interval '1 month' else public.user_credits.period_end end;
end;
$$;

-- 6) GATE DURO: ninguém cria conta sem assinatura ativa para o mesmo e-mail.
-- B2 (defesa em profundidade): exige também user_id is null, ou seja, uma
-- assinatura ainda NÃO reivindicada por nenhuma conta — evita reusar uma
-- linha de subscriptions já vinculada a outra conta (ex.: e-mail trocado no
-- customer da Stripe, linha antiga órfã) para autorizar um cadastro novo.
-- A prova forte de pagamento (session_id da Stripe) é validada em código, na
-- rota app/api/auth/verify-signup — este trigger é a última linha de defesa
-- no banco, não o mecanismo primário.
create or replace function public.enforce_paid_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.subscriptions
    where lower(email) = lower(new.email)
      and status in ('active', 'trialing')
      and user_id is null
  ) then
    raise exception 'subscription_required'
      using errcode = 'P0001',
            hint = 'Assine um plano antes de criar a conta.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_paid_signup_trg on auth.users;
create trigger enforce_paid_signup_trg
  before insert on auth.users
  for each row execute function public.enforce_paid_signup();

-- 7) Ao criar o usuário: cria profile (como antes), vincula assinatura/customer
--    pelo e-mail e provisiona créditos.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_allowance int;
begin
  insert into public.profiles (id, name, handle, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'handle', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (id) do nothing;

  -- Vincula a(s) assinatura(s) paga(s) pelo e-mail
  update public.subscriptions
     set user_id = new.id
   where user_id is null
     and lower(email) = lower(new.email);

  -- Pega a assinatura ativa mais recente para provisionar créditos
  select * into v_sub
    from public.subscriptions
   where user_id = new.id
     and status in ('active', 'trialing')
   order by current_period_end desc nulls last, updated_at desc
   limit 1;

  if found then
    -- (Removido na migração AbacatePay) Não espelha mais em stripe_customers: a
    -- coluna stripe_customer_id é NULL numa assinatura AbacatePay, e
    -- stripe_customers.stripe_customer_id é NOT NULL — o insert antigo quebrava
    -- o cadastro pago via AbacatePay. Nada mais lê stripe_customers.
    v_allowance := public.plan_allowance(v_sub.price_id, v_sub.plan_interval);

    insert into public.user_credits (user_id, balance, monthly_allowance, period_start, period_end)
    values (new.id, v_allowance, v_allowance, now(), now() + interval '1 month')
    on conflict (user_id) do update set monthly_allowance = excluded.monthly_allowance;
  end if;

  return new;
end;
$$;

-- 8) Backfill: provisiona créditos para assinantes ativos já existentes
--    (ex.: contas criadas antes deste fluxo). Não sobrescreve quem já tem.
insert into public.user_credits (user_id, balance, monthly_allowance, period_start, period_end)
select distinct on (s.user_id)
  s.user_id,
  public.plan_allowance(s.price_id, s.plan_interval),
  public.plan_allowance(s.price_id, s.plan_interval),
  now(),
  now() + interval '1 month'
from public.subscriptions s
where s.user_id is not null
  and s.status in ('active', 'trialing')
order by s.user_id, s.current_period_end desc nulls last
on conflict (user_id) do nothing;
