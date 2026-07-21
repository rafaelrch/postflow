-- ============================================================
-- Creatools — Assinaturas (subscriptions) — schema canônico
-- Idempotente. Rodar APÓS supabase/schema.sql e ANTES de
-- supabase/abacatepay-schema.sql e supabase/credits-and-flow.sql.
--
-- Esta é a definição COMPLETA e ATUAL de public.subscriptions. Consolidada aqui
-- na remoção do Stripe: a tabela nasceu em stripe-schema.sql e foi evoluindo por
-- ALTERs em credits-and-flow.sql (user_id nullable, email) e em
-- abacatepay-schema.sql (provider, abacatepay_customer_id, stripe_customer_id
-- nullable). Agora vive em um só lugar, provider-neutro. Os ALTERs naqueles
-- arquivos permanecem idempotentes (no-ops quando a coluna já existe).
--
-- É a fonte de gating de acesso/créditos de TODO o app (AbacatePay e legado):
-- getActiveSubscription(), hasBillableSubscription() e a view abaixo leem daqui.
-- ============================================================

create table if not exists public.subscriptions (
  id text primary key,                          -- id do checkout/assinatura do provedor
  -- Pode ser NULL: no fluxo "pagamento primeiro" a linha é criada no checkout,
  -- antes de existir a conta; o signUp a vincula pelo e-mail (handle_new_user).
  user_id uuid references auth.users(id) on delete cascade,
  -- Origem do registro. 'stripe' é histórico (dados de teste, removidos); novas
  -- assinaturas são sempre 'abacatepay', gravadas com provider explícito.
  provider text not null default 'stripe',
  -- Legado Stripe: nullable porque assinatura AbacatePay não tem um.
  stripe_customer_id text,
  abacatepay_customer_id text,
  -- E-mail do pagador — chave de vínculo no cadastro pré-login e, na AbacatePay,
  -- o único jeito de saber quem pagou (o checkout não devolve e-mail).
  email text,
  status text not null,                         -- active|trialing|past_due|canceled|unpaid|incomplete|incomplete_expired|paused|disputed|refunded
  price_id text not null,                       -- Stripe: price_xxx · AbacatePay: prod_xxx
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

-- Colunas/constraints para bancos que já tinham a tabela num formato anterior.
alter table public.subscriptions alter column user_id drop not null;
alter table public.subscriptions alter column stripe_customer_id drop not null;
alter table public.subscriptions add column if not exists provider text not null default 'stripe';
alter table public.subscriptions add column if not exists abacatepay_customer_id text;
alter table public.subscriptions add column if not exists email text;

alter table public.subscriptions drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions
  add constraint subscriptions_provider_check check (provider in ('stripe', 'abacatepay'));

-- Índices
create index if not exists idx_subscriptions_user on public.subscriptions (user_id, status);
create index if not exists idx_subscriptions_customer on public.subscriptions (stripe_customer_id);
create index if not exists idx_subscriptions_abacate_customer on public.subscriptions (abacatepay_customer_id);
create index if not exists idx_subscriptions_provider on public.subscriptions (provider, status);
create index if not exists idx_subscriptions_email on public.subscriptions (lower(email));

-- Trigger updated_at
drop trigger if exists set_subscriptions_updated on public.subscriptions;
create trigger set_subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- RLS: usuário só lê a própria assinatura. Inserts/updates via service role.
alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select using (auth.uid() = user_id);

-- View conveniente: assinatura "ativa" do usuário (active|trialing) — a mais
-- recente. O sync AbacatePay mapeia PAID → 'active', então entra aqui igual à
-- Stripe legada. security_invoker garante que a RLS da tabela base aplica.
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

alter view public.user_active_subscription set (security_invoker = true);
