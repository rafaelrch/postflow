// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * A TELA da troca de e-mail.
 *
 * O contrato que ela precisa cumprir, e que um "sucesso" mal escrito quebraria:
 * depois de pedir a troca, o e-mail da conta AINDA É O ANTIGO. Se a tela
 * anunciar o novo como se já valesse, a pessoa vai tentar entrar com ele,
 * falhar, e achar que perdeu a conta.
 */

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const ATUAL = 'cliente@example.com';

async function montar(pendingEmail: string | null = null) {
  const { default: ChangeEmailButton } = await import('../components/settings/ChangeEmailButton');
  return render(<ChangeEmailButton currentEmail={ATUAL} pendingEmail={pendingEmail} />);
}

function responde(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', responde(202, { pendingEmail: 'novo@example.com', resent: false }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('troca de e-mail — diálogo', () => {
  it('o formulário fica atrás do botão, não solto na aba', async () => {
    await montar();
    expect(screen.queryByTestId('form-trocar-email')).toBeNull();

    fireEvent.click(screen.getByTestId('abrir-trocar-email'));
    expect(screen.getByTestId('form-trocar-email')).toBeTruthy();
  });

  it('o diálogo diz que a troca só vale DEPOIS da confirmação', async () => {
    const { container } = await montar();
    fireEvent.click(screen.getByTestId('abrir-trocar-email'));

    expect(container.textContent).toMatch(/só muda depois que você\s+confirmar/i);
    // E mostra qual é o e-mail de hoje, para não haver dúvida sobre o que muda.
    expect(container.textContent).toContain(ATUAL);
  });

  it('pedido aceito → estado "aguardando confirmação em <novo>"', async () => {
    await montar();
    fireEvent.click(screen.getByTestId('abrir-trocar-email'));
    fireEvent.change(screen.getByTestId('novo-email'), { target: { value: 'novo@example.com' } });
    fireEvent.submit(screen.getByTestId('form-trocar-email'));

    await waitFor(() => expect(screen.getByTestId('email-pendente')).toBeTruthy());
    expect(screen.getByTestId('email-pendente-endereco').textContent).toBe('novo@example.com');
    // O diálogo fecha; o pendente fica na aba.
    expect(screen.queryByTestId('form-trocar-email')).toBeNull();
    // E revalida a página, para o pendente sobreviver a uma recarga.
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('enquanto pendente, a tela afirma que o e-mail ANTIGO continua valendo', async () => {
    const { container } = await montar('novo@example.com');

    expect(screen.getByTestId('email-pendente-endereco').textContent).toBe('novo@example.com');
    expect(container.textContent).toMatch(/o e-mail da conta continua/i);
    expect(container.textContent).toContain(ATUAL);
  });

  it('pendente vindo do servidor pode ser reenviado', async () => {
    const chamada = responde(202, { pendingEmail: 'novo@example.com', resent: true });
    vi.stubGlobal('fetch', chamada);
    await montar('novo@example.com');

    fireEvent.click(screen.getByTestId('reenviar-troca-email'));

    await waitFor(() => expect(chamada).toHaveBeenCalled());
    const [, init] = chamada.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ email: 'novo@example.com' });
  });

  it('recusa do servidor aparece na tela, com a mensagem que o servidor mandou', async () => {
    vi.stubGlobal('fetch', responde(409, {
      error: 'Não foi possível usar este endereço. Escolha outro e-mail ou fale com o suporte.',
      code: 'email_unavailable',
    }));
    await montar();

    fireEvent.click(screen.getByTestId('abrir-trocar-email'));
    fireEvent.change(screen.getByTestId('novo-email'), { target: { value: 'alguem@example.com' } });
    fireEvent.submit(screen.getByTestId('form-trocar-email'));

    const erro = await screen.findByTestId('erro-trocar-email-dialogo');
    expect(erro.textContent).toMatch(/não foi possível usar este endereço/i);
    // Recusa NÃO vira pendente: nada foi pedido.
    expect(screen.queryByTestId('email-pendente')).toBeNull();
    // E a mensagem não confirma que a outra conta existe.
    expect(erro.textContent).not.toMatch(/cadastrad|já existe|em uso/i);
  });

  it('rede fora do ar não trava o botão nem inventa sucesso', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await montar();

    fireEvent.click(screen.getByTestId('abrir-trocar-email'));
    fireEvent.change(screen.getByTestId('novo-email'), { target: { value: 'novo@example.com' } });
    fireEvent.submit(screen.getByTestId('form-trocar-email'));

    await screen.findByTestId('erro-trocar-email-dialogo');
    expect(screen.queryByTestId('email-pendente')).toBeNull();
    expect((screen.getByTestId('enviar-troca-email') as HTMLButtonElement).disabled).toBe(false);
  });
});
