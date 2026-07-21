-- ============================================================
-- Limpeza de dados de teste do Stripe (migração AbacatePay concluída)
-- Confirmado pelo Rafael (21/07/2026): nenhum assinante Stripe é real.
-- Rodar manualmente no SQL editor do Supabase. Idempotente.
-- ============================================================

-- PRÉ-VOO — rode isto primeiro e confira os números antes de prosseguir:
select count(*) as stripe_customers_rows from public.stripe_customers;
select count(*) as stripe_webhook_events_rows from public.stripe_webhook_events;
select column_name from information_schema.columns
  where table_schema='public' and table_name='subscriptions'
  order by ordinal_position;
-- Se a coluna "provider" aparecer na lista acima, use a Opção B abaixo.
-- Se NÃO aparecer, toda linha de subscriptions é Stripe por definição — use a Opção A.

-- Opção A — banco AINDA NÃO tem a coluna provider (schema antigo):
begin;
delete from public.stripe_webhook_events;
delete from public.subscriptions;      -- toda linha é Stripe neste cenário
delete from public.stripe_customers;
commit;

-- Opção B — banco JÁ tem a coluna provider (schema com AbacatePay aplicado):
begin;
delete from public.stripe_webhook_events;
delete from public.subscriptions where provider = 'stripe' or provider is null;
delete from public.stripe_customers;
commit;
