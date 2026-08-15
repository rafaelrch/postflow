-- 20260815_admin_dashboard_indexes.sql
--
-- Índices para a Visão geral do painel administrativo (/admin).
--
-- ⚠️ Rafael roda no SQL Editor do Supabase. Idempotente: reexecutar é no-op.
--
-- ── ESTA MIGRATION NÃO É PRÉ-REQUISITO ──────────────────────────────────────
-- O painel FUNCIONA sem ela. Ela só troca sequential scan por index scan nos
-- recortes por data e nos filtros de estado da assinatura. Com o volume atual
-- (dezenas de linhas) a diferença é invisível; ela existe para o dia em que
-- não for, e porque índice criado depois de a tabela crescer trava a tabela.
--
-- ── O QUE ESTA MIGRATION **NÃO** FAZ, DE PROPÓSITO ──────────────────────────
-- Não cria tabela, view, função nem policy. A Fatia 1 lê o que já existe, com
-- o client service_role, no servidor, depois de requireAdmin(). Nenhuma tabela
-- nova é exposta ao Data API e nenhuma RLS é afrouxada — o painel não precisa
-- disso e afrouxar seria ampliar a superfície do banco para resolver um
-- problema de leitura interna.
--
-- ── NADA DE `concurrently` ──────────────────────────────────────────────────
-- `create index concurrently` não roda dentro de bloco transacional e o editor
-- do Supabase envolve o script em um. Com estas tabelas do tamanho que estão, o
-- lock de um create index comum dura milissegundos.

begin;

-- ── Recortes por data do filtro de período ──────────────────────────────────

-- "Leads no período" e a comparação com o período anterior.
create index if not exists idx_leads_created_at
  on public.leads (created_at desc);

-- "Perfis criados no período".
create index if not exists idx_profiles_created_at
  on public.profiles (created_at desc);

-- "Checkouts iniciados": o count por período e a leitura de lead_id que
-- deduplica pessoa. Inclui lead_id para o índice cobrir a consulta sozinho.
create index if not exists idx_payment_checkout_refs_created_at
  on public.payment_checkout_refs (created_at desc, lead_id);

-- ── Estado das assinaturas ──────────────────────────────────────────────────

-- Quase todo card de assinatura começa por "status ativo". Índice PARCIAL: só
-- as linhas que interessam entram, então ele fica pequeno e continua pequeno
-- mesmo quando a base de canceladas crescer.
create index if not exists idx_subscriptions_admin_active
  on public.subscriptions (plan_interval, cancel_at_period_end, user_id)
  where status in ('active', 'trialing');

-- "Renovações previstas nos próximos 7/30 dias": ordena por current_period_end
-- dentro do subconjunto que de fato renova (ativa e sem cancelamento agendado).
create index if not exists idx_subscriptions_renewal_window
  on public.subscriptions (current_period_end)
  where status in ('active', 'trialing') and cancel_at_period_end = false;

-- "Onboarding concluído × incompleto".
create index if not exists idx_profiles_onboarding
  on public.profiles (onboarding_completed);

-- "Clientes com 0 créditos". Parcial pelo mesmo motivo do índice de ativas: o
-- que se pergunta é sempre pelo zero.
create index if not exists idx_user_credits_zero_balance
  on public.user_credits (user_id)
  where balance = 0;

commit;

-- ── CONFERÊNCIA (só leitura, rode depois) ───────────────────────────────────
-- Esperado: as sete linhas acima.
select indexname
  from pg_indexes
 where schemaname = 'public'
   and indexname in (
     'idx_leads_created_at',
     'idx_profiles_created_at',
     'idx_payment_checkout_refs_created_at',
     'idx_subscriptions_admin_active',
     'idx_subscriptions_renewal_window',
     'idx_profiles_onboarding',
     'idx_user_credits_zero_balance'
   )
 order by indexname;
