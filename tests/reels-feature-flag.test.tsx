// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * Chave REELS_ENABLED (lib/feature-flags.ts). Reels foi DESLIGADO — não
 * apagado. Este arquivo prova as duas metades:
 *
 *   - DESLIGADO: o link some da sidebar, /reels desvia pro /dashboard no
 *     servidor e a rota de upload nega.
 *   - LIGADO: tudo volta a se comportar como antes — a prova de que religar é
 *     trocar um `false` por `true` e nada mais.
 *
 * Cada bloco reimporta os módulos sob teste depois de trocar o mock da chave,
 * porque a constante é lida no topo do módulo (a sidebar monta `navItems` na
 * carga) e um import cacheado congelaria o valor do primeiro teste.
 */

const {
  mockRedirect,
  mockPathname,
  mockGetUser,
  mockSign,
  mockFetchCredits,
} = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockPathname: vi.fn(() => '/dashboard'),
  mockGetUser: vi.fn(),
  mockSign: vi.fn(),
  mockFetchCredits: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  usePathname: mockPathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

// A sidebar busca sessão/perfil/plano no mount; nada disso importa aqui, só
// precisa não explodir. Todas as cadeias terminam numa Promise resolvida.
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      signOut: () => Promise.resolve({}),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null }),
          maybeSingle: () => Promise.resolve({ data: null }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/useCreditsStore', () => ({
  useCreditsStore: (selector: (s: unknown) => unknown) =>
    selector({ balance: 0, fetch: mockFetchCredits }),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    storage: { from: () => ({ createSignedUploadUrl: mockSign }) },
  }),
}));

vi.mock('@/lib/entitlements', () => ({ getEntitlement: async () => 'pro' }));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const MP4 = { mime: 'video/mp4', sizeBytes: 4 * 1024 * 1024 };

function uploadReq(body: unknown): Request {
  return new Request('http://localhost/api/reels/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Troca o valor da chave e devolve os módulos que a consomem, já recarregados. */
async function loadWithFlag(enabled: boolean) {
  vi.resetModules();
  vi.doMock('@/lib/feature-flags', () => ({ REELS_ENABLED: enabled }));
  const AppSidebar = (await import('../components/ui/AppSidebar')).default;
  const ReelsLayout = (await import('../app/(app)/reels/layout')).default;
  const { POST } = await import('../app/api/reels/upload-url/route');
  return { AppSidebar, ReelsLayout, POST };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPathname.mockReturnValue('/dashboard');
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  mockSign.mockResolvedValue({
    data: { path: `${USER_ID}/reels/x.mp4`, token: 'tok', signedUrl: 'https://x/y' },
    error: null,
  });
});

afterEach(() => {
  cleanup();
  vi.doUnmock('@/lib/feature-flags');
});

describe('REELS_ENABLED = false (estado atual: Reels desligado)', () => {
  it('a sidebar não mostra o link de Reels', async () => {
    const { AppSidebar } = await loadWithFlag(false);
    render(<AppSidebar />);

    expect(screen.queryByRole('link', { name: 'Reels' })).toBeNull();
    const hrefs = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain('/reels');
    // Sanidade: a navegação continua de pé, só sem Reels.
    expect(hrefs).toContain('/dashboard');
  });

  it('/reels redireciona pro /dashboard no servidor', async () => {
    const { ReelsLayout } = await loadWithFlag(false);
    ReelsLayout({ children: <div>página de reels</div> });

    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });

  it('POST /api/reels/upload-url responde 404 e não assina nada', async () => {
    const { POST } = await loadWithFlag(false);
    const res = await POST(uploadReq(MP4));

    expect(res.status).toBe(404);
    expect(mockSign).not.toHaveBeenCalled();
    // Corta antes de tudo: nem a sessão é consultada.
    expect(mockGetUser).not.toHaveBeenCalled();
  });
});

describe('REELS_ENABLED = true (prova de que religar é só trocar a chave)', () => {
  it('a sidebar volta a mostrar o link de Reels', async () => {
    const { AppSidebar } = await loadWithFlag(true);
    render(<AppSidebar />);

    const hrefs = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/reels');
  });

  it('/reels renderiza a página, sem redirecionar', async () => {
    const { ReelsLayout } = await loadWithFlag(true);
    const tree = ReelsLayout({ children: <div>página de reels</div> });

    expect(mockRedirect).not.toHaveBeenCalled();
    render(tree);
    expect(screen.getByText('página de reels')).toBeTruthy();
  });

  it('POST /api/reels/upload-url volta a assinar a URL de upload', async () => {
    const { POST } = await loadWithFlag(true);
    const res = await POST(uploadReq(MP4));

    expect(res.status).toBe(200);
    expect(mockSign).toHaveBeenCalled();
  });
});
