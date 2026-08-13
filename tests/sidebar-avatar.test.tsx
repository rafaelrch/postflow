// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * O badge da conta mostra a FOTO do perfil, com a inicial como rede de
 * segurança. Rede de segurança de verdade cobre TRÊS casos, não um:
 *
 *   1. perfil sem photo_url (null) → inicial;
 *   2. photo_url vazia — a coluna tem default '' → inicial;
 *   3. photo_url preenchida mas a imagem não carrega (link quebrado, bucket
 *      sem permissão) → inicial, via onError.
 *
 * O caso 3 é o que some numa revisão apressada: em ambiente de dev a imagem
 * sempre carrega, e o defeito aparece só no usuário que trocou de bucket.
 */

const { mockFetchCredits, mockProfile } = vi.hoisted(() => ({
  mockFetchCredits: vi.fn(),
  mockProfile: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

vi.mock('@/hooks/useCreditsStore', () => ({
  useCreditsStore: (selector: (s: unknown) => unknown) => selector({ balance: 0, fetch: mockFetchCredits }),
}));

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({
          data: { session: { user: { id: 'u1', email: 'rafael@creatools.com', user_metadata: { name: 'Rafael' } } } },
        }),
      signOut: () => Promise.resolve({}),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => (table === 'profiles' ? Promise.resolve({ data: mockProfile() }) : Promise.resolve({ data: null })),
          maybeSingle: () => Promise.resolve({ data: null }),
        }),
      }),
    }),
  }),
}));

const FOTO = 'https://exemplo.test/storage/profile-photos/rafael.jpg';

async function renderSidebar() {
  const { default: AppSidebar } = await import('../components/ui/AppSidebar');
  return render(<AppSidebar />);
}

/** O badge fica no link de conta; a inicial é o texto dele quando não há foto. */
const badge = () => screen.getByTitle('Ver conta e assinatura').querySelector('span[aria-hidden]')!;

describe('badge da conta na sidebar — foto com fallback para a inicial', () => {
  beforeEach(() => {
    mockProfile.mockReturnValue({ name: 'Rafael', brand_name: null, photo_url: FOTO });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('mostra a foto quando photo_url está preenchida', async () => {
    await renderSidebar();
    const img = await screen.findByTestId('sidebar-avatar-photo');
    expect(img.getAttribute('src')).toBe(FOTO);
    // Preenche o círculo sem distorcer, no tamanho atual do badge.
    expect(img.className).toContain('object-cover');
    expect(badge().className).toContain('w-8');
    expect(badge().className).toContain('h-8');
    expect(badge().textContent).toBe('');
  });

  it('(1) sem photo_url no perfil → inicial', async () => {
    mockProfile.mockReturnValue({ name: 'Rafael', brand_name: null, photo_url: null });
    await renderSidebar();
    await waitFor(() => expect(badge().textContent).toBe('R'));
    expect(screen.queryByTestId('sidebar-avatar-photo')).toBeNull();
  });

  it('(2) photo_url vazia (default da coluna) → inicial', async () => {
    mockProfile.mockReturnValue({ name: 'Rafael', brand_name: null, photo_url: '   ' });
    await renderSidebar();
    await waitFor(() => expect(badge().textContent).toBe('R'));
    expect(screen.queryByTestId('sidebar-avatar-photo')).toBeNull();
  });

  it('(3) imagem quebrada → onError cai para a inicial, sem círculo vazio', async () => {
    await renderSidebar();
    const img = await screen.findByTestId('sidebar-avatar-photo');
    fireEvent.error(img);
    await waitFor(() => expect(badge().textContent).toBe('R'));
    expect(screen.queryByTestId('sidebar-avatar-photo')).toBeNull();
  });

  it('sem perfil algum a inicial vem do nome da sessão', async () => {
    mockProfile.mockReturnValue(null);
    await renderSidebar();
    await waitFor(() => expect(badge().textContent).toBe('R'));
  });
});
