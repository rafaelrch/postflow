-- 20260812_asaas_migration_rollback.sql
--
-- Rollback de 20260812_asaas_migration.sql. Ordem inversa: funções primeiro
-- (bloco 4), depois o schema novo (bloco 3), depois o que foi removido nos
-- blocos 1 e 2 — na medida em que dá para repor.
--
-- ⚠️ LEIA O LIMITE DESTE ARQUIVO ANTES DE CONFIAR NELE ⚠️
--
-- Ele volta ESTRUTURAS, não DADOS. O estado anterior deste banco era o híbrido
-- AbacatePay: 2 usuários, 1 assinatura, 1 intent, as tabelas abacatepay_* com
-- suas linhas e user_entitlements populada. Nada disso volta daqui. O bloco 5
-- da migração apagou os usuários, e usuário apagado só volta por BACKUP do
-- Supabase — não há como reconstruí-lo a partir de DDL.
--
-- E este arquivo NÃO É um restaurador do AbacatePay. Ele não recria
-- abacatepay_customers, abacatepay_webhook_events nem abacatepay_checkout_refs,
-- e não repõe as funções que falavam com elas. Fazer isso seria escrever um
-- provedor inteiro de memória, e o resultado teria a forma de um rollback sem
-- ser um. Se você precisa do AbacatePay funcionando de novo, o caminho é:
-- restaurar backup, ou reaplicar 20260721 + 20260722 + 20260725 em cima de um
-- banco onde as tabelas existam.
--
-- O QUE ESTE ARQUIVO SERVE PARA: desfazer uma aplicação PARCIAL, feita em
-- ambiente de teste, onde nada de valor foi apagado — tirar do caminho as
-- tabelas e funções novas para poder rodar a migração de novo do zero.
--
-- Também não repõe o plano free (bloco 1). user_entitlements e seus triggers
-- eram uma decisão de produto revertida, não um efeito colateral da troca de
-- provedor: recriá-los aqui reintroduziria um plano que o Rafael tirou.
-- Se um dia o free voltar, o caminho é reaplicar 20260724/26/27/28.


-- ============================================================
-- PARTE A — desfaz o BLOCO 4 (funções)
--
-- As funções do cadastro voltam a citar 'abacatepay' e price_id, ou seja,
-- voltam a depender de um schema que este mesmo arquivo NÃO recria. Elas
-- ficarão quebradas em runtime até alguém repor as tabelas AbacatePay. Isso é
-- consequência honesta de reverter só metade — está aqui declarado, não
-- escondido.
--
-- Se o seu objetivo é só "limpar para rodar a migração de novo", pule a
-- PARTE A inteira: deixar as funções na versão Asaas é mais útil.
-- ============================================================

begin;

-- enforce_paid_signup_precondition volta com o ramo free E o provider antigo
-- (versão de 20260725, a última aplicada antes da migração).
create or replace function public.enforce_paid_signup_precondition()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,auth as $$
begin
  if new.raw_user_meta_data->>'signup_kind' = 'free' then
    return new;
  end if;

  if not exists (
    select 1 from public.subscriptions
    where provider='abacatepay' and status='active' and user_id is null
      and lower(email)=lower(new.email)
  ) then
    raise exception 'paid_subscription_required' using errcode='P0001';
  end if;
  return new;
end; $$;
revoke all on function public.enforce_paid_signup_precondition() from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='supabase_auth_admin') then execute 'grant execute on function public.enforce_paid_signup_precondition() to supabase_auth_admin'; end if; end $$;
drop trigger if exists enforce_paid_signup_precondition_trg on auth.users;
create trigger enforce_paid_signup_precondition_trg before insert on auth.users for each row execute function public.enforce_paid_signup_precondition();

-- protect_subscription_claim volta para provider='abacatepay'.
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
revoke all on function public.protect_subscription_claim() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.protect_subscription_claim() to service_role';
  end if;
end $$;
drop trigger if exists protect_subscription_claim_trg on public.subscriptions;
create trigger protect_subscription_claim_trg before update of user_id
  on public.subscriptions for each row execute function public.protect_subscription_claim();

-- claim_paid_signup_for_user volta à definição final de 20260721.
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

-- claim_verified_paid_signup volta à definição de 20260721.
create or replace function public.claim_verified_paid_signup() returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid uuid:=auth.uid(); v_email text; v_intent public.paid_signup_intents%rowtype; v_sub public.subscriptions%rowtype; v_allowance int;
begin
 if v_uid is null then raise exception 'signup_session_required' using errcode='P0001'; end if;
 select email into v_email from auth.users where id=v_uid and email_confirmed_at is not null for update;
 if v_email is null then raise exception 'email_confirmation_required' using errcode='P0001'; end if;
 select * into v_intent from public.paid_signup_intents where user_id=v_uid and consumed_at is null and expires_at>now() for update;
 if not found then if exists(select 1 from public.subscriptions where user_id=v_uid and provider='abacatepay') then return jsonb_build_object('ok',true); end if; raise exception 'signup_intent_invalid_or_expired' using errcode='P0001'; end if;
 select * into v_sub from public.subscriptions where id=v_intent.subscription_id and provider='abacatepay' and status='active' and user_id is null and lower(email)=lower(v_email) for update;
 if not found then raise exception 'subscription_claim_unavailable' using errcode='P0001'; end if;
 update public.subscriptions set user_id=v_uid where id=v_sub.id and user_id is null;
 update public.paid_signup_intents set consumed_at=now(),consumed_by=v_uid where id=v_intent.id and consumed_at is null;
 insert into public.profiles(id,name,handle,phone) values(v_uid,'','','') on conflict(id) do nothing;
 v_allowance:=public.plan_allowance(v_sub.price_id,v_sub.plan_interval);
 insert into public.user_credits(user_id,balance,monthly_allowance,period_start,period_end) values(v_uid,v_allowance,v_allowance,now(),now()+interval '1 month') on conflict(user_id) do nothing;
 if v_sub.abacatepay_customer_id is not null then insert into public.abacatepay_customers(user_id,abacatepay_customer_id) values(v_uid,v_sub.abacatepay_customer_id) on conflict(user_id) do update set abacatepay_customer_id=excluded.abacatepay_customer_id; end if;
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.claim_verified_paid_signup() from public,anon,authenticated;
grant execute on function public.claim_verified_paid_signup() to authenticated;

-- refresh_credits volta a validar contra provider/price_id.
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

-- plan_allowance de 2 argumentos volta a ter corpo próprio ANTES de a versão
-- de 1 argumento sumir — senão o wrapper ficaria apontando para função
-- inexistente entre um comando e outro.
create or replace function public.plan_allowance(p_price_id text, p_interval text)
returns int language sql immutable set search_path = pg_catalog, public as $$
  select case when p_interval = 'year' then 300 else 200 end;
$$;
revoke all on function public.plan_allowance(text, text) from public, anon, authenticated;

drop function if exists public.plan_allowance(text);

-- handle_new_user, enforce_paid_signup e claim_paid_signup NÃO são recriadas:
-- estavam órfãs (sem trigger) desde 20260721 e recriá-las só devolveria código
-- morto ao banco.

commit;


-- ============================================================
-- PARTE B — desfaz o BLOCO 3 (schema novo)
--
-- Mesma dança da FK, na ordem inversa: soltar a constraint, esvaziar os
-- intents, dropar subscriptions. Aqui a tabela NÃO é recriada — não existe
-- "subscriptions anterior" para repor sem reaplicar 20260721.
-- ============================================================

begin;

drop view if exists public.user_active_subscription;

alter table public.paid_signup_intents
  drop constraint if exists paid_signup_intents_subscription_id_fkey;

-- Os intents referenciam assinaturas que somem logo abaixo.
delete from public.paid_signup_intents;

drop trigger if exists protect_subscription_claim_trg on public.subscriptions;
drop trigger if exists set_subscriptions_updated on public.subscriptions;
drop trigger if exists set_payment_customers_updated on public.payment_customers;

drop policy if exists subscriptions_select_own on public.subscriptions;
drop policy if exists payment_customers_select_own on public.payment_customers;

drop index if exists public.idx_payment_webhook_events_pending;
drop index if exists public.idx_payment_webhook_events_type;
drop index if exists public.idx_subscriptions_external_reference;
drop index if exists public.idx_subscriptions_email;
drop index if exists public.idx_subscriptions_customer;
drop index if exists public.idx_subscriptions_user;

drop table if exists public.payment_webhook_events;
drop table if exists public.payment_customers;
drop table if exists public.subscriptions;

commit;


-- ============================================================
-- PARTE C — blocos 1, 2 e 5: o que NÃO volta
--
-- Nada a executar aqui. Está escrito para você não procurar.
--
--   • BLOCO 5 (usuários apagados): irreversível. Só backup.
--   • BLOCO 2 (tabelas abacatepay_* / stripe_*): não recriadas — ver o
--     cabeçalho. Se precisar delas, reaplique 20260721.
--   • BLOCO 1 (plano free): não recriado — foi decisão de produto revertida,
--     não efeito colateral. Se o free voltar, reaplique 20260724/26/27/28.
--
-- Depois da PARTE B o banco fica SEM tabela subscriptions. O cadastro não
-- funciona nesse estado, por desenho: é um ponto de parada para reaplicar uma
-- migração do zero, não um estado de produção.
-- ============================================================
