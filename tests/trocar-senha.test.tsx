// @vitest-environment jsdom
/**
 * Trocar a senha estando logado (/configuracoes/conta).
 *
 * O erro que estes testes existem para impedir: trocar a senha SEM conferir a
 * atual. A sessão já está de pé, então o updateUser passaria sozinho — e quem
 * sentasse no computador destravado de um cliente tomaria a conta. O teste do
 * "senha atual errada" é o que garante que a reautenticação não vire opcional
 * numa refatoração futura.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { PASSWORD_MIN } from '../lib/password-rules';

const { mockGetUser, mockSignIn, mockUpdateUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSignIn: vi.fn(),
  mockUpdateUser: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
      signInWithPassword: mockSignIn,
      updateUser: mockUpdateUser,
    },
  }),
}));

const SENHA_ATUAL = 'senha-de-hoje';
const SENHA_NOVA = 'senha-nova-123';

beforeEach(() => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'cliente@example.com' } } });
  mockSignIn.mockResolvedValue({ data: {}, error: null });
  mockUpdateUser.mockResolvedValue({ error: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderForm() {
  const { default: ChangePasswordForm } = await import('../components/settings/ChangePasswordForm');
  return render(<ChangePasswordForm />);
}

function preencher(
  screen: Awaited<ReturnType<typeof renderForm>>,
  { atual = SENHA_ATUAL, nova = SENHA_NOVA, confirmacao }: {
    atual?: string;
    nova?: string;
    confirmacao?: string;
  } = {},
) {
  // Por padrão a confirmação repete a nova senha — o caso "não conferem" passa
  // o valor divergente de propósito.
  confirmacao = confirmacao ?? nova;
  fireEvent.change(screen.getByTestId('senha-atual'), { target: { value: atual } });
  fireEvent.change(screen.getByTestId('senha-nova'), { target: { value: nova } });
  fireEvent.change(screen.getByTestId('senha-confirmacao'), { target: { value: confirmacao } });
  fireEvent.submit(screen.getByTestId('form-trocar-senha'));
}

describe('ChangePasswordForm — a senha atual é obrigatória', () => {
  it('senha atual ERRADA é recusada e NADA é alterado', async () => {
    mockSignIn.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    const screen = await renderForm();
    preencher(screen);

    await waitFor(() =>
      expect(screen.getByTestId('erro-trocar-senha').textContent).toMatch(/senha atual está incorreta/i),
    );
    // O que mais importa nesta suíte: a troca NÃO acontece.
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(screen.queryByTestId('senha-trocada')).toBeNull();
  });

  it('reautentica com o e-mail DA SESSÃO, nunca com um digitado na tela', async () => {
    const screen = await renderForm();
    preencher(screen);

    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
    expect(mockSignIn.mock.calls[0][0]).toEqual({
      email: 'cliente@example.com',
      password: SENHA_ATUAL,
    });
    // Não há campo de e-mail: ele viraria um oráculo de "esta senha vale para
    // este endereço?" para quem já está sentado na máquina.
    expect(screen.container.querySelector('input[type="email"]')).toBeNull();
  });

  it('a reautenticação vem ANTES da troca, não depois', async () => {
    const ordem: string[] = [];
    mockSignIn.mockImplementation(async () => { ordem.push('signIn'); return { data: {}, error: null }; });
    mockUpdateUser.mockImplementation(async () => { ordem.push('updateUser'); return { error: null }; });

    const screen = await renderForm();
    preencher(screen);

    await waitFor(() => expect(screen.getByTestId('senha-trocada')).toBeTruthy());
    expect(ordem).toEqual(['signIn', 'updateUser']);
  });
});

describe('ChangePasswordForm — regras da senha nova', () => {
  it('senha curta é recusada sem nem chamar o Supabase', async () => {
    const screen = await renderForm();
    preencher(screen, { nova: 'a'.repeat(PASSWORD_MIN - 1) });

    await waitFor(() => expect(screen.getByTestId('erro-trocar-senha')).toBeTruthy());
    expect(screen.getByTestId('erro-trocar-senha').textContent).toContain(String(PASSWORD_MIN));
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('confirmação diferente é recusada', async () => {
    const screen = await renderForm();
    preencher(screen, { confirmacao: 'outra-coisa-qualquer' });

    await waitFor(() =>
      expect(screen.getByTestId('erro-trocar-senha').textContent).toMatch(/não conferem/i),
    );
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('senha nova igual à atual é recusada', async () => {
    const screen = await renderForm();
    preencher(screen, { nova: SENHA_ATUAL });

    await waitFor(() =>
      expect(screen.getByTestId('erro-trocar-senha').textContent).toMatch(/diferente da atual/i),
    );
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});

describe('ChangePasswordForm — sucesso', () => {
  it('troca de fato e confirma na tela, avisando que a sessão continua', async () => {
    const screen = await renderForm();
    preencher(screen);

    await waitFor(() => expect(screen.getByTestId('senha-trocada')).toBeTruthy());
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: SENHA_NOVA });
    // "Não deslogue a pessoa sem avisar": aqui ela continua logada, e a tela diz.
    expect(screen.getByTestId('senha-trocada').textContent).toMatch(/continua conectado/i);
  });

  it('falha do Supabase na troca NÃO diz que trocou', async () => {
    mockUpdateUser.mockResolvedValue({ error: { message: 'boom' } });
    const screen = await renderForm();
    preencher(screen);

    await waitFor(() => expect(screen.getByTestId('erro-trocar-senha')).toBeTruthy());
    expect(screen.queryByTestId('senha-trocada')).toBeNull();
  });
});
