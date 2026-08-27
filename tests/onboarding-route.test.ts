import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockMaybeSingle, mockProjectSingle, mockWorkspaceMaybeSingle, mockWorkspaceRpc, mockExposeWorkspaceRpc, mockUpsert, mockBrandUpsert, mockInsert, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockProjectSingle: vi.fn(),
  mockWorkspaceMaybeSingle: vi.fn(),
  mockWorkspaceRpc: vi.fn(),
  mockExposeWorkspaceRpc: { value: false },
  mockUpsert: vi.fn(),
  mockBrandUpsert: vi.fn(),
  mockInsert: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    ...(mockExposeWorkspaceRpc.value ? { rpc: mockWorkspaceRpc } : {}),
  }),
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
    if (table === 'workspaces') return {
      select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: mockWorkspaceMaybeSingle }) }) }) }),
    };
    if (table === 'workspace_brand_context') return { upsert: mockBrandUpsert };
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
  mockWorkspaceMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockUpsert.mockResolvedValue({ error: null });
  mockBrandUpsert.mockResolvedValue({ error: null });
  mockInsert.mockResolvedValue({ error: null });
});

afterEach(() => {
  mockExposeWorkspaceRpc.value = false;
  vi.clearAllMocks();
});

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

  it('rejeita referral fora do contrato do dropdown', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'usuario-da-sessao' } } });
    const response = await (await route()).PUT(new Request('http://local/api/onboarding', {
      method: 'PUT',
      body: JSON.stringify({ brandName: 'Marca', referralSource: 'fonte-desconhecida' }),
    }));
    expect(response.status).toBe(422);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('persiste referral sem alterar campos legados de contexto', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'usuario-da-sessao' } } });
    const response = await (await route()).PUT(new Request('http://local/api/onboarding', {
      method: 'PUT',
      body: JSON.stringify({ brandName: 'Marca', referralSource: 'google_search', brandStory: 'legado', audiencePains: 'legado', defaultTone: 'legado' }),
    }));
    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ referral_source: 'google_search', brand_story: 'legado', audience_pains: 'legado', default_tone: 'legado' }));
  });

  it('valida o handle de cada canal selecionado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'usuario-da-sessao' } } });
    const response = await (await route()).PUT(new Request('http://local/api/onboarding', {
      method: 'PUT',
      body: JSON.stringify({
        complete: true,
        brandName: 'Marca',
        selectedChannels: ['instagram_news', 'twitter'],
        newsInstagramHandle: '@noticias',
      }),
    }));
    expect(response.status).toBe(422);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('persiste handles separados e descarta o handle de canal desmarcado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'usuario-da-sessao' } } });
    const response = await (await route()).PUT(new Request('http://local/api/onboarding', {
      method: 'PUT',
      body: JSON.stringify({
        complete: true,
        brandName: 'Marca',
        selectedChannels: ['instagram_news', 'twitter'],
        instagramHandle: '@nao-selecionado',
        newsInstagramHandle: '@noticias',
        twitterHandle: '@twitter',
      }),
    }));
    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
      instagram_handle: '',
      news_instagram_handle: 'noticias',
      twitter_handle: 'twitter',
    }));
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      brand_voice: expect.objectContaining({
        instagramHandle: '',
        newsInstagramHandle: 'noticias',
        twitterHandle: 'twitter',
      }),
    }));
  });

  it('marca complete somente após persistir obrigatórios e cria o projeto da sessão', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'usuario-da-sessao' } } });
    const response = await (await route()).PUT(new Request('http://local/api/onboarding', { method: 'PUT', body: JSON.stringify({ complete: true, workspaceName: 'Cliente A', firstName: 'Ana', lastName: 'Silva', professionalProfile: 'Agência', brandName: 'Marca', instagramHandle: '@marca', palette: ['#112233'] }) }));
    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'usuario-da-sessao', onboarding_completed: true, workspace_name: 'Cliente A', first_name: 'Ana', last_name: 'Silva', professional_profile: 'agency', instagram_handle: 'marca', news_instagram_handle: '' }));
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'usuario-da-sessao', name: 'Marca' }));
  });

  it('separa o perfil do usuário do contexto do workspace após a migration', async () => {
    mockExposeWorkspaceRpc.value = true;
    mockGetUser.mockResolvedValue({ data: { user: { id: 'usuario-da-sessao' } } });
    mockWorkspaceMaybeSingle.mockResolvedValue({ data: { id: 'workspace-a' }, error: null });

    const response = await (await route()).PUT(new Request('http://local/api/onboarding', {
      method: 'PUT',
      body: JSON.stringify({ complete: true, firstName: 'Ana', professionalProfile: 'agency', referralSource: 'instagram', workspaceName: 'Cliente A', brandName: 'Marca A', niche: 'Educação', instagramHandle: '@marca' }),
    }));

    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(expect.not.objectContaining({ brand_name: 'Marca A', workspace_name: 'Cliente A', niche: 'Educação' }));
    expect(mockBrandUpsert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: 'workspace-a', brand_name: 'Marca A', niche: 'Educação' }));
  });

  it('mantém o fluxo legado quando a migration ainda não criou workspaces', async () => {
    mockExposeWorkspaceRpc.value = true;
    mockGetUser.mockResolvedValue({ data: { user: { id: 'usuario-da-sessao' } } });
    mockWorkspaceMaybeSingle.mockResolvedValue({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.workspaces' in the schema cache" } });

    const response = await (await route()).PUT(new Request('http://local/api/onboarding', { method: 'PUT', body: JSON.stringify({ complete: true, brandName: 'Marca', instagramHandle: '@marca' }) }));

    expect(response.status).toBe(200);
    expect(mockWorkspaceRpc).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'usuario-da-sessao' }));
    expect(mockInsert.mock.calls[0][0]).not.toHaveProperty('workspace_id');
  });

  it('não mascara erro real na consulta de rollout do workspace', async () => {
    mockExposeWorkspaceRpc.value = true;
    mockGetUser.mockResolvedValue({ data: { user: { id: 'usuario-da-sessao' } } });
    mockWorkspaceMaybeSingle.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied for table workspaces' } });

    const response = await (await route()).PUT(new Request('http://local/api/onboarding', { method: 'PUT', body: JSON.stringify({ complete: true, brandName: 'Marca', instagramHandle: '@marca' }) }));

    expect(response.status).toBe(500);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('preserva instalação antiga sem colunas pessoais da Task 1', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'usuario-legado' } } });
    mockUpsert
      .mockResolvedValueOnce({ error: { code: '42703', message: 'column first_name does not exist' } })
      .mockResolvedValueOnce({ error: null });

    const response = await (await route()).PUT(new Request('http://local/api/onboarding', { method: 'PUT', body: JSON.stringify({ complete: true, brandName: 'Marca', instagramHandle: '@marca' }) }));

    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockUpsert.mock.calls[1][0]).not.toHaveProperty('first_name');
    expect(mockInsert.mock.calls[0][0]).not.toHaveProperty('workspace_id');
  });
});
