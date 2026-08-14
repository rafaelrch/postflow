// @vitest-environment jsdom
/**
 * Aba "Conta" das Configurações.
 *
 * A regra que estes testes seguram: NENHUM campo inventado. Só aparece o que o
 * banco realmente tem (e-mail da sessão, profiles.name, data de criação da
 * conta). E o e-mail é só leitura — trocar e-mail não é um fluxo que exista, e
 * um campo editável prometeria algo que nada implementa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mockGetUser }, from: mockFrom }),
}));
// O formulário de senha tem suíte própria (tests/trocar-senha.test.tsx).
vi.mock('@/components/settings/ChangePasswordForm', () => ({
  default: () => <div data-testid="form-senha-stub" />,
}));

function perfil(data: unknown) {
  return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data }) }) }) };
}

beforeEach(() => {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'u1', email: 'cliente@example.com', created_at: '2026-03-10T14:00:00.000Z' } },
  });
  mockFrom.mockReturnValue(perfil({ name: 'Rafael' }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderAba() {
  const { default: ContaTab } = await import('../app/(app)/configuracoes/conta/page');
  return render(await ContaTab());
}

describe('/configuracoes/conta', () => {
  it('mostra e-mail, nome e data de criação', async () => {
    const screen = await renderAba();

    expect(screen.getByTestId('conta-email').textContent).toBe('cliente@example.com');
    expect(screen.getByTestId('conta-nome').textContent).toBe('Rafael');
    expect(screen.getByTestId('conta-criada-em').textContent).toBe('10 de março de 2026');
  });

  it('o e-mail é TEXTO, não campo editável', async () => {
    const screen = await renderAba();

    expect(screen.container.querySelector('input[type="email"]')).toBeNull();
    // E a tela explica por quê, em vez de deixar a pessoa procurando o botão.
    expect(screen.container.textContent).toMatch(/não pode ser alterado por aqui/i);
  });

  it('perfil sem nome não vira linha "Nome —"', async () => {
    mockFrom.mockReturnValue(perfil({ name: '   ' }));
    const screen = await renderAba();

    expect(screen.queryByTestId('conta-nome')).toBeNull();
    expect(screen.getByTestId('conta-email')).toBeTruthy();
  });

  it('linha de profiles inexistente não derruba a aba', async () => {
    mockFrom.mockReturnValue(perfil(null));
    const screen = await renderAba();

    expect(screen.getByTestId('conta-email').textContent).toBe('cliente@example.com');
    expect(screen.getByTestId('form-senha-stub')).toBeTruthy();
  });

  it('a troca de senha vive nesta aba', async () => {
    const screen = await renderAba();
    expect(screen.getByTestId('form-senha-stub')).toBeTruthy();
  });
});
