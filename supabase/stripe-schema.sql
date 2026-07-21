-- ============================================================
-- PostFlow — Stripe (LEGADO / histórico)
-- Idempotente. Rodar APÓS supabase/schema.sql.
--
-- O Stripe foi removido do código (migração AbacatePay). Estas duas tabelas
-- permanecem apenas como histórico e para não quebrar referências existentes
-- (ex.: credits-and-flow.sql ainda cita stripe_customers). Seus dados de teste
-- são esvaziados por supabase/cleanup-stripe-test-data.sql, rodado manualmente.
--
-- A tabela public.subscriptions e a view user_active_subscription — que ANTES
-- moravam aqui — foram movidas para supabase/subscriptions-schema.sql (schema
-- canônico, provider-neutro).
-- ============================================================

-- Mapeia user → customer Stripe (1:1). Legado: nada no código escreve mais aqui.
create table if not exists public.stripe_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotência de webhooks Stripe (evt_xxx como PK). Legado.
create table if not exists public.stripe_webhook_events (
  id text primary key,                          -- evt_xxx
  type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create index if not exists idx_stripe_webhook_events_type on public.stripe_webhook_events (type, processed_at desc);

-- Trigger
drop trigger if exists set_stripe_customers_updated on public.stripe_customers;
create trigger set_stripe_customers_updated before update on public.stripe_customers
  for each row execute function public.set_updated_at();

-- RLS
alter table public.stripe_customers enable row level security;
alter table public.stripe_webhook_events enable row level security;

-- Usuário só lê o próprio customer
drop policy if exists stripe_customers_select_own on public.stripe_customers;
create policy stripe_customers_select_own on public.stripe_customers
  for select using (auth.uid() = user_id);

-- Usuário só insere o próprio customer (service role bypassa)
drop policy if exists stripe_customers_insert_own on public.stripe_customers;
create policy stripe_customers_insert_own on public.stripe_customers
  for insert with check (auth.uid() = user_id);

-- webhook_events: RLS habilitado e nenhuma policy ⇒ deny por padrão. Service role bypassa.
