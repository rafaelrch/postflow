-- One-shot migration for the legacy snapshot: subscriptions exists without
-- provider; AbacatePay/leads/legacy Stripe tables do not exist.
-- Cleanup of legacy Stripe subscriptions is intentionally a separate script.
begin;

do $$
begin
  if to_regclass('public.subscriptions') is null then
    raise exception 'ABORTED: public.subscriptions is required';
  end if;
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'user_active_subscription'
      and c.relkind = 'v'
  ) then
    raise exception 'ABORTED: public.user_active_subscription must be a view';
  end if;
end
$$;

-- Preserve the legacy rows; adding a NOT NULL column with this constant default
-- backfills every existing row as Stripe without changing any other value.
alter table public.subscriptions alter column user_id drop not null;
alter table public.subscriptions alter column stripe_customer_id drop not null;
alter table public.subscriptions add column if not exists provider text not null default 'stripe';
alter table public.subscriptions add column if not exists abacatepay_customer_id text;
alter table public.subscriptions add column if not exists email text;
alter table public.subscriptions drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions
  add constraint subscriptions_provider_check check (provider in ('stripe', 'abacatepay'));
create index if not exists idx_subscriptions_user on public.subscriptions (user_id, status);
create index if not exists idx_subscriptions_customer on public.subscriptions (stripe_customer_id);
create index if not exists idx_subscriptions_abacate_customer on public.subscriptions (abacatepay_customer_id);
create index if not exists idx_subscriptions_provider on public.subscriptions (provider, status);
create index if not exists idx_subscriptions_email on public.subscriptions (lower(email));
create unique index if not exists idx_subscriptions_abacate_ref
  on public.subscriptions ((metadata->>'ref'))
  where provider = 'abacatepay' and metadata ? 'ref';

drop trigger if exists set_subscriptions_updated on public.subscriptions;
create trigger set_subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();

create or replace function public.protect_subscription_claim()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.provider = 'abacatepay' and old.user_id is not null
     and new.user_id is distinct from old.user_id then
    if new.user_id is null then
      new.user_id := old.user_id;
    else
      raise exception 'subscription_claim_immutable' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_subscription_claim_trg on public.subscriptions;
create trigger protect_subscription_claim_trg before update of user_id
  on public.subscriptions for each row execute function public.protect_subscription_claim();
revoke all on function public.protect_subscription_claim() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.protect_subscription_claim() to service_role';
  end if;
end $$;

alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select using (auth.uid() = user_id);

create or replace view public.user_active_subscription as
  select distinct on (user_id) user_id, id as subscription_id, status, price_id,
    plan_interval, cancel_at_period_end, current_period_end, trial_end
  from public.subscriptions
  where status in ('active', 'trialing')
  order by user_id, current_period_end desc nulls last, updated_at desc;
alter view public.user_active_subscription set (security_invoker = true);

-- AbacatePay tables and RLS. There is deliberately no client INSERT policy.
create table if not exists public.abacatepay_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  abacatepay_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.abacatepay_webhook_events (
  id text primary key, event text not null, payload jsonb not null,
  processed_at timestamptz not null default now()
);
create index if not exists idx_abacatepay_webhook_events_event
  on public.abacatepay_webhook_events (event, processed_at desc);
drop trigger if exists set_abacatepay_customers_updated on public.abacatepay_customers;
create trigger set_abacatepay_customers_updated before update
  on public.abacatepay_customers for each row execute function public.set_updated_at();
alter table public.abacatepay_customers enable row level security;
alter table public.abacatepay_webhook_events enable row level security;
drop policy if exists abacatepay_customers_select_own on public.abacatepay_customers;
create policy abacatepay_customers_select_own on public.abacatepay_customers
  for select using (auth.uid() = user_id);
drop policy if exists abacatepay_customers_insert_own on public.abacatepay_customers;

-- Leads are service-role written and client unreadable.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(), name text not null,
  email text not null, phone text not null,
  plan_interval text not null check (plan_interval in ('month', 'year')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.leads add column if not exists updated_at timestamptz not null default now();
alter table public.leads drop constraint if exists leads_email_key;
alter table public.leads add constraint leads_email_key unique (email);
create index if not exists idx_leads_created_at on public.leads (created_at desc);
drop index if exists idx_leads_email;
drop trigger if exists set_leads_updated on public.leads;
create trigger set_leads_updated before update on public.leads
  for each row execute function public.set_updated_at();
alter table public.leads enable row level security;

-- Credits and auth gate. Existing legacy functions are replaced atomically.
alter table public.user_credits enable row level security;
drop policy if exists user_credits_select_own on public.user_credits;
create policy user_credits_select_own on public.user_credits
  for select using (auth.uid() = user_id);
create or replace function public.plan_allowance(p_price_id text, p_interval text)
returns int language sql immutable set search_path = pg_catalog, public as $$
  select case when p_interval = 'year' then 300 else 200 end;
$$;
revoke all on function public.plan_allowance(text, text) from public, anon, authenticated;
create or replace function public.consume_credits(p_user uuid, p_cost int)
returns int language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare v public.user_credits%rowtype;
begin
  if p_cost <= 0 then raise exception 'invalid_credit_cost' using errcode = 'P0001'; end if;
  if auth.uid() is distinct from p_user then raise exception 'credit_user_mismatch' using errcode = 'P0001'; end if;
  select * into v from public.user_credits where user_id = p_user for update;
  if not found then raise exception 'insufficient_credits' using errcode = 'P0001'; end if;
  if now() >= v.period_end then
    v.balance := v.monthly_allowance; v.period_start := now(); v.period_end := now() + interval '1 month';
  end if;
  if v.balance < p_cost then raise exception 'insufficient_credits' using errcode = 'P0001'; end if;
  update public.user_credits set balance = v.balance - p_cost,
    period_start = v.period_start, period_end = v.period_end
    where user_id = p_user returning balance into v.balance;
  return v.balance;
end;
$$;
revoke all on function public.consume_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_credits(uuid, integer) to authenticated;
create or replace function public.refund_credits(p_user uuid, p_amount int)
returns int language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_balance int;
begin
  if p_amount <= 0 then raise exception 'invalid_refund_amount' using errcode = 'P0001'; end if;
  update public.user_credits set balance = least(balance + p_amount, monthly_allowance)
    where user_id = p_user returning balance into v_balance;
  if not found then raise exception 'credits_not_found' using errcode = 'P0001'; end if;
  return v_balance;
end;
$$;
revoke all on function public.refund_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.refund_credits(uuid, integer) to service_role;
create or replace function public.refresh_credits(p_user uuid, p_allowance int, p_reset boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_expected int;
begin
  select public.plan_allowance(s.price_id, s.plan_interval) into v_expected
    from public.subscriptions s where s.user_id = p_user and s.provider = 'abacatepay'
      and s.status = 'active' order by s.current_period_end desc nulls last, s.updated_at desc limit 1;
  if not found or p_allowance is distinct from v_expected then
    raise exception 'invalid_credit_allowance' using errcode = 'P0001';
  end if;
  insert into public.user_credits (user_id, balance, monthly_allowance, period_start, period_end)
    values (p_user, v_expected, v_expected, now(), now() + interval '1 month')
    on conflict (user_id) do update set monthly_allowance = v_expected,
      balance = case when p_reset then v_expected else greatest(public.user_credits.balance, v_expected) end,
      period_start = case when p_reset then now() else public.user_credits.period_start end,
      period_end = case when p_reset then now() + interval '1 month' else public.user_credits.period_end end;
end;
$$;
revoke all on function public.refresh_credits(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.refresh_credits(uuid, integer, boolean) to service_role;

create or replace function public.enforce_paid_signup()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_ref text; v_claimed_id text;
begin
  v_ref := nullif(btrim(new.raw_user_meta_data->>'checkout_ref'), '');
  if v_ref is null then raise exception 'subscription_proof_required' using errcode = 'P0001'; end if;
  update public.subscriptions set user_id = new.id where provider = 'abacatepay'
    and status = 'active' and user_id is null and lower(email) = lower(new.email)
    and metadata->>'ref' = v_ref returning id into v_claimed_id;
  if v_claimed_id is null then raise exception 'subscription_proof_invalid_or_used' using errcode = 'P0001'; end if;
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'checkout_ref';
  return new;
end;
$$;
revoke all on function public.enforce_paid_signup() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.enforce_paid_signup() to supabase_auth_admin';
  end if;
end $$;
drop trigger if exists enforce_paid_signup_trg on auth.users;
create trigger enforce_paid_signup_trg before insert on auth.users
  for each row execute function public.enforce_paid_signup();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_sub public.subscriptions%rowtype; v_allowance int;
begin
  insert into public.profiles (id, name, handle, phone)
    values (new.id, coalesce(new.raw_user_meta_data->>'name',''),
      coalesce(new.raw_user_meta_data->>'handle',''), coalesce(new.raw_user_meta_data->>'phone',''))
    on conflict (id) do nothing;
  select * into v_sub from public.subscriptions where user_id = new.id
    and provider = 'abacatepay' and status = 'active'
    order by current_period_end desc nulls last, updated_at desc limit 1;
  if found then
    if v_sub.abacatepay_customer_id is not null then
      insert into public.abacatepay_customers (user_id, abacatepay_customer_id)
        values (new.id, v_sub.abacatepay_customer_id)
        on conflict (user_id) do update set abacatepay_customer_id = excluded.abacatepay_customer_id;
    end if;
    v_allowance := public.plan_allowance(v_sub.price_id, v_sub.plan_interval);
    insert into public.user_credits (user_id, balance, monthly_allowance, period_start, period_end)
      values (new.id, v_allowance, v_allowance, now(), now() + interval '1 month')
      on conflict (user_id) do update set monthly_allowance = excluded.monthly_allowance;
  end if;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.handle_new_user() to supabase_auth_admin';
  end if;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.user_credits (user_id, balance, monthly_allowance, period_start, period_end)
select distinct on (s.user_id) s.user_id,
  public.plan_allowance(s.price_id, s.plan_interval), public.plan_allowance(s.price_id, s.plan_interval),
  now(), now() + interval '1 month'
from public.subscriptions s where s.user_id is not null
  and s.provider = 'abacatepay' and s.status = 'active'
order by s.user_id, s.current_period_end desc nulls last
on conflict (user_id) do nothing;

commit;
