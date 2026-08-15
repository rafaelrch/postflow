-- F6 /admin/saude
--
-- Somente leitura: nenhuma regra altera assinatura, usuário, pagamento ou
-- crédito. A função é chamada uma vez por regra para que falhas sejam isoladas
-- no servidor Next; uma consulta quebrada nunca transforme outro alerta em 0.
--
-- Dependência intencional: a regra unconfirmed_subscription usa
-- subscriptions.payment_confirmed_at, criada pela migration P1
-- 20260815d_access_requires_confirmed_payment.sql. Aplique P1 antes desta.

begin;

create or replace function public.admin_health_check(
  p_check_key text,
  p_now timestamptz default now(),
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  safe_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  case p_check_key
    when 'unconfirmed_subscription' then
      with affected as (
        select s.id, s.user_id, s.email, s.created_at,
          exists (
            select 1 from public.paid_signup_intents i
            where i.subscription_id=s.id and i.consumed_at is not null
          ) as intent_consumed
        from public.subscriptions s
        where s.status in ('active','trialing')
          and s.created_at < p_now - interval '10 minutes'
          and s.payment_confirmed_at is null
          and not exists (
            select 1 from public.payment_transactions t
            where t.provider_subscription_id=s.id and t.confirmed_at is not null
          )
      ), sample as (
        select * from affected order by created_at asc limit safe_limit
      )
      select jsonb_build_object(
        'count',(select count(*) from affected),
        'first_at',(select min(created_at) from affected),
        'last_at',(select max(created_at) from affected),
        'severity',case when exists(select 1 from affected where user_id is not null or intent_consumed) then 'critical' else 'high' end,
        'rows',coalesce((select jsonb_agg(jsonb_build_object(
          'record_key',id,'email',email,'occurred_at',created_at,
          'detail',case when user_id is not null or intent_consumed then 'Acesso ou cadastro já vinculado' else 'Aguardando comprovação' end,
          'link_kind','customers'
        ) order by created_at) from sample),'[]'::jsonb)
      ) into result;

    when 'confirmed_unprocessed' then
      with affected as (
        select e.event_id, e.received_at,
          nullif(e.payload #>> '{payment,subscription}','') as subscription_id
        from public.payment_webhook_events e
        where e.event_type='PAYMENT_CONFIRMED' and e.processed_at is null
      ), sample as (select * from affected order by received_at asc limit safe_limit)
      select jsonb_build_object(
        'count',(select count(*) from affected),'first_at',(select min(received_at) from affected),
        'last_at',(select max(received_at) from affected),'severity','critical',
        'rows',coalesce((select jsonb_agg(jsonb_build_object(
          'record_key',event_id,'occurred_at',received_at,'detail',coalesce(subscription_id,'Assinatura não identificada'),
          'link_kind','finance'
        ) order by received_at) from sample),'[]'::jsonb)
      ) into result;

    when 'stale_webhook' then
      with affected as (
        select e.event_id, e.event_type, e.received_at
        from public.payment_webhook_events e
        where e.processed_at is null and e.received_at < p_now - interval '5 minutes'
      ), sample as (select * from affected order by received_at asc limit safe_limit)
      select jsonb_build_object(
        'count',(select count(*) from affected),'first_at',(select min(received_at) from affected),
        'last_at',(select max(received_at) from affected),'severity','high',
        'rows',coalesce((select jsonb_agg(jsonb_build_object(
          'record_key',event_id,'occurred_at',received_at,'detail',coalesce(event_type,'Evento sem tipo'),
          'link_kind','finance'
        ) order by received_at) from sample),'[]'::jsonb)
      ) into result;

    when 'paid_without_account' then
      with affected as (
        select s.id, s.email, s.created_at
        from public.subscriptions s
        where s.status in ('active','trialing') and s.user_id is null
          and s.created_at < p_now - interval '30 minutes'
          and exists (
            select 1 from public.payment_transactions t
            where t.provider_subscription_id=s.id and t.confirmed_at is not null
              and t.refunded_at is null and t.chargeback_at is null
          )
      ), sample as (select * from affected order by created_at asc limit safe_limit)
      select jsonb_build_object(
        'count',(select count(*) from affected),'first_at',(select min(created_at) from affected),
        'last_at',(select max(created_at) from affected),'severity','high',
        'rows',coalesce((select jsonb_agg(jsonb_build_object(
          'record_key',id,'email',email,'occurred_at',created_at,'detail','Pagamento confirmado há mais de 30 min',
          'link_kind','customers'
        ) order by created_at) from sample),'[]'::jsonb)
      ) into result;

    when 'missing_period_end' then
      with affected as (
        select s.id, s.email, s.created_at
        from public.subscriptions s
        where s.status in ('active','trialing') and s.current_period_end is null
      ), sample as (select * from affected order by created_at asc limit safe_limit)
      select jsonb_build_object(
        'count',(select count(*) from affected),'first_at',(select min(created_at) from affected),
        'last_at',(select max(created_at) from affected),'severity','medium',
        'rows',coalesce((select jsonb_agg(jsonb_build_object(
          'record_key',id,'email',email,'occurred_at',created_at,'detail','Fora da previsão de renovação',
          'link_kind','customers'
        ) order by created_at) from sample),'[]'::jsonb)
      ) into result;

    when 'payment_problem' then
      with affected as (
        select distinct on (record_key) record_key,email,occurred_at,detail
        from (
          select s.id as record_key,s.email,s.updated_at as occurred_at,s.status as detail
          from public.subscriptions s where s.status in ('past_due','unpaid')
          union all
          select t.provider_payment_id,coalesce(s.email,u.email),
            coalesce(t.chargeback_at,t.refunded_at,t.failed_at,t.overdue_at,t.last_event_at),
            case when t.chargeback_at is not null then 'chargeback' when t.refunded_at is not null then 'reembolsado'
              when t.failed_at is not null then 'unpaid' else 'past_due' end
          from public.payment_transactions t
          left join public.subscriptions s on s.id=t.provider_subscription_id
          left join auth.users u on u.id=coalesce(t.user_id,s.user_id)
          where t.refunded_at is not null or t.chargeback_at is not null
        ) issues order by record_key,occurred_at desc
      ), sample as (select * from affected order by occurred_at desc limit safe_limit)
      select jsonb_build_object(
        'count',(select count(*) from affected),'first_at',(select min(occurred_at) from affected),
        'last_at',(select max(occurred_at) from affected),'severity','high',
        'rows',coalesce((select jsonb_agg(jsonb_build_object(
          'record_key',record_key,'email',email,'occurred_at',occurred_at,'detail',detail,'link_kind','finance'
        ) order by occurred_at desc) from sample),'[]'::jsonb)
      ) into result;

    when 'account_without_subscription' then
      with affected as (
        select u.id, u.email, p.created_at
        from public.profiles p join auth.users u on u.id=p.id
        where not exists (
          select 1 from public.subscriptions s
          where s.user_id=u.id and s.status in ('active','trialing')
        )
      ), sample as (select * from affected order by created_at asc limit safe_limit)
      select jsonb_build_object(
        'count',(select count(*) from affected),'first_at',(select min(created_at) from affected),
        'last_at',(select max(created_at) from affected),'severity','high',
        'rows',coalesce((select jsonb_agg(jsonb_build_object(
          'record_key',id,'email',email,'occurred_at',created_at,'detail','Perfil sem assinatura válida',
          'link_kind','customers'
        ) order by created_at) from sample),'[]'::jsonb)
      ) into result;

    when 'onboarding_stale' then
      with affected as (
        select p.id,u.email,p.created_at
        from public.profiles p join auth.users u on u.id=p.id
        where p.onboarding_completed=false and p.created_at < p_now - interval '24 hours'
      ), sample as (select * from affected order by created_at asc limit safe_limit)
      select jsonb_build_object(
        'count',(select count(*) from affected),'first_at',(select min(created_at) from affected),
        'last_at',(select max(created_at) from affected),'severity','medium',
        'rows',coalesce((select jsonb_agg(jsonb_build_object(
          'record_key',id,'email',email,'occurred_at',created_at,'detail','Onboarding incompleto há mais de 24h',
          'link_kind','customers'
        ) order by created_at) from sample),'[]'::jsonb)
      ) into result;

    when 'checkout_abandoned' then
      with affected as (
        select r.checkout_session_id,l.email,r.created_at
        from public.payment_checkout_refs r join public.leads l on l.id=r.lead_id
        where r.created_at < p_now - interval '24 hours'
          and not exists (
            select 1 from public.subscriptions s
            where s.external_reference=r.lead_id::text
          )
          and not exists (
            select 1 from public.payment_transactions t where t.lead_id=r.lead_id
          )
      ), sample as (select * from affected order by created_at asc limit safe_limit)
      select jsonb_build_object(
        'count',(select count(*) from affected),'first_at',(select min(created_at) from affected),
        'last_at',(select max(created_at) from affected),'severity','low',
        'rows',coalesce((select jsonb_agg(jsonb_build_object(
          'record_key',checkout_session_id,'email',email,'occurred_at',created_at,'detail','Checkout sem pagamento após 24h',
          'link_kind','customers'
        ) order by created_at) from sample),'[]'::jsonb)
      ) into result;

    when 'zero_credits' then
      with affected as (
        select c.user_id,u.email,c.updated_at
        from public.user_credits c join auth.users u on u.id=c.user_id
        where c.balance=0
      ), sample as (select * from affected order by updated_at asc limit safe_limit)
      select jsonb_build_object(
        'count',(select count(*) from affected),'first_at',(select min(updated_at) from affected),
        'last_at',(select max(updated_at) from affected),'severity','low',
        'rows',coalesce((select jsonb_agg(jsonb_build_object(
          'record_key',user_id,'email',email,'occurred_at',updated_at,'detail','Saldo atual zerado',
          'link_kind','customers'
        ) order by updated_at) from sample),'[]'::jsonb)
      ) into result;

    else
      raise exception 'unknown_admin_health_check' using errcode='22023';
  end case;

  return coalesce(result,'{}'::jsonb);
end;
$$;

revoke all on function public.admin_health_check(text,timestamptz,integer)
  from public,anon,authenticated;
grant execute on function public.admin_health_check(text,timestamptz,integer)
  to service_role;

commit;
