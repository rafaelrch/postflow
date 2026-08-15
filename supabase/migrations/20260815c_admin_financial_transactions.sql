-- F3 /admin/financeiro
--
-- NORMALIZAÇÃO ADITIVA: esta migration não altera subscriptions nem o fluxo
-- de acesso. payment_webhook_events continua sendo a trilha bruta; esta tabela
-- é a projeção financeira consultável, com UMA linha por cobrança.

begin;

create table if not exists public.payment_transactions (
  provider_payment_id text primary key,
  payment_provider text not null default 'asaas'
    check (payment_provider in ('asaas')),
  provider_subscription_id text,
  user_id uuid references auth.users(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  plan_interval text check (plan_interval in ('month', 'year')),
  status text,
  last_event_type text,
  gross_value numeric(12, 2) check (gross_value is null or gross_value >= 0),
  billing_type text,
  due_date date,
  confirmed_at timestamptz,
  received_at timestamptz,
  overdue_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  chargeback_at timestamptz,
  first_event_at timestamptz not null,
  last_event_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.payment_transactions is
  'Projecao financeira normalizada dos webhooks. Uma linha por cobranca; valores sao brutos, sem taxa do Asaas.';
comment on column public.payment_transactions.received_at is
  'Quando PAYMENT_RECEIVED foi observado. Nao confundir com confirmed_at.';

alter table public.payment_transactions enable row level security;
revoke all on table public.payment_transactions from public, anon, authenticated;
grant select, insert, update on table public.payment_transactions to service_role;

create index if not exists idx_payment_transactions_received
  on public.payment_transactions (received_at desc)
  where received_at is not null;
create index if not exists idx_payment_transactions_confirmed
  on public.payment_transactions (confirmed_at desc)
  where confirmed_at is not null;
create index if not exists idx_payment_transactions_status
  on public.payment_transactions (status, last_event_at desc);
create index if not exists idx_payment_transactions_subscription
  on public.payment_transactions (provider_subscription_id, confirmed_at);
create index if not exists idx_payment_transactions_refunded
  on public.payment_transactions (refunded_at desc)
  where refunded_at is not null;
create index if not exists idx_payment_transactions_chargeback
  on public.payment_transactions (chargeback_at desc)
  where chargeback_at is not null;

-- Único caminho de escrita daqui para frente. A função resolve os vínculos a
-- partir da assinatura já processada pelo webhook e faz merge monotônico: um
-- evento atrasado nunca apaga datas nem regride o status corrente.
create or replace function public.record_asaas_payment_transaction(
  p_provider_payment_id text,
  p_provider_subscription_id text,
  p_event_type text,
  p_status text,
  p_gross_value numeric,
  p_billing_type text,
  p_due_date date,
  p_event_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_user uuid;
  linked_lead uuid;
  linked_plan text;
  happened_at timestamptz := coalesce(p_event_at, now());
begin
  if nullif(btrim(p_provider_payment_id), '') is null then
    return;
  end if;

  select
    s.user_id,
    case
      when s.external_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then s.external_reference::uuid
      else null
    end,
    s.plan_interval
  into linked_user, linked_lead, linked_plan
  from public.subscriptions s
  where s.id = p_provider_subscription_id;

  insert into public.payment_transactions as current_tx (
    provider_payment_id, provider_subscription_id, user_id, lead_id,
    plan_interval, status, last_event_type, gross_value, billing_type,
    due_date, confirmed_at, received_at, overdue_at, failed_at,
    refunded_at, chargeback_at, first_event_at, last_event_at
  ) values (
    p_provider_payment_id, p_provider_subscription_id, linked_user, linked_lead,
    linked_plan, p_status, p_event_type, p_gross_value, p_billing_type,
    p_due_date,
    case when p_event_type = 'PAYMENT_CONFIRMED' then happened_at end,
    case when p_event_type = 'PAYMENT_RECEIVED' then happened_at end,
    case when p_event_type = 'PAYMENT_OVERDUE' then happened_at end,
    case when p_event_type = 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED' then happened_at end,
    case when p_event_type = 'PAYMENT_REFUNDED' then happened_at end,
    case when p_event_type = 'PAYMENT_CHARGEBACK_REQUESTED' then happened_at end,
    happened_at, happened_at
  )
  on conflict (provider_payment_id) do update set
    provider_subscription_id = coalesce(excluded.provider_subscription_id, current_tx.provider_subscription_id),
    user_id = coalesce(excluded.user_id, current_tx.user_id),
    lead_id = coalesce(excluded.lead_id, current_tx.lead_id),
    plan_interval = coalesce(excluded.plan_interval, current_tx.plan_interval),
    status = case when excluded.last_event_at >= current_tx.last_event_at then excluded.status else current_tx.status end,
    last_event_type = case when excluded.last_event_at >= current_tx.last_event_at then excluded.last_event_type else current_tx.last_event_type end,
    gross_value = case when excluded.last_event_at >= current_tx.last_event_at then coalesce(excluded.gross_value, current_tx.gross_value) else current_tx.gross_value end,
    billing_type = case when excluded.last_event_at >= current_tx.last_event_at then coalesce(excluded.billing_type, current_tx.billing_type) else current_tx.billing_type end,
    due_date = case when excluded.last_event_at >= current_tx.last_event_at then coalesce(excluded.due_date, current_tx.due_date) else current_tx.due_date end,
    confirmed_at = least(current_tx.confirmed_at, excluded.confirmed_at),
    received_at = least(current_tx.received_at, excluded.received_at),
    overdue_at = least(current_tx.overdue_at, excluded.overdue_at),
    failed_at = least(current_tx.failed_at, excluded.failed_at),
    refunded_at = least(current_tx.refunded_at, excluded.refunded_at),
    chargeback_at = least(current_tx.chargeback_at, excluded.chargeback_at),
    first_event_at = least(current_tx.first_event_at, excluded.first_event_at),
    last_event_at = greatest(current_tx.last_event_at, excluded.last_event_at),
    updated_at = now();
end;
$$;

revoke all on function public.record_asaas_payment_transaction(text, text, text, text, numeric, text, date, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_asaas_payment_transaction(text, text, text, text, numeric, text, date, timestamptz)
  to service_role;

-- Backfill somente-leitura da origem. A agregação acontece por payment.id
-- antes do INSERT, impedindo CONFIRMED + RECEIVED de virarem duas receitas.
-- Reexecutar preserva a primeira ocorrência de cada marco e a última situação.
with raw_events as (
  select
    e.event_id,
    e.event_type,
    e.received_at as event_at,
    e.payload -> 'payment' as payment
  from public.payment_webhook_events e
  where nullif(e.payload -> 'payment' ->> 'id', '') is not null
), normalized as (
  select
    event_id,
    event_type,
    event_at,
    payment ->> 'id' as provider_payment_id,
    nullif(payment ->> 'subscription', '') as provider_subscription_id,
    nullif(payment ->> 'status', '') as status,
    case when payment ->> 'value' ~ '^[0-9]+([.][0-9]+)?$' then (payment ->> 'value')::numeric end as gross_value,
    nullif(payment ->> 'billingType', '') as billing_type,
    case when payment ->> 'dueDate' ~ '^\d{4}-\d{2}-\d{2}$' then (payment ->> 'dueDate')::date end as due_date
  from raw_events
), grouped as (
  select
    provider_payment_id,
    (array_agg(provider_subscription_id order by event_at desc, event_id desc) filter (where provider_subscription_id is not null))[1] as provider_subscription_id,
    (array_agg(status order by event_at desc, event_id desc) filter (where status is not null))[1] as status,
    (array_agg(event_type order by event_at desc, event_id desc))[1] as last_event_type,
    (array_agg(gross_value order by event_at desc, event_id desc) filter (where gross_value is not null))[1] as gross_value,
    (array_agg(billing_type order by event_at desc, event_id desc) filter (where billing_type is not null))[1] as billing_type,
    (array_agg(due_date order by event_at desc, event_id desc) filter (where due_date is not null))[1] as due_date,
    min(event_at) filter (where event_type = 'PAYMENT_CONFIRMED') as confirmed_at,
    min(event_at) filter (where event_type = 'PAYMENT_RECEIVED') as received_at,
    min(event_at) filter (where event_type = 'PAYMENT_OVERDUE') as overdue_at,
    min(event_at) filter (where event_type = 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED') as failed_at,
    min(event_at) filter (where event_type = 'PAYMENT_REFUNDED') as refunded_at,
    min(event_at) filter (where event_type = 'PAYMENT_CHARGEBACK_REQUESTED') as chargeback_at,
    min(event_at) as first_event_at,
    max(event_at) as last_event_at
  from normalized
  group by provider_payment_id
), linked as (
  select
    g.*,
    s.user_id,
    case
      when s.external_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then s.external_reference::uuid
      else null
    end as lead_id,
    s.plan_interval
  from grouped g
  left join public.subscriptions s on s.id = g.provider_subscription_id
)
insert into public.payment_transactions as current_tx (
  provider_payment_id, provider_subscription_id, user_id, lead_id,
  plan_interval, status, last_event_type, gross_value, billing_type, due_date,
  confirmed_at, received_at, overdue_at, failed_at, refunded_at, chargeback_at,
  first_event_at, last_event_at
)
select
  provider_payment_id, provider_subscription_id, user_id, lead_id,
  plan_interval, status, last_event_type, gross_value, billing_type, due_date,
  confirmed_at, received_at, overdue_at, failed_at, refunded_at, chargeback_at,
  first_event_at, last_event_at
from linked
on conflict (provider_payment_id) do update set
  provider_subscription_id = coalesce(excluded.provider_subscription_id, current_tx.provider_subscription_id),
  user_id = coalesce(excluded.user_id, current_tx.user_id),
  lead_id = coalesce(excluded.lead_id, current_tx.lead_id),
  plan_interval = coalesce(excluded.plan_interval, current_tx.plan_interval),
  status = case when excluded.last_event_at >= current_tx.last_event_at then excluded.status else current_tx.status end,
  last_event_type = case when excluded.last_event_at >= current_tx.last_event_at then excluded.last_event_type else current_tx.last_event_type end,
  gross_value = case when excluded.last_event_at >= current_tx.last_event_at then coalesce(excluded.gross_value, current_tx.gross_value) else current_tx.gross_value end,
  billing_type = case when excluded.last_event_at >= current_tx.last_event_at then coalesce(excluded.billing_type, current_tx.billing_type) else current_tx.billing_type end,
  due_date = case when excluded.last_event_at >= current_tx.last_event_at then coalesce(excluded.due_date, current_tx.due_date) else current_tx.due_date end,
  confirmed_at = least(current_tx.confirmed_at, excluded.confirmed_at),
  received_at = least(current_tx.received_at, excluded.received_at),
  overdue_at = least(current_tx.overdue_at, excluded.overdue_at),
  failed_at = least(current_tx.failed_at, excluded.failed_at),
  refunded_at = least(current_tx.refunded_at, excluded.refunded_at),
  chargeback_at = least(current_tx.chargeback_at, excluded.chargeback_at),
  first_event_at = least(current_tx.first_event_at, excluded.first_event_at),
  last_event_at = greatest(current_tx.last_event_at, excluded.last_event_at),
  updated_at = case when row(
    excluded.provider_subscription_id, excluded.user_id, excluded.lead_id,
    excluded.plan_interval, excluded.status, excluded.last_event_type,
    excluded.gross_value, excluded.billing_type, excluded.due_date,
    excluded.confirmed_at, excluded.received_at, excluded.overdue_at,
    excluded.failed_at, excluded.refunded_at, excluded.chargeback_at,
    excluded.first_event_at, excluded.last_event_at
  ) is distinct from row(
    current_tx.provider_subscription_id, current_tx.user_id, current_tx.lead_id,
    current_tx.plan_interval, current_tx.status, current_tx.last_event_type,
    current_tx.gross_value, current_tx.billing_type, current_tx.due_date,
    current_tx.confirmed_at, current_tx.received_at, current_tx.overdue_at,
    current_tx.failed_at, current_tx.refunded_at, current_tx.chargeback_at,
    current_tx.first_event_at, current_tx.last_event_at
  ) then now() else current_tx.updated_at end;

-- Bloco 1: caixa observado e ciclo de pagamentos. Confirmado e recebido são
-- consultas distintas sobre a mesma linha, nunca soma de eventos.
create or replace function public.admin_financial_revenue(
  p_from timestamptz,
  p_to timestamptz,
  p_grain text default 'day'
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with valid as (
    select * from public.payment_transactions
    where refunded_at is null and chargeback_at is null
  ), received as (
    select * from valid where received_at >= p_from and received_at < p_to
  ), confirmed as (
    select * from valid where confirmed_at >= p_from and confirmed_at < p_to
  ), series as (
    select
      date_trunc(case when p_grain in ('day', 'week', 'month') then p_grain else 'day' end, received_at at time zone 'America/Sao_Paulo') as bucket,
      count(*)::bigint as count,
      coalesce(sum(gross_value), 0)::numeric as amount
    from received
    group by 1
  ), observed as (
    select
      v.*,
      row_number() over (
        partition by coalesce(v.provider_subscription_id, v.provider_payment_id)
        order by v.confirmed_at, v.provider_payment_id
      ) as payment_number
    from valid v
    where v.confirmed_at is not null
  ), observed_period as (
    select * from observed where confirmed_at >= p_from and confirmed_at < p_to
  )
  select jsonb_build_object(
    'received', jsonb_build_object('count', (select count(*) from received), 'amount', (select coalesce(sum(gross_value), 0) from received)),
    'confirmed', jsonb_build_object('count', (select count(*) from confirmed), 'amount', (select coalesce(sum(gross_value), 0) from confirmed)),
    'refunded', jsonb_build_object('count', (select count(*) from public.payment_transactions where refunded_at >= p_from and refunded_at < p_to), 'amount', (select coalesce(sum(gross_value), 0) from public.payment_transactions where refunded_at >= p_from and refunded_at < p_to)),
    'chargeback', jsonb_build_object('count', (select count(*) from public.payment_transactions where chargeback_at >= p_from and chargeback_at < p_to), 'amount', (select coalesce(sum(gross_value), 0) from public.payment_transactions where chargeback_at >= p_from and chargeback_at < p_to)),
    'new_subscriptions', (select count(*) from observed_period where payment_number = 1),
    'renewals', (select count(*) from observed_period where payment_number > 1),
    'history_started_at', (select min(first_event_at) from public.payment_transactions),
    'series', coalesce((select jsonb_agg(jsonb_build_object('bucket', to_char(bucket, 'YYYY-MM-DD'), 'count', count, 'amount', amount) order by bucket) from series), '[]'::jsonb),
    'by_plan', coalesce((select jsonb_agg(jsonb_build_object('plan', coalesce(plan_interval, 'unknown'), 'count', count, 'amount', amount) order by plan_interval) from (select plan_interval, count(*)::bigint count, coalesce(sum(gross_value), 0)::numeric amount from received group by plan_interval) plans), '[]'::jsonb)
  );
$$;

-- Bloco 2: fotografia atual. Não existe snapshot histórico de MRR; a UI deve
-- dizer isso em vez de desenhar uma série retroativa.
create or replace function public.admin_financial_current()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with active as (
    select * from public.subscriptions where status in ('active', 'trialing')
  )
  select jsonb_build_object(
    'mrr', coalesce(sum(case when plan_interval = 'month' then value when plan_interval = 'year' then value / 12 else 0 end), 0),
    'arr', coalesce(sum(case when plan_interval = 'month' then value * 12 when plan_interval = 'year' then value else 0 end), 0),
    'missing_value', count(*) filter (where value is null),
    'monthly', jsonb_build_object('count', count(*) filter (where plan_interval = 'month'), 'value', coalesce(sum(value) filter (where plan_interval = 'month'), 0)),
    'yearly', jsonb_build_object('count', count(*) filter (where plan_interval = 'year'), 'value', coalesce(sum(value) filter (where plan_interval = 'year'), 0))
  )
  from active;
$$;

-- Bloco 3: itens que pedem ação. canceled_at não entra: ele é ambíguo e não
-- sustenta churn. Refund/chargeback vêm das datas específicas da transação.
create or replace function public.admin_financial_attention(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with issues as (
    select t.*, 'overdue'::text issue_type, overdue_at issue_at from public.payment_transactions t where overdue_at >= p_from and overdue_at < p_to
    union all
    select t.*, 'failed'::text, failed_at from public.payment_transactions t where failed_at >= p_from and failed_at < p_to
    union all
    select t.*, 'refunded'::text, refunded_at from public.payment_transactions t where refunded_at >= p_from and refunded_at < p_to
    union all
    select t.*, 'chargeback'::text, chargeback_at from public.payment_transactions t where chargeback_at >= p_from and chargeback_at < p_to
  ), issue_rows as (
    select
      i.provider_payment_id, i.provider_subscription_id,
      coalesce(i.user_id, s.user_id) user_id,
      s.email, i.issue_type, i.issue_at, i.gross_value, i.billing_type,
      case when coalesce(i.user_id, s.user_id) is not null
        then 'account:' || coalesce(i.user_id, s.user_id)::text
        else 'subscription:' || i.provider_subscription_id end customer_key
    from issues i
    left join public.subscriptions s on s.id = i.provider_subscription_id
    order by i.issue_at desc, i.provider_payment_id
    limit 50
  ), scheduled as (
    select id, user_id, email, plan_interval, value, current_period_end
    from public.subscriptions
    where status in ('active', 'trialing') and cancel_at_period_end = true
    order by current_period_end nulls last, id
    limit 30
  ), orphan as (
    select id, email, plan_interval, value, current_period_end
    from public.subscriptions
    where status in ('active', 'trialing') and user_id is null
    order by created_at desc, id
    limit 30
  )
  select jsonb_build_object(
    'issues', coalesce((select jsonb_agg(to_jsonb(issue_rows) order by issue_at desc, provider_payment_id) from issue_rows), '[]'::jsonb),
    'scheduled_cancellations', jsonb_build_object('count', (select count(*) from public.subscriptions where status in ('active', 'trialing') and cancel_at_period_end = true), 'rows', coalesce((select jsonb_agg(to_jsonb(scheduled)) from scheduled), '[]'::jsonb)),
    'paid_without_account', jsonb_build_object('count', (select count(*) from public.subscriptions where status in ('active', 'trialing') and user_id is null), 'rows', coalesce((select jsonb_agg(to_jsonb(orphan)) from orphan), '[]'::jsonb))
  );
$$;

-- Bloco 4: previsão é um piso quando falta data OU valor. As duas incertezas
-- são retornadas para a UI nunca transformar desconhecido em zero silencioso.
create or replace function public.admin_financial_forecast(p_now timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with renewable as (
    select id, user_id, email, plan_interval, value, current_period_end
    from public.subscriptions
    where status in ('active', 'trialing') and cancel_at_period_end = false
  ), next_30 as (
    select * from renewable
    where current_period_end >= p_now and current_period_end < p_now + interval '30 days'
  ), next_7 as (
    select * from next_30 where current_period_end < p_now + interval '7 days'
  )
  select jsonb_build_object(
    'undated', (select count(*) from renewable where current_period_end is null),
    'next7', jsonb_build_object(
      'count', (select count(*) from next_7),
      'amount', (select coalesce(sum(value), 0) from next_7),
      'missing_value', (select count(*) from next_7 where value is null),
      'rows', coalesce((select jsonb_agg(to_jsonb(next_7) order by current_period_end, id) from next_7), '[]'::jsonb)
    ),
    'next30', jsonb_build_object(
      'count', (select count(*) from next_30),
      'amount', (select coalesce(sum(value), 0) from next_30),
      'missing_value', (select count(*) from next_30 where value is null),
      'rows', coalesce((select jsonb_agg(to_jsonb(next_30) order by current_period_end, id) from next_30), '[]'::jsonb)
    )
  );
$$;

revoke all on function public.admin_financial_revenue(timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.admin_financial_current() from public, anon, authenticated;
revoke all on function public.admin_financial_attention(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_financial_forecast(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_financial_revenue(timestamptz, timestamptz, text) to service_role;
grant execute on function public.admin_financial_current() to service_role;
grant execute on function public.admin_financial_attention(timestamptz, timestamptz) to service_role;
grant execute on function public.admin_financial_forecast(timestamptz) to service_role;

commit;
