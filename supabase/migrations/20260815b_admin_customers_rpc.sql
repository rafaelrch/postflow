-- F2 /admin/clientes
--
-- A lista precisa cruzar auth.users com dados públicos sem baixar o Auth para
-- o Node. Esta função faz busca, filtros, ordenação, contagem e paginação no
-- Postgres. Ela é SECURITY DEFINER porque auth.users não é exposta ao Data API,
-- mas só service_role pode executá-la — e o app cria esse client apenas depois
-- de requireAdminPage(). Nenhuma tabela/view nova é exposta.

create schema if not exists extensions;
-- pg_trgm e uma extensao pre-configurada no Supabase e pode ser habilitada
-- pelo papel postgres usado no SQL Editor. Ela so atende os indices das
-- tabelas public abaixo; nao tentamos alterar objetos gerenciados pelo Auth.
create extension if not exists pg_trgm with schema extensions;

-- auth.users pertence a supabase_auth_admin nos projetos hospedados. Nem o
-- papel postgres do SQL Editor deve criar indices nela. Por isso a busca por
-- fragmento de e-mail das contas faz sequential scan em auth.users. Isso e
-- aceitavel no volume atual; a partir de aproximadamente 10 mil contas,
-- acompanhe com EXPLAIN (ANALYZE, BUFFERS). Se ficar lento, espelhe id/e-mail
-- normalizado em uma tabela public mantida por trigger/backfill e crie o GIN
-- trgm nessa copia. Nao tente indexar diretamente a tabela gerenciada do Auth.

create index if not exists idx_profiles_admin_name_trgm
  on public.profiles using gin (lower(name) extensions.gin_trgm_ops);

create index if not exists idx_leads_admin_name_trgm
  on public.leads using gin (lower(name) extensions.gin_trgm_ops);

create index if not exists idx_subscriptions_admin_email_trgm
  on public.subscriptions using gin (lower(email) extensions.gin_trgm_ops);

create index if not exists idx_subscriptions_admin_user_recent
  on public.subscriptions (user_id, updated_at desc, id)
  where user_id is not null;

create index if not exists idx_subscriptions_admin_orphan_recent
  on public.subscriptions (updated_at desc, id)
  where user_id is null;

-- O SQL Editor hospedado executa como postgres, e SECURITY DEFINER conserva
-- os privilegios do criador. Falhamos durante a migration (nao em runtime) se
-- esse papel algum dia deixar de poder consultar auth.users.
do $$
begin
  if not has_table_privilege(current_user, 'auth.users', 'select') then
    raise exception
      'admin_list_customers requer SELECT em auth.users para o owner %',
      current_user;
  end if;
end
$$;

create or replace function public.admin_list_customers(
  p_search text default null,
  p_filters text[] default '{}'::text[],
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with
  params as (
    select
      nullif(lower(btrim(p_search)), '') as search_term,
      replace(
        replace(replace(nullif(lower(btrim(p_search)), ''), E'\\', E'\\\\'), '%', E'\\%'),
        '_', E'\\_'
      ) as search_pattern,
      coalesce(p_filters, '{}'::text[]) as filters,
      greatest(coalesce(p_page, 1), 1) as page_number,
      least(greatest(coalesce(p_page_size, 25), 1), 100) as page_size,
      (greatest(coalesce(p_page, 1), 1) - 1)
        * least(greatest(coalesce(p_page_size, 25), 1), 100) as row_offset
  ),
  content_events as (
    select c.user_id, 'carousel'::text as kind, c.created_at
    from public.carousels c
    union all
    select n.user_id, 'news'::text as kind, n.created_at
    from public.news_entries n
    union all
    select s.user_id, 'scheduled'::text as kind, s.created_at
    from public.scheduled_posts s
  ),
  content_by_user as (
    select
      ce.user_id,
      count(*) filter (where ce.kind = 'carousel')::bigint as carousel_count,
      count(*) filter (where ce.kind = 'news')::bigint as news_count,
      count(*) filter (where ce.kind = 'scheduled')::bigint as scheduled_count,
      min(ce.created_at) as first_content_at
    from content_events ce
    group by ce.user_id
  ),
  checkout_by_lead as (
    select r.lead_id, min(r.created_at) as checkout_created_at
    from public.payment_checkout_refs r
    group by r.lead_id
  ),
  account_rows as (
    select
      'account:' || u.id::text as customer_key,
      u.id as user_id,
      sub.id as subscription_id,
      coalesce(nullif(btrim(p.name), ''), 'Sem nome') as name,
      coalesce(u.email, sub.email, '')::text as email,
      u.created_at as account_created_at,
      u.email_confirmed_at,
      p.onboarding_completed,
      sub.plan_interval,
      sub.status as subscription_status,
      sub.value as subscription_value,
      coalesce(sub.current_period_end, sub.next_due_date::timestamp at time zone 'America/Sao_Paulo') as access_until,
      coalesce(sub.cancel_at_period_end, false) as cancel_at_period_end,
      credits.balance as credit_balance,
      credits.monthly_allowance as credit_limit,
      coalesce(content.carousel_count, 0)::bigint as carousel_count,
      coalesce(content.news_count, 0)::bigint as news_count,
      coalesce(content.scheduled_count, 0)::bigint as scheduled_count,
      lead.created_at as lead_created_at,
      checkout.checkout_created_at,
      sub.created_at as subscription_created_at,
      case when p.onboarding_completed then p.updated_at else null end as onboarding_at,
      content.first_content_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join lateral (
      select s.*
      from public.subscriptions s
      where s.user_id = u.id
      order by
        case s.status
          when 'active' then 0
          when 'trialing' then 1
          when 'past_due' then 2
          when 'unpaid' then 3
          else 4
        end,
        s.updated_at desc,
        s.id asc
      limit 1
    ) sub on true
    left join public.user_credits credits on credits.user_id = u.id
    left join content_by_user content on content.user_id = u.id
    left join public.leads lead on lead.id::text = sub.external_reference
    left join checkout_by_lead checkout on checkout.lead_id = lead.id
    where u.deleted_at is null
  ),
  orphan_rows as (
    select
      'subscription:' || sub.id as customer_key,
      null::uuid as user_id,
      sub.id as subscription_id,
      coalesce(nullif(btrim(lead.name), ''), 'Sem nome') as name,
      coalesce(sub.email, lead.email, '')::text as email,
      null::timestamptz as account_created_at,
      null::timestamptz as email_confirmed_at,
      null::boolean as onboarding_completed,
      sub.plan_interval,
      sub.status as subscription_status,
      sub.value as subscription_value,
      coalesce(sub.current_period_end, sub.next_due_date::timestamp at time zone 'America/Sao_Paulo') as access_until,
      sub.cancel_at_period_end,
      null::integer as credit_balance,
      null::integer as credit_limit,
      0::bigint as carousel_count,
      0::bigint as news_count,
      0::bigint as scheduled_count,
      lead.created_at as lead_created_at,
      checkout.checkout_created_at,
      sub.created_at as subscription_created_at,
      null::timestamptz as onboarding_at,
      null::timestamptz as first_content_at
    from public.subscriptions sub
    left join public.leads lead on lead.id::text = sub.external_reference
    left join checkout_by_lead checkout on checkout.lead_id = lead.id
    where sub.user_id is null
  ),
  all_customers as (
    select * from account_rows
    union all
    select * from orphan_rows
  ),
  filtered as (
    select c.*
    from all_customers c
    cross join params p
    where
      (
        p.search_term is null
        or lower(c.email) like '%' || p.search_pattern || '%' escape E'\\'
        or lower(c.name) like '%' || p.search_pattern || '%' escape E'\\'
      )
      and (not ('month' = any(p.filters)) or c.plan_interval = 'month')
      and (not ('year' = any(p.filters)) or c.plan_interval = 'year')
      and (not ('active' = any(p.filters)) or c.subscription_status in ('active', 'trialing'))
      and (not ('past_due' = any(p.filters)) or c.subscription_status = 'past_due')
      and (not ('unpaid' = any(p.filters)) or c.subscription_status = 'unpaid')
      and (not ('canceled' = any(p.filters)) or c.subscription_status = 'canceled')
      and (not ('cancellation_scheduled' = any(p.filters)) or c.cancel_at_period_end)
      and (
        not ('onboarding_incomplete' = any(p.filters))
        or (c.user_id is not null and coalesce(c.onboarding_completed, false) = false)
      )
      and (
        not ('no_content' = any(p.filters))
        or c.carousel_count + c.news_count + c.scheduled_count = 0
      )
      and (not ('zero_credits' = any(p.filters)) or c.credit_balance = 0)
      and (
        not ('paid_without_account' = any(p.filters))
        or (c.user_id is null and c.subscription_id is not null)
      )
  ),
  paged as (
    select f.*
    from filtered f
    order by
      coalesce(f.subscription_created_at, f.account_created_at) desc nulls last,
      f.customer_key asc
    limit (select page_size from params)
    offset (select row_offset from params)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce(
      (
        select jsonb_agg(
          to_jsonb(row_data)
          order by coalesce(row_data.subscription_created_at, row_data.account_created_at) desc nulls last,
                   row_data.customer_key asc
        )
        from paged row_data
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.admin_list_customers(text, text[], integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_list_customers(text, text[], integer, integer)
  to service_role;

comment on function public.admin_list_customers(text, text[], integer, integer) is
  'Server-only: lista metadados de clientes com busca, filtros e paginacao no Postgres. Nunca retorna conteudo privado.';
