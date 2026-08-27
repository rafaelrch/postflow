export const WORKSPACE_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export type WorkspaceMembershipStatus = 'invited' | 'active' | 'removed';
export type WorkspaceStatus = 'active' | 'archived';

export type WorkspaceMembership = {
  workspaceId: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  status: WorkspaceMembershipStatus;
  workspaceStatus?: WorkspaceStatus;
  /** Ordem real de criação do workspace, usada somente para o fallback. */
  createdAt?: string;
};

export type WorkspaceSelection =
  | { workspaceId: string; state: 'ready' }
  | { workspaceId: null; state: 'workspace_required' };

const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 10,
  editor: 20,
  admin: 30,
  owner: 40,
};

const ROLE_REQUIREMENTS = {
  read: 'viewer',
  write_content: 'editor',
  manage_brand: 'editor',
  manage_members: 'admin',
  archive_workspace: 'admin',
  transfer_ownership: 'owner',
} as const satisfies Record<string, WorkspaceRole>;

export type WorkspaceAction = keyof typeof ROLE_REQUIREMENTS;

export function canWorkspaceRole(role: WorkspaceRole, action: WorkspaceAction): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[ROLE_REQUIREMENTS[action]];
}

/** Produz um identificador humano sem transformá-lo em autoridade de tenant. */
export function normalizeWorkspaceSlug(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || 'workspace';
}

function isSelectable(membership: WorkspaceMembership): boolean {
  return membership.status === 'active' && (membership.workspaceStatus ?? 'active') === 'active';
}

/**
 * A preferência persistida é a primeira sugestão; o cookie é somente a
 * segunda. Ambos são validados contra memberships ativos antes de serem usados.
 */
export function resolveWorkspaceSelection(input: {
  memberships: WorkspaceMembership[];
  preferenceId?: string | null;
  cookieId?: string | null;
}): WorkspaceSelection {
  const allowed = input.memberships.filter(isSelectable);
  const preferred = [input.preferenceId, input.cookieId]
    .map((id) => (id ? allowed.find((membership) => membership.workspaceId === id) : undefined))
    .find(Boolean);

  if (preferred) return { workspaceId: preferred.workspaceId, state: 'ready' };

  // A lista recebida pelo contexto vem ordenada pelo banco por created_at. A
  // ordenação explícita aqui também protege consumidores que montam a lista
  // fora da API; em empate, preservamos a ordem recebida e nunca usamos UUID.
  const fallback = [...allowed].sort((a, b) => {
    const aCreatedAt = a.createdAt ? Date.parse(a.createdAt) : Number.NaN;
    const bCreatedAt = b.createdAt ? Date.parse(b.createdAt) : Number.NaN;
    const aHasDate = Number.isFinite(aCreatedAt);
    const bHasDate = Number.isFinite(bCreatedAt);

    if (aHasDate && bHasDate) return aCreatedAt - bCreatedAt;
    if (aHasDate) return -1;
    if (bHasDate) return 1;
    return 0;
  })[0];
  return fallback
    ? { workspaceId: fallback.workspaceId, state: 'ready' }
    : { workspaceId: null, state: 'workspace_required' };
}
