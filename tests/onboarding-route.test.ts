import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockMaybeSingle, mockProjectSingle, mockUpsert, mockInsert, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockProjectSingle: vi.fn(),
  mockUpsert: vi.fn(),
  mockInsert: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mockGetUser }, from: mockFrom }),
}));

function configureSupabase() {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') return {
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
      upsert: mockUpsert,
    };
    if (table === 'projects') return {
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mockProjectSingle }) }) }),
      insert: mockInsert,
    };
    throw new Error(`Tabela inesperada: ${table}`);
  });
}

async function route() {
  vi.resetModules();
  return import('../app/api/onboarding/route');
}

beforeEach(() => {
  configureSupabase();
  mockMaybeSingle.mockResolvedValue({ data: { onboarding_completed: false }, error: null });
  mockProjectSingle.mockResolvedValue({ data: null, error: null });
  mockUpsert.mockResolvedValue({ error: null });
  mockInsert.mockResolvedValue({ error: null });
});

afterEach(() => vi.clearAllMocks());

describe('PUT /api/onboarding', () => {
  it('retorna 401 sem sessão e não toca nos dados', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const response = await (await route()).PUT(new Request('http://local/api/onboarding', { method: 'PUT', body: '{}' }));
    expect(response.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('deriva o id exclusivamente da sessão, não do corpo enviado pelo cliente', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'usuario-da-sessao' } } });
    const response = await (await route()).PUT(new Request('http://local/api/onboarding', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'usuario-malicioso', brandName: 'Marca', instagramHandle: '@marca', complete: false }) }));
    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'usuario-da-sessao', onboarding_completed: false }));
  });

  it('retorna 422 ao tentar concluir sem nome ou Instagram', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'usuario-da-sessao' } } });
    const response = await (await route()).PUT(new Request('http://local/api/onboarding', { method: 'PUT', body: JSON.stringify({ complete: true, brandName: 'Marca' }) }));
    expect(response.status).toBe(422);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('marca complete somente após persistir obrigatórios e cria o projeto da sessão', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'usuario-da-sessao' } } });
    const response = await (await route()).PUT(new Request('http://local/api/onboarding', { method: 'PUT', body: JSON.stringify({ complete: true, brandName: 'Marca', instagramHandle: '@marca', palette: ['#112233'] }) }));
    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'usuario-da-sessao', onboarding_completed: true, instagram_handle: 'marca' }));
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'usuario-da-sessao', name: 'Marca' }));
  });
});
