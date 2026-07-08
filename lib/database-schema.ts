export const POSTFLOW_DATABASE_SCHEMA = String.raw`
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
  constraint carousels_style_check check (style in ('minimalist', 'profile', 'editorial')),
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
alter table public.carousels add constraint carousels_style_check check (style in ('minimalist', 'profile', 'editorial'));
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
  content_image_url text not null default '',
  content_image_position jsonb,
  background_image_opacity smallint,
  background_color text not null default '#111111',
  shadow_style text not null default 'base',
  shadow_opacity smallint not null default 88,
  shadow_color text,
  shadow_size smallint,
  shadow_distance smallint,
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
  editorial_title_offset_y smallint,
  editorial_desc_offset_y smallint,
  editorial_image_offset_y smallint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (carousel_id, position),
  constraint slides_image_type_check check (image_type in ('background', 'grid', 'mixed')),
  constraint slides_text_alignment_check check (text_alignment in ('left', 'center', 'right'))
);

alter table public.slides add column if not exists highlights jsonb not null default '[]'::jsonb;
alter table public.slides add column if not exists shadow_color text;
alter table public.slides add column if not exists shadow_size smallint;
alter table public.slides add column if not exists shadow_distance smallint;
alter table public.slides add column if not exists content_image_url text not null default '';
alter table public.slides add column if not exists content_image_position jsonb;
alter table public.slides add column if not exists background_image_opacity smallint;
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
  constraint templates_style_check check (style in ('minimalist', 'profile', 'editorial'))
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
`.trim();
