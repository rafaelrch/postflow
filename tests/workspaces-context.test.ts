import { describe, expect, it } from 'vitest';
import {
  canWorkspaceRole,
  normalizeWorkspaceSlug,
  resolveWorkspaceSelection,
  type WorkspaceMembership,
} from '@/lib/workspace-context';
import { getWorkspaceContext, isWorkspaceFeatureUnavailableError } from '@/lib/workspaces';

const memberships: WorkspaceMembership[] = [
  { workspaceId: 'workspace-b', name: 'Cliente B', slug: 'cliente-b', status: 'active', role: 'editor', createdAt: '2026-08-02T12:00:00.000Z' },
  { workspaceId: 'workspace-a', name: 'Cliente A', slug: 'cliente-a', status: 'active', role: 'owner', createdAt: '2026-08-01T12:00:00.000Z' },
  { workspaceId: 'workspace-archived', name: 'Arquivo', slug: 'arquivo', status: 'active', role: 'owner', workspaceStatus: 'archived', createdAt: '2026-07-01T12:00:00.000Z' },
  { workspaceId: 'workspace-removed', name: 'Removido', slug: 'removido', status: 'removed', role: 'viewer', createdAt: '2026-06-01T12:00:00.000Z' },
];

describe('workspace context', () => {
  it('normaliza nomes para slugs estáveis e seguros', () => {
    expect(normalizeWorkspaceSlug('  Agência São José / 2026! ')).toBe('agencia-sao-jose-2026');
    expect(normalizeWorkspaceSlug('---')).toBe('workspace');
  });

  it('aceita somente a preferência/cookie que pertence a um workspace ativo permitido', () => {
    expect(resolveWorkspaceSelection({ memberships, preferenceId: 'workspace-b', cookieId: 'workspace-a' }).workspaceId)
      .toBe('workspace-b');
    expect(resolveWorkspaceSelection({ memberships, preferenceId: 'missing', cookieId: 'workspace-b' }).workspaceId)
      .toBe('workspace-b');
    expect(resolveWorkspaceSelection({ memberships, preferenceId: 'workspace-archived', cookieId: 'workspace-b' }).workspaceId)
      .toBe('workspace-b');
  });

  it('usa fallback determinístico e explicita quando não existe contexto', () => {
    expect(resolveWorkspaceSelection({ memberships, preferenceId: null, cookieId: null }).workspaceId)
      .toBe('workspace-a');
    expect(resolveWorkspaceSelection({ memberships: [], preferenceId: null, cookieId: null }))
      .toEqual({ workspaceId: null, state: 'workspace_required' });
  });

  it('escolhe o workspace mais antigo por createdAt mesmo com IDs fora de ordem', () => {
    const outOfOrder: WorkspaceMembership[] = [
      { workspaceId: 'z-workspace-new', name: 'Novo', slug: 'novo', status: 'active', role: 'owner', createdAt: '2026-08-27T12:00:00.000Z' },
      { workspaceId: 'a-workspace-old', name: 'Antigo', slug: 'antigo', status: 'active', role: 'owner', createdAt: '2026-08-26T12:00:00.000Z' },
    ];

    expect(resolveWorkspaceSelection({ memberships: outOfOrder, preferenceId: null, cookieId: null }).workspaceId)
      .toBe('a-workspace-old');
  });

  it('aplica a hierarquia de papéis no servidor', () => {
    expect(canWorkspaceRole('owner', 'manage_members')).toBe(true);
    expect(canWorkspaceRole('admin', 'manage_members')).toBe(true);
    expect(canWorkspaceRole('editor', 'manage_members')).toBe(false);
    expect(canWorkspaceRole('owner', 'write_content')).toBe(true);
    expect(canWorkspaceRole('admin', 'write_content')).toBe(true);
    expect(canWorkspaceRole('editor', 'write_content')).toBe(true);
    expect(canWorkspaceRole('viewer', 'read')).toBe(true);
    expect(canWorkspaceRole('viewer', 'write_content')).toBe(false);
  });

  it('classifica apenas ausência de objetos da Task 1 como rollout legado', () => {
    expect(isWorkspaceFeatureUnavailableError({ code: 'PGRST205', message: "Could not find table 'public.workspace_members' in the schema cache" })).toBe(true);
    expect(isWorkspaceFeatureUnavailableError({ code: 'PGRST202', message: 'Could not find function public.create_workspace_with_context' })).toBe(true);
    expect(isWorkspaceFeatureUnavailableError({ code: '42501', message: 'permission denied for table workspaces' })).toBe(false);
    expect(isWorkspaceFeatureUnavailableError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
  });

  it('retorna estado legacy quando a instalação ainda não tem workspace_members', async () => {
    const supabase = {
      auth: { getUser: async () => ({ data: { user: { id: 'user-legacy' } } }) },
      from: () => ({
        select: () => ({
          eq: async () => ({ data: null, error: { code: 'PGRST205', message: "Could not find table 'public.workspace_members' in the schema cache" } }),
        }),
      }),
    } as never;

    await expect(getWorkspaceContext(supabase)).resolves.toMatchObject({ userId: 'user-legacy', state: 'legacy', memberships: [] });
  });

  it('propaga erros reais em vez de convertê-los em estado legacy', async () => {
    const supabase = {
      auth: { getUser: async () => ({ data: { user: { id: 'user-legacy' } } }) },
      from: () => ({
        select: () => ({
          eq: async () => ({ data: null, error: { code: '42501', message: 'permission denied for table workspace_members' } }),
        }),
      }),
    } as never;

    await expect(getWorkspaceContext(supabase)).rejects.toMatchObject({ code: '42501' });
  });
});
