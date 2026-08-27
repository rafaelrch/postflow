import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFrom, mockBrandMaybeSingle } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockBrandMaybeSingle: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ from: mockFrom }),
}));
vi.mock('@/lib/workspaces', () => ({
  getWorkspaceContext: vi.fn(async () => ({
    state: 'ready',
    memberships: [{ workspaceId: 'workspace-a', role: 'owner' }],
  })),
  isWorkspaceFeatureUnavailableError: vi.fn(() => false),
}));

describe('GET /api/workspaces/[id]/brand', () => {
  beforeEach(() => {
    mockBrandMaybeSingle.mockResolvedValue({ data: { workspace_id: 'workspace-a', brand_name: 'Marca A', niche: 'Educação' }, error: null });
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: mockBrandMaybeSingle }) }),
    });
  });

  it('carrega somente o contexto do workspace permitido', async () => {
    const { GET } = await import('../app/api/workspaces/[id]/brand/route');
    const response = await GET(new Request('http://local'), { params: Promise.resolve({ id: 'workspace-a' }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ brand: expect.objectContaining({ workspace_id: 'workspace-a' }) }));
    expect(mockFrom).toHaveBeenCalledWith('workspace_brand_context');
  });
});
