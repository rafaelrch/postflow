
-- ============================================================
-- PostFlow / Creatools - Supabase schema
-- Safe to run more than once. It creates or evolves the database
-- without dropping user content.
-- ============================================================

create extension if not exists pgcrypto;

-- Utility trigger for updated_at columns
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- User profile created automatically after Supabase auth signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, handle, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'handle', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Profiles / onboarding
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  handle text not null default '',
  phone text not null default '',
  photo_url text not null default '',
  workspace_name text not null default 'Meu workspace',
  brand_name text not null default '',
  instagram_handle text not null default '',
  news_instagram_handle text not null default '',
  twitter_handle text not null default '',
  brand_palette jsonb not null default '[]'::jsonb,
  brand_logo_url text not null default '',
  brand_story text not null default '',
  audience_pains text not null default '',
  niche text not null default '',
  audience text not null default '',
  default_tone text not null default '',
  visual_preference text not null default '',
  goals jsonb not null default '[]'::jsonb,
  referral_source text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists phone text not null default '';
alter table public.profiles add column if not exists workspace_name text not null default 'Meu workspace';
alter table public.profiles add column if not exists brand_name text not null default '';
alter table public.profiles add column if not exists instagram_handle text not null default '';
alter table public.profiles add column if not exists news_instagram_handle text not null default '';
alter table public.profiles add column if not exists twitter_handle text not null default '';
alter table public.profiles add column if not exists brand_palette jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists brand_logo_url text not null default '';
alter table public.profiles add column if not exists brand_story text not null default '';
alter table public.profiles add column if not exists audience_pains text not null default '';
alter table public.profiles add column if not exists niche text not null default '';
alter table public.profiles add column if not exists audience text not null default '';
alter table public.profiles add column if not exists default_tone text not null default '';
alter table public.profiles add column if not exists visual_preference text not null default '';
alter table public.profiles add column if not exists goals jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists onboarding_completed boolean not null default false;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- Projects / workspaces
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Novo projeto',
  description text not null default '',
  niche text not null default '',
  audience text not null default '',
  default_tone text not null default '',
  objectives jsonb not null default '[]'::jsonb,
  brand_voice jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_status_check check (status in ('active', 'archived'))
);

-- Carousels
create table if not exists public.carousels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  template_id uuid,
  title text not null default 'Novo Carrossel',
  description text not null default '',
  style text not null default 'minimalist',
  status text not null default 'draft',
  source_kind text,
  source_id uuid,
  theme text not null default 'dark',
  font_pair text not null default 'SF Pro Display + IvyOra Text',
  accent_color text not null default '#00CFFF',
  corners jsonb not null default '{}'::jsonb,
  profile_badge jsonb not null default '{}'::jsonb,
  global_settings jsonb not null default '{}'::jsonb,
  caption text not null default '',
  hashtags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carousels_style_check check (style in ('minimalist', 'profile', 'editorial', 'template01', 'template02', 'template03')),
  constraint carousels_status_check check (status in ('draft', 'ready', 'published', 'archived')),
  constraint carousels_theme_check check (theme in ('dark', 'light'))
);

alter table public.carousels add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.carousels add column if not exists template_id uuid;
alter table public.carousels add column if not exists description text not null default '';
alter table public.carousels add column if not exists status text not null default 'draft';
alter table public.carousels add column if not exists source_kind text;
alter table public.carousels add column if not exists source_id uuid;
alter table public.carousels add column if not exists global_settings jsonb not null default '{}'::jsonb;
alter table public.carousels add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.carousels add column if not exists archived_at timestamptz;
alter table public.carousels add column if not exists published_at timestamptz;

alter table public.carousels drop constraint if exists carousels_style_check;
alter table public.carousels add constraint carousels_style_check check (style in ('minimalist', 'profile', 'editorial', 'template01', 'template02', 'template03'));
alter table public.carousels drop constraint if exists carousels_status_check;
alter table public.carousels add constraint carousels_status_check check (status in ('draft', 'ready', 'published', 'archived'));
alter table public.carousels drop constraint if exists carousels_theme_check;
alter table public.carousels add constraint carousels_theme_check check (theme in ('dark', 'light'));

-- Slides
create table if not exists public.slides (
  id uuid primary key default gen_random_uuid(),
  carousel_id uuid not null references public.carousels(id) on delete cascade,
  position smallint not null default 0,
  title text not null default '',
  description text not null default '',
  subtitle text not null default '',
  highlight_word text not null default '',
  highlights jsonb not null default '[]'::jsonb,
  background_image_url text not null default '',
  grid_image_url text not null default '',
  image_type text not null default 'grid',
  image_position jsonb not null default '{"x":50,"y":50,"zoom":175}'::jsonb,
  background_color text not null default '#111111',
  shadow_style text not null default 'base',
  shadow_opacity smallint not null default 88,
  shadow_color text,
  shadow_size smallint,
  text_position text not null default 'bottom-left',
  text_offset jsonb,
  text_alignment text not null default 'left',
  font_size jsonb not null default '{"title":48,"description":18}'::jsonb,
  line_height real not null default 1.2,
  cta_button jsonb not null default '{"show":false}'::jsonb,
  title_color text,
  description_color text,
  subtitle_color text,
  title_font text,
  description_font text,
  subtitle_font text,
  title_underline boolean,
  description_underline boolean,
  subtitle_underline boolean,
  title_letter_spacing real,
  title_description_gap smallint,
  text_padding jsonb,
  content_layout text,
  template_slots jsonb,
  template_overrides jsonb,
  -- TEMPLATE 1: estilo por SLOT de texto ({"s2.body": {"color": "#F00"}}).
  template_slot_styles jsonb,
  -- TEMPLATE 1: qual dos 6 modelos do spec o slide desenha. NULL nos outros
  -- estilos e em todo deck salvo antes da coluna (aí o modelo sai da posicao).
  template_model smallint,
  editorial_title_offset_y smallint,
  editorial_desc_offset_y smallint,
  editorial_image_offset_y smallint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (carousel_id, position),
  constraint slides_image_type_check check (image_type in ('background', 'grid', 'mixed')),
  constraint slides_text_alignment_check check (text_alignment in ('left', 'center', 'right')),
  constraint slides_template_model_check check (template_model is null or template_model between 1 and 6)
);

alter table public.slides add column if not exists highlights jsonb not null default '[]'::jsonb;
alter table public.slides add column if not exists shadow_color text;
alter table public.slides add column if not exists shadow_size smallint;
alter table public.slides add column if not exists title_color text;
alter table public.slides add column if not exists description_color text;
alter table public.slides add column if not exists subtitle_color text;
alter table public.slides add column if not exists title_font text;
alter table public.slides add column if not exists description_font text;
alter table public.slides add column if not exists subtitle_font text;
alter table public.slides add column if not exists title_underline boolean;
alter table public.slides add column if not exists description_underline boolean;
alter table public.slides add column if not exists subtitle_underline boolean;
alter table public.slides add column if not exists title_letter_spacing real;
alter table public.slides add column if not exists title_description_gap smallint;
alter table public.slides add column if not exists text_padding jsonb;
alter table public.slides add column if not exists content_layout text;
alter table public.slides add column if not exists template_slots jsonb;
alter table public.slides add column if not exists template_overrides jsonb;
alter table public.slides add column if not exists template_slot_styles jsonb;
alter table public.slides add column if not exists template_model smallint;
alter table public.slides add column if not exists editorial_title_offset_y smallint;
alter table public.slides add column if not exists editorial_desc_offset_y smallint;
alter table public.slides add column if not exists editorial_image_offset_y smallint;
alter table public.slides add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.slides add column if not exists updated_at timestamptz not null default now();

-- News/editorial posts
create table if not exists public.news_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null default '',
  topic text not null default '',
  description text not null default '',
  source_url text not null default '',
  image_url text not null default '',
  local_image_url text not null default '',
  caption text not null default '',
  hashtags text[] not null default '{}',
  raw_payload jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  related_carousel_id uuid references public.carousels(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_entries_status_check check (status in ('draft', 'ready', 'published', 'archived'))
);

-- Templates
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  name text not null default 'Novo template',
  description text not null default '',
  category text not null default 'general',
  kind text not null default 'carousel',
  visibility text not null default 'private',
  style text not null default 'minimalist',
  preview_image_url text not null default '',
  global_settings jsonb not null default '{}'::jsonb,
  slide_blueprint jsonb not null default '[]'::jsonb,
  content_schema jsonb not null default '{}'::jsonb,
  is_favorite boolean not null default false,
  usage_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint templates_kind_check check (kind in ('carousel', 'slide', 'news')),
  constraint templates_visibility_check check (visibility in ('private', 'system')),
  constraint templates_style_check check (style in ('minimalist', 'profile', 'editorial', 'template01', 'template02', 'template03'))
);

-- Asset library
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  name text not null default '',
  kind text not null default 'image',
  bucket text not null default 'postflow-assets',
  storage_path text not null default '',
  public_url text not null default '',
  mime_type text not null default '',
  size_bytes bigint,
  width integer,
  height integer,
  alt text not null default '',
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_kind_check check (kind in ('image', 'background', 'cover', 'logo', 'font', 'other'))
);

-- Editorial calendar
create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  scheduled_at timestamptz not null,
  kind text not null default 'note',
  title text not null default '',
  note text not null default '',
  carousel_id uuid references public.carousels(id) on delete set null,
  news_entry_id uuid references public.news_entries(id) on delete set null,
  status text not null default 'planned',
  channel text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_posts_kind_check check (kind in ('carousel', 'news', 'note')),
  constraint scheduled_posts_status_check check (status in ('planned', 'ready', 'published', 'skipped'))
);

alter table public.scheduled_posts add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.scheduled_posts add column if not exists news_entry_id uuid references public.news_entries(id) on delete set null;
alter table public.scheduled_posts add column if not exists channel text not null default '';
alter table public.scheduled_posts add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.scheduled_posts drop constraint if exists scheduled_posts_kind_check;
alter table public.scheduled_posts add constraint scheduled_posts_kind_check check (kind in ('carousel', 'news', 'note'));
alter table public.scheduled_posts drop constraint if exists scheduled_posts_status_check;
alter table public.scheduled_posts add constraint scheduled_posts_status_check check (status in ('planned', 'ready', 'published', 'skipped'));

-- Relationships between formats (news -> carousel, carousel -> thread, etc.)
create table if not exists public.content_relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  relation_type text not null default 'derived_from',
  created_at timestamptz not null default now(),
  constraint content_relations_source_type_check check (source_type in ('carousel', 'news', 'template', 'asset', 'project')),
  constraint content_relations_target_type_check check (target_type in ('carousel', 'news', 'template', 'asset', 'project'))
);

-- Triggers
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists set_profiles_updated on public.profiles;
create trigger set_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists set_projects_updated on public.projects;
create trigger set_projects_updated before update on public.projects for each row execute function public.set_updated_at();
drop trigger if exists set_carousels_updated on public.carousels;
create trigger set_carousels_updated before update on public.carousels for each row execute function public.set_updated_at();
drop trigger if exists set_slides_updated on public.slides;
create trigger set_slides_updated before update on public.slides for each row execute function public.set_updated_at();
drop trigger if exists set_news_entries_updated on public.news_entries;
create trigger set_news_entries_updated before update on public.news_entries for each row execute function public.set_updated_at();
drop trigger if exists set_templates_updated on public.templates;
create trigger set_templates_updated before update on public.templates for each row execute function public.set_updated_at();
drop trigger if exists set_assets_updated on public.assets;
create trigger set_assets_updated before update on public.assets for each row execute function public.set_updated_at();
drop trigger if exists set_scheduled_posts_updated on public.scheduled_posts;
create trigger set_scheduled_posts_updated before update on public.scheduled_posts for each row execute function public.set_updated_at();

-- Indexes
create index if not exists idx_projects_user_updated on public.projects (user_id, updated_at desc);
create index if not exists idx_carousels_user_updated on public.carousels (user_id, updated_at desc);
create index if not exists idx_carousels_project_updated on public.carousels (project_id, updated_at desc);
create index if not exists idx_slides_carousel_position on public.slides (carousel_id, position asc);
create index if not exists idx_news_entries_user_created on public.news_entries (user_id, created_at desc);
create index if not exists idx_news_entries_project_created on public.news_entries (project_id, created_at desc);
create index if not exists idx_templates_user_kind on public.templates (user_id, kind, updated_at desc);
create index if not exists idx_assets_user_kind on public.assets (user_id, kind, created_at desc);
create index if not exists idx_scheduled_posts_user_when on public.scheduled_posts (user_id, scheduled_at asc);
create index if not exists idx_scheduled_posts_project_when on public.scheduled_posts (project_id, scheduled_at asc);
create index if not exists idx_content_relations_user_source on public.content_relations (user_id, source_type, source_id);

-- RLS
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.carousels enable row level security;
alter table public.slides enable row level security;
alter table public.news_entries enable row level security;
alter table public.templates enable row level security;
alter table public.assets enable row level security;
alter table public.scheduled_posts enable row level security;
alter table public.content_relations enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists projects_owner on public.projects;
create policy projects_owner on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists carousels_owner on public.carousels;
create policy carousels_owner on public.carousels
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists slides_owner on public.slides;
create policy slides_owner on public.slides
  for all using (
    auth.uid() = (select c.user_id from public.carousels c where c.id = carousel_id)
  )
  with check (
    auth.uid() = (select c.user_id from public.carousels c where c.id = carousel_id)
  );

drop policy if exists news_entries_owner on public.news_entries;
create policy news_entries_owner on public.news_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists templates_owner_or_system on public.templates;
create policy templates_owner_or_system on public.templates
  for select using (visibility = 'system' or auth.uid() = user_id);

drop policy if exists templates_owner_mutation on public.templates;
create policy templates_owner_mutation on public.templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists assets_owner on public.assets;
create policy assets_owner on public.assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists scheduled_posts_owner on public.scheduled_posts;
create policy scheduled_posts_owner on public.scheduled_posts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists content_relations_owner on public.content_relations;
create policy content_relations_owner on public.content_relations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Storage bucket for the asset library
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'postflow-assets',
  'postflow-assets',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists postflow_assets_read on storage.objects;
create policy postflow_assets_read on storage.objects
  for select using (bucket_id = 'postflow-assets');

drop policy if exists postflow_assets_insert on storage.objects;
create policy postflow_assets_insert on storage.objects
  for insert with check (
    bucket_id = 'postflow-assets'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists postflow_assets_update on storage.objects;
create policy postflow_assets_update on storage.objects
  for update using (
    bucket_id = 'postflow-assets'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'postflow-assets'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists postflow_assets_delete on storage.objects;
create policy postflow_assets_delete on storage.objects
  for delete using (
    bucket_id = 'postflow-assets'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
--
-- Reaplica as policies de conteúdo com o contexto ativo como segunda fronteira.
drop policy if exists projects_workspace_member on public.projects;
create policy projects_workspace_member on public.projects for all using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists carousels_workspace_member on public.carousels;
create policy carousels_workspace_member on public.carousels for all using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists slides_workspace_member on public.slides;
create policy slides_workspace_member on public.slides for all using (exists (select 1 from public.carousels c where c.id = carousel_id and public.is_workspace_member(c.workspace_id) and public.active_workspace_id(auth.uid()) = c.workspace_id)) with check (exists (select 1 from public.carousels c where c.id = carousel_id and public.is_workspace_member(c.workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = c.workspace_id));
drop policy if exists news_entries_workspace_member on public.news_entries;
create policy news_entries_workspace_member on public.news_entries for all using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists templates_workspace_read on public.templates;
create policy templates_workspace_read on public.templates for select using (visibility = 'system' or (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id));
drop policy if exists templates_workspace_mutation on public.templates;
create policy templates_workspace_mutation on public.templates for all using (public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists assets_workspace_member on public.assets;
create policy assets_workspace_member on public.assets for all using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists scheduled_posts_workspace_member on public.scheduled_posts;
create policy scheduled_posts_workspace_member on public.scheduled_posts for all using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists content_relations_workspace_member on public.content_relations;
create policy content_relations_workspace_member on public.content_relations for all using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
--
-- Archived workspaces remain manageable for owner/admin; content still requires active context.
create or replace function public.is_workspace_member(
  p_workspace_id uuid,
  p_required_role text default 'viewer'
)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.status = 'active'
      and case p_required_role
        when 'owner' then m.role = 'owner'
        when 'admin' then m.role in ('owner', 'admin')
        when 'editor' then m.role in ('owner', 'admin', 'editor')
        else m.role in ('owner', 'admin', 'editor', 'viewer')
      end
  );
$$;
--
create or replace function public.validate_workspace_references()
returns trigger language plpgsql security definer set search_path = public
as $$
declare referenced_workspace uuid;
begin
  if new.project_id is not null then
    select workspace_id into referenced_workspace from public.projects where id = new.project_id;
    if referenced_workspace is distinct from new.workspace_id then raise exception 'project_workspace_mismatch'; end if;
  end if;
  if tg_table_name = 'scheduled_posts' and new.carousel_id is not null then
    select workspace_id into referenced_workspace from public.carousels where id = new.carousel_id;
    if referenced_workspace is distinct from new.workspace_id then raise exception 'carousel_workspace_mismatch'; end if;
  end if;
  if tg_table_name = 'scheduled_posts' and new.news_entry_id is not null then
    select workspace_id into referenced_workspace from public.news_entries where id = new.news_entry_id;
    if referenced_workspace is distinct from new.workspace_id then raise exception 'news_workspace_mismatch'; end if;
  end if;
  if tg_table_name = 'news_entries' and new.related_carousel_id is not null then
    select workspace_id into referenced_workspace from public.carousels where id = new.related_carousel_id;
    if referenced_workspace is distinct from new.workspace_id then raise exception 'related_carousel_workspace_mismatch'; end if;
  end if;
  if tg_table_name = 'content_relations' then
    if new.source_type = 'project' then select workspace_id into referenced_workspace from public.projects where id = new.source_id;
    elsif new.source_type = 'carousel' then select workspace_id into referenced_workspace from public.carousels where id = new.source_id;
    elsif new.source_type = 'news' then select workspace_id into referenced_workspace from public.news_entries where id = new.source_id;
    elsif new.source_type = 'template' then select workspace_id into referenced_workspace from public.templates where id = new.source_id;
    elsif new.source_type = 'asset' then select workspace_id into referenced_workspace from public.assets where id = new.source_id;
    end if;
    if referenced_workspace is distinct from new.workspace_id then raise exception 'source_workspace_mismatch'; end if;
    referenced_workspace := null;
    if new.target_type = 'project' then select workspace_id into referenced_workspace from public.projects where id = new.target_id;
    elsif new.target_type = 'carousel' then select workspace_id into referenced_workspace from public.carousels where id = new.target_id;
    elsif new.target_type = 'news' then select workspace_id into referenced_workspace from public.news_entries where id = new.target_id;
    elsif new.target_type = 'template' then select workspace_id into referenced_workspace from public.templates where id = new.target_id;
    elsif new.target_type = 'asset' then select workspace_id into referenced_workspace from public.assets where id = new.target_id;
    end if;
    if referenced_workspace is distinct from new.workspace_id then raise exception 'target_workspace_mismatch'; end if;
  end if;
  return new;
end
$$;
--
-- Keep archived workspaces visible to their members for reactivation.
create or replace function public.is_workspace_member(
  p_workspace_id uuid,
  p_required_role text default 'viewer'
)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.status = 'active'
      and case p_required_role
        when 'owner' then m.role = 'owner'
        when 'admin' then m.role in ('owner', 'admin')
        when 'editor' then m.role in ('owner', 'admin', 'editor')
        else m.role in ('owner', 'admin', 'editor', 'viewer')
      end
  );
$$;


-- Keep archived workspaces visible to their members for reactivation.
create or replace function public.is_workspace_member(
  p_workspace_id uuid,
  p_required_role text default 'viewer'
)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.status = 'active'
      and case p_required_role
        when 'owner' then m.role = 'owner'
        when 'admin' then m.role in ('owner', 'admin')
        when 'editor' then m.role in ('owner', 'admin', 'editor')
        else m.role in ('owner', 'admin', 'editor', 'viewer')
      end
  );
$$;




--

create or replace function public.update_workspace(
  p_workspace_id uuid,
  p_name text default null,
  p_avatar_url text default null,
  p_status text default null
)
returns public.workspaces
language plpgsql security definer set search_path = public
as $$
declare result public.workspaces;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.is_workspace_member(p_workspace_id, 'admin') then raise exception 'workspace_forbidden'; end if;
  if p_status is not null and p_status not in ('active', 'archived') then raise exception 'invalid_workspace_status'; end if;
  update public.workspaces set
    name = coalesce(nullif(left(trim(p_name), 120), ''), name),
    avatar_url = coalesce(left(p_avatar_url, 2048), avatar_url),
    status = coalesce(p_status, status)
  where id = p_workspace_id returning * into result;
  if result.id is null then raise exception 'workspace_not_found'; end if;
  return result;
end
$$;
-- Keep archived workspaces visible to their members for reactivation.
create or replace function public.is_workspace_member(
  p_workspace_id uuid,
  p_required_role text default 'viewer'
)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.status = 'active'
      and case p_required_role
        when 'owner' then m.role = 'owner'
        when 'admin' then m.role in ('owner', 'admin')
        when 'editor' then m.role in ('owner', 'admin', 'editor')
        else m.role in ('owner', 'admin', 'editor', 'viewer')
      end
  );
$$;
+-- TASK 1 — Workspaces, projetos e contexto por cliente
-- Expand -> backfill -> enforce. Esta migration é aditiva e idempotente.

create extension if not exists unaccent;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Meu workspace',
  slug text not null default 'workspace',
  avatar_url text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_status_check check (status in ('active', 'archived'))
);
create unique index if not exists workspaces_owner_slug_key on public.workspaces(owner_id, slug);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  constraint workspace_members_role_check check (role in ('owner', 'admin', 'editor', 'viewer')),
  constraint workspace_members_status_check check (status in ('invited', 'active', 'removed'))
);

create table if not exists public.workspace_brand_context (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  brand_name text not null default '',
  logo_url text not null default '',
  instagram_handle text not null default '',
  news_instagram_handle text not null default '',
  twitter_handle text not null default '',
  brand_palette jsonb not null default '[]'::jsonb,
  brand_story text not null default '',
  audience_pains text not null default '',
  niche text not null default '',
  audience text not null default '',
  default_tone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_workspace_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_workspace_id uuid references public.workspaces(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists first_name text not null default '';
alter table public.profiles add column if not exists last_name text not null default '';
alter table public.profiles add column if not exists professional_profile text not null default '';
alter table public.profiles add column if not exists referral_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_referral_source_check'
  ) then
    alter table public.profiles add constraint profiles_referral_source_check check (
      referral_source is null or referral_source in (
        'twitter_x', 'youtube', 'google_search', 'instagram',
        'tiktok', 'facebook', 'reddit', 'hacker_news'
      )
    );
  end if;
end
$$;

alter table public.projects add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.carousels add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.news_entries add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.templates add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.assets add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.scheduled_posts add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.content_relations add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

do $$
begin
  if to_regclass('public.reels') is not null then
    execute 'alter table public.reels add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade';
  end if;
end
$$;

create or replace function public.workspace_slug(p_name text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(unaccent(coalesce(p_name, 'workspace'))), '[^a-z0-9]+', '-', 'g')), ''), 'workspace');
$$;

create or replace function public.is_workspace_member(
  p_workspace_id uuid,
  p_required_role text default 'viewer'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and w.status = 'active'
      and case p_required_role
        when 'owner' then m.role = 'owner'
        when 'admin' then m.role in ('owner', 'admin')
        when 'editor' then m.role in ('owner', 'admin', 'editor')
        else m.role in ('owner', 'admin', 'editor', 'viewer')
      end
  );
$$;

create or replace function public.active_workspace_id(p_user_id uuid default auth.uid())
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.active_workspace_id
      from public.user_workspace_preferences p
      join public.workspace_members m on m.workspace_id = p.active_workspace_id and m.user_id = p_user_id
      join public.workspaces w on w.id = p.active_workspace_id
      where p.user_id = p_user_id and m.status = 'active' and w.status = 'active'
    ),
    (
      select m.workspace_id
      from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
      where m.user_id = p_user_id and m.status = 'active' and w.status = 'active'
      order by m.workspace_id limit 1
    )
  );
$$;

create or replace function public.set_workspace_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists set_workspaces_updated on public.workspaces;
create trigger set_workspaces_updated before update on public.workspaces for each row execute function public.set_workspace_updated_at();
drop trigger if exists set_workspace_members_updated on public.workspace_members;
create trigger set_workspace_members_updated before update on public.workspace_members for each row execute function public.set_workspace_updated_at();
drop trigger if exists set_workspace_brand_updated on public.workspace_brand_context;
create trigger set_workspace_brand_updated before update on public.workspace_brand_context for each row execute function public.set_workspace_updated_at();
drop trigger if exists set_workspace_preferences_updated on public.user_workspace_preferences;
create trigger set_workspace_preferences_updated before update on public.user_workspace_preferences for each row execute function public.set_workspace_updated_at();

-- Backfill de uma conta existente; nenhum campo legado é removido.
do $$
declare u record; w_id uuid; w_name text; w_slug text;
begin
  for u in
    select a.id, coalesce(nullif(p.workspace_name, ''), nullif(p.brand_name, ''), 'Meu workspace') as name,
      p.brand_name, p.brand_logo_url, p.instagram_handle, p.news_instagram_handle,
      p.twitter_handle, p.brand_palette, p.brand_story, p.audience_pains,
      p.niche, p.audience, p.default_tone
    from auth.users a left join public.profiles p on p.id = a.id
  loop
    select w.id into w_id from public.workspaces w
    where w.owner_id = u.id order by w.created_at, w.id limit 1;
    if w_id is null then
      w_name := left(coalesce(u.name, 'Meu workspace'), 120);
      w_slug := public.workspace_slug(w_name);
      if exists (select 1 from public.workspaces where owner_id = u.id and slug = w_slug) then
        w_slug := left(w_slug, 70) || '-' || substr(md5(u.id::text), 1, 8);
      end if;
      insert into public.workspaces(owner_id, name, slug)
      values (u.id, w_name, w_slug) returning id into w_id;
    end if;
    insert into public.workspace_members(workspace_id, user_id, role, status)
    values (w_id, u.id, 'owner', 'active')
    on conflict (workspace_id, user_id) do update set role = 'owner', status = 'active';
    insert into public.workspace_brand_context(
      workspace_id, brand_name, logo_url, instagram_handle, news_instagram_handle,
      twitter_handle, brand_palette, brand_story, audience_pains, niche, audience, default_tone
    ) values (
      w_id, coalesce(u.brand_name, ''), coalesce(u.brand_logo_url, ''),
      coalesce(u.instagram_handle, ''), coalesce(u.news_instagram_handle, ''),
      coalesce(u.twitter_handle, ''), coalesce(u.brand_palette, '[]'::jsonb),
      coalesce(u.brand_story, ''), coalesce(u.audience_pains, ''),
      coalesce(u.niche, ''), coalesce(u.audience, ''), coalesce(u.default_tone, '')
    ) on conflict (workspace_id) do nothing;
    insert into public.user_workspace_preferences(user_id, active_workspace_id)
    values (u.id, w_id) on conflict (user_id) do nothing;
  end loop;
end
$$;

update public.projects p set workspace_id = w.id
from public.workspaces w where p.workspace_id is null and w.owner_id = p.user_id;
update public.carousels c set workspace_id = coalesce(
  (select p.workspace_id from public.projects p where p.id = c.project_id and p.user_id = c.user_id),
  w.id
)
from public.workspaces w
where c.workspace_id is null and w.owner_id = c.user_id;
update public.news_entries n set workspace_id = coalesce(
  (select p.workspace_id from public.projects p where p.id = n.project_id and p.user_id = n.user_id),
  w.id
)
from public.workspaces w
where n.workspace_id is null and w.owner_id = n.user_id;
update public.templates t set workspace_id = coalesce(
  (select p.workspace_id from public.projects p where p.id = t.project_id and p.user_id = t.user_id),
  w.id
)
from public.workspaces w
where t.workspace_id is null and t.user_id is not null and w.owner_id = t.user_id and t.visibility <> 'system';
update public.assets a set workspace_id = coalesce(
  (select p.workspace_id from public.projects p where p.id = a.project_id and p.user_id = a.user_id),
  w.id
)
from public.workspaces w
where a.workspace_id is null and w.owner_id = a.user_id;
update public.scheduled_posts s set workspace_id = coalesce(
  (select p.workspace_id from public.projects p where p.id = s.project_id and p.user_id = s.user_id),
  (select c.workspace_id from public.carousels c where c.id = s.carousel_id and c.user_id = s.user_id),
  (select n.workspace_id from public.news_entries n where n.id = s.news_entry_id and n.user_id = s.user_id),
  w.id
)
from public.workspaces w
where s.workspace_id is null and w.owner_id = s.user_id;
update public.content_relations r set workspace_id = w.id
from public.workspaces w where r.workspace_id is null and w.owner_id = r.user_id;

do $$
begin
  if to_regclass('public.reels') is not null then
    execute 'update public.reels r set workspace_id = w.id from public.workspaces w where r.workspace_id is null and w.owner_id = r.user_id';
  end if;
end
$$;

create or replace function public.assign_active_workspace()
returns trigger language plpgsql security definer set search_path = public
as $$
declare resolved uuid;
begin
  if tg_op = 'UPDATE' and old.workspace_id is distinct from new.workspace_id then
    raise exception 'workspace_id cannot be changed';
  end if;
  if new.user_id is not null and new.user_id <> auth.uid() then
    raise exception 'user_id must match the authenticated user';
  end if;
  if new.workspace_id is null then
    resolved := public.active_workspace_id(auth.uid());
    if resolved is null then raise exception 'workspace_required'; end if;
    new.workspace_id := resolved;
  end if;
  if not public.is_workspace_member(new.workspace_id, 'editor') then
    raise exception 'workspace_forbidden';
  end if;
  return new;
end
$$;

create or replace function public.validate_workspace_references()
returns trigger language plpgsql security definer set search_path = public
as $$
declare referenced_workspace uuid;
begin
  if new.project_id is not null then
    select workspace_id into referenced_workspace from public.projects where id = new.project_id;
    if referenced_workspace is distinct from new.workspace_id then raise exception 'project_workspace_mismatch'; end if;
  end if;
  if tg_table_name = 'scheduled_posts' and new.carousel_id is not null then
    select workspace_id into referenced_workspace from public.carousels where id = new.carousel_id;
    if referenced_workspace is distinct from new.workspace_id then raise exception 'carousel_workspace_mismatch'; end if;
  end if;
  if tg_table_name = 'scheduled_posts' and new.news_entry_id is not null then
    select workspace_id into referenced_workspace from public.news_entries where id = new.news_entry_id;
    if referenced_workspace is distinct from new.workspace_id then raise exception 'news_workspace_mismatch'; end if;
  end if;
  if tg_table_name = 'news_entries' and new.related_carousel_id is not null then
    select workspace_id into referenced_workspace from public.carousels where id = new.related_carousel_id;
    if referenced_workspace is distinct from new.workspace_id then raise exception 'related_carousel_workspace_mismatch'; end if;
  end if;
  return new;
end
$$;

do $$
declare t text;
begin
  foreach t in array array['projects','carousels','news_entries','templates','assets','scheduled_posts','content_relations'] loop
    execute format('drop trigger if exists assign_active_workspace on public.%I', t);
    execute format('create trigger assign_active_workspace before insert or update on public.%I for each row execute function public.assign_active_workspace()', t);
    execute format('drop trigger if exists validate_workspace_references on public.%I', t);
    execute format('create trigger validate_workspace_references before insert or update on public.%I for each row execute function public.validate_workspace_references()', t);
  end loop;
  if to_regclass('public.reels') is not null then
    execute 'drop trigger if exists assign_active_workspace on public.reels';
    execute 'create trigger assign_active_workspace before insert or update on public.reels for each row execute function public.assign_active_workspace()';
  end if;
end
$$;

create index if not exists idx_workspace_members_user on public.workspace_members(user_id, status);
create index if not exists idx_workspace_members_workspace on public.workspace_members(workspace_id, status, role);
create index if not exists idx_projects_workspace_updated on public.projects(workspace_id, updated_at desc);
create index if not exists idx_carousels_workspace_updated on public.carousels(workspace_id, updated_at desc);
create index if not exists idx_news_entries_workspace_created on public.news_entries(workspace_id, created_at desc);
create index if not exists idx_templates_workspace_kind on public.templates(workspace_id, kind, updated_at desc);
create index if not exists idx_assets_workspace_kind on public.assets(workspace_id, kind, created_at desc);
create index if not exists idx_scheduled_posts_workspace_when on public.scheduled_posts(workspace_id, scheduled_at asc);
create index if not exists idx_content_relations_workspace_source on public.content_relations(workspace_id, source_type, source_id);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_brand_context enable row level security;
alter table public.user_workspace_preferences enable row level security;

drop policy if exists workspaces_member_read on public.workspaces;
drop policy if exists workspace_members_member_read on public.workspace_members;
drop policy if exists workspace_brand_member_read on public.workspace_brand_context;
drop policy if exists workspace_brand_editor_write on public.workspace_brand_context;
drop policy if exists workspace_preferences_self on public.user_workspace_preferences;
drop policy if exists projects_workspace_member on public.projects;
drop policy if exists carousels_workspace_member on public.carousels;
drop policy if exists slides_workspace_member on public.slides;
drop policy if exists news_entries_workspace_member on public.news_entries;
drop policy if exists templates_workspace_read on public.templates;
drop policy if exists templates_workspace_mutation on public.templates;
drop policy if exists assets_workspace_member on public.assets;
drop policy if exists scheduled_posts_workspace_member on public.scheduled_posts;
drop policy if exists content_relations_workspace_member on public.content_relations;
create policy workspaces_member_read on public.workspaces for select using (public.is_workspace_member(id));
drop policy if exists workspace_members_member_read on public.workspace_members;
create policy workspace_members_member_read on public.workspace_members for select using (public.is_workspace_member(workspace_id) or user_id = auth.uid());
drop policy if exists workspace_brand_member_read on public.workspace_brand_context;
create policy workspace_brand_member_read on public.workspace_brand_context for select using (public.is_workspace_member(workspace_id));
drop policy if exists workspace_brand_editor_write on public.workspace_brand_context;
create policy workspace_brand_editor_write on public.workspace_brand_context for all using (public.is_workspace_member(workspace_id, 'editor')) with check (public.is_workspace_member(workspace_id, 'editor'));
drop policy if exists workspace_preferences_self on public.user_workspace_preferences;
create policy workspace_preferences_self on public.user_workspace_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid() and (active_workspace_id is null or public.is_workspace_member(active_workspace_id)));

drop policy if exists projects_owner on public.projects;
create policy projects_workspace_member on public.projects for all using (public.is_workspace_member(workspace_id)) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor'));
drop policy if exists carousels_owner on public.carousels;
create policy carousels_workspace_member on public.carousels for all using (public.is_workspace_member(workspace_id)) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor'));
drop policy if exists slides_owner on public.slides;
create policy slides_workspace_member on public.slides for all using (exists (select 1 from public.carousels c where c.id = carousel_id and public.is_workspace_member(c.workspace_id))) with check (exists (select 1 from public.carousels c where c.id = carousel_id and public.is_workspace_member(c.workspace_id, 'editor')));
drop policy if exists news_entries_owner on public.news_entries;
create policy news_entries_workspace_member on public.news_entries for all using (public.is_workspace_member(workspace_id)) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor'));
drop policy if exists templates_owner_or_system on public.templates;
create policy templates_workspace_read on public.templates for select using (visibility = 'system' or public.is_workspace_member(workspace_id));
drop policy if exists templates_owner_mutation on public.templates;
create policy templates_workspace_mutation on public.templates for all using (public.is_workspace_member(workspace_id, 'editor')) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor'));
drop policy if exists assets_owner on public.assets;
create policy assets_workspace_member on public.assets for all using (public.is_workspace_member(workspace_id)) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor'));
drop policy if exists scheduled_posts_owner on public.scheduled_posts;
create policy scheduled_posts_workspace_member on public.scheduled_posts for all using (public.is_workspace_member(workspace_id)) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor'));
drop policy if exists content_relations_owner on public.content_relations;
create policy content_relations_workspace_member on public.content_relations for all using (public.is_workspace_member(workspace_id)) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor'));

create or replace function public.create_workspace_with_context(
  p_name text,
  p_brand_context jsonb default '{}'::jsonb
)
returns public.workspaces
language plpgsql security definer set search_path = public
as $$
declare result public.workspaces; base_slug text; candidate_slug text; suffix integer := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'workspace_name_required'; end if;
  base_slug := public.workspace_slug(left(trim(p_name), 120));
  candidate_slug := base_slug;
  while exists (select 1 from public.workspaces where owner_id = auth.uid() and slug = candidate_slug) loop
    suffix := suffix + 1;
    candidate_slug := left(base_slug, 70) || '-' || suffix::text;
  end loop;
  insert into public.workspaces(owner_id, name, slug)
  values (auth.uid(), left(trim(p_name), 120), candidate_slug) returning * into result;
  insert into public.workspace_members(workspace_id, user_id, role, status)
  values (result.id, auth.uid(), 'owner', 'active');
  insert into public.workspace_brand_context(workspace_id, brand_name, logo_url, instagram_handle, news_instagram_handle, twitter_handle, brand_palette, brand_story, audience_pains, niche, audience, default_tone)
  values (
    result.id, left(coalesce(p_brand_context->>'brandName', ''), 120),
    left(coalesce(p_brand_context->>'logoUrl', ''), 2048),
    left(coalesce(p_brand_context->>'instagramHandle', ''), 80),
    left(coalesce(p_brand_context->>'newsInstagramHandle', ''), 80),
    left(coalesce(p_brand_context->>'twitterHandle', ''), 80),
    coalesce(p_brand_context->'palette', '[]'::jsonb),
    left(coalesce(p_brand_context->>'brandStory', ''), 2000),
    left(coalesce(p_brand_context->>'audiencePains', ''), 2000),
    left(coalesce(p_brand_context->>'niche', ''), 2000),
    left(coalesce(p_brand_context->>'audience', ''), 2000),
    left(coalesce(p_brand_context->>'defaultTone', ''), 200)
  );
  insert into public.user_workspace_preferences(user_id, active_workspace_id)
  values (auth.uid(), result.id)
  on conflict (user_id) do update set active_workspace_id = result.id;
  return result;
end
$$;


-- Final reconciliation of the installer mirror: active context and relation
-- checks must be the last definitions loaded by /setup.
create or replace function public.is_workspace_member(
  p_workspace_id uuid,
  p_required_role text default 'viewer'
)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and case p_required_role
        when 'owner' then m.role = 'owner'
        when 'admin' then m.role in ('owner', 'admin')
        when 'editor' then m.role in ('owner', 'admin', 'editor')
        else m.role in ('owner', 'admin', 'editor', 'viewer')
      end
  );
$$;

create or replace function public.validate_workspace_references()
returns trigger language plpgsql security definer set search_path = public
as $$
declare referenced_workspace uuid;
begin
  if new.project_id is not null then
    select workspace_id into referenced_workspace from public.projects where id = new.project_id;
    if referenced_workspace is distinct from new.workspace_id then raise exception 'project_workspace_mismatch'; end if;
  end if;
  if tg_table_name = 'scheduled_posts' and new.carousel_id is not null then
    select workspace_id into referenced_workspace from public.carousels where id = new.carousel_id;
    if referenced_workspace is distinct from new.workspace_id then raise exception 'carousel_workspace_mismatch'; end if;
  end if;
  if tg_table_name = 'scheduled_posts' and new.news_entry_id is not null then
    select workspace_id into referenced_workspace from public.news_entries where id = new.news_entry_id;
    if referenced_workspace is distinct from new.workspace_id then raise exception 'news_workspace_mismatch'; end if;
  end if;
  if tg_table_name = 'news_entries' and new.related_carousel_id is not null then
    select workspace_id into referenced_workspace from public.carousels where id = new.related_carousel_id;
    if referenced_workspace is distinct from new.workspace_id then raise exception 'related_carousel_workspace_mismatch'; end if;
  end if;
  if tg_table_name = 'content_relations' then
    if new.source_type = 'project' then select workspace_id into referenced_workspace from public.projects where id = new.source_id;
    elsif new.source_type = 'carousel' then select workspace_id into referenced_workspace from public.carousels where id = new.source_id;
    elsif new.source_type = 'news' then select workspace_id into referenced_workspace from public.news_entries where id = new.source_id;
    elsif new.source_type = 'template' then select workspace_id into referenced_workspace from public.templates where id = new.source_id;
    elsif new.source_type = 'asset' then select workspace_id into referenced_workspace from public.assets where id = new.source_id;
    end if;
    if referenced_workspace is distinct from new.workspace_id then raise exception 'source_workspace_mismatch'; end if;
    referenced_workspace := null;
    if new.target_type = 'project' then select workspace_id into referenced_workspace from public.projects where id = new.target_id;
    elsif new.target_type = 'carousel' then select workspace_id into referenced_workspace from public.carousels where id = new.target_id;
    elsif new.target_type = 'news' then select workspace_id into referenced_workspace from public.news_entries where id = new.target_id;
    elsif new.target_type = 'template' then select workspace_id into referenced_workspace from public.templates where id = new.target_id;
    elsif new.target_type = 'asset' then select workspace_id into referenced_workspace from public.assets where id = new.target_id;
    end if;
    if referenced_workspace is distinct from new.workspace_id then raise exception 'target_workspace_mismatch'; end if;
  end if;
  return new;
end
$$;

drop policy if exists workspace_brand_member_read on public.workspace_brand_context;
create policy workspace_brand_member_read on public.workspace_brand_context for select
using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists workspace_brand_editor_write on public.workspace_brand_context;
create policy workspace_brand_editor_write on public.workspace_brand_context for all
using (public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id)
with check (public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);

drop policy if exists projects_workspace_member on public.projects;
create policy projects_workspace_member on public.projects for all
using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id)
with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists carousels_workspace_member on public.carousels;
create policy carousels_workspace_member on public.carousels for all
using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id)
with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists slides_workspace_member on public.slides;
create policy slides_workspace_member on public.slides for all
using (exists (select 1 from public.carousels c where c.id = carousel_id and public.is_workspace_member(c.workspace_id) and public.active_workspace_id(auth.uid()) = c.workspace_id))
with check (exists (select 1 from public.carousels c where c.id = carousel_id and public.is_workspace_member(c.workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = c.workspace_id));
drop policy if exists news_entries_workspace_member on public.news_entries;
create policy news_entries_workspace_member on public.news_entries for all
using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id)
with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists templates_workspace_read on public.templates;
create policy templates_workspace_read on public.templates for select
using (visibility = 'system' or (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id));
drop policy if exists templates_workspace_mutation on public.templates;
create policy templates_workspace_mutation on public.templates for all
using (public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id)
with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists assets_workspace_member on public.assets;
create policy assets_workspace_member on public.assets for all
using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id)
with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists scheduled_posts_workspace_member on public.scheduled_posts;
create policy scheduled_posts_workspace_member on public.scheduled_posts for all
using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id)
with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists content_relations_workspace_member on public.content_relations;
create policy content_relations_workspace_member on public.content_relations for all
using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id)
with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);

-- Final role reconciliation. Editors/admins may update shared content, while
-- the author is fixed at insert time and workspace boundaries stay immutable.
create or replace function public.assign_active_workspace()
returns trigger language plpgsql security definer set search_path = public
as $$
declare resolved uuid;
begin
  if tg_op = 'INSERT' then
    if new.user_id is not null and new.user_id <> auth.uid() then
      raise exception 'user_id must match the authenticated user';
    end if;
  elsif new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot be changed';
  end if;
  if tg_op = 'UPDATE' and old.workspace_id is distinct from new.workspace_id then
    raise exception 'workspace_id cannot be changed';
  end if;
  if new.workspace_id is null then
    resolved := public.active_workspace_id(auth.uid());
    if resolved is null then raise exception 'workspace_required'; end if;
    new.workspace_id := resolved;
  end if;
  if not public.is_workspace_member(new.workspace_id, 'editor') then
    raise exception 'workspace_forbidden';
  end if;
  return new;
end
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['projects','carousels','news_entries','assets','scheduled_posts','content_relations','reels'] loop
    if to_regclass(format('public.%I', table_name)) is null then continue; end if;
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_workspace_member', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_workspace_read', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_workspace_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_workspace_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_workspace_delete', table_name);
    execute format('create policy %I on public.%I for select using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id)', table_name || '_workspace_read', table_name);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, ''editor'') and public.active_workspace_id(auth.uid()) = workspace_id)', table_name || '_workspace_insert', table_name);
    execute format('create policy %I on public.%I for update using (public.is_workspace_member(workspace_id, ''editor'') and public.active_workspace_id(auth.uid()) = workspace_id) with check (public.is_workspace_member(workspace_id, ''editor'') and public.active_workspace_id(auth.uid()) = workspace_id)', table_name || '_workspace_update', table_name);
    execute format('create policy %I on public.%I for delete using (public.is_workspace_member(workspace_id, ''editor'') and public.active_workspace_id(auth.uid()) = workspace_id)', table_name || '_workspace_delete', table_name);
  end loop;
end
$$;

alter table public.slides enable row level security;
drop policy if exists slides_owner on public.slides;
drop policy if exists slides_workspace_member on public.slides;
drop policy if exists slides_workspace_read on public.slides;
drop policy if exists slides_workspace_insert on public.slides;
drop policy if exists slides_workspace_update on public.slides;
drop policy if exists slides_workspace_delete on public.slides;
create policy slides_workspace_read on public.slides for select
using (exists (select 1 from public.carousels c where c.id = carousel_id and public.is_workspace_member(c.workspace_id) and public.active_workspace_id(auth.uid()) = c.workspace_id));
create policy slides_workspace_insert on public.slides for insert
with check (exists (select 1 from public.carousels c where c.id = carousel_id and public.is_workspace_member(c.workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = c.workspace_id));
create policy slides_workspace_update on public.slides for update
using (exists (select 1 from public.carousels c where c.id = carousel_id and public.is_workspace_member(c.workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = c.workspace_id))
with check (exists (select 1 from public.carousels c where c.id = carousel_id and public.is_workspace_member(c.workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = c.workspace_id));
create policy slides_workspace_delete on public.slides for delete
using (exists (select 1 from public.carousels c where c.id = carousel_id and public.is_workspace_member(c.workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = c.workspace_id));

alter table public.templates enable row level security;
drop policy if exists templates_owner_or_system on public.templates;
drop policy if exists templates_owner_mutation on public.templates;
drop policy if exists templates_workspace_read on public.templates;
drop policy if exists templates_workspace_member on public.templates;
drop policy if exists templates_workspace_insert on public.templates;
drop policy if exists templates_workspace_update on public.templates;
drop policy if exists templates_workspace_delete on public.templates;
create policy templates_workspace_read on public.templates for select
using (visibility = 'system' or (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id));
create policy templates_workspace_insert on public.templates for insert
with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
create policy templates_workspace_update on public.templates for update
using (public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id)
with check (public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
create policy templates_workspace_delete on public.templates for delete
using (public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);

-- TASK 1 — Security hardening for workspace functions.
-- Privilege-only change: no data or row contents are modified.
revoke execute on function public.is_workspace_member(uuid, text) from public, anon, authenticated;
grant execute on function public.is_workspace_member(uuid, text) to authenticated;
revoke execute on function public.active_workspace_id(uuid) from public, anon, authenticated;
grant execute on function public.active_workspace_id(uuid) to authenticated;
revoke execute on function public.create_workspace_with_context(text, jsonb) from public, anon, authenticated;
grant execute on function public.create_workspace_with_context(text, jsonb) to authenticated;
revoke execute on function public.update_workspace(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.update_workspace(uuid, text, text, text) to authenticated;
revoke execute on function public.assign_active_workspace() from public, anon, authenticated;
revoke execute on function public.validate_workspace_references() from public, anon, authenticated;

-- TASK 1 — Pin search_path for workspace helper functions.
-- Function configuration only; no data or row contents are modified.
alter function public.workspace_slug(text) set search_path = public, pg_temp;
alter function public.set_workspace_updated_at() set search_path = public, pg_temp;

-- TASK 1 — Generic workspace reference validation repair.
create or replace function public.validate_workspace_references()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_data jsonb;
  workspace_id uuid;
  project_id uuid;
  carousel_id uuid;
  news_entry_id uuid;
  related_carousel_id uuid;
  source_type text;
  source_id uuid;
  target_type text;
  target_id uuid;
  referenced_workspace uuid;
begin
  row_data := to_jsonb(new);
  workspace_id := (nullif(row_data->>'workspace_id', ''))::uuid;
  project_id := (nullif(row_data->>'project_id', ''))::uuid;
  carousel_id := (nullif(row_data->>'carousel_id', ''))::uuid;
  news_entry_id := (nullif(row_data->>'news_entry_id', ''))::uuid;
  related_carousel_id := (nullif(row_data->>'related_carousel_id', ''))::uuid;
  source_type := nullif(row_data->>'source_type', '');
  source_id := (nullif(row_data->>'source_id', ''))::uuid;
  target_type := nullif(row_data->>'target_type', '');
  target_id := (nullif(row_data->>'target_id', ''))::uuid;

  if project_id is not null then
    select p.workspace_id into referenced_workspace
    from public.projects p
    where p.id = project_id;
    if referenced_workspace is distinct from workspace_id then raise exception 'project_workspace_mismatch'; end if;
  end if;
  if tg_table_name = 'scheduled_posts' and carousel_id is not null then
    select c.workspace_id into referenced_workspace
    from public.carousels c
    where c.id = carousel_id;
    if referenced_workspace is distinct from workspace_id then raise exception 'carousel_workspace_mismatch'; end if;
  end if;
  if tg_table_name = 'scheduled_posts' and news_entry_id is not null then
    select n.workspace_id into referenced_workspace
    from public.news_entries n
    where n.id = news_entry_id;
    if referenced_workspace is distinct from workspace_id then raise exception 'news_workspace_mismatch'; end if;
  end if;
  if tg_table_name = 'news_entries' and related_carousel_id is not null then
    select c.workspace_id into referenced_workspace
    from public.carousels c
    where c.id = related_carousel_id;
    if referenced_workspace is distinct from workspace_id then raise exception 'related_carousel_workspace_mismatch'; end if;
  end if;
  if tg_table_name = 'content_relations' then
    if source_type = 'project' then select p.workspace_id into referenced_workspace from public.projects p where p.id = source_id;
    elsif source_type = 'carousel' then select c.workspace_id into referenced_workspace from public.carousels c where c.id = source_id;
    elsif source_type = 'news' then select n.workspace_id into referenced_workspace from public.news_entries n where n.id = source_id;
    elsif source_type = 'template' then select t.workspace_id into referenced_workspace from public.templates t where t.id = source_id;
    elsif source_type = 'asset' then select a.workspace_id into referenced_workspace from public.assets a where a.id = source_id;
    end if;
    if referenced_workspace is distinct from workspace_id then raise exception 'source_workspace_mismatch'; end if;
    referenced_workspace := null;
    if target_type = 'project' then select p.workspace_id into referenced_workspace from public.projects p where p.id = target_id;
    elsif target_type = 'carousel' then select c.workspace_id into referenced_workspace from public.carousels c where c.id = target_id;
    elsif target_type = 'news' then select n.workspace_id into referenced_workspace from public.news_entries n where n.id = target_id;
    elsif target_type = 'template' then select t.workspace_id into referenced_workspace from public.templates t where t.id = target_id;
    elsif target_type = 'asset' then select a.workspace_id into referenced_workspace from public.assets a where a.id = target_id;
    end if;
    if referenced_workspace is distinct from workspace_id then raise exception 'target_workspace_mismatch'; end if;
  end if;
  return new;
end
$$;
