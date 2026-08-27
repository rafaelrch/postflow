-- TASK 1 — Workspaces, projetos e contexto por cliente
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

/* Final role reconciliation. Editors/admins may update shared content, while
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

*/
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
create policy workspace_brand_member_read on public.workspace_brand_context for select using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists workspace_brand_editor_write on public.workspace_brand_context;
create policy workspace_brand_editor_write on public.workspace_brand_context for all using (public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id) with check (public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists workspace_preferences_self on public.user_workspace_preferences;
create policy workspace_preferences_self on public.user_workspace_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid() and (active_workspace_id is null or public.is_workspace_member(active_workspace_id)));

drop policy if exists projects_owner on public.projects;
create policy projects_workspace_member on public.projects for all using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists carousels_owner on public.carousels;
create policy carousels_workspace_member on public.carousels for all using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists slides_owner on public.slides;
create policy slides_workspace_member on public.slides for all using (exists (select 1 from public.carousels c where c.id = carousel_id and public.is_workspace_member(c.workspace_id) and public.active_workspace_id(auth.uid()) = c.workspace_id)) with check (exists (select 1 from public.carousels c where c.id = carousel_id and public.is_workspace_member(c.workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = c.workspace_id));
drop policy if exists news_entries_owner on public.news_entries;
create policy news_entries_workspace_member on public.news_entries for all using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists templates_owner_or_system on public.templates;
create policy templates_workspace_read on public.templates for select using (visibility = 'system' or (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id));
drop policy if exists templates_owner_mutation on public.templates;
create policy templates_workspace_mutation on public.templates for all using (public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists assets_owner on public.assets;
create policy assets_workspace_member on public.assets for all using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists scheduled_posts_owner on public.scheduled_posts;
create policy scheduled_posts_workspace_member on public.scheduled_posts for all using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);
drop policy if exists content_relations_owner on public.content_relations;
create policy content_relations_workspace_member on public.content_relations for all using (public.is_workspace_member(workspace_id) and public.active_workspace_id(auth.uid()) = workspace_id) with check (auth.uid() = user_id and public.is_workspace_member(workspace_id, 'editor') and public.active_workspace_id(auth.uid()) = workspace_id);

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
