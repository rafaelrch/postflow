-- TASK 1 — Security hardening for workspace functions.
-- Privilege-only change: no data or row contents are modified.

-- Functions used by RLS policies and authenticated application routes.
revoke execute on function public.is_workspace_member(uuid, text) from public, anon, authenticated;
grant execute on function public.is_workspace_member(uuid, text) to authenticated;

revoke execute on function public.active_workspace_id(uuid) from public, anon, authenticated;
grant execute on function public.active_workspace_id(uuid) to authenticated;

revoke execute on function public.create_workspace_with_context(text, jsonb) from public, anon, authenticated;
grant execute on function public.create_workspace_with_context(text, jsonb) to authenticated;

revoke execute on function public.update_workspace(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.update_workspace(uuid, text, text, text) to authenticated;

-- Trigger-only functions. The owning role can still create/use their triggers;
-- no Data API role receives direct EXECUTE access.
revoke execute on function public.assign_active_workspace() from public, anon, authenticated;
revoke execute on function public.validate_workspace_references() from public, anon, authenticated;
