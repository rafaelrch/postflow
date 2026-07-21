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

-- Passwordless B2: auth.users insertion is deliberately side-effect free.
drop trigger if exists enforce_paid_signup_trg on auth.users;
drop trigger if exists claim_paid_signup_trg on auth.users;
drop trigger if exists on_auth_user_created on auth.users;

create table if not exists public.paid_signup_intents (
  id uuid primary key default gen_random_uuid(),
  subscription_id text not null references public.subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index if not exists paid_signup_intents_open_subscription
  on public.paid_signup_intents(subscription_id) where consumed_at is null;
create unique index if not exists paid_signup_intents_open_user
  on public.paid_signup_intents(user_id) where consumed_at is null;
alter table public.paid_signup_intents enable row level security;
revoke all on public.paid_signup_intents from public, anon, authenticated;

drop function if exists public.prepare_paid_signup_intent(text,text);
create or replace function public.prepare_paid_signup_intent(p_subscription_id text, p_email text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid uuid; v_id uuid;
begin
 select id into v_uid from auth.users where lower(email)=lower(p_email)
   and (email_confirmed_at is not null or raw_app_meta_data->>'origin'='paid_passwordless') limit 1;
 if v_uid is null then raise exception 'signup_user_not_eligible' using errcode='P0001'; end if;
 update public.paid_signup_intents set consumed_at=now() where subscription_id=p_subscription_id and user_id=v_uid and consumed_at is null and expires_at<=now();
 select id into v_id from public.paid_signup_intents where subscription_id=p_subscription_id and consumed_at is null for update;
 if v_id is not null then
   if not exists (select 1 from public.paid_signup_intents where id=v_id and user_id=v_uid) then raise exception 'signup_intent_conflict' using errcode='P0001'; end if;
   update public.paid_signup_intents set expires_at=now()+interval '15 minutes' where id=v_id;
   return jsonb_build_object('state','pending');
 end if;
 insert into public.paid_signup_intents(subscription_id,user_id,expires_at)
 values(p_subscription_id,v_uid,now()+interval '15 minutes')
 returning id into v_id;
 return jsonb_build_object('state','pending');
end; $$;
revoke all on function public.prepare_paid_signup_intent(text,text) from public,anon,authenticated;
grant execute on function public.prepare_paid_signup_intent(text,text) to service_role;

create or replace function public.claim_verified_paid_signup()
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare v_uid uuid := auth.uid(); v_email text; v_intent public.paid_signup_intents%rowtype;
declare v_sub public.subscriptions%rowtype; v_allowance int;
begin
  if v_uid is null then raise exception 'signup_session_required' using errcode='P0001'; end if;
  select email into v_email from auth.users where id=v_uid and email_confirmed_at is not null for update;
  if v_email is null then raise exception 'email_confirmation_required' using errcode='P0001'; end if;
  select * into v_intent from public.paid_signup_intents
   where user_id=v_uid and consumed_at is null and expires_at > now() for update;
  if not found then
    if exists (select 1 from public.subscriptions where user_id=v_uid and provider='abacatepay') then return jsonb_build_object('ok',true); end if;
    raise exception 'signup_intent_invalid_or_expired' using errcode='P0001';
  end if;
  select * into v_sub from public.subscriptions where id=v_intent.subscription_id
    and provider='abacatepay' and status='active' and user_id is null and lower(email)=lower(v_email) for update;
  if not found then raise exception 'subscription_claim_unavailable' using errcode='P0001'; end if;
  update public.subscriptions set user_id=v_uid where id=v_sub.id and user_id is null;
  update public.paid_signup_intents set consumed_at=now(), consumed_by=v_uid where id=v_intent.id and consumed_at is null;
  update public.abacatepay_checkout_refs set consumed_at=now() where checkout_id=v_sub.id and consumed_at is null;
  insert into public.profiles(id,name,handle,phone) values(v_uid,'','','') on conflict(id) do nothing;
  v_allowance := public.plan_allowance(v_sub.price_id,v_sub.plan_interval);
  insert into public.user_credits(user_id,balance,monthly_allowance,period_start,period_end)
    values(v_uid,v_allowance,v_allowance,now(),now()+interval '1 month') on conflict(user_id) do nothing;
  if v_sub.abacatepay_customer_id is not null then
    insert into public.abacatepay_customers(user_id,abacatepay_customer_id) values(v_uid,v_sub.abacatepay_customer_id)
      on conflict(user_id) do update set abacatepay_customer_id=excluded.abacatepay_customer_id;
  end if;
  return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.claim_verified_paid_signup() from public, anon, authenticated;
grant execute on function public.claim_verified_paid_signup() to authenticated;

create table if not exists public.passwordless_rate_limits (
  ip_hash text not null, ref_hash text not null, window_start timestamptz not null,
  count int not null default 0, primary key(ip_hash,ref_hash,window_start)
);
create table if not exists public.passwordless_ref_rate_limits (
  ref_hash text not null, window_start timestamptz not null, count int not null default 0,
  primary key(ref_hash, window_start)
);
alter table public.passwordless_rate_limits enable row level security;
alter table public.passwordless_ref_rate_limits enable row level security;
revoke all on public.passwordless_rate_limits from public,anon,authenticated;
revoke all on public.passwordless_ref_rate_limits from public,anon,authenticated;
create or replace function public.consume_passwordless_rate(p_ip_hash text,p_ref_hash text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_start timestamptz:=date_trunc('minute',now()); v_count int;
begin
 insert into public.passwordless_rate_limits(ip_hash,ref_hash,window_start,count) values(p_ip_hash,p_ref_hash,v_start,1)
 on conflict(ip_hash,ref_hash,window_start) do update set count=passwordless_rate_limits.count+1 returning count into v_count;
 insert into public.passwordless_ref_rate_limits(ref_hash,window_start,count) values(p_ref_hash,v_start,1)
 on conflict(ref_hash,window_start) do update set count=passwordless_ref_rate_limits.count+1;
 return v_count <= 5 and (select count from public.passwordless_ref_rate_limits where ref_hash=p_ref_hash and window_start=v_start) <= 10;
end; $$;
revoke all on function public.consume_passwordless_rate(text,text) from public,anon,authenticated;
grant execute on function public.consume_passwordless_rate(text,text) to service_role;

create or replace function public.claim_on_email_confirmation() returns trigger language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_intent public.paid_signup_intents%rowtype; v_sub public.subscriptions%rowtype; v_allowance int;
begin
 select * into v_intent from public.paid_signup_intents where user_id=new.id and consumed_at is null and expires_at>now() order by created_at desc for update;
 if not found then raise exception 'signup_intent_required' using errcode='P0001'; end if;
 select * into v_sub from public.subscriptions where id=v_intent.subscription_id and provider='abacatepay' and status='active' and user_id is null and lower(email)=lower(new.email) for update;
 if not found then raise exception 'subscription_claim_unavailable' using errcode='P0001'; end if;
 update public.subscriptions set user_id=new.id where id=v_sub.id and user_id is null;
 update public.paid_signup_intents set consumed_at=now(),consumed_by=new.id where id=v_intent.id and consumed_at is null;
 update public.abacatepay_checkout_refs set consumed_at=now() where checkout_id=v_sub.id and consumed_at is null;
 insert into public.profiles(id,name,handle,phone) values(new.id,'','','') on conflict(id) do nothing;
 v_allowance:=public.plan_allowance(v_sub.price_id,v_sub.plan_interval);
 insert into public.user_credits(user_id,balance,monthly_allowance,period_start,period_end) values(new.id,v_allowance,v_allowance,now(),now()+interval '1 month') on conflict(user_id) do nothing;
 return new;
end; $$;
revoke all on function public.claim_on_email_confirmation() from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='supabase_auth_admin') then execute 'grant execute on function public.claim_on_email_confirmation() to supabase_auth_admin'; end if; end $$;
drop trigger if exists claim_on_email_confirmation_trg on auth.users;
create trigger claim_on_email_confirmation_trg after update of email_confirmed_at on auth.users
for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null) execute function public.claim_on_email_confirmation();

-- Single atomic implementation used by both confirmed-user preparation and the
-- auth confirmation trigger. It never trusts client-supplied email/provider.
create or replace function public.claim_paid_signup_for_user(p_uid uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_email text; v_name text; v_phone text; v_intent public.paid_signup_intents%rowtype; v_sub public.subscriptions%rowtype; v_allowance int;
begin
 select email into v_email from auth.users where id=p_uid and email_confirmed_at is not null for update;
 if v_email is null then raise exception 'email_confirmation_required' using errcode='P0001'; end if;
 select * into v_intent from public.paid_signup_intents where user_id=p_uid and consumed_at is null and expires_at>now() order by created_at asc,id asc limit 1 for update;
 if not found then if exists(select 1 from public.subscriptions where user_id=p_uid and provider='abacatepay') then return true; end if; raise exception 'signup_intent_required' using errcode='P0001'; end if;
 select * into v_sub from public.subscriptions where id=v_intent.subscription_id and provider='abacatepay' and status='active' and user_id is null and lower(email)=lower(v_email) for update;
 if not found then raise exception 'subscription_claim_unavailable' using errcode='P0001'; end if;
 update public.subscriptions set user_id=p_uid where id=v_sub.id and user_id is null;
 update public.paid_signup_intents set consumed_at=now(),consumed_by=p_uid where id=v_intent.id and consumed_at is null;
 update public.abacatepay_checkout_refs set consumed_at=now() where checkout_id=v_sub.id and consumed_at is null;
 begin select name,phone into v_name,v_phone from public.leads where lower(email)=lower(v_email) order by created_at desc limit 1; exception when undefined_table then v_name:=null; v_phone:=null; end;
 insert into public.profiles(id,name,handle,phone) values(p_uid,coalesce(v_name,''),'',coalesce(v_phone,'')) on conflict(id) do nothing;
 v_allowance:=public.plan_allowance(v_sub.price_id,v_sub.plan_interval);
 insert into public.user_credits(user_id,balance,monthly_allowance,period_start,period_end) values(p_uid,v_allowance,v_allowance,now(),now()+interval '1 month') on conflict(user_id) do nothing;
 if v_sub.abacatepay_customer_id is not null then insert into public.abacatepay_customers(user_id,abacatepay_customer_id) values(p_uid,v_sub.abacatepay_customer_id) on conflict(user_id) do update set abacatepay_customer_id=excluded.abacatepay_customer_id; end if;
 return true;
end; $$;
revoke all on function public.claim_paid_signup_for_user(uuid) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='supabase_auth_admin') then execute 'grant execute on function public.claim_paid_signup_for_user(uuid) to supabase_auth_admin'; end if; end $$;

drop function if exists public.prepare_paid_signup_intent(text,text);
create or replace function public.prepare_paid_signup_intent(p_subscription_id text,p_email text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid uuid; v_id uuid; v_confirmed timestamptz;
begin
 select id,email_confirmed_at into v_uid,v_confirmed from auth.users where lower(email)=lower(p_email) and raw_app_meta_data->>'origin'='paid_passwordless' order by id limit 1;
 if v_uid is null then raise exception 'signup_user_not_eligible' using errcode='P0001'; end if;
 update public.paid_signup_intents set consumed_at=now() where consumed_at is null and (user_id=v_uid or subscription_id=p_subscription_id) and expires_at<=now();
 select id into v_id from public.paid_signup_intents where subscription_id=p_subscription_id and consumed_at is null and expires_at>now() for update;
 if v_id is not null and not exists(select 1 from public.paid_signup_intents where id=v_id and user_id=v_uid) then raise exception 'signup_intent_conflict' using errcode='P0001'; end if;
 if v_id is null then insert into public.paid_signup_intents(subscription_id,user_id,expires_at) values(p_subscription_id,v_uid,now()+interval '15 minutes') returning id into v_id; else update public.paid_signup_intents set expires_at=now()+interval '15 minutes' where id=v_id; end if;
 if v_confirmed is not null then perform public.claim_paid_signup_for_user(v_uid); return jsonb_build_object('state','claimed'); end if;
 return jsonb_build_object('state','pending');
end; $$;
revoke all on function public.prepare_paid_signup_intent(text,text) from public,anon,authenticated;
grant execute on function public.prepare_paid_signup_intent(text,text) to service_role;

create or replace function public.claim_on_email_confirmation() returns trigger language plpgsql security definer set search_path=pg_catalog,public,auth as $$ begin if coalesce(new.raw_app_meta_data->>'origin','') <> 'paid_passwordless' then return new; end if; perform public.claim_paid_signup_for_user(new.id); return new; end; $$;
revoke all on function public.claim_on_email_confirmation() from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='supabase_auth_admin') then execute 'grant execute on function public.claim_on_email_confirmation() to supabase_auth_admin'; end if; end $$;
