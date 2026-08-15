begin;

create or replace function public.admin_product_metrics(
  p_block text,
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'invalid_product_period' using errcode = '22023';
  end if;

  if p_block = 'activity' then
    select jsonb_build_object(
      'collected_since', (select min(e.created_at) from public.product_events e),
      'dau', (select count(distinct e.user_id) from public.product_events e where e.created_at >= p_to - interval '1 day' and e.created_at < p_to),
      'wau', (select count(distinct e.user_id) from public.product_events e where e.created_at >= p_to - interval '7 days' and e.created_at < p_to),
      'mau', (select count(distinct e.user_id) from public.product_events e where e.created_at >= p_to - interval '30 days' and e.created_at < p_to),
      'series', coalesce((select jsonb_agg(to_jsonb(x) order by x.bucket) from (
        select date_trunc('day', e.created_at) bucket, count(distinct e.user_id) users
        from public.product_events e where e.created_at >= p_from and e.created_at < p_to
        group by 1
      ) x), '[]'::jsonb),
      'existing_carousels', (select count(*) from public.carousels),
      'existing_news', (select count(*) from public.news_entries)
    ) into v_result;

  elsif p_block = 'creation' then
    select jsonb_build_object(
      'content_series', coalesce((select jsonb_agg(to_jsonb(x) order by x.bucket) from (
        select date_trunc('day', e.created_at) bucket, count(*) count
        from public.product_events e
        where e.created_at >= p_from and e.created_at < p_to
          and e.event_name in ('carousel_created', 'news_batch_created')
        group by 1
      ) x), '[]'::jsonb),
      'carousel_modes', coalesce((select jsonb_agg(to_jsonb(x) order by x.mode) from (
        select coalesce(nullif(e.properties->>'source',''), 'unknown') mode, count(*) count
        from public.product_events e
        where e.created_at >= p_from and e.created_at < p_to and e.event_name = 'carousel_created'
        group by 1
      ) x), '[]'::jsonb),
      'exports_single', (select count(*) from public.product_events e where e.created_at >= p_from and e.created_at < p_to and e.event_name = 'carousel_exported_single'),
      'exports_all', (select count(*) from public.product_events e where e.created_at >= p_from and e.created_at < p_to and e.event_name = 'carousel_exported_all'),
      'images', (select count(*) from public.product_events e where e.created_at >= p_from and e.created_at < p_to and e.event_name = 'image_generation_succeeded'),
      'news_batches', (select count(*) from public.product_events e where e.created_at >= p_from and e.created_at < p_to and e.event_name = 'news_batch_created'),
      'schedules', (select count(*) from public.product_events e where e.created_at >= p_from and e.created_at < p_to and e.event_name = 'schedule_created'),
      'styles', coalesce((select jsonb_agg(to_jsonb(x) order by x.count desc, x.style) from (
        select coalesce(nullif(e.properties->>'style',''), 'Não identificado') style, count(*) count
        from public.product_events e
        where e.created_at >= p_from and e.created_at < p_to and e.event_name = 'carousel_created'
        group by 1 order by count(*) desc limit 10
      ) x), '[]'::jsonb),
      'average_slides', (select round(avg((e.properties->>'slide_count')::numeric), 1)
        from public.product_events e where e.created_at >= p_from and e.created_at < p_to
          and e.event_name = 'carousel_created' and e.properties->>'slide_count' ~ '^[0-9]+$')
    ) into v_result;

  elsif p_block = 'features' then
    select jsonb_build_object(
      'features', coalesce((select jsonb_agg(to_jsonb(x) order by x.events desc, x.feature) from (
        select e.feature, count(*) events, count(distinct e.user_id) users
        from public.product_events e where e.created_at >= p_from and e.created_at < p_to
        group by e.feature
      ) x), '[]'::jsonb),
      'created_never_exported', (select count(*) from (
        select distinct e.user_id from public.product_events e
        where e.created_at >= p_from and e.created_at < p_to
          and e.event_name in ('carousel_created', 'news_batch_created')
        except
        select distinct e.user_id from public.product_events e
        where e.created_at < p_to and e.event_name in ('carousel_exported_single', 'carousel_exported_all')
      ) q),
      'paid_never_created', (select count(distinct s.user_id) from public.subscriptions s
        where s.status in ('active','trialing') and s.user_id is not null
          and not exists (select 1 from public.product_events e where e.user_id = s.user_id
            and e.event_name in ('carousel_created','news_batch_created'))),
      'reels_disabled', true
    ) into v_result;

  elsif p_block = 'credits_ai' then
    select jsonb_build_object(
      'credits_by_feature', coalesce((select jsonb_agg(to_jsonb(x) order by x.credits desc, x.feature) from (
        select l.feature, sum(l.quantity)::bigint credits
        from public.credit_ledger l
        where l.created_at >= p_from and l.created_at < p_to and l.movement_type = 'consume'
        group by l.feature
      ) x), '[]'::jsonb),
      'ai_succeeded', (select count(*) from public.ai_generation_events a where a.created_at >= p_from and a.created_at < p_to and a.status = 'succeeded'),
      'ai_failed', (select count(*) from public.ai_generation_events a where a.created_at >= p_from and a.created_at < p_to and a.status = 'failed'),
      'zero_credits', (select count(*) from public.user_credits c where c.balance = 0),
      'models', coalesce((select jsonb_agg(to_jsonb(x) order by x.generations desc, x.model) from (
        select a.model, count(*) generations, sum(a.input_tokens)::bigint input_tokens, sum(a.output_tokens)::bigint output_tokens
        from public.ai_generation_events a where a.created_at >= p_from and a.created_at < p_to
        group by a.model
      ) x), '[]'::jsonb)
    ) into v_result;
  else
    raise exception 'unknown_product_block' using errcode = '22023';
  end if;

  return v_result;
end;
$$;

revoke all on function public.admin_product_metrics(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_product_metrics(text, timestamptz, timestamptz) to service_role;

commit;
