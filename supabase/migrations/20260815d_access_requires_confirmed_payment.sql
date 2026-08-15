-- P1: novas assinaturas só liberam cadastro após PAYMENT_CONFIRMED.
--
-- COMPATIBILIDADE / NÃO REVOGAÇÃO
-- O primeiro DEFAULT false é materializado logicamente nas linhas existentes;
-- mudar o DEFAULT para true em seguida afeta somente INSERTs futuros. Não há
-- UPDATE nem backfill: todo cliente que já tinha acesso continua grandfathered
-- e intocado. Em linhas novas, payment_confirmed_at é a prova monotônica que o
-- webhook grava exclusivamente para PAYMENT_CONFIRMED.
--
-- DEPLOY SEM JANELA INVERSA
-- A migration pode entrar antes do código: o trigger abaixo usa o evento bruto,
-- que a rota persiste ANTES do upsert da assinatura, para reconhecer exatamente
-- PAYMENT_CONFIRMED. Assim, até o webhook anterior materializa a prova e nenhum
-- pagante fica preso entre migration e deploy. O código novo grava o mesmo campo
-- diretamente; o trigger é a defesa de compatibilidade e nunca infere pagamento
-- de status active ou provider_payment_id.

begin;

alter table public.subscriptions
  add column if not exists payment_confirmation_required boolean not null default false,
  add column if not exists payment_confirmed_at timestamptz;

-- Só novos INSERTs passam a exigir prova. Linhas existentes permanecem false.
alter table public.subscriptions
  alter column payment_confirmation_required set default true;

comment on column public.subscriptions.payment_confirmation_required is
  'false = assinatura anterior ao corte, preservada sem revogação; true = exige PAYMENT_CONFIRMED';
comment on column public.subscriptions.payment_confirmed_at is
  'instante do PAYMENT_CONFIRMED; provider_payment_id e status active não são prova de pagamento';

create or replace function public.capture_confirmed_payment_from_webhook()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.payment_confirmation_required
     and new.payment_confirmed_at is null
     and exists (
       select 1 from public.payment_webhook_events e
       where e.event_type='PAYMENT_CONFIRMED'
         and e.payload #>> '{payment,subscription}'=new.id
     ) then
    new.payment_confirmed_at:=now();
  end if;
  return new;
end; $$;
revoke all on function public.capture_confirmed_payment_from_webhook() from public,anon,authenticated;
drop trigger if exists capture_confirmed_payment_from_webhook_trg on public.subscriptions;
create trigger capture_confirmed_payment_from_webhook_trg
  before insert or update on public.subscriptions for each row
  execute function public.capture_confirmed_payment_from_webhook();

-- Defesa antes mesmo do INSERT em auth.users. O status ACTIVE de uma assinatura
-- do Asaas não basta: SUBSCRIPTION_CREATED pode trazê-lo antes de qualquer
-- cobrança confirmada.
create or replace function public.enforce_paid_signup_precondition()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,auth as $$
begin
  if not exists (
    select 1 from public.subscriptions
    where payment_provider='asaas' and status='active' and user_id is null
      and lower(email)=lower(new.email)
      and (payment_confirmation_required=false or payment_confirmed_at is not null)
  ) then
    raise exception 'paid_subscription_required' using errcode='P0001';
  end if;
  return new;
end; $$;
revoke all on function public.enforce_paid_signup_precondition() from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='supabase_auth_admin') then execute 'grant execute on function public.enforce_paid_signup_precondition() to supabase_auth_admin'; end if; end $$;

-- Última barreira antes de criar/renovar o intent. Mesmo que a rota seja
-- alterada no futuro, uma assinatura nova sem confirmação não produz intent.
create or replace function public.prepare_paid_signup_intent(p_subscription_id text, p_email text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid uuid; v_id uuid; v_confirmed timestamptz;
begin
  if not exists (
    select 1 from public.subscriptions
    where id=p_subscription_id and payment_provider='asaas' and status='active'
      and user_id is null and lower(email)=lower(p_email)
      and (payment_confirmation_required=false or payment_confirmed_at is not null)
  ) then
    raise exception 'subscription_claim_unavailable' using errcode='P0001';
  end if;
  select id,email_confirmed_at into v_uid,v_confirmed from auth.users
   where lower(email)=lower(p_email)
     and raw_app_meta_data->>'origin'='paid_passwordless'
   order by id limit 1;
  if v_uid is null then raise exception 'signup_user_not_eligible' using errcode='P0001'; end if;
  update public.paid_signup_intents set consumed_at=now()
   where consumed_at is null and (user_id=v_uid or subscription_id=p_subscription_id) and expires_at<=now();
  select id into v_id from public.paid_signup_intents
   where subscription_id=p_subscription_id and consumed_at is null and expires_at>now() for update;
  if v_id is not null and not exists(select 1 from public.paid_signup_intents where id=v_id and user_id=v_uid) then raise exception 'signup_intent_conflict' using errcode='P0001'; end if;
  if v_id is null then
    insert into public.paid_signup_intents(subscription_id,user_id,expires_at) values(p_subscription_id,v_uid,now()+interval '15 minutes') returning id into v_id;
  else
    update public.paid_signup_intents set expires_at=now()+interval '15 minutes' where id=v_id;
  end if;
  if v_confirmed is not null then perform public.claim_paid_signup_for_user(v_uid); return jsonb_build_object('state','claimed'); end if;
  return jsonb_build_object('state','pending');
end; $$;
revoke all on function public.prepare_paid_signup_intent(text,text) from public,anon,authenticated;
grant execute on function public.prepare_paid_signup_intent(text,text) to service_role;

create or replace function public.claim_paid_signup_for_user(p_uid uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_email text; v_name text; v_phone text; v_intent public.paid_signup_intents%rowtype; v_sub public.subscriptions%rowtype; v_allowance int;
begin
  select email into v_email from auth.users where id=p_uid and email_confirmed_at is not null for update;
  if v_email is null then raise exception 'email_confirmation_required' using errcode='P0001'; end if;
  select * into v_intent from public.paid_signup_intents where user_id=p_uid and consumed_at is null and expires_at>now() order by created_at asc,id asc limit 1 for update;
  if not found then if exists(select 1 from public.subscriptions where user_id=p_uid and payment_provider='asaas') then return true; end if; raise exception 'signup_intent_required' using errcode='P0001'; end if;
  select * into v_sub from public.subscriptions where id=v_intent.subscription_id and payment_provider='asaas' and status='active' and user_id is null and lower(email)=lower(v_email) and (payment_confirmation_required=false or payment_confirmed_at is not null) for update;
  if not found then raise exception 'subscription_claim_unavailable' using errcode='P0001'; end if;
  update public.subscriptions set user_id=p_uid where id=v_sub.id and user_id is null;
  update public.paid_signup_intents set consumed_at=now(),consumed_by=p_uid where id=v_intent.id and consumed_at is null;
  begin select name,phone into v_name,v_phone from public.leads where lower(email)=lower(v_email) order by created_at desc limit 1; exception when undefined_table then v_name:=null; v_phone:=null; end;
  insert into public.profiles(id,name,handle,phone) values(p_uid,coalesce(v_name,''),'',coalesce(v_phone,'')) on conflict(id) do nothing;
  v_allowance:=public.plan_allowance(v_sub.plan_interval);
  insert into public.user_credits(user_id,balance,monthly_allowance,period_start,period_end) values(p_uid,v_allowance,v_allowance,now(),now()+interval '1 month') on conflict(user_id) do nothing;
  if v_sub.provider_customer_id is not null then insert into public.payment_customers(user_id,provider_customer_id) values(p_uid,v_sub.provider_customer_id) on conflict(user_id) do update set provider_customer_id=excluded.provider_customer_id; end if;
  return true;
end; $$;
revoke all on function public.claim_paid_signup_for_user(uuid) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='supabase_auth_admin') then execute 'grant execute on function public.claim_paid_signup_for_user(uuid) to supabase_auth_admin'; end if; end $$;

create or replace function public.claim_verified_paid_signup() returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid uuid:=auth.uid(); v_email text; v_intent public.paid_signup_intents%rowtype; v_sub public.subscriptions%rowtype; v_allowance int;
begin
 if v_uid is null then raise exception 'signup_session_required' using errcode='P0001'; end if;
 select email into v_email from auth.users where id=v_uid and email_confirmed_at is not null for update;
 if v_email is null then raise exception 'email_confirmation_required' using errcode='P0001'; end if;
 select * into v_intent from public.paid_signup_intents where user_id=v_uid and consumed_at is null and expires_at>now() for update;
 if not found then if exists(select 1 from public.subscriptions where user_id=v_uid and payment_provider='asaas') then return jsonb_build_object('ok',true); end if; raise exception 'signup_intent_invalid_or_expired' using errcode='P0001'; end if;
 select * into v_sub from public.subscriptions where id=v_intent.subscription_id and payment_provider='asaas' and status='active' and user_id is null and lower(email)=lower(v_email) and (payment_confirmation_required=false or payment_confirmed_at is not null) for update;
 if not found then raise exception 'subscription_claim_unavailable' using errcode='P0001'; end if;
 update public.subscriptions set user_id=v_uid where id=v_sub.id and user_id is null;
 update public.paid_signup_intents set consumed_at=now(),consumed_by=v_uid where id=v_intent.id and consumed_at is null;
 insert into public.profiles(id,name,handle,phone) values(v_uid,'','','') on conflict(id) do nothing;
 v_allowance:=public.plan_allowance(v_sub.plan_interval);
 insert into public.user_credits(user_id,balance,monthly_allowance,period_start,period_end) values(v_uid,v_allowance,v_allowance,now(),now()+interval '1 month') on conflict(user_id) do nothing;
 if v_sub.provider_customer_id is not null then insert into public.payment_customers(user_id,provider_customer_id) values(v_uid,v_sub.provider_customer_id) on conflict(user_id) do update set provider_customer_id=excluded.provider_customer_id; end if;
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.claim_verified_paid_signup() from public,anon,authenticated;
grant execute on function public.claim_verified_paid_signup() to authenticated;

commit;
