-- ============================================================
-- PostFlow — Stripe (assinatura) schema
-- Idempotente. Rodar APÓS supabase/schema.sql.
-- ============================================================

-- 1) Mapeia user → customer Stripe (1:1)
create table if not exists public.stripe_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Assinatura corrente do usuário (latest wins via on_conflict)
create table if not exists public.subscriptions (
  id text primary key,                          -- stripe subscription id (sub_xxx)
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  status text not null,                         -- active|trialing|past_due|canceled|unpaid|incomplete|incomplete_expired|paused
  price_id text not null,                       -- price_xxx
  plan_interval text not null,                  -- 'month' | 'year'
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  trial_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_user on public.subscriptions (user_id, status);
create index if not exists idx_subscriptions_customer on public.subscriptions (stripe_customer_id);

-- 3) Idempotência de webhooks Stripe (evt_xxx como PK ⇒ insere 1x só)
create table if not exists public.stripe_webhook_events (
  id text primary key,                          -- evt_xxx
  type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create index if not exists idx_stripe_webhook_events_type on public.stripe_webhook_events (type, processed_at desc);

-- Triggers
drop trigger if exists set_stripe_customers_updated on public.stripe_customers;
create trigger set_stripe_customers_updated before update on public.stripe_customers
  for each row execute function public.set_updated_at();

drop trigger if exists set_subscriptions_updated on public.subscriptions;
create trigger set_subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- RLS
alter table public.stripe_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_webhook_events enable row level security;

-- Usuário só lê o próprio customer
drop policy if exists stripe_customers_select_own on public.stripe_customers;
create policy stripe_customers_select_own on public.stripe_customers
  for select using (auth.uid() = user_id);

-- Usuário só insere o próprio customer (service role bypassa)
drop policy if exists stripe_customers_insert_own on public.stripe_customers;
create policy stripe_customers_insert_own on public.stripe_customers
  for insert with check (auth.uid() = user_id);

-- Usuário só lê a própria assinatura. Inserts/updates são feitos via service role no webhook.
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select using (auth.uid() = user_id);

-- webhook_events: nenhum acesso de usuário final (somente service role lê/escreve).
-- Tabela tem RLS habilitado e nenhuma policy ⇒ deny por padrão. Service role bypassa.

-- View conveniente: assinatura "ativa" do usuário (active|trialing) — pega a mais recente.
create or replace view public.user_active_subscription as
  select distinct on (user_id)
    user_id,
    id as subscription_id,
    status,
    price_id,
    plan_interval,
    cancel_at_period_end,
    current_period_end,
    trial_end
  from public.subscriptions
  where status in ('active', 'trialing')
  order by user_id, current_period_end desc nulls last, updated_at desc;

-- Permite que o usuário leia a view (security_invoker garante que a RLS da tabela base aplica)
alter view public.user_active_subscription set (security_invoker = true);
