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
  created_at timestamptz not null default now(),
  -- Última vez que o mesmo e-mail reenviou o formulário (ver upsert abaixo).
  updated_at timestamptz not null default now()
);

-- Coluna nova para tabelas que já existiam antes deste bloco.
alter table public.leads add column if not exists updated_at timestamptz not null default now();

-- E-mail único: um lead por endereço. A rota faz upsert por e-mail (atualiza
-- nome/telefone/plano + updated_at) em vez de acumular duplicata infinita do
-- mesmo contato. created_at fica com o primeiro registro; updated_at marca o
-- último interesse.
-- Antes de criar o índice único, remove duplicatas pré-existentes mantendo a
-- linha mais recente por e-mail (idempotente: sem duplicata, é no-op).
delete from public.leads a
  using public.leads b
  where a.email = b.email
    and (a.created_at, a.id) < (b.created_at, b.id);

alter table public.leads drop constraint if exists leads_email_key;
alter table public.leads add constraint leads_email_key unique (email);

-- Consulta típica de remarketing: mais recentes primeiro. O índice único de
-- e-mail (leads_email_key) já cobre a busca por endereço — o idx_leads_email
-- antigo, não-único, vira redundante.
create index if not exists idx_leads_created_at on public.leads (created_at desc);
drop index if exists idx_leads_email;

-- updated_at automático no upsert.
drop trigger if exists set_leads_updated on public.leads;
create trigger set_leads_updated before update on public.leads
  for each row execute function public.set_updated_at();

-- RLS ligado e NENHUMA policy ⇒ deny por padrão para o usuário final. A
-- inserção acontece só via service role na rota /api/leads (mesmo padrão de
-- abacatepay_webhook_events). Leads são dados de contato de terceiros: nunca
-- devem ser legíveis pelo client anônimo.
alter table public.leads enable row level security;
