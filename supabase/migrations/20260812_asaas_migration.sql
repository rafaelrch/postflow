-- 20260812_asaas_migration.sql
--
-- Migração AbacatePay → Asaas + REMOÇÃO DO PLANO FREE.
--
-- ⚠️ ARQUIVO NOVO — Rafael roda no SQL Editor do Supabase, BLOCO A BLOCO.
--    Cada bloco tem begin/commit próprio de propósito: são passos com riscos
--    diferentes (0 e 6 são só leitura, 5 é destrutivo e irreversível) e ele
--    precisa poder parar entre eles e conferir. Idempotente: reexecutar um
--    bloco já aplicado não deve dar erro.
--
-- CONTEXTO — o que este arquivo assume do banco (levantado em 12/08):
--   • O produto voltou a ser PAGO-PRIMEIRO. O plano free sai inteiro.
--   • AbacatePay e Stripe saem. Asaas entra. Planos iguais: mensal e anual.
--   • Não há assinante real: 2 usuários de teste, 1 assinatura, 1 intent.
--   • stripe_customers e stripe_webhook_events NÃO existem neste banco — o
--     stripe-schema.sql nunca foi aplicado por completo aqui. Os drops delas
--     ficam mesmo assim, com if exists, porque o custo é zero e a alternativa
--     é depender da minha leitura do inventário estar certa.
--
-- O QUE **NÃO** MUDA, e é decisão de arquitetura, não omissão: a máquina de
-- cadastro passwordless (paid_signup_intents, prepare_paid_signup_intent,
-- claim_verified_paid_signup, claim_paid_signup_for_user,
-- claim_on_email_confirmation, protect_subscription_claim,
-- enforce_paid_signup_precondition e os rate limits) CONTINUA. Ela já está em
-- produção, já resolve pagamento-primeiro e é melhor que o fluxo session_id da
-- era Stripe. Só o PROVEDOR muda dentro dela: provider='abacatepay' vira
-- payment_provider='asaas', abacatepay_customers vira payment_customers,
-- abacatepay_customer_id vira provider_customer_id.
--
-- ORDEM OBRIGATÓRIA: 0 → 1 → 2 → 3 → 4 → 5 → 6. O bloco 4 reescreve funções
-- que leem as tabelas criadas no bloco 3; rodar 4 antes de 3 deixa o cadastro
-- quebrado até o 3 rodar.


-- ============================================================
-- BLOCO 0 — INVENTÁRIO (SÓ LEITURA, não altera nada)
--
-- Rode antes de qualquer coisa e confira contra o que você espera. Tolerante a
-- tabela ausente (to_regclass devolve null em vez de dar erro), porque metade
-- do que ele checa é justamente o que pode não existir.
-- ============================================================

select
  to_regclass('public.subscriptions')             as subscriptions,
  to_regclass('public.abacatepay_customers')      as abacatepay_customers,
  to_regclass('public.abacatepay_webhook_events') as abacatepay_webhook_events,
  to_regclass('public.abacatepay_checkout_refs')  as abacatepay_checkout_refs,
  to_regclass('public.stripe_customers')          as stripe_customers,
  to_regclass('public.stripe_webhook_events')     as stripe_webhook_events,
  to_regclass('public.user_entitlements')         as user_entitlements,
  to_regclass('public.paid_signup_intents')       as paid_signup_intents,
  to_regclass('public.payment_customers')         as payment_customers_nova,
  to_regclass('public.payment_webhook_events')    as payment_webhook_events_nova;

-- Volume que será destruído nos blocos 3 e 5.
select
  (select count(*) from auth.users)                   as usuarios,
  (select count(*) from public.subscriptions)         as assinaturas,
  (select count(*) from public.paid_signup_intents)   as intents,
  (select count(*) from public.carousels)             as carrosseis_que_caem_por_cascade,
  (select count(*) from public.leads)                 as leads_preservados;

-- Triggers hoje pendurados em auth.users. Esperado: três —
-- enforce_paid_signup_precondition_trg, claim_on_email_confirmation_trg e
-- ensure_user_entitlement_trg (este último sai no bloco 1).
select tgname
  from pg_trigger
 where tgrelid = 'auth.users'::regclass
   and not tgisinternal
 order by tgname;

-- Confirma que handle_new_user, enforce_paid_signup e claim_paid_signup estão
-- mesmo ÓRFÃS (nenhum trigger aponta para elas) antes do bloco 4 dropá-las.
-- Esperado: zero linhas.
select p.proname, t.tgname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  left join pg_trigger t on t.tgfoid = p.oid and not t.tgisinternal
 where n.nspname = 'public'
   and p.proname in ('handle_new_user', 'enforce_paid_signup', 'claim_paid_signup')
   and t.tgname is not null;


-- ============================================================
-- BLOCO 1 — REMOVER O PLANO FREE
--
-- O free sai inteiro: volta a ser pago-primeiro. Some a tabela de entitlement,
-- os triggers que a alimentavam e os três limites que dependiam dela.
--
-- ORDEM: trigger ANTES da função. Um `drop function` sem cascade FALHA se
-- ainda houver trigger apontando para ela — e é bom que falhe, porque isso
-- significaria que o mapeamento aqui está incompleto. Não use cascade para
-- "resolver" um erro desses: investigue.
--
-- Os triggers de limite foram descobertos lendo 20260724 (carousels), 20260727
-- (reels, news_entries) e 20260728 (recriação dos três), não por adivinhação.
--
-- FICA DE PÉ, de propósito: freeze_news_entries_created_at (+ trigger). Ela
-- nasceu junto com o limite de news (20260728), mas o que faz é impedir o
-- cliente de reescrever news_entries.created_at — integridade de dado, não
-- cobrança. Sem os limites free ela deixa de ser barreira anti-abuso e vira
-- só isso; removê-la não é pedido e reabriria a edição do created_at.
-- ============================================================

begin;

-- Triggers primeiro.
drop trigger if exists ensure_user_entitlement_trg        on auth.users;
drop trigger if exists profiles_entitlement_default_trg   on public.profiles;
drop trigger if exists subscriptions_entitlement_sync_trg on public.subscriptions;
drop trigger if exists enforce_free_carousel_limit_trg    on public.carousels;
drop trigger if exists enforce_free_reel_limit_trg        on public.reels;
drop trigger if exists enforce_free_news_daily_limit_trg  on public.news_entries;

-- Agora as funções.
drop function if exists public.ensure_user_entitlement();
drop function if exists public.profiles_entitlement_default();
drop function if exists public.subscriptions_entitlement_sync();
drop function if exists public.sync_user_entitlement(uuid);
drop function if exists public.enforce_free_carousel_limit();
drop function if exists public.enforce_free_reel_limit();
drop function if exists public.enforce_free_news_daily_limit();

-- E a tabela. Sem cascade: se algo ainda depender dela, quero saber.
drop table if exists public.user_entitlements;

commit;

-- O ramo signup_kind='free' dentro de enforce_paid_signup_precondition NÃO sai
-- aqui — sai no bloco 4, junto com a reescrita da função inteira, para não
-- redefinir a mesma função em dois blocos.


-- ============================================================
-- BLOCO 2 — REMOVER O LEGADO DE PAGAMENTO
--
-- Ordem de dependência escrita À MÃO, sem cascade, DE PROPÓSITO.
--
-- Foi exatamente esse exercício que revelou a FK
-- paid_signup_intents_subscription_id_fkey → subscriptions(id): mapear a ordem
-- obriga a olhar quem depende de quem. Um `drop ... cascade` cego teria
-- passado silenciosamente e levado junto objetos que ninguém mapeou — a FK
-- some sem aviso e o bloco 3 recria a tabela sem ela, deixando
-- paid_signup_intents apontando para o nada. Se algum drop aqui falhar por
-- dependência, é sinal de que existe um objeto fora do inventário: investigue,
-- não acrescente cascade.
--
-- paid_signup_intents NÃO É DROPADA. Ela é parte da máquina de cadastro que
-- estamos preservando. Só a FK dela precisa ser refeita, e isso é no bloco 3.
--
-- A view sai primeiro porque depende de subscriptions; subscriptions em si só
-- é recriada no bloco 3.
-- ============================================================

begin;

drop view if exists public.user_active_subscription;

drop table if exists public.abacatepay_checkout_refs;
drop table if exists public.abacatepay_customers;
drop table if exists public.abacatepay_webhook_events;

-- Não existem neste banco (o stripe-schema.sql nunca foi aplicado por
-- completo). Ficam com if exists porque custam zero e cobrem o caso de a minha
-- leitura do inventário estar errada.
drop table if exists public.stripe_customers;
drop table if exists public.stripe_webhook_events;

commit;


-- ============================================================
-- BLOCO 3 — SCHEMA NOVO, PROVIDER-NEUTRO
--
-- subscriptions é RECRIADA, não alterada. Seriam 8+ alter table para sair do
-- híbrido de duas eras (provider, stripe_customer_id, abacatepay_customer_id,
-- price_id, trial_end...) e o resultado ainda carregaria colunas mortas. Como
-- não há assinante real, recriar limpa é mais honesto e mais barato.
--
-- O NÓ: paid_signup_intents.subscription_id tem FK para subscriptions(id).
-- Não dá para dropar a tabela com a FK de pé. A sequência é obrigatória:
--   1. dropar a constraint (não a tabela paid_signup_intents!)
--   2. esvaziar paid_signup_intents
--   3. dropar e recriar subscriptions
--   4. recriar a constraint
-- O passo 2 não é opcional: os intents existentes apontam para assinaturas que
-- deixam de existir no passo 3, e o passo 4 recusaria a constraint por
-- violação. São dados de teste de um fluxo de cadastro que nunca foi concluído
-- — não há nada a preservar, mas é uma DELEÇÃO e está aqui, declarada, e não
-- escondida no bloco 5.
--
-- Vocabulário de `status`: INTOCÁVEL. active/trialing/past_due/unpaid/canceled
-- são os valores que o app já consome (a view user_active_subscription,
-- lib/subscription.ts e o gate de cadastro filtram por 'active'/'trialing').
-- O status cru do Asaas (ACTIVE/EXPIRED/INACTIVE, e OVERDUE do lado da
-- cobrança) é outro vocabulário e vive separado em subscription_status, só
-- para debug do webhook.
-- ============================================================

begin;

-- 1. Solta a FK. A tabela paid_signup_intents e suas linhas continuam aqui.
alter table public.paid_signup_intents
  drop constraint if exists paid_signup_intents_subscription_id_fkey;

-- 2. Esvazia: os intents apontam para assinaturas que somem no passo 3.
delete from public.paid_signup_intents;

-- 3. Fora a tabela híbrida.
drop table if exists public.subscriptions;

create table if not exists public.subscriptions (
  id text primary key,                          -- id da assinatura no Asaas
  -- NULLABLE de propósito: a linha nasce no webhook, ANTES de existir conta.
  -- É isso que sustenta o pagamento-primeiro; o cadastro reivindica depois.
  user_id uuid references auth.users(id) on delete cascade,
  email text,                                   -- e-mail pago: chave do cadastro
  payment_provider text not null default 'asaas'
    check (payment_provider in ('asaas')),
  provider_customer_id text,
  provider_subscription_id text,
  provider_payment_id text,                     -- última cobrança conhecida
  -- externalReference do Asaas: carrega o id do lead que originou a compra.
  external_reference text,
  status text not null
    check (status in ('active', 'trialing', 'past_due', 'unpaid', 'canceled')),
  subscription_status text,                     -- status cru do Asaas, sem tradução
  plan_interval text not null check (plan_interval in ('month', 'year')),
  billing_type text,                            -- CREDIT_CARD | PIX
  cycle text,                                   -- MONTHLY | YEARLY
  value numeric(10, 2),
  next_due_date date,
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_user on public.subscriptions (user_id, status);
create index if not exists idx_subscriptions_customer on public.subscriptions (provider_customer_id);
-- lower(email): o gate de cadastro e o claim casam e-mail sem case-sensitivity.
create index if not exists idx_subscriptions_email on public.subscriptions (lower(email));
-- Lookup pelo lead na volta do checkout.
create index if not exists idx_subscriptions_external_reference on public.subscriptions (external_reference);

-- 4. Repõe a FK, agora contra a tabela nova.
alter table public.paid_signup_intents
  add constraint paid_signup_intents_subscription_id_fkey
  foreign key (subscription_id) references public.subscriptions(id) on delete cascade;

-- payment_customers substitui abacatepay_customers. cpf_cnpj é nullable porque
-- o customer nasce no checkout hospedado: só sabemos o documento quando o
-- Asaas devolve o cliente no webhook.
create table if not exists public.payment_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payment_provider text not null default 'asaas'
    check (payment_provider in ('asaas')),
  provider_customer_id text not null unique,
  cpf_cnpj text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- payment_webhook_events substitui abacatepay_webhook_events, com uma
-- diferença que importa: lá a linha era inserida DEPOIS de processar
-- (processed_at not null default now()), então uma reentrega durante o
-- processamento rodava o efeito duas vezes. Aqui a linha entra ANTES
-- (received_at) e processed_at só é preenchido no fim. O insert vira o lock:
-- se o Asaas reentrega, o PK colide e a segunda entrega não reprocessa. E uma
-- linha com processed_at null é evidência de evento que morreu no meio.
create table if not exists public.payment_webhook_events (
  event_id text primary key,                    -- campo `id` do payload do Asaas
  event_type text,
  payload jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_payment_webhook_events_type
  on public.payment_webhook_events (event_type, received_at desc);
-- Fila de diagnóstico: o que chegou e nunca terminou.
create index if not exists idx_payment_webhook_events_pending
  on public.payment_webhook_events (received_at) where processed_at is null;

-- Triggers de updated_at (set_updated_at vem de schema.sql).
drop trigger if exists set_subscriptions_updated on public.subscriptions;
create trigger set_subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();

drop trigger if exists set_payment_customers_updated on public.payment_customers;
create trigger set_payment_customers_updated before update on public.payment_customers
  for each row execute function public.set_updated_at();

-- RLS: o usuário só LÊ o que é dele. Nenhuma policy de insert/update/delete —
-- toda escrita de pagamento nasce no webhook, via service role. O client não
-- pode inventar uma assinatura para si.
alter table public.subscriptions enable row level security;
alter table public.payment_customers enable row level security;
alter table public.payment_webhook_events enable row level security;

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists payment_customers_select_own on public.payment_customers;
create policy payment_customers_select_own on public.payment_customers
  for select using (auth.uid() = user_id);

-- payment_webhook_events: RLS ligado e ZERO policy ⇒ deny-all para o usuário
-- final. Service role bypassa. Mesmo padrão de public.leads: payload de
-- webhook é dado de terceiro e não deve ser legível por ninguém logado.
revoke all on public.payment_webhook_events from public, anon, authenticated;

-- View recriada com a MESMA lista de colunas de hoje — lib/subscription.ts
-- seleciona coluna por nome e quebraria com qualquer mudança aqui.
-- Duas não têm equivalente no Asaas e ficam como compatibilidade:
--   • price_id — no Stripe era o price_xxx que identificava o plano; no Asaas
--     o plano é só o intervalo, então expomos plan_interval no lugar. Quem lê
--     usa isso apenas para distinguir mensal de anual.
--   • trial_end — não há trial no produto e o Asaas não devolve equivalente.
--     NULL fixo, tipado como timestamptz para o client não receber `unknown`.
-- Ambas saem na Fase 5, junto com o resto do vocabulário Stripe.
create or replace view public.user_active_subscription as
  select distinct on (user_id)
    user_id,
    id as subscription_id,
    status,
    plan_interval as price_id,
    plan_interval,
    cancel_at_period_end,
    current_period_end,
    null::timestamptz as trial_end
  from public.subscriptions
  where status in ('active', 'trialing')
  order by user_id, current_period_end desc nulls last, updated_at desc;

-- security_invoker: a view não pode virar um furo na RLS da tabela base.
alter view public.user_active_subscription set (security_invoker = true);

commit;


-- ============================================================
-- BLOCO 4 — REESCREVER AS FUNÇÕES DO CADASTRO
--
-- Mesma máquina, provedor trocado. Cada função abaixo tinha pelo menos uma de
-- três amarras ao passado: provider='abacatepay', as tabelas abacatepay_* ou
-- a coluna price_id (que não existe mais). O corpo de uma função plpgsql só é
-- resolvido em tempo de execução, então nada disso quebra na hora do drop —
-- quebra no primeiro cadastro depois dele. Por isso TODAS precisam ser
-- reescritas no mesmo bloco.
--
-- Duas funções da máquina foram CONFERIDAS e NÃO precisam de mudança:
-- prepare_paid_signup_intent e claim_on_email_confirmation (versões finais de
-- 20260721, linhas 360 e 355). Nenhuma cita provedor nem price_id: a primeira
-- só mexe em paid_signup_intents/auth.users, a segunda só checa o marcador
-- origin='paid_passwordless' e delega para claim_paid_signup_for_user.
-- ============================================================

begin;

-- ── plan_allowance ───────────────────────────────────────────
-- A versão de 2 argumentos sempre IGNOROU o price_id: o número saía só do
-- intervalo. Com o Asaas não existe price_id nenhum, então a assinatura
-- honesta é a de 1 argumento. A de 2 vira wrapper para não quebrar chamada
-- antiga que ainda exista em algum lugar. Números do produto inalterados:
-- 200 no mensal, 300 no anual.
create or replace function public.plan_allowance(p_interval text)
returns int language sql immutable set search_path = pg_catalog, public as $$
  select case when p_interval = 'year' then 300 else 200 end;
$$;
revoke all on function public.plan_allowance(text) from public, anon, authenticated;

create or replace function public.plan_allowance(p_price_id text, p_interval text)
returns int language sql immutable set search_path = pg_catalog, public as $$
  select public.plan_allowance(p_interval);
$$;
revoke all on function public.plan_allowance(text, text) from public, anon, authenticated;

-- ── enforce_paid_signup_precondition ─────────────────────────
-- Gate BEFORE INSERT em auth.users. Duas mudanças:
--   1. O ramo signup_kind='free' (20260725) SAI. Sem plano free, não há
--      cadastro que não passe pela assinatura paga.
--   2. provider='abacatepay' vira payment_provider='asaas'.
--
-- A TRIPLA status='active' AND user_id is null AND lower(email)=lower(new.email)
-- é o endurecimento de segurança e fica IDÊNTICA. `user_id is null` em
-- particular NÃO é supérflua: exige uma assinatura ainda não reivindicada por
-- nenhuma conta. Sem ela, uma assinatura já vinculada a um usuário autorizaria
-- um SEGUNDO cadastro com o mesmo e-mail — uma assinatura paga valendo por N
-- contas. Não remova.
create or replace function public.enforce_paid_signup_precondition()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,auth as $$
begin
  if not exists (
    select 1 from public.subscriptions
    where payment_provider='asaas' and status='active' and user_id is null
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

-- ── protect_subscription_claim ───────────────────────────────
-- Impede que uma assinatura já reivindicada troque de dono num UPDATE. Só o
-- nome do provedor muda. O trigger precisa ser RECRIADO porque a tabela
-- subscriptions foi recriada no bloco 3 (o trigger antigo caiu junto com ela).
create or replace function public.protect_subscription_claim()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.payment_provider = 'asaas' and old.user_id is not null
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

-- ── claim_paid_signup_for_user ───────────────────────────────
-- O coração do claim: é para cá que claim_on_email_confirmation e
-- prepare_paid_signup_intent delegam.
--
-- NÃO estava na lista da tarefa, mas PRECISA ser reescrita: a versão em
-- produção (20260721, definição final) toca abacatepay_checkout_refs e
-- abacatepay_customers — as duas dropadas no bloco 2 — além de provider e
-- price_id. Sem esta reescrita, todo cadastro pago falharia no primeiro claim
-- com "relation public.abacatepay_checkout_refs does not exist".
--
-- Mudanças, e só elas: provider→payment_provider/'asaas',
-- abacatepay_customers→payment_customers,
-- abacatepay_customer_id→provider_customer_id, plan_allowance de 1 argumento,
-- e o update em abacatepay_checkout_refs sai (a tabela não existe mais; o
-- Asaas não usa o mecanismo de ref do checkout da AbacatePay). Toda a lógica
-- de trava — for update, consumo do intent, on conflict do nothing — fica.
create or replace function public.claim_paid_signup_for_user(p_uid uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_email text; v_name text; v_phone text; v_intent public.paid_signup_intents%rowtype; v_sub public.subscriptions%rowtype; v_allowance int;
begin
  select email into v_email from auth.users where id=p_uid and email_confirmed_at is not null for update;
  if v_email is null then raise exception 'email_confirmation_required' using errcode='P0001'; end if;
  select * into v_intent from public.paid_signup_intents where user_id=p_uid and consumed_at is null and expires_at>now() order by created_at asc,id asc limit 1 for update;
  if not found then if exists(select 1 from public.subscriptions where user_id=p_uid and payment_provider='asaas') then return true; end if; raise exception 'signup_intent_required' using errcode='P0001'; end if;
  select * into v_sub from public.subscriptions where id=v_intent.subscription_id and payment_provider='asaas' and status='active' and user_id is null and lower(email)=lower(v_email) for update;
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

-- ── claim_verified_paid_signup ───────────────────────────────
-- Caminho chamado pelo client autenticado (RPC). Mesmas trocas de nome; a
-- lógica de intent e as travas ficam intactas.
create or replace function public.claim_verified_paid_signup() returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid uuid:=auth.uid(); v_email text; v_intent public.paid_signup_intents%rowtype; v_sub public.subscriptions%rowtype; v_allowance int;
begin
 if v_uid is null then raise exception 'signup_session_required' using errcode='P0001'; end if;
 select email into v_email from auth.users where id=v_uid and email_confirmed_at is not null for update;
 if v_email is null then raise exception 'email_confirmation_required' using errcode='P0001'; end if;
 select * into v_intent from public.paid_signup_intents where user_id=v_uid and consumed_at is null and expires_at>now() for update;
 if not found then if exists(select 1 from public.subscriptions where user_id=v_uid and payment_provider='asaas') then return jsonb_build_object('ok',true); end if; raise exception 'signup_intent_invalid_or_expired' using errcode='P0001'; end if;
 select * into v_sub from public.subscriptions where id=v_intent.subscription_id and payment_provider='asaas' and status='active' and user_id is null and lower(email)=lower(v_email) for update;
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

-- ── refresh_credits ──────────────────────────────────────────
-- Também NÃO estava na lista da tarefa e também precisa: a versão de 20260721
-- valida o allowance contra `s.provider='abacatepay'` e
-- `plan_allowance(s.price_id, s.plan_interval)`. A coluna price_id não existe
-- mais, então a função levantaria erro de coluna inexistente na primeira
-- renovação vinda do webhook. A validação em si (recusar allowance que não
-- bata com o plano) é preservada — é ela que impede o service role pedir
-- crédito arbitrário.
create or replace function public.refresh_credits(p_user uuid, p_allowance int, p_reset boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_expected int;
begin
  select public.plan_allowance(s.plan_interval) into v_expected
    from public.subscriptions s where s.user_id = p_user and s.payment_provider = 'asaas'
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

-- ── Funções órfãs: dropar ────────────────────────────────────
-- handle_new_user, enforce_paid_signup e claim_paid_signup são da era Stripe /
-- do primeiro rollout AbacatePay. Os triggers delas foram removidos ainda em
-- 20260721 (linhas 292-294); o bloco 0 confirma que não sobrou nenhum. Ficam
-- como funções SECURITY DEFINER mortas que referenciam colunas e tabelas que
-- não existem mais — só confundem quem abrir o banco depois.
--
-- Sem cascade de propósito: `drop function` FALHA se algum trigger ainda
-- depender. Se falhar aqui, o bloco 0 mentiu e você deve parar e investigar em
-- vez de forçar.
drop function if exists public.handle_new_user();
drop function if exists public.enforce_paid_signup();
drop function if exists public.claim_paid_signup();

commit;


-- ============================================================
-- BLOCO 5 — LIMPEZA DESTRUTIVA
--
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- ATENÇÃO: IRREVERSÍVEL. APAGA **TODOS** OS USUÁRIOS.
-- NÃO EXISTE ROLLBACK. O arquivo _rollback.sql NÃO traz estes dados de volta.
-- FAÇA BACKUP ANTES. NENHUM AGENTE DEVE EXECUTAR ESTE BLOCO.
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
--
-- São 2 contas, ambas de teste, e o Rafael autorizou. O DELETE derruba por
-- CASCADE, para cada usuário: profiles, projects, carousels (e slides),
-- news_entries, templates, assets, scheduled_posts, content_relations, reels,
-- user_credits, paid_signup_intents e as sessões/identities do auth.
--
-- DELETE e não TRUNCATE: o TRUNCATE em auth.users não dispara os cascades do
-- jeito que precisamos e o Supabase costuma recusá-lo.
--
-- public.leads é PRESERVADA: é dado de marketing, não de pagamento, e não tem
-- FK para auth.users.
-- ============================================================

begin;

-- As linhas de pagamento remanescentes. Ordem: filhos antes dos pais.
delete from public.paid_signup_intents;
delete from public.payment_webhook_events;
delete from public.payment_customers;
delete from public.subscriptions;

delete from auth.users;

commit;


-- ============================================================
-- BLOCO 6 — VERIFICAÇÃO FINAL (SÓ LEITURA)
-- ============================================================

-- O legado sumiu (esperado: tudo null) e o novo existe (esperado: não-null).
select
  to_regclass('public.abacatepay_customers')      as legado_abacate_customers,
  to_regclass('public.abacatepay_webhook_events') as legado_abacate_events,
  to_regclass('public.abacatepay_checkout_refs')  as legado_abacate_refs,
  to_regclass('public.stripe_customers')          as legado_stripe_customers,
  to_regclass('public.user_entitlements')         as legado_entitlements,
  to_regclass('public.subscriptions')             as nova_subscriptions,
  to_regclass('public.payment_customers')         as nova_payment_customers,
  to_regclass('public.payment_webhook_events')    as nova_webhook_events,
  to_regclass('public.paid_signup_intents')       as preservada_intents;

-- Tabelas de PRODUTO intactas (esperado: todas não-null). reels inclusa: é de
-- outra frente e não tem relação com pagamento.
select
  to_regclass('public.profiles')          as profiles,
  to_regclass('public.projects')          as projects,
  to_regclass('public.carousels')         as carousels,
  to_regclass('public.slides')            as slides,
  to_regclass('public.templates')         as templates,
  to_regclass('public.assets')            as assets,
  to_regclass('public.news_entries')      as news_entries,
  to_regclass('public.scheduled_posts')   as scheduled_posts,
  to_regclass('public.content_relations') as content_relations,
  to_regclass('public.leads')             as leads,
  to_regclass('public.user_credits')      as user_credits,
  to_regclass('public.reels')             as reels;

-- A FK do paid_signup_intents voltou e aponta para a subscriptions nova.
select conname, pg_get_constraintdef(oid) as definicao
  from pg_constraint
 where conrelid = 'public.paid_signup_intents'::regclass
   and contype = 'f'
 order by conname;

-- Triggers em auth.users. Esperado: DOIS —
-- enforce_paid_signup_precondition_trg e claim_on_email_confirmation_trg.
-- ensure_user_entitlement_trg NÃO pode aparecer.
select tgname
  from pg_trigger
 where tgrelid = 'auth.users'::regclass
   and not tgisinternal
 order by tgname;

-- Nenhuma função em public pode mais citar abacatepay, o provider antigo ou
-- price_id. Esperado: ZERO linhas.
select p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and (pg_get_functiondef(p.oid) ilike '%abacatepay%'
     or pg_get_functiondef(p.oid) ilike '%stripe_customer_id%'
     or pg_get_functiondef(p.oid) ilike '%v_sub.price_id%'
     or pg_get_functiondef(p.oid) ilike '%s.price_id%'
     or pg_get_functiondef(p.oid) ilike '%user_entitlements%')
 order by p.proname;

-- Zerou.
select
  (select count(*) from auth.users)               as usuarios,
  (select count(*) from public.subscriptions)     as assinaturas,
  (select count(*) from public.paid_signup_intents) as intents,
  (select count(*) from public.leads)             as leads_preservados;
