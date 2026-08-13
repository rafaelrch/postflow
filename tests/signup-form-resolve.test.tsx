// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

/**
 * O passo de RESOLVE do cadastro pago: descobrir de quem é a conta (o e-mail do
 * pagamento) antes de pedir a senha.
 *
 * Este arquivo nasce de um travamento visto no teste real: pagamento OK,
 * webhook 200 duas vezes, /api/asaas/signup-intent respondendo 200 — e a tela
 * presa em "Confirmando seu pagamento…" para sempre. O servidor estava certo; o
 * bug era um deadlock entre o StrictMode e o guard de "já comecei":
 *
 *   1. 1ª montagem marca o guard e dispara o fetch;
 *   2. o cleanup dela faz active = false;
 *   3. a 2ª montagem sai pelo guard ANTES de se pendurar em qualquer coisa,
 *      então nunca chama setResolving(false);
 *   4. o fetch resolve, mas o `if (!active) return` da 1ª descarta o resultado.
 *
 * Ninguém mais desliga o spinner. O guard não podia sair (cada resolve gasta
 * cota de consume_passwordless_rate), então o que mudou foi o que se guarda: a
 * PROMESSA, não um booleano.
 */

const TOKEN = `${'3f8a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b'}.${'a'.repeat(43)}`;
const EMAIL = 'pagador@test.com';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ auth: { signInWithPassword: vi.fn() } }),
}));

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { default: toast, toast };
});

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

/** 200 com o e-mail do pagamento — o caminho feliz do resolve. */
const RESOLVED = () => jsonResponse(200, { ok: true, email: EMAIL });
/** 202: existe pagamento, o webhook ainda não confirmou. */
const PENDING = () => jsonResponse(202, { pending: true, code: 'payment_pending' });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => RESOLVED());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

/**
 * As esperas do componente, uma fatia por vez.
 *
 * Não dá para pular direto para o fim: cada espera só é AGENDADA depois que a
 * resposta anterior chega, então um único advance grande dispara um timer só.
 * Avançar em fatias é o que reproduz o relógio de verdade.
 */
async function advanceRetries(delays: number[]) {
  for (const delay of delays) {
    await act(async () => { await vi.advanceTimersByTimeAsync(delay); });
  }
}

async function renderSignup(strict: boolean) {
  const { default: AuthForm } = await import('../components/auth/AuthForm');
  const form = <AuthForm mode="signup" signupToken={TOKEN} />;
  return render(strict ? <StrictMode>{form}</StrictMode> : form);
}

describe('AuthForm — resolve do e-mail pago sob StrictMode', () => {
  it('com DUAS montagens (StrictMode), o formulário aparece — não fica no spinner', async () => {
    // Regressão do travamento: com o guard booleano isto ficava eternamente em
    // "Confirmando seu pagamento…" mesmo com o servidor devolvendo 200.
    await renderSignup(true);

    await waitFor(() => expect(screen.getByTestId('signup-paid-email')).toBeTruthy());
    expect(screen.getByTestId('signup-paid-email').textContent).toContain(EMAIL);
    expect(screen.queryByTestId('signup-resolving')).toBeNull();
  });

  it('as duas montagens gastam UMA chamada só (a cota do rate limit é por token)', async () => {
    await renderSignup(true);

    await waitFor(() => expect(screen.getByTestId('signup-paid-email')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/asaas/signup-intent');
  });

  it('o resolve pergunta SÓ o e-mail: manda o token e nenhuma senha', async () => {
    await renderSignup(true);

    await waitFor(() => expect(screen.getByTestId('signup-paid-email')).toBeTruthy());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body).toEqual({ token: TOKEN });
  });

  it('sem StrictMode (produção) o comportamento é o mesmo', async () => {
    await renderSignup(false);

    await waitFor(() => expect(screen.getByTestId('signup-paid-email')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('AuthForm — pagamento ainda em confirmação tenta sozinho', () => {
  it('202 nas primeiras respostas e 200 depois: a tela sai sozinha do pendente', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock
      .mockImplementationOnce(async () => PENDING())
      .mockImplementationOnce(async () => PENDING())
      .mockImplementationOnce(async () => RESOLVED());

    await renderSignup(true);

    // Enquanto espera, continua no spinner — sem botão para a pessoa clicar.
    await waitFor(() => expect(screen.getByTestId('signup-resolving')).toBeTruthy());
    expect(screen.queryByText('Tentar de novo')).toBeNull();

    // 1ª automática (~4s) ainda devolve 202; a 2ª (~8s) resolve.
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });

    await waitFor(() => expect(screen.getByTestId('signup-paid-email')).toBeTruthy());
    expect(screen.getByTestId('signup-paid-email').textContent).toContain(EMAIL);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('esgotadas as automáticas, aparece o botão manual — depois de ~90s, não de 12s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockImplementation(async () => PENDING());

    await renderSignup(true);

    // Cada espera é agendada só DEPOIS da resposta anterior, então o tempo
    // avança em fatias, uma por tentativa — como no relógio de verdade.
    await advanceRetries([4_000, 8_000]);

    // Aos 12s (o teto da versão anterior) a tela ainda tem de estar esperando:
    // um cartão pode demorar mais que isso.
    expect(screen.queryByText('Tentar de novo')).toBeNull();
    expect(screen.getByTestId('signup-resolving')).toBeTruthy();

    await advanceRetries([15_000, 25_000, 40_000]);

    await waitFor(() => expect(screen.getByText('Tentar de novo')).toBeTruthy());
    expect(screen.getByText(/Ainda estamos confirmando seu pagamento/)).toBeTruthy();
    // resolve inicial + 5 automáticas = 6, contra o balde próprio do resolve
    // (consume_rate_window, 15/min). O commit da senha não sai deste balde.
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('a corrida com o webhook (202 o tempo todo) mostra confirmação, nunca "não encontramos"', async () => {
    // Servidor devolvendo payment_pending porque existe ref de checkout e a
    // assinatura ainda não foi escrita. A tela não pode acusar falta de
    // pagamento de alguém que acabou de pagar.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockImplementation(async () => PENDING());

    await renderSignup(true);

    for (const delay of [0, 4_000, 8_000, 15_000, 25_000]) {
      await advanceRetries([delay]);
      expect(screen.queryByText(/Não encontramos um pagamento/)).toBeNull();
      expect(screen.getByText(/Confirmando seu pagamento/)).toBeTruthy();
    }
  });

  it('durante a espera a tela diz que está verificando sozinha', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockImplementation(async () => PENDING());

    await renderSignup(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });

    await waitFor(() =>
      expect(screen.getByText(/não precisa fazer nada nem recarregar a página/)).toBeTruthy(),
    );
  });

  it('pagamento não encontrado NÃO fica tentando: erra de uma vez', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockImplementation(async () =>
      jsonResponse(404, { error: 'x', code: 'no_payment_found' }),
    );

    await renderSignup(true);

    await waitFor(() => expect(screen.getByText(/Não encontramos um pagamento/)).toBeTruthy());
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
