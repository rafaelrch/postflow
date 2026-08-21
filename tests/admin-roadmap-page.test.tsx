// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * A GUARDA da página /admin/roadmap, no molde de `admin-saude-page.test.tsx`.
 *
 * O que se prova aqui é a ORDEM: `requireAdminPage()` roda ANTES de existir um
 * cliente service_role. Esta página é a que enxerga pendente e recusado — se a
 * checagem escorregasse para depois da leitura, um `return` esquecido num
 * refactor viraria leitura livre do quadro inteiro.
 *
 * A negativa da AÇÃO (PATCH /api/roadmap/admin) já é coberta em
 * `roadmap-routes.test.ts`: sem sessão 401, fora da allowlist 403, allowlist
 * ausente 403 e e-mail não confirmado 403 — todos sem tocar no service_role.
 */

const { guard, createAdmin, load } = vi.hoisted(() => ({
  guard: vi.fn(),
  createAdmin: vi.fn(),
  load: vi.fn(),
}));

vi.mock('@/lib/admin-page-guard', () => ({ requireAdminPage: guard }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabaseClient: createAdmin }));
vi.mock('@/lib/admin-roadmap', async () => {
  const real = await vi.importActual<typeof import('@/lib/admin-roadmap')>('@/lib/admin-roadmap');
  return { ...real, loadAdminRoadmapBoard: load };
});
vi.mock('@/app/admin/roadmap/RoadmapAdminClient', () => ({
  default: ({ state }: { state?: string }) => <div data-testid="cliente">{state}</div>,
}));

async function page() {
  vi.resetModules();
  return (await import('@/app/admin/roadmap/page')).default;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('/admin/roadmap', () => {
  it.each([401, 403])('nega %i antes de criar o service_role', async (status) => {
    guard.mockRejectedValue(new Error(`INTERRUPT:${status}`));
    await expect((await page())()).rejects.toThrow(`INTERRUPT:${status}`);
    expect(createAdmin).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('autoriza antes de ler o quadro', async () => {
    guard.mockResolvedValue({ ok: true, email: 'admin@exemplo.com' });
    createAdmin.mockReturnValue({ service: true });
    load.mockResolvedValue({ pendentes: [], colunas: [], recusados: [] });

    render(await (await page())());
    expect(screen.getByTestId('cliente').textContent).toBe('ready');
    expect(guard).toHaveBeenCalledBefore(createAdmin);
    expect(load).toHaveBeenCalledWith({ service: true });
  });

  /** Falha de leitura vira estado de ERRO, não quadro vazio. */
  it('leitura que falha cai no estado de erro, sem derrubar a página', async () => {
    guard.mockResolvedValue({ ok: true, email: 'admin@exemplo.com' });
    createAdmin.mockReturnValue({ service: true });
    load.mockRejectedValue(new Error('admin_roadmap_cards_read_failed'));

    render(await (await page())());

    expect(screen.getByTestId('cliente').textContent).toBe('error');
  });
});

/**
 * A seção entra na navegação do painel como as outras entram — pela mesma
 * lista. Esconder o item nunca foi controle de acesso (a guarda acima é), mas
 * uma seção fora da lista é uma seção que só existe para quem sabe a URL.
 */
describe('Roadmap na navegação do /admin', () => {
  it('é uma aba pronta do painel, apontando para /admin/roadmap', async () => {
    const { ADMIN_TABS } = await import('@/components/admin/AdminTabs');
    const aba = ADMIN_TABS.find((tab) => tab.href === '/admin/roadmap');

    expect(aba).toBeTruthy();
    expect(aba?.label).toBe('Roadmap');
    expect(aba?.ready).toBe(true);
    expect(aba?.icon).toBeTruthy();
  });
});
