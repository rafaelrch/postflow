-- 20260728_harden_free_limits.sql
--
-- ETAPA 6 / Fatia 6 — Correção dos 2 achados MEDIA da auditoria (Reviewer + Security).
--
-- ⚠️ ARQUIVO NOVO — Rafael roda no SQL Editor. NÃO altera 20260724/25/26/27
--    (já aplicadas). Idempotente e transacional. Recria as 3 funções de limite
--    (create or replace) preservando TODO o comportamento (falha fechada, PRO
--    retorna cedo, nada apagado, mesmos códigos e thresholds).
--
-- ── ACHADO 1 (news 24h burlável) ─────────────────────────────────────────────
-- news_entries.created_at é escrito pelo CLIENTE (policy news_entries_owner é
-- `for all`, sem restrição de coluna). O limite de news conta uma JANELA de 24h
-- sobre essa coluna, então um free podia inserir com created_at no passado e
-- zerar a contagem → news ilimitadas. FIX: o trigger FORÇA new.created_at :=
-- now() antes de contar, tornando a coluna server-authoritative para o limite.
-- (Carrossel e reel contam o ACERVO TOTAL — não uma janela — então created_at
--  manipulável NÃO afeta o limite deles; não precisam do forçamento. Ver relato.)
--
-- ── ACHADO 2 (TOCTOU nos 3 triggers) ─────────────────────────────────────────
-- SELECT count + INSERT sem lock: sob READ COMMITTED, 2 INSERTs concorrentes do
-- mesmo usuário leem o mesmo count e passam os dois (duplo clique / abas). FIX:
-- pg_advisory_xact_lock por (domínio-da-tabela, usuário) no início do caminho
-- free, serializando os inserts do MESMO usuário na MESMA tabela. Escolhi lock
-- consultivo em vez de unique/exclusion constraint porque os limites dependem do
-- PLANO (tabela user_entitlements) e são condicionais/por-janela — não dá pra
-- expressar como constraint de coluna sem quebrar PRO nem contas legadas.
-- Deadlock: cada trigger adquire UM só lock → não há ordenação de múltiplos
-- locks, logo não há deadlock. Contenção: só entre inserts simultâneos do mesmo
-- usuário na mesma tabela (exatamente o que precisa serializar); classid por
-- tabela evita contenção cruzada entre carrossel/reel/news do mesmo usuário.

begin;

-- classid por tabela (2º arg do advisory lock) para isolar os domínios de lock.
-- 1 = carousels · 2 = reels · 3 = news_entries.

-- ── CARROSSEL: 5 no total ────────────────────────────────────────────────────
create or replace function public.enforce_free_carousel_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan text;
  v_count int;
begin
  select plan into v_plan from public.user_entitlements where user_id = new.user_id;
  if v_plan is null then
    v_plan := 'free';
  end if;
  if v_plan = 'pro' then
    return new;
  end if;

  -- ACHADO 2: serializa inserts concorrentes do mesmo usuário (xact-scoped).
  perform pg_advisory_xact_lock(1, hashtext(new.user_id::text));

  select count(*) into v_count from public.carousels where user_id = new.user_id;
  if v_count >= 5 then
    raise exception 'free_project_limit'
      using errcode = 'P0001',
            hint = 'O plano gratuito permite salvar até 5 projetos. Faça upgrade para salvar mais.';
  end if;
  return new;
end;
$$;

-- ── REELS: 1 no total ────────────────────────────────────────────────────────
create or replace function public.enforce_free_reel_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan text;
  v_count int;
begin
  select plan into v_plan from public.user_entitlements where user_id = new.user_id;
  if v_plan is null then
    v_plan := 'free';
  end if;
  if v_plan = 'pro' then
    return new;
  end if;

  perform pg_advisory_xact_lock(2, hashtext(new.user_id::text));

  select count(*) into v_count from public.reels where user_id = new.user_id;
  if v_count >= 1 then
    raise exception 'free_reel_limit'
      using errcode = 'P0001',
            hint = 'O plano gratuito guarda 1 Reel. Apague o atual ou faça upgrade para criar outro.';
  end if;
  return new;
end;
$$;

-- ── NEWS: 4 por janela deslizante de 24h ─────────────────────────────────────
create or replace function public.enforce_free_news_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan text;
  v_count int;
begin
  -- ACHADO 1: timestamp server-authoritative — ignora o que o cliente mandou.
  -- Vem ANTES de tudo, então vale para free e pro (o app nunca seta created_at).
  new.created_at := now();

  select plan into v_plan from public.user_entitlements where user_id = new.user_id;
  if v_plan is null then
    v_plan := 'free';
  end if;
  if v_plan = 'pro' then
    return new;
  end if;

  perform pg_advisory_xact_lock(3, hashtext(new.user_id::text));

  -- Conta a janela usando o created_at JÁ forçado acima (não o do cliente).
  select count(*) into v_count
    from public.news_entries
   where user_id = new.user_id
     and created_at > now() - interval '24 hours';
  if v_count >= 4 then
    raise exception 'free_news_daily_limit'
      using errcode = 'P0001',
            hint = 'O plano gratuito cria 4 notícias por dia. O limite renova em 24h — nada foi apagado.';
  end if;
  return new;
end;
$$;

-- ── NEWS: created_at imutável no UPDATE ──────────────────────────────────────
-- O forçamento acima cobre só o INSERT. A policy news_entries_owner é `for all`
-- sem restrição de coluna, então o usuário inseria 4 news (created_at = now())
-- e depois dava UPDATE jogando created_at pro passado: a janela de 24h zerava e
-- o limite voltava a ser decorativo. O ramo UPDATE do upsert cai no mesmo buraco.
-- FIX: descarta qualquer alteração de created_at vinda do cliente.
--
-- DELETE + recriar continua possível e é ACEITÁVEL (decisão de produto): o
-- usuário destrói o próprio conteúdo, o teto de acervo simultâneo continua
-- valendo e news não consome IA nem crédito. Não há contador append-only.
--
-- Convive com set_news_entries_updated (schema.sql), que também é BEFORE UPDATE
-- FOR EACH ROW na mesma tabela: aquele escreve updated_at, este escreve
-- created_at. Colunas disjuntas e os BEFORE triggers encadeiam o NEW, então a
-- ordem alfabética de disparo não muda o resultado — nenhum sobrescreve o outro.
create or replace function public.freeze_news_entries_created_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists freeze_news_entries_created_at_trg on public.news_entries;
create trigger freeze_news_entries_created_at_trg
  before update on public.news_entries
  for each row execute function public.freeze_news_entries_created_at();

-- Funções recriadas por create or replace; os triggers já apontam para elas
-- (instalados em 20260724/20260727). Recria por idempotência/garantia.
drop trigger if exists enforce_free_carousel_limit_trg on public.carousels;
create trigger enforce_free_carousel_limit_trg
  before insert on public.carousels
  for each row execute function public.enforce_free_carousel_limit();

drop trigger if exists enforce_free_reel_limit_trg on public.reels;
create trigger enforce_free_reel_limit_trg
  before insert on public.reels
  for each row execute function public.enforce_free_reel_limit();

drop trigger if exists enforce_free_news_daily_limit_trg on public.news_entries;
create trigger enforce_free_news_daily_limit_trg
  before insert on public.news_entries
  for each row execute function public.enforce_free_news_daily_limit();

-- Re-emite os revokes de 20260724/20260727. Idempotente: nenhuma dessas funções
-- é chamável direto por cliente — só via trigger, que roda com os privilégios do
-- dono. Reafirmado aqui para blindar contra um futuro drop+create que reponha os
-- grants default de EXECUTE a public. Inclui a função nova deste arquivo.
revoke all on function public.enforce_free_carousel_limit() from public, anon, authenticated;
revoke all on function public.enforce_free_reel_limit() from public, anon, authenticated;
revoke all on function public.enforce_free_news_daily_limit() from public, anon, authenticated;
revoke all on function public.freeze_news_entries_created_at() from public, anon, authenticated;

commit;
