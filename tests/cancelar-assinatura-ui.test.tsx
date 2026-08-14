// @vitest-environment jsdom
/**
 * Botão de cancelar assinatura + popup de confirmação.
 *
 * O erro que estes testes existem para impedir: a tela dizer "cancelado"
 * quando a rota falhou. Quem acredita nisso é cobrado de novo no mês seguinte
 * e abre chargeback.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

const PERIOD_END = '2026-09-12T12:00:00.000Z';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function renderBotao(props: {
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
}) {
  const { default: CancelSubscriptionButton } = await import(
    '../components/billing/CancelSubscriptionButton'
  );
  return render(
    <CancelSubscriptionButton
      // `??` aqui apagaria o caso que mais importa: currentPeriodEnd null.
      currentPeriodEnd={'currentPeriodEnd' in props ? props.currentPeriodEnd! : PERIOD_END}
      cancelAtPeriodEnd={props.cancelAtPeriodEnd ?? false}
    />,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(
    jsonResponse(200, {
      canceled: true,
      alreadyCanceled: false,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: PERIOD_END,
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('CancelSubscriptionButton — confirmação', () => {
  it('confirmar chama a rota UMA vez', async () => {
    const screen = await renderBotao({});
    fireEvent.click(screen.getByTestId('abrir-cancelamento'));
    fireEvent.click(screen.getByTestId('confirmar-cancelamento'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/asaas/cancel');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('fechar o popup NÃO cancela nada', async () => {
    const screen = await renderBotao({});
    fireEvent.click(screen.getByTestId('abrir-cancelamento'));
    fireEvent.click(screen.getByTestId('fechar-cancelamento'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirmar-cancelamento')).toBeNull();
    // Saiu sem escolher: o botão continua lá, a assinatura intacta.
    expect(screen.getByTestId('abrir-cancelamento')).toBeTruthy();
  });

  it('clique duplo não dispara dois cancelamentos', async () => {
    let liberar: (r: Response) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => { liberar = resolve; }),
    );

    const screen = await renderBotao({});
    fireEvent.click(screen.getByTestId('abrir-cancelamento'));
    const confirmar = screen.getByTestId('confirmar-cancelamento');
    fireEvent.click(confirmar);
    fireEvent.click(confirmar);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((confirmar as HTMLButtonElement).disabled).toBe(true);

    liberar(
      jsonResponse(200, { canceled: true, cancelAtPeriodEnd: true, currentPeriodEnd: PERIOD_END }),
    );
    await waitFor(() => expect(screen.getByTestId('assinatura-cancelada')).toBeTruthy());
  });

  it('o texto do popup diz a verdade: acesso continua até a data', async () => {
    const screen = await renderBotao({});
    fireEvent.click(screen.getByTestId('abrir-cancelamento'));

    const texto = screen.getByTestId('texto-cancelamento').textContent ?? '';
    expect(texto).toContain('12/09/2026');
    expect(texto).toMatch(/não será renovada/i);
    expect(texto).not.toMatch(/perder[áa] o acesso agora|acesso ser[áa] encerrado agora/i);
  });

  it('sem current_period_end, o texto não afirma dia nenhum', async () => {
    const screen = await renderBotao({ currentPeriodEnd: null });
    fireEvent.click(screen.getByTestId('abrir-cancelamento'));

    const texto = screen.getByTestId('texto-cancelamento').textContent ?? '';
    expect(texto).not.toMatch(/\d{2}\/\d{2}/);
    expect(texto).toMatch(/fim do período já pago/i);
  });
});

describe('CancelSubscriptionButton — erros', () => {
  it('404 aparece como erro e a tela NÃO diz que cancelou', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, { error: 'x', code: 'no_active_subscription' }),
    );
    const screen = await renderBotao({});
    fireEvent.click(screen.getByTestId('abrir-cancelamento'));
    fireEvent.click(screen.getByTestId('confirmar-cancelamento'));

    await waitFor(() =>
      expect(screen.getByTestId('erro-cancelamento').textContent).toMatch(
        /não encontramos assinatura ativa/i,
      ),
    );
    expect(screen.queryByTestId('assinatura-cancelada')).toBeNull();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('502 aparece como erro e a tela NÃO diz que cancelou', async () => {
    fetchMock.mockResolvedValue(jsonResponse(502, { error: 'x', code: 'provider_error' }));
    const screen = await renderBotao({});
    fireEvent.click(screen.getByTestId('abrir-cancelamento'));
    fireEvent.click(screen.getByTestId('confirmar-cancelamento'));

    await waitFor(() =>
      expect(screen.getByTestId('erro-cancelamento').textContent).toMatch(/tente mais tarde/i),
    );
    expect(screen.queryByTestId('assinatura-cancelada')).toBeNull();
  });

  it('depois do erro dá para tentar de novo', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(502, { code: 'provider_error' }));
    const screen = await renderBotao({});
    fireEvent.click(screen.getByTestId('abrir-cancelamento'));
    fireEvent.click(screen.getByTestId('confirmar-cancelamento'));

    await waitFor(() => expect(screen.getByTestId('erro-cancelamento')).toBeTruthy());
    fireEvent.click(screen.getByTestId('confirmar-cancelamento'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

describe('CancelSubscriptionButton — estados', () => {
  it('assinatura já cancelada mostra o ESTADO, não um botão', async () => {
    const screen = await renderBotao({ cancelAtPeriodEnd: true });

    expect(screen.queryByTestId('abrir-cancelamento')).toBeNull();
    expect(screen.getByTestId('assinatura-cancelada').textContent).toContain('12/09/2026');
  });

  it('depois do sucesso a tela vira o estado novo, sem F5', async () => {
    const screen = await renderBotao({});
    fireEvent.click(screen.getByTestId('abrir-cancelamento'));
    fireEvent.click(screen.getByTestId('confirmar-cancelamento'));

    await waitFor(() => expect(screen.getByTestId('assinatura-cancelada')).toBeTruthy());
    expect(screen.queryByTestId('abrir-cancelamento')).toBeNull();
    expect(screen.queryByTestId('confirmar-cancelamento')).toBeNull();
    expect(mockRefresh).toHaveBeenCalled();
  });
});
