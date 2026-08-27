import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveWorkspaceSelection,
  type WorkspaceMembership,
  type WorkspaceRole,
  type WorkspaceStatus,
} from '@/lib/workspace-context';

export const ACTIVE_WORKSPACE_COOKIE = 'postflow_active_workspace';

export type WorkspaceRecord = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  avatar_url: string;
  status: WorkspaceStatus;
  createdAt?: string;
};

export type WorkspaceContext = {
  userId: string;
  workspace: WorkspaceRecord | null;
  membership: WorkspaceMembership | null;
  memberships: WorkspaceMembership[];
  state: 'ready' | 'workspace_required' | 'legacy';
};

/**
 * Identifica somente a ausência dos objetos da Task 1. Erros de rede,
 * constraint, RLS ou dados inválidos continuam erros reais e não entram no
 * fallback legado.
 */
export function isWorkspaceFeatureUnavailableError(error: unknown): boolean {
  const value = error as { code?: unknown; message?: unknown } | null;
  const code = typeof value?.code === 'string' ? value.code : '';
  const message = typeof value?.message === 'string' ? value.message : String(error ?? '');
  const mentionsWorkspaceObject = /workspace_members|workspace_brand_context|user_workspace_preferences|\bworkspaces\b|create_workspace_with_context|active_workspace_id/i.test(message);
  if (!mentionsWorkspaceObject) return false;
  return ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code)
    || /does not exist|not found|could not find|schema cache/i.test(message);
}

function mapWorkspace(row: Record<string, unknown>): WorkspaceRecord {
  return {
    id: String(row.id),
    owner_id: String(row.owner_id),
    name: String(row.name ?? ''),
    slug: String(row.slug ?? ''),
    avatar_url: String(row.avatar_url ?? ''),
    status: row.status === 'archived' ? 'archived' : 'active',
    createdAt: typeof row.created_at === 'string' ? row.created_at : undefined,
  };
}

export async function getWorkspaceContext(
  supabase: SupabaseClient,
  requestedUserId?: string,
): Promise<WorkspaceContext | { userId: null; workspace: null; membership: null; memberships: []; state: 'unauthorized' }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || (requestedUserId && requestedUserId !== user.id)) {
    return { userId: null, workspace: null, membership: null, memberships: [], state: 'unauthorized' };
  }

  const { data: rawMembershipRows, error: membershipError } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, status')
    .eq('user_id', user.id);
  if (membershipError) {
    if (isWorkspaceFeatureUnavailableError(membershipError)) {
      return { userId: user.id, workspace: null, membership: null, memberships: [], state: 'legacy' };
    }
    throw membershipError;
  }
  const membershipRows = Array.isArray(rawMembershipRows)
    ? rawMembershipRows.filter((row) => row.status === 'active')
    : [];

  const ids = (membershipRows ?? []).map((row) => String(row.workspace_id));
  if (ids.length === 0) {
    return { userId: user.id, workspace: null, membership: null, memberships: [], state: 'workspace_required' };
  }

  const { data: workspaceRows, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id, owner_id, name, slug, avatar_url, status, created_at')
    .in('id', ids)
    .order('created_at', { ascending: true });
  if (workspaceError) {
    if (isWorkspaceFeatureUnavailableError(workspaceError)) {
      return { userId: user.id, workspace: null, membership: null, memberships: [], state: 'legacy' };
    }
    throw workspaceError;
  }

  const byId = new Map((workspaceRows ?? []).map((row) => [String(row.id), mapWorkspace(row as Record<string, unknown>)]));
  const memberships: WorkspaceMembership[] = (membershipRows ?? [])
    .map<WorkspaceMembership | null>((row) => {
      const workspace = byId.get(String(row.workspace_id));
      if (!workspace) return null;
      return {
        workspaceId: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        status: row.status === 'active' ? 'active' : 'removed',
        role: row.role as WorkspaceRole,
        workspaceStatus: workspace.status,
        createdAt: workspace.createdAt,
      };
    })
    .filter((value): value is WorkspaceMembership => value !== null);

  const { data: preference, error: preferenceError } = await supabase
    .from('user_workspace_preferences')
    .select('active_workspace_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (preferenceError) {
    if (isWorkspaceFeatureUnavailableError(preferenceError)) {
      return { userId: user.id, workspace: null, membership: null, memberships: [], state: 'legacy' };
    }
    throw preferenceError;
  }

  const cookieId = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const selection = resolveWorkspaceSelection({
    memberships,
    preferenceId: preference?.active_workspace_id ?? null,
    cookieId,
  });
  const membership = memberships.find((item) => item.workspaceId === selection.workspaceId) ?? null;
  const workspace = selection.workspaceId ? byId.get(selection.workspaceId) ?? null : null;

  return { userId: user.id, workspace, membership, memberships, state: selection.state };
}

export async function requireWorkspaceContext(supabase: SupabaseClient, role: WorkspaceRole = 'viewer') {
  const context = await getWorkspaceContext(supabase);
  if (context.state === 'unauthorized') return { ok: false as const, status: 401, error: 'Não autorizado.' };
  if (context.state === 'legacy') return { ok: false as const, status: 409, error: 'workspace_unavailable' };
  if (context.state === 'workspace_required' || !context.workspace || !context.membership) {
    return { ok: false as const, status: 409, error: 'workspace_required' };
  }
  const allowed = role === 'viewer'
    || (role === 'editor' && ['owner', 'admin', 'editor'].includes(context.membership.role))
    || (role === 'admin' && ['owner', 'admin'].includes(context.membership.role))
    || (role === 'owner' && context.membership.role === 'owner');
  if (!allowed) return { ok: false as const, status: 403, error: 'workspace_forbidden' };
  return { ok: true as const, context };
}

export async function setActiveWorkspaceCookie(id: string) {
  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function createWorkspace(
  supabase: SupabaseClient,
  name: string,
  brandContext: Record<string, unknown> = {},
) {
  const { data, error } = await supabase.rpc('create_workspace_with_context', {
    p_name: name,
    p_brand_context: brandContext,
  }).single();
  if (error) throw error;
  if (!data) throw new Error('Workspace não pôde ser criado');
  return mapWorkspace(data as Record<string, unknown>);
}
