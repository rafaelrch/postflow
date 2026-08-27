-- TASK 1 — Generic workspace reference validation repair.
-- Replaces direct NEW.<field> access with JSONB extraction so the trigger can
-- safely run on tables that do not have every optional relationship column.

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
