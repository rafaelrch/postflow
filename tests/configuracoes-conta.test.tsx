// @vitest-environment jsdom
/**
 * Aba "Conta" das Configurações.
 *
 * A regra que estes testes seguram: NENHUM campo inventado. Só aparece o que o
 * banco realmente tem (e-mail da sessão, profiles.name, data de criação da
 * conta).
 *
 * O e-mail continua sendo TEXTO no cartão — o que mudou é que agora existe um
 * BOTÃO ao lado do de senha, e o formulário mora no diálogo dele. A troca em si
 * (confirmação, pendente, duplicado) é coberta em tests/trocar-email.test.tsx e
 * tests/conta-email-rota.test.ts.
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
// O botão/diálogo de senha tem suíte própria (tests/trocar-senha.test.tsx).
vi.mock('@/components/settings/ChangePasswordButton', () => ({
  default: () => <button type="button" data-testid="botao-senha-stub">Trocar senha</button>,
}));
// Idem para o de e-mail (tests/trocar-email.test.tsx). O stub expõe as props
// para provar QUE a página as calcula — é o contrato entre servidor e tela.
vi.mock('@/components/settings/ChangeEmailButton', () => ({
  default: ({ currentEmail, pendingEmail }: { currentEmail: string; pendingEmail: string | null }) => (
    <button type="button" data-testid="botao-email-stub" data-atual={currentEmail} data-pendente={pendingEmail ?? ''}>
      Trocar e-mail
    </button>
  ),
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

  it('o e-mail é TEXTO no cartão; a troca fica atrás de um botão', async () => {
    const screen = await renderAba();

    // Nenhum campo solto na aba: o formulário vive no diálogo do botão, igual
    // ao de senha. A aba continua cabendo na janela sem rolagem.
    expect(screen.container.querySelector('input[type="email"]')).toBeNull();
    expect(screen.getByTestId('botao-email-stub')).toBeTruthy();
  });

  it('o pendente de troca vem do servidor (user.new_email), não de estado local', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'u1',
          email: 'cliente@example.com',
          created_at: '2026-03-10T14:00:00.000Z',
          new_email: 'NOVO@Example.com ',
        },
      },
    });
    const screen = await renderAba();

    // E o e-mail EXIBIDO continua sendo o atual: mostrar o novo antes da
    // confirmação faria a pessoa achar que já pode entrar com ele.
    expect(screen.getByTestId('conta-email').textContent).toBe('cliente@example.com');
    expect(screen.getByTestId('botao-email-stub').getAttribute('data-pendente')).toBe('NOVO@Example.com');
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
    expect(screen.getByTestId('botao-senha-stub')).toBeTruthy();
  });

  it('a troca de senha vive nesta aba, atrás de um BOTÃO', async () => {
    const screen = await renderAba();
    expect(screen.getByTestId('botao-senha-stub')).toBeTruthy();
  });

  /**
   * O pedido desta fase: a aba tem de caber na janela. O que dá para garantir
   * em teste é a CAUSA do estouro — a quantidade de conteúdo empilhado —, não
   * a altura renderizada (jsdom não faz layout). Então: um cartão só, e
   * nenhum campo de senha no documento antes do clique.
   */
  it('é UM cartão só — o segundo é que empurrava a página para fora da janela', async () => {
    const screen = await renderAba();

    expect(screen.container.querySelectorAll('section')).toHaveLength(1);
    expect(screen.queryByText('Trocar a senha')).toBeNull();
  });

  it('nenhum campo de senha existe antes do clique', async () => {
    const screen = await renderAba();

    expect(screen.container.querySelectorAll('input[type="password"]')).toHaveLength(0);
  });
});
