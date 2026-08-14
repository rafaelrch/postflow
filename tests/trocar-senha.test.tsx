// @vitest-environment jsdom
/**
 * Trocar a senha estando logado (/configuracoes/conta).
 *
 * O erro que estes testes existem para impedir: trocar a senha SEM conferir a
 * atual. A sessão já está de pé, então o updateUser passaria sozinho — e quem
 * sentasse no computador destravado de um cliente tomaria a conta. O teste do
 * "senha atual errada" é o que garante que a reautenticação não vire opcional
 * numa refatoração futura.
 *
 * Desde a Fase 18 o formulário mora atrás de um BOTÃO, num diálogo: aberto na
 * página, ele empurrava a aba para além da altura da janela. Daí o `abrir()`
 * antes de cada caso — e os testes de que, fechado, ele não existe no
 * documento e não troca senha nenhuma.
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

async function renderBotao() {
  const { default: ChangePasswordButton } = await import('../components/settings/ChangePasswordButton');
  return render(<ChangePasswordButton />);
}

/** Renderiza e ABRE o diálogo — o estado em que os casos abaixo começam. */
async function abrir() {
  const screen = await renderBotao();
  fireEvent.click(screen.getByTestId('abrir-trocar-senha'));
  return screen;
}

function preencher(
  screen: Awaited<ReturnType<typeof renderBotao>>,
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

describe('ChangePasswordButton — a senha atual é obrigatória', () => {
  it('senha atual ERRADA é recusada e NADA é alterado', async () => {
    mockSignIn.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    const screen = await abrir();
    preencher(screen);

    await waitFor(() =>
      expect(screen.getByTestId('erro-trocar-senha').textContent).toMatch(/senha atual está incorreta/i),
    );
    // O que mais importa nesta suíte: a troca NÃO acontece.
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(screen.queryByTestId('senha-trocada')).toBeNull();
  });

  it('reautentica com o e-mail DA SESSÃO, nunca com um digitado na tela', async () => {
    const screen = await abrir();
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

    const screen = await abrir();
    preencher(screen);

    await waitFor(() => expect(screen.getByTestId('senha-trocada')).toBeTruthy());
    expect(ordem).toEqual(['signIn', 'updateUser']);
  });
});

describe('ChangePasswordButton — regras da senha nova', () => {
  it('senha curta é recusada sem nem chamar o Supabase', async () => {
    const screen = await abrir();
    preencher(screen, { nova: 'a'.repeat(PASSWORD_MIN - 1) });

    await waitFor(() => expect(screen.getByTestId('erro-trocar-senha')).toBeTruthy());
    expect(screen.getByTestId('erro-trocar-senha').textContent).toContain(String(PASSWORD_MIN));
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('confirmação diferente é recusada', async () => {
    const screen = await abrir();
    preencher(screen, { confirmacao: 'outra-coisa-qualquer' });

    await waitFor(() =>
      expect(screen.getByTestId('erro-trocar-senha').textContent).toMatch(/não conferem/i),
    );
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('senha nova igual à atual é recusada', async () => {
    const screen = await abrir();
    preencher(screen, { nova: SENHA_ATUAL });

    await waitFor(() =>
      expect(screen.getByTestId('erro-trocar-senha').textContent).toMatch(/diferente da atual/i),
    );
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});

describe('ChangePasswordButton — sucesso', () => {
  it('troca de fato e confirma na tela, avisando que a sessão continua', async () => {
    const screen = await abrir();
    preencher(screen);

    await waitFor(() => expect(screen.getByTestId('senha-trocada')).toBeTruthy());
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: SENHA_NOVA });
    // "Não deslogue a pessoa sem avisar": aqui ela continua logada, e a tela diz.
    expect(screen.getByTestId('senha-trocada').textContent).toMatch(/continua conectado/i);
  });

  it('falha do Supabase na troca NÃO diz que trocou', async () => {
    mockUpdateUser.mockResolvedValue({ error: { message: 'boom' } });
    const screen = await abrir();
    preencher(screen);

    await waitFor(() => expect(screen.getByTestId('erro-trocar-senha')).toBeTruthy());
    expect(screen.queryByTestId('senha-trocada')).toBeNull();
  });
});

describe('ChangePasswordButton — o formulário fica escondido atrás do botão', () => {
  it('antes do clique NÃO existe formulário no documento', async () => {
    const screen = await renderBotao();

    // Não é "está invisível": não está lá. É isso que tira a altura da página.
    expect(screen.queryByTestId('form-trocar-senha')).toBeNull();
    expect(screen.queryByTestId('senha-atual')).toBeNull();
    expect(screen.container.querySelectorAll('input')).toHaveLength(0);
    expect(screen.getByTestId('abrir-trocar-senha')).toBeTruthy();
  });

  it('depois do clique o formulário aparece, num diálogo', async () => {
    const screen = await abrir();

    expect(screen.getByTestId('form-trocar-senha')).toBeTruthy();
    expect(screen.getByTestId('senha-atual')).toBeTruthy();
    const dialogo = screen.container.querySelector('[role="dialog"]');
    expect(dialogo).toBeTruthy();
    expect(dialogo?.getAttribute('aria-modal')).toBe('true');
  });

  it('FECHAR sem salvar não troca senha nenhuma', async () => {
    const screen = await abrir();

    fireEvent.change(screen.getByTestId('senha-atual'), { target: { value: SENHA_ATUAL } });
    fireEvent.change(screen.getByTestId('senha-nova'), { target: { value: SENHA_NOVA } });
    fireEvent.click(screen.getByTestId('fechar-trocar-senha'));

    expect(screen.queryByTestId('form-trocar-senha')).toBeNull();
    // O que mais importa: nem reautenticação, nem troca.
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('o botão Cancelar também só fecha', async () => {
    const screen = await abrir();
    fireEvent.click(screen.getByTestId('cancelar-trocar-senha'));

    expect(screen.queryByTestId('form-trocar-senha')).toBeNull();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('reabrir vem em branco — senha digitada não fica pendurada', async () => {
    const screen = await abrir();
    fireEvent.change(screen.getByTestId('senha-atual'), { target: { value: 'digitei-e-desisti' } });
    fireEvent.click(screen.getByTestId('fechar-trocar-senha'));

    fireEvent.click(screen.getByTestId('abrir-trocar-senha'));
    expect((screen.getByTestId('senha-atual') as HTMLInputElement).value).toBe('');
  });

  it('erro de uma tentativa não sobrevive ao fechar', async () => {
    mockSignIn.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    const screen = await abrir();
    preencher(screen);
    await waitFor(() => expect(screen.getByTestId('erro-trocar-senha')).toBeTruthy());

    fireEvent.click(screen.getByTestId('fechar-trocar-senha'));
    fireEvent.click(screen.getByTestId('abrir-trocar-senha'));

    expect(screen.queryByTestId('erro-trocar-senha')).toBeNull();
  });

  it('durante o envio o diálogo não fecha por engano', async () => {
    // Fechar no meio deixaria a troca acontecendo sem ninguém para mostrar o
    // resultado — a pessoa não saberia se a senha mudou.
    mockSignIn.mockImplementation(() => new Promise(() => {}));
    const screen = await abrir();
    preencher(screen);

    await waitFor(() =>
      expect((screen.getByTestId('salvar-senha') as HTMLButtonElement).disabled).toBe(true),
    );
    fireEvent.click(screen.getByTestId('fechar-trocar-senha'));
    expect(screen.getByTestId('form-trocar-senha')).toBeTruthy();
  });
});
