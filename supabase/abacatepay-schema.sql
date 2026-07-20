-- ============================================================
-- Creatools — AbacatePay (assinatura) schema
-- Idempotente. Rodar APÓS supabase/schema.sql e supabase/stripe-schema.sql.
--
-- ESTRATÉGIA: aditivo, não substitutivo. Em vez de criar uma tabela
-- `abacatepay_subscriptions` paralela, a tabela `subscriptions` existente
-- ganha uma coluna `provider` e passa a guardar as duas origens. Motivo:
-- a view public.user_active_subscription, getActiveSubscription() e TODO o
-- gating de créditos (consume_credits — intocável) leem dessa tabela. Manter
-- uma tabela só significa que nada disso precisa mudar: basta mapear o
-- vocabulário de status da AbacatePay para o interno que já existe.
-- ============================================================

-- 1) Origem do registro. Default 'stripe' para as linhas que já existem.
alter table public.subscriptions
  add column if not exists provider text not null default 'stripe';

alter table public.subscriptions
  drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions
  add constraint subscriptions_provider_check check (provider in ('stripe', 'abacatepay'));

-- 2) O id do customer na AbacatePay. stripe_customer_id vira opcional porque
--    uma assinatura AbacatePay não tem um.
alter table public.subscriptions
  add column if not exists abacatepay_customer_id text;

alter table public.subscriptions
  alter column stripe_customer_id drop not null;

-- 3) price_id guarda o id do PRODUTO na AbacatePay (prod_...). Mesma coluna,
--    semântica equivalente: identifica o plano contratado.

create index if not exists idx_subscriptions_provider on public.subscriptions (provider, status);
create index if not exists idx_subscriptions_abacate_customer on public.subscriptions (abacatepay_customer_id);

-- 4) Mapeia user → customer AbacatePay (1:1), espelhando stripe_customers.
create table if not exists public.abacatepay_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  abacatepay_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5) Idempotência de webhooks. A AbacatePay não manda um id de evento estável,
--    então a PK é um hash do corpo bruto (ver lib/abacatepay-webhook.ts) —
--    entrega repetida do mesmo payload colide e é ignorada.
create table if not exists public.abacatepay_webhook_events (
  id text primary key,
  event text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create index if not exists idx_abacatepay_webhook_events_event
  on public.abacatepay_webhook_events (event, processed_at desc);

-- Triggers
drop trigger if exists set_abacatepay_customers_updated on public.abacatepay_customers;
create trigger set_abacatepay_customers_updated before update on public.abacatepay_customers
  for each row execute function public.set_updated_at();

-- RLS
alter table public.abacatepay_customers enable row level security;
alter table public.abacatepay_webhook_events enable row level security;

-- Usuário só lê/insere o próprio customer (service role bypassa).
drop policy if exists abacatepay_customers_select_own on public.abacatepay_customers;
create policy abacatepay_customers_select_own on public.abacatepay_customers
  for select using (auth.uid() = user_id);

drop policy if exists abacatepay_customers_insert_own on public.abacatepay_customers;
create policy abacatepay_customers_insert_own on public.abacatepay_customers
  for insert with check (auth.uid() = user_id);

-- webhook_events: RLS ligado e nenhuma policy ⇒ deny por padrão para usuário
-- final. Só o service role lê/escreve. Mesmo padrão de stripe_webhook_events.

-- NOTA: public.user_active_subscription NÃO muda. Ela filtra
-- status in ('active','trialing'), e o sync mapeia PAID → 'active', então
-- assinatura AbacatePay paga entra na view exatamente como a da Stripe.
