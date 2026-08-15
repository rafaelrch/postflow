begin;

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (event_name in (
    'session_started', 'onboarding_completed', 'carousel_created',
    'carousel_generated_with_ai', 'carousel_created_manually', 'carousel_imported_json',
    'carousel_exported_single', 'carousel_exported_all',
    'image_generation_succeeded', 'image_generation_failed',
    'news_batch_created', 'schedule_created', 'checkout_started'
  )),
  feature text not null check (feature in ('session', 'onboarding', 'carousel', 'image', 'news', 'schedule', 'checkout')),
  session_id text check (session_id is null or length(session_id) between 1 and 100),
  properties jsonb not null default '{}'::jsonb check (
    jsonb_typeof(properties) = 'object' and pg_column_size(properties) <= 2048
  ),
  created_at timestamptz not null default now()
);

comment on table public.product_events is
  'Eventos de produto sem conteúdo privado. A coleta começa na aplicação desta migration.';
create index if not exists idx_product_events_created on public.product_events (created_at desc);
create index if not exists idx_product_events_user_created on public.product_events (user_id, created_at desc);
create index if not exists idx_product_events_name_created on public.product_events (event_name, created_at desc);

alter table public.product_events enable row level security;
revoke all on table public.product_events from public, anon, authenticated;
grant select, insert on table public.product_events to service_role;

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  movement_type text not null check (movement_type in ('consume', 'refund', 'monthly_reset', 'adjustment')),
  feature text not null check (feature in ('carousel', 'image', 'subscription', 'admin')),
  quantity integer not null check (quantity >= 0),
  balance_before integer not null check (balance_before >= 0),
  balance_after integer not null check (balance_after >= 0),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  check (
    (movement_type = 'consume' and quantity > 0 and balance_after = balance_before - quantity)
    or (movement_type = 'refund' and quantity > 0 and balance_after = balance_before + quantity)
    or (movement_type in ('monthly_reset', 'adjustment') and quantity = abs(balance_after - balance_before))
  )
);

comment on table public.credit_ledger is
  'Razão append-only de créditos. A instalação não cria movimentos nem altera saldos existentes.';
create index if not exists idx_credit_ledger_user_created on public.credit_ledger (user_id, created_at desc);
create index if not exists idx_credit_ledger_created on public.credit_ledger (created_at desc);

alter table public.credit_ledger enable row level security;
revoke all on table public.credit_ledger from public, anon, authenticated;
grant select, insert on table public.credit_ledger to service_role;

create table if not exists public.ai_generation_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature in ('carousel', 'image')),
  status text not null check (status in ('succeeded', 'failed')),
  model text not null check (length(model) between 1 and 80),
  generation_type text check (generation_type is null or length(generation_type) <= 40),
  quality text check (quality is null or quality in ('low', 'medium', 'high', 'auto')),
  style text check (style is null or length(style) <= 60),
  language text check (language is null or length(language) <= 20),
  slide_count integer check (slide_count is null or slide_count between 1 and 100),
  credits integer not null check (credits >= 0),
  duration_ms integer not null check (duration_ms >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  error_code text check (error_code is null or length(error_code) <= 60),
  created_at timestamptz not null default now()
);

comment on table public.ai_generation_events is
  'Insumos brutos de IA, não custo monetário. Nunca contém prompt, resposta, legenda ou texto de slide.';
create index if not exists idx_ai_generation_created on public.ai_generation_events (created_at desc);
create index if not exists idx_ai_generation_user_created on public.ai_generation_events (user_id, created_at desc);

alter table public.ai_generation_events enable row level security;
revoke all on table public.ai_generation_events from public, anon, authenticated;
grant select, insert on table public.ai_generation_events to service_role;

create or replace function public.consume_credits_tracked(
  p_user uuid, p_cost integer, p_feature text, p_idempotency_key uuid
) returns integer
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare
  v public.user_credits%rowtype;
  v_existing integer;
  v_before integer;
  v_reset_key uuid;
begin
  if p_cost <= 0 then raise exception 'invalid_credit_cost' using errcode = 'P0001'; end if;
  if p_feature not in ('carousel', 'image') then raise exception 'invalid_credit_feature' using errcode = 'P0001'; end if;
  if auth.uid() is distinct from p_user then raise exception 'credit_user_mismatch' using errcode = 'P0001'; end if;

  select balance_after into v_existing from public.credit_ledger where idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  select * into v from public.user_credits where user_id = p_user for update;
  if not found then raise exception 'insufficient_credits' using errcode = 'P0001'; end if;

  if now() >= v.period_end then
    v_before := v.balance;
    v.balance := v.monthly_allowance;
    v.period_start := now();
    v.period_end := now() + interval '1 month';
    v_reset_key := gen_random_uuid();
    insert into public.credit_ledger
      (user_id, movement_type, feature, quantity, balance_before, balance_after, idempotency_key)
    values
      (p_user, 'monthly_reset', 'subscription', abs(v.balance - v_before), v_before, v.balance, v_reset_key);
  end if;
  if v.balance < p_cost then raise exception 'insufficient_credits' using errcode = 'P0001'; end if;

  v_before := v.balance;
  update public.user_credits set balance = v.balance - p_cost,
    period_start = v.period_start, period_end = v.period_end
    where user_id = p_user returning balance into v.balance;
  insert into public.credit_ledger
    (user_id, movement_type, feature, quantity, balance_before, balance_after, idempotency_key)
  values (p_user, 'consume', p_feature, p_cost, v_before, v.balance, p_idempotency_key);
  return v.balance;
end;
$$;
revoke all on function public.consume_credits_tracked(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.consume_credits_tracked(uuid, integer, text, uuid) to authenticated;

create or replace function public.refund_credits_tracked(
  p_user uuid, p_amount integer, p_feature text, p_idempotency_key uuid
) returns integer
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v public.user_credits%rowtype; v_existing integer; v_actual integer;
begin
  if p_amount <= 0 then raise exception 'invalid_refund_amount' using errcode = 'P0001'; end if;
  if p_feature not in ('carousel', 'image') then raise exception 'invalid_credit_feature' using errcode = 'P0001'; end if;
  select balance_after into v_existing from public.credit_ledger where idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;
  select * into v from public.user_credits where user_id = p_user for update;
  if not found then raise exception 'credits_not_found' using errcode = 'P0001'; end if;
  v_actual := least(p_amount, v.monthly_allowance - v.balance);
  if v_actual > 0 then
    update public.user_credits set balance = v.balance + v_actual where user_id = p_user returning balance into v.balance;
  end if;
  insert into public.credit_ledger
    (user_id, movement_type, feature, quantity, balance_before, balance_after, idempotency_key)
  values (p_user, 'refund', p_feature, v_actual, v.balance - v_actual, v.balance, p_idempotency_key);
  return v.balance;
end;
$$;
revoke all on function public.refund_credits_tracked(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.refund_credits_tracked(uuid, integer, text, uuid) to service_role;

-- Mantém a validação Asaas da função vigente e acrescenta o lançamento no
-- ledger na mesma transação. Instalar a função não toca em nenhuma linha.
create or replace function public.refresh_credits(p_user uuid, p_allowance int, p_reset boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_expected int;
  v_before int := 0;
  v_after int;
  v_kind text;
  v_key uuid;
begin
  select public.plan_allowance(s.plan_interval) into v_expected
    from public.subscriptions s
   where s.user_id = p_user and s.payment_provider = 'asaas' and s.status = 'active'
   order by s.current_period_end desc nulls last, s.updated_at desc limit 1;
  if not found or p_allowance is distinct from v_expected then
    raise exception 'invalid_credit_allowance' using errcode = 'P0001';
  end if;

  select balance into v_before from public.user_credits where user_id = p_user for update;
  if not found then v_before := 0; end if;

  insert into public.user_credits (user_id, balance, monthly_allowance, period_start, period_end)
    values (p_user, v_expected, v_expected, now(), now() + interval '1 month')
    on conflict (user_id) do update set monthly_allowance = v_expected,
      balance = case when p_reset then v_expected else greatest(public.user_credits.balance, v_expected) end,
      period_start = case when p_reset then now() else public.user_credits.period_start end,
      period_end = case when p_reset then now() + interval '1 month' else public.user_credits.period_end end
    returning balance into v_after;

  v_kind := case when p_reset then 'monthly_reset' else 'adjustment' end;
  v_key := (substr(md5(p_user::text || ':' || v_kind || ':' || date_trunc('month', now())::text), 1, 8)
    || '-' || substr(md5(p_user::text || ':' || v_kind || ':' || date_trunc('month', now())::text), 9, 4)
    || '-' || substr(md5(p_user::text || ':' || v_kind || ':' || date_trunc('month', now())::text), 13, 4)
    || '-' || substr(md5(p_user::text || ':' || v_kind || ':' || date_trunc('month', now())::text), 17, 4)
    || '-' || substr(md5(p_user::text || ':' || v_kind || ':' || date_trunc('month', now())::text), 21, 12))::uuid;
  insert into public.credit_ledger
    (user_id, movement_type, feature, quantity, balance_before, balance_after, idempotency_key)
  values (p_user, v_kind, 'subscription', abs(v_after - v_before), v_before, v_after, v_key)
  on conflict (idempotency_key) do nothing;
end;
$$;
revoke all on function public.refresh_credits(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.refresh_credits(uuid, integer, boolean) to service_role;

commit;
