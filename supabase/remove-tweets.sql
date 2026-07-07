-- ============================================================
-- Remove a funcionalidade de Tweets / X do banco (Supabase).
-- Rodar uma vez no SQL Editor. Idempotente.
-- ============================================================

-- 1) Agendamentos de tweets deixam de existir
delete from public.scheduled_posts where kind = 'tweet';
alter table public.scheduled_posts drop column if exists tweet_id;
alter table public.scheduled_posts drop constraint if exists scheduled_posts_kind_check;
alter table public.scheduled_posts add constraint scheduled_posts_kind_check
  check (kind in ('carousel', 'news', 'note'));

-- 2) Referências em news e relações de conteúdo
alter table public.news_entries drop column if exists related_tweet_id;

delete from public.content_relations where source_type = 'tweet' or target_type = 'tweet';
alter table public.content_relations drop constraint if exists content_relations_source_type_check;
alter table public.content_relations add constraint content_relations_source_type_check
  check (source_type in ('carousel', 'news', 'template', 'asset', 'project'));
alter table public.content_relations drop constraint if exists content_relations_target_type_check;
alter table public.content_relations add constraint content_relations_target_type_check
  check (target_type in ('carousel', 'news', 'template', 'asset', 'project'));

-- 3) Templates de tweet
delete from public.templates where kind = 'tweet';
alter table public.templates drop constraint if exists templates_kind_check;
alter table public.templates add constraint templates_kind_check
  check (kind in ('carousel', 'slide', 'news'));

-- 4) A tabela em si (por último, depois que nada mais referencia)
drop table if exists public.tweets cascade;
