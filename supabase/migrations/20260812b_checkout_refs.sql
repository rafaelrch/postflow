-- 20260812b_checkout_refs.sql
--
-- Ponte checkout → lead. Migration SEPARADA de propósito: a
-- 20260812_asaas_migration.sql já rodou em produção e não pode ser editada.
--
-- ── POR QUE ESTA TABELA EXISTE (leia antes de achar que é redundante) ────────
--
-- Nós mandamos `externalReference` = id do lead na criação do checkout
-- (POST /v3/checkouts). O Asaas ACEITA o campo, mostra no painel dele... e
-- NUNCA o devolve. Não propaga para a cobrança nem para a assinatura. Medido no
-- primeiro pagamento real em sandbox (12/08/2026), lendo o payload cru gravado
-- em payment_webhook_events:
--
--   payment.externalReference       = null
--   subscription.externalReference  = null
--   payment.checkoutSession         = '008a7f76-2ae2-4100-9652-65b7b2ded675'
--   subscription.checkoutSession    = '008a7f76-2ae2-4100-9652-65b7b2ded675'
--
-- O que ELE devolve é `checkoutSession` — que é exatamente o `id` que o
-- POST /v3/checkouts nos retornou na criação. Ou seja: a ponte existe, mas
-- precisamos guardar as duas pontas nós mesmos. É isso que esta tabela faz.
--
-- Sem ela, subscriptions.external_reference fica NULL e a atribuição do lead se
-- perde: não dá para saber qual lead converteu.
--
-- ── E POR QUE NÃO CASAR POR E-MAIL ──────────────────────────────────────────
--
-- Porque não funciona, e o caso é comum, não raro. No MESMO teste o comprador
-- digitou endereços diferentes nos dois lugares:
--   lead (popup):   rafaelrocha250304@gmail.com
--   pagador:        rafarocha250304@gmail.com
-- Gravamos o do PAGADOR, que é o comportamento correto (é o e-mail que
-- enforce_paid_signup_precondition exige no cadastro). Logo, e-mail identifica
-- QUEM PAGOU, nunca QUAL LEAD converteu. São perguntas diferentes.
--
-- ── PRECEDENTE HISTÓRICO ────────────────────────────────────────────────────
--
-- A era AbacatePay tinha abacatepay_checkout_refs resolvendo este mesmo
-- problema. Ela saiu junto com o resto do AbacatePay e o problema voltou com
-- outro provedor. Não é acidente do Asaas: é o padrão de checkout hospedado.
--
-- Idempotente: pode rodar mais de uma vez sem estrago.

create table if not exists public.payment_checkout_refs (
  -- id do checkout no Asaas (o `id` devolvido por POST /v3/checkouts, que volta
  -- no webhook como `checkoutSession`). PK: um checkout pertence a um lead só.
  checkout_session_id text primary key,
  lead_id uuid not null references public.leads(id) on delete cascade,
  plan_interval text not null check (plan_interval in ('month', 'year')),
  created_at timestamptz not null default now()
);

-- "Quais checkouts este lead abriu?" — a pergunta de conciliação. Um lead pode
-- ter mais de um (abandonou o primeiro, voltou depois).
create index if not exists idx_payment_checkout_refs_lead
  on public.payment_checkout_refs (lead_id);

-- RLS ligado e ZERO policy ⇒ deny-all para anon e authenticated. Só a service
-- role (que bypassa RLS) escreve na rota de checkout e lê no webhook. Mesmo
-- padrão de public.leads e public.payment_webhook_events: isto liga uma pessoa
-- a um pagamento e não deve ser legível por ninguém logado.
alter table public.payment_checkout_refs enable row level security;
revoke all on public.payment_checkout_refs from public, anon, authenticated;
