// @vitest-environment jsdom
/**
 * A TELA /redefinir-senha.
 *
 * ⚠️ A MECÂNICA QUE JÁ MORDEU ESTE PROJETO UMA VEZ: o Supabase devolve a sessão
 * no FRAGMENTO da URL (#access_token…&type=recovery), e fragmento NUNCA é
 * enviado ao servidor. Uma tela protegida por sessão no servidor veria um
 * visitante anônimo, mandaria para o login — e o link do e-mail já teria sido
 * consumido. Por isso a leitura é toda no cliente.
 *
 * A leitura do fragmento em si (o módulo lib/recovery-callback, aqui mockado)
 * tem suíte própria: tests/recuperar-senha-fragmento.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

const HASH = '#access_token=access-1&expires_in=3600&refresh_token=refresh-1&token_type=bearer&type=recovery';
const user = { id: 'user-1', email: 'cliente@example.com' };

// ── A tela ───────────────────────────────────────────────────────────────────

const { mockReplace, mockRefresh, mockEstablish } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockRefresh: vi.fn(),
  mockEstablish: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
}));
vi.mock('@/lib/recovery-callback', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/recovery-callback')>()),
  establishRecoverySession: mockEstablish,
}));

const mockUpdateUser = vi.fn();

beforeEach(() => {
  mockUpdateUser.mockResolvedValue({ error: null });
  mockEstablish.mockResolvedValue({ client: { auth: { updateUser: mockUpdateUser } }, user });
  window.location.hash = HASH;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderTela() {
  const { default: RedefinirSenhaPage } = await import('../app/(auth)/redefinir-senha/page');
  return render(<RedefinirSenhaPage />);
}

describe('/redefinir-senha', () => {
  it('lê o FRAGMENTO da URL — não depende de sessão no servidor', async () => {
    const screen = await renderTela();

    await waitFor(() => expect(screen.getByTestId('redefinir-form')).toBeTruthy());
    // O que a tela entrega ao validador é o fragmento do navegador. Se um dia
    // alguém trocar isso por uma leitura de sessão server-side, este teste cai.
    expect(mockEstablish.mock.calls[0][0]).toBe(HASH);
    expect(typeof mockEstablish.mock.calls[0][1].clearHash).toBe('function');
  });

  it('link inválido/expirado oferece pedir outro, e não o formulário', async () => {
    mockEstablish.mockResolvedValue(null);
    const screen = await renderTela();

    await waitFor(() => expect(screen.getByTestId('redefinir-link-invalido')).toBeTruthy());
    expect(screen.queryByTestId('redefinir-form')).toBeNull();
    expect(screen.container.querySelector('a[href="/recuperar-senha"]')).toBeTruthy();
  });

  it('senha curta é recusada antes de qualquer chamada', async () => {
    const screen = await renderTela();
    await waitFor(() => expect(screen.getByTestId('redefinir-form')).toBeTruthy());

    fireEvent.change(screen.getByTestId('nova-senha'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByTestId('nova-senha-confirmacao'), { target: { value: 'abc' } });
    fireEvent.submit(screen.getByTestId('redefinir-form'));

    await waitFor(() => expect(screen.getByTestId('redefinir-erro')).toBeTruthy());
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('confirmação diferente é recusada', async () => {
    const screen = await renderTela();
    await waitFor(() => expect(screen.getByTestId('redefinir-form')).toBeTruthy());

    fireEvent.change(screen.getByTestId('nova-senha'), { target: { value: 'senha-boa-123' } });
    fireEvent.change(screen.getByTestId('nova-senha-confirmacao'), { target: { value: 'outra-coisa' } });
    fireEvent.submit(screen.getByTestId('redefinir-form'));

    await waitFor(() => expect(screen.getByTestId('redefinir-erro').textContent).toMatch(/não conferem/i));
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('sucesso grava a senha e entra — sem pedir para digitar de novo', async () => {
    const screen = await renderTela();
    await waitFor(() => expect(screen.getByTestId('redefinir-form')).toBeTruthy());

    fireEvent.change(screen.getByTestId('nova-senha'), { target: { value: 'senha-boa-123' } });
    fireEvent.change(screen.getByTestId('nova-senha-confirmacao'), { target: { value: 'senha-boa-123' } });
    fireEvent.submit(screen.getByTestId('redefinir-form'));

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'senha-boa-123' }));
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });

  it('falha ao gravar NÃO manda a pessoa para o app achando que trocou', async () => {
    mockUpdateUser.mockResolvedValue({ error: { message: 'expired' } });
    const screen = await renderTela();
    await waitFor(() => expect(screen.getByTestId('redefinir-form')).toBeTruthy());

    fireEvent.change(screen.getByTestId('nova-senha'), { target: { value: 'senha-boa-123' } });
    fireEvent.change(screen.getByTestId('nova-senha-confirmacao'), { target: { value: 'senha-boa-123' } });
    fireEvent.submit(screen.getByTestId('redefinir-form'));

    await waitFor(() => expect(screen.getByTestId('redefinir-erro')).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
