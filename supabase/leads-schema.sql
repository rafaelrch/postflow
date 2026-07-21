-- ============================================================
-- Creatools — Leads (captura de interesse) schema
-- Idempotente. Rodar APÓS supabase/schema.sql (usa pgcrypto/gen_random_uuid).
--
-- PROPÓSITO: capturar nome/e-mail/telefone de TODO mundo que clica em "assinar"
-- um plano, ANTES e INDEPENDENTE de completar a compra. Dois motivos:
--   1. A AbacatePay não devolve e-mail no checkout (diferente da Stripe), então
--      coletar o e-mail aqui é o que permite provar depois quem demonstrou
--      interesse / iniciou a compra (equivalente ao fix B2).
--   2. Remarketing: quem não converte ainda fica registrado para contato.
--
-- Por isso a linha é gravada no submit do popup, antes do redirect pro checkout,
-- e nunca é condicionada ao sucesso do pagamento.
-- ============================================================

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  -- Qual plano o lead escolheu ao demonstrar interesse. Mesmo vocabulário
  -- ('month'/'year') usado em subscriptions.plan_interval.
  plan_interval text not null check (plan_interval in ('month', 'year')),
  created_at timestamptz not null default now()
);

-- Consulta típica de remarketing: mais recentes primeiro, e busca por e-mail
-- para cruzar com quem depois virou assinante.
create index if not exists idx_leads_created_at on public.leads (created_at desc);
create index if not exists idx_leads_email on public.leads (email);

-- RLS ligado e NENHUMA policy ⇒ deny por padrão para o usuário final. A
-- inserção acontece só via service role na rota /api/leads (mesmo padrão de
-- abacatepay_webhook_events). Leads são dados de contato de terceiros: nunca
-- devem ser legíveis pelo client anônimo.
alter table public.leads enable row level security;
