-- ============================================================
-- Limpeza de dados de teste do Stripe (migração AbacatePay concluída)
-- Confirmado pelo Rafael (21/07/2026): nenhum assinante Stripe é real.
-- Rodar manualmente no SQL editor do Supabase. Idempotente.
-- ============================================================

-- PRÉ-VOO — confira os números e a presença de provider antes de prosseguir.
-- Estas consultas não alteram dados.
select count(*) as stripe_customers_rows from public.stripe_customers;
select count(*) as stripe_webhook_events_rows from public.stripe_webhook_events;
select column_name from information_schema.columns
  where table_schema='public' and table_name='subscriptions'
  order by ordinal_position;
select exists (
  select 1
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'subscriptions'
    and column_name = 'provider'
) as subscriptions_provider_column_present;

-- FLUXO ÚNICO E ATÔMICO:
-- Sem public.subscriptions.provider, aborta antes de qualquer DELETE.
-- Se qualquer comando falhar, o bloco inteiro é revertido.
do $cleanup$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'subscriptions'
      and column_name = 'provider'
  ) then
    raise exception
      'ABORTADO: public.subscriptions.provider não existe; aplique o schema com provider antes da limpeza.';
  end if;

  delete from public.stripe_webhook_events;
  delete from public.subscriptions where provider = 'stripe';
  delete from public.stripe_customers;
end
$cleanup$;
