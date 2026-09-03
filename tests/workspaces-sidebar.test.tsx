// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { mockFetchCredits, mockFetch, mockRouterRefresh } = vi.hoisted(() => ({
  mockFetchCredits: vi.fn(),
  mockFetch: vi.fn(),
  mockRouterRefresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: vi.fn(), refresh: mockRouterRefresh }),
}));

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

vi.mock('@/hooks/useCreditsStore', () => ({
  useCreditsStore: (selector: (state: unknown) => unknown) =>
    selector({ balance: 0, fetch: mockFetchCredits }),
}));

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getSession: () => Promise.resolve({
        data: {
          session: {
            user: {
              id: 'user-1',
              email: 'cliente@creatools.com',
              user_metadata: { name: 'Cliente' },
            },
          },
        },
      }),
      signOut: () => Promise.resolve({}),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => table === 'profiles'
            ? Promise.resolve({ data: { name: 'Cliente', brand_name: null, photo_url: null } })
            : Promise.resolve({ data: null }),
          maybeSingle: () => Promise.resolve({ data: null }),
        }),
      }),
    }),
  }),
}));

function response(body: unknown, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

const memberships = [
  { workspaceId: 'ws-a', name: 'Agência A', slug: 'agencia-a', status: 'active', role: 'owner', workspaceStatus: 'active' },
  { workspaceId: 'ws-b', name: 'Marca B', slug: 'marca-b', status: 'active', role: 'editor', workspaceStatus: 'active' },
];

function workspaceList(activeWorkspaceId = 'ws-a') {
  const activeWorkspace = memberships.find((workspace) => workspace.workspaceId === activeWorkspaceId);
  return {
    state: 'ready',
    activeWorkspace: activeWorkspace
      ? { id: activeWorkspace.workspaceId, owner_id: 'user-1', name: activeWorkspace.name, slug: activeWorkspace.slug, avatar_url: '', status: 'active' }
      : null,
    workspaces: memberships,
  };
}

async function renderSidebar() {
  const { default: AppSidebar } = await import('../components/ui/AppSidebar');
  return render(<AppSidebar />);
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/workspaces') return response(workspaceList());
    return response({});
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('troca de workspace na sidebar', () => {
  it('não exibe um workspace enquanto a lista permitida ainda está carregando', async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<unknown>((resolve) => {
      release = () => resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(workspaceList()),
      });
    });
    mockFetch.mockImplementationOnce(() => pending);

    await renderSidebar();
    expect(screen.queryByTestId('workspace-switcher-trigger')).toBeNull();

    release?.();
    expect(await screen.findByTestId('workspace-switcher-trigger')).toBeTruthy();
  });

  it('carrega somente os workspaces permitidos e indica o ativo', async () => {
    await renderSidebar();

    const trigger = await screen.findByTestId('workspace-switcher-trigger');
    expect(trigger.textContent).toContain('Agência A');

    fireEvent.click(trigger);
    expect(screen.getByTestId('workspace-option-ws-a').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('workspace-option-ws-b').getAttribute('aria-selected')).toBe('false');
    expect(screen.queryByText('workspace-fora-da-lista')).toBeNull();
  });

  it('persiste uma troca somente pelo endpoint seguro do workspace permitido', async () => {
    mockFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/workspaces') return response(workspaceList());
      if (url === '/api/workspaces/ws-b/switch') return response({ workspaceId: 'ws-b' });
      return response({}, 500);
    });

    await renderSidebar();
    fireEvent.click(await screen.findByTestId('workspace-switcher-trigger'));
    fireEvent.click(screen.getByTestId('workspace-option-ws-b'));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-b/switch',
      expect.objectContaining({ method: 'POST' }),
    ));
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('workspace-switcher-trigger').textContent).toContain('Marca B'));
  });

  it('cria um workspace e o ativa após a criação', async () => {
    const created = { id: 'ws-c', owner_id: 'user-1', name: 'Novo Cliente', slug: 'novo-cliente', avatar_url: '', status: 'active' };
    mockFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/workspaces' && options?.method === 'POST') return response({ workspace: created }, 201);
      if (url === '/api/workspaces/ws-c/switch') return response({ workspaceId: 'ws-c' });
      if (url === '/api/workspaces') return response(workspaceList());
      return response({}, 500);
    });

    await renderSidebar();
    fireEvent.click(await screen.findByTestId('workspace-switcher-trigger'));
    fireEvent.click(screen.getByTestId('workspace-create-action'));
    expect(screen.getByTestId('workspace-create-modal')).toBeTruthy();
    fireEvent.change(screen.getByTestId('workspace-name-input'), { target: { value: 'Novo Cliente' } });
    fireEvent.change(screen.getByLabelText('Nome da marca'), { target: { value: 'Marca Nova' } });
    fireEvent.change(screen.getByLabelText('@ Instagram de carrossel'), { target: { value: '@novo' } });
    fireEvent.click(screen.getByTestId('workspace-create-submit'));

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(([url, options]) => url === '/api/workspaces' && options?.method === 'POST');
      expect(call).toBeTruthy();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual(expect.objectContaining({
        name: 'Novo Cliente',
        brandName: 'Marca Nova',
        instagramHandle: '@novo',
      }));
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-c/switch',
      expect.objectContaining({ method: 'POST' }),
    ));
    await waitFor(() => expect(screen.getByTestId('workspace-switcher-trigger').textContent).toContain('Novo Cliente'));
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
  });

  it('preserva as classes estruturais da referência no trigger e no popover', async () => {
    await renderSidebar();
    const trigger = await screen.findByTestId('workspace-switcher-trigger');
    expect(trigger.className).toContain('border-input');
    expect(trigger.className).toContain('bg-background');
    expect(trigger.className).toContain('rounded-md');
    expect(trigger.style.background).toBe('var(--paper)');
    expect(trigger.style.borderColor).toBe('var(--line-strong)');

    fireEvent.click(trigger);
    const content = screen.getByText('Workspaces').parentElement?.parentElement;
    expect(content?.getAttribute('class') ?? '').toContain('w-72');
    expect(content?.getAttribute('class') ?? '').toContain('rounded-md');
    expect(content?.getAttribute('class') ?? '').toContain('shadow-md');
    expect(content?.getAttribute('class') ?? '').toContain('bg-[var(--paper)]');
    expect(content?.getAttribute('class') ?? '').toContain('text-[var(--ink)]');
    expect(content?.getAttribute('class') ?? '').toContain('z-[1000]');
  });

  it('mantém uma ação acessível quando a conta ainda não tem workspace', async () => {
    mockFetch.mockImplementation((url: string) => url === '/api/workspaces'
      ? response({ state: 'workspace_required', activeWorkspace: null, workspaces: [] })
      : response({}, 500));

    await renderSidebar();
    const trigger = await screen.findByTestId('workspace-switcher-trigger');
    expect(trigger.textContent).toContain('Criar workspace');
    fireEvent.click(trigger);
    expect(screen.getByTestId('workspace-create-modal')).toBeTruthy();
  });

  it('expõe erro de carregamento e permite tentar novamente', async () => {
    mockFetch
      .mockImplementationOnce(() => response({ error: 'falha' }, 500))
      .mockImplementationOnce(() => response(workspaceList()));

    await renderSidebar();
    expect((await screen.findByTestId('workspace-error')).textContent).toContain('Não foi possível carregar os workspaces.');
    fireEvent.click(screen.getByTestId('workspace-retry'));
    await waitFor(() => expect(screen.getByTestId('workspace-switcher-trigger').textContent).toContain('Agência A'));
  });
});
