-- 20260727_free_reel_news_limits.sql
--
-- ETAPA 6 / Fatia 4 — Travas de Reels e News no plano free.
--
-- ⚠️ ARQUIVO NOVO — Rafael roda no SQL Editor do Supabase.
--    NÃO altera 20260724/20260725/20260726 (já aplicadas). Idempotente/transacional.
--
-- Decisão do Rafael (25/07, supera a anterior de "Reels/News ilimitados"):
--   • REELS: 1 no TOTAL para free (teto de acervo, como o carrossel).
--   • NEWS:  4 CRIADAS por JANELA DESLIZANTE de 24h para free (limite de
--            criação, não de acervo — o acervo total é livre). Janela deslizante
--            (created_at > now() - 24h), não dia de calendário, para não estourar
--            na virada da meia-noite.
--   • PRO: sem limite em nenhum dos dois.
--
-- Mesmo padrão aprovado do carrossel (enforce_free_carousel_limit): trigger
-- BEFORE INSERT, SECURITY DEFINER com search_path fixo, falha fechada
-- (entitlement não resolvido = free), PRO retorna cedo, NADA é apagado — só
-- recusa o INSERT excedente. Códigos próprios e distintos para a UI diferenciar.

begin;

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
  select plan into v_plan
    from public.user_entitlements
   where user_id = new.user_id;

  if v_plan is null then
    v_plan := 'free';
  end if;

  if v_plan = 'pro' then
    return new;
  end if;

  select count(*) into v_count
    from public.reels
   where user_id = new.user_id;

  if v_count >= 1 then
    raise exception 'free_reel_limit'
      using errcode = 'P0001',
            hint = 'O plano gratuito guarda 1 Reel. Apague o atual ou faça upgrade para criar outro.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_free_reel_limit() from public, anon, authenticated;

drop trigger if exists enforce_free_reel_limit_trg on public.reels;
create trigger enforce_free_reel_limit_trg
  before insert on public.reels
  for each row execute function public.enforce_free_reel_limit();

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
  select plan into v_plan
    from public.user_entitlements
   where user_id = new.user_id;

  if v_plan is null then
    v_plan := 'free';
  end if;

  if v_plan = 'pro' then
    return new;
  end if;

  -- Janela DESLIZANTE de 24h (não dia de calendário). Em INSERT de lote, as
  -- linhas anteriores do mesmo statement já contam (created_at = now(), dentro
  -- da janela), então um lote que ultrapassaria 4 é recusado inteiro.
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

revoke all on function public.enforce_free_news_daily_limit() from public, anon, authenticated;

drop trigger if exists enforce_free_news_daily_limit_trg on public.news_entries;
create trigger enforce_free_news_daily_limit_trg
  before insert on public.news_entries
  for each row execute function public.enforce_free_news_daily_limit();

commit;
