-- TASK 1 — Pin search_path for workspace helper functions.
-- Function configuration only; no data or row contents are modified.

alter function public.workspace_slug(text) set search_path = public, pg_temp;
alter function public.set_workspace_updated_at() set search_path = public, pg_temp;
