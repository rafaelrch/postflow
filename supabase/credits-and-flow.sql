-- ============================================================
-- Creatools — signup pago + créditos (AbacatePay)
-- Idempotente. Rodar após schema.sql, subscriptions-schema.sql e
-- abacatepay-schema.sql. Não depende de tabelas Stripe.
-- ============================================================

alter table public.subscriptions alter column user_id drop not null;
alter table public.subscriptions add column if not exists email text;
create index if not exists idx_subscriptions_email on public.subscriptions (lower(email));

create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance int not null default 0,
  monthly_allowance int not null default 0,
  period_start timestamptz not null default now(),
  period_end timestamptz not null default (now() + interval '1 month'),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_user_credits_updated on public.user_credits;
create trigger set_user_credits_updated before update on public.user_credits
  for each row execute function public.set_updated_at();

alter table public.user_credits enable row level security;
drop policy if exists user_credits_select_own on public.user_credits;
create policy user_credits_select_own on public.user_credits
  for select using (auth.uid() = user_id);

create or replace function public.plan_allowance(p_price_id text, p_interval text)
returns int
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case when p_interval = 'year' then 300 else 200 end;
$$;
revoke all on function public.plan_allowance(text, text) from public, anon, authenticated;

-- Débito chamado com o JWT do usuário. Não aceita zero/negativo e não permite
-- que um usuário debite o saldo de outro.
create or replace function public.consume_credits(p_user uuid, p_cost int)
returns int
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v public.user_credits%rowtype;
begin
  if p_cost <= 0 then
    raise exception 'invalid_credit_cost' using errcode = 'P0001';
  end if;
  if auth.uid() is distinct from p_user then
    raise exception 'credit_user_mismatch' using errcode = 'P0001';
  end if;

  select * into v from public.user_credits where user_id = p_user for update;
  if not found then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  if now() >= v.period_end then
    v.balance := v.monthly_allowance;
    v.period_start := now();
    v.period_end := now() + interval '1 month';
  end if;
  if v.balance < p_cost then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  update public.user_credits
     set balance = v.balance - p_cost,
         period_start = v.period_start,
         period_end = v.period_end
   where user_id = p_user
   returning balance into v.balance;
  return v.balance;
end;
$$;

revoke all on function public.consume_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_credits(uuid, integer) to authenticated;

-- Estorno best-effort dos backends. Valor sempre positivo e saldo nunca passa
-- do allowance, então retries não viram concessão ilimitada.
create or replace function public.refund_credits(p_user uuid, p_amount int)
returns int
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_balance int;
begin
  if p_amount <= 0 then
    raise exception 'invalid_refund_amount' using errcode = 'P0001';
  end if;
  update public.user_credits
     set balance = least(balance + p_amount, monthly_allowance)
   where user_id = p_user
   returning balance into v_balance;
  if not found then
    raise exception 'credits_not_found' using errcode = 'P0001';
  end if;
  return v_balance;
end;
$$;

revoke all on function public.refund_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.refund_credits(uuid, integer) to service_role;

-- Renovação/upgrade: somente service role e somente com allowance derivado de
-- uma assinatura AbacatePay ativa do próprio usuário.
create or replace function public.refresh_credits(p_user uuid, p_allowance int, p_reset boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_expected int;
begin
  select public.plan_allowance(s.price_id, s.plan_interval)
    into v_expected
    from public.subscriptions s
   where s.user_id = p_user
     and s.provider = 'abacatepay'
     and s.status = 'active'
   order by s.current_period_end desc nulls last, s.updated_at desc
   limit 1;
  if not found or p_allowance is distinct from v_expected then
    raise exception 'invalid_credit_allowance' using errcode = 'P0001';
  end if;

  insert into public.user_credits (user_id, balance, monthly_allowance, period_start, period_end)
  values (p_user, v_expected, v_expected, now(), now() + interval '1 month')
  on conflict (user_id) do update
    set monthly_allowance = v_expected,
        balance = case
          when p_reset then v_expected
          else greatest(public.user_credits.balance, v_expected)
        end,
        period_start = case when p_reset then now() else public.user_credits.period_start end,
        period_end = case when p_reset then now() + interval '1 month' else public.user_credits.period_end end;
end;
$$;

revoke all on function public.refresh_credits(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.refresh_credits(uuid, integer, boolean) to service_role;

-- B2 BEFORE: valida a prova, mas não toca subscriptions. O auth.users row ainda
-- não existe neste ponto, portanto qualquer FK claim precisa esperar o AFTER.
create or replace function public.enforce_paid_signup()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_ref text;
begin
  v_ref := nullif(btrim(new.raw_user_meta_data->>'checkout_ref'), '');
  if v_ref is null then
    raise exception 'subscription_proof_required' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.subscriptions
     where provider = 'abacatepay'
       and status = 'active'
       and user_id is null
       and lower(email) = lower(new.email)
       and metadata->>'ref' = v_ref
  ) then
    raise exception 'subscription_proof_invalid_or_used' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_paid_signup() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.enforce_paid_signup() to supabase_auth_admin';
  end if;
end
$$;

drop trigger if exists enforce_paid_signup_trg on auth.users;
create trigger enforce_paid_signup_trg
  before insert on auth.users
  for each row execute function public.enforce_paid_signup();

-- B2 AFTER: o auth.users row já existe, então o FK de subscriptions.user_id é
-- válido. O UPDATE continua one-shot sob corrida (user_id IS NULL + RETURNING).
create or replace function public.claim_paid_signup()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ref text;
  v_claimed_id text;
begin
  v_ref := nullif(btrim(new.raw_user_meta_data->>'checkout_ref'), '');
  update public.subscriptions
     set user_id = new.id
   where provider = 'abacatepay'
     and status = 'active'
     and user_id is null
     and lower(email) = lower(new.email)
     and metadata->>'ref' = v_ref
   returning id into v_claimed_id;

  if v_claimed_id is null then
    raise exception 'subscription_proof_invalid_or_used' using errcode = 'P0001';
  end if;

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'checkout_ref'
   where id = new.id;
  return new;
end;
$$;

revoke all on function public.claim_paid_signup() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.claim_paid_signup() to supabase_auth_admin';
  end if;
end
$$;

drop trigger if exists claim_paid_signup_trg on auth.users;
create trigger claim_paid_signup_trg
  after insert on auth.users
  for each row execute function public.claim_paid_signup();

-- This AFTER trigger name sorts after claim_paid_signup_trg in PostgreSQL, so it
-- only provisions data after the atomic claim has succeeded.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_allowance int;
begin
  insert into public.profiles (id, name, handle, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'handle', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (id) do nothing;

  select * into v_sub
    from public.subscriptions
   where user_id = new.id
     and provider = 'abacatepay'
     and status = 'active'
   order by current_period_end desc nulls last, updated_at desc
   limit 1;

  if found then
    if v_sub.abacatepay_customer_id is not null then
      insert into public.abacatepay_customers (user_id, abacatepay_customer_id)
      values (new.id, v_sub.abacatepay_customer_id)
      on conflict (user_id) do update
        set abacatepay_customer_id = excluded.abacatepay_customer_id;
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
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.handle_new_user() to supabase_auth_admin';
  end if;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill só de AbacatePay; Stripe legado não pode gerar créditos antes do cleanup.
insert into public.user_credits (user_id, balance, monthly_allowance, period_start, period_end)
select distinct on (s.user_id)
  s.user_id,
  public.plan_allowance(s.price_id, s.plan_interval),
  public.plan_allowance(s.price_id, s.plan_interval),
  now(),
  now() + interval '1 month'
from public.subscriptions s
where s.user_id is not null
  and s.provider = 'abacatepay'
  and s.status = 'active'
order by s.user_id, s.current_period_end desc nulls last
on conflict (user_id) do nothing;
