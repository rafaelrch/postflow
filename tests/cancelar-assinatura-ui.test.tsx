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

const { mockRefresh, mockGetUser, mockGetActive, mockGetCredits } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetActive: vi.fn(),
  mockGetCredits: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mockGetUser } }),
}));
vi.mock('@/lib/subscription', () => ({ getActiveSubscription: mockGetActive }));
vi.mock('@/lib/credits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/credits')>()),
  getUserCredits: mockGetCredits,
}));

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

  it('o botão é vermelho sólido com texto branco, e reusa a sombra da marca', async () => {
    const screen = await renderBotao({});
    const botao = screen.getByTestId('abrir-cancelamento');

    expect(botao.getAttribute('style')).toContain('var(--danger)');
    // Sem `outline`: é a classe que apaga o fundo. Com ela, o vermelho some.
    expect(botao.className).toContain('brand-btn');
    expect(botao.className).not.toContain('outline');
    // A borda e a sombra dura vêm do .brand-btn base (--sh-2), não de estilo
    // inline: sombra própria aqui sairia do padrão do resto do app.
    expect(botao.getAttribute('style')).not.toContain('box-shadow');
  });

  it('durante o envio o confirmar fica desabilitado', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    const screen = await renderBotao({});
    fireEvent.click(screen.getByTestId('abrir-cancelamento'));
    const confirmar = screen.getByTestId('confirmar-cancelamento') as HTMLButtonElement;
    fireEvent.click(confirmar);

    await waitFor(() => expect(confirmar.disabled).toBe(true));
    expect(confirmar.textContent).toMatch(/cancelando/i);
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

/**
 * A data do fim do ciclo tem que sair do MESMO lugar nos três pontos da tela:
 * a linha "Acesso até"/"Renova em", o popup de confirmação e o estado
 * pós-cancelamento. A fonte é current_period_end (ver o bloco "QUAL COLUNA
 * MANDA" em lib/asaas-webhook.ts). Enquanto ninguém gravava essa coluna, os
 * três mostravam "—" — e o webhook cortava o acesso na hora do cancelamento.
 */
describe('/configuracoes/assinatura — a data vem da fonte única', () => {
  const FIM_DO_CICLO = '2026-09-15T02:59:59.999Z'; // 14/09 23:59:59.999 em Brasília

  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'r@x.com' } } });
    mockGetCredits.mockResolvedValue({ balance: 10, monthly_allowance: 200, period_end: null });
    mockGetActive.mockResolvedValue({
      subscription_id: 'sub_1',
      status: 'active',
      price_id: 'month',
      plan_interval: 'month',
      cancel_at_period_end: false,
      current_period_end: FIM_DO_CICLO,
      trial_end: null,
    });
  });

  // A aba de assinatura é a antiga /conta, migrada na Fase 17. /conta virou
  // redirect e é testada em tests/configuracoes-abas.test.tsx.
  async function renderConta() {
    const { default: AssinaturaPage } = await import('../app/(app)/configuracoes/assinatura/page');
    return render(await AssinaturaPage());
  }

  it('mostra o dia do fim do ciclo, não um traço', async () => {
    const screen = await renderConta();

    // Fuso fixo em São Paulo: em UTC este instante já é dia 15, e a página
    // renderiza no servidor. Sem o timeZone, /conta e o popup divergiriam.
    expect(screen.queryByText('15 de setembro de 2026')).toBeNull();
    expect(screen.getByText('14 de setembro de 2026')).toBeTruthy();
    expect(screen.getByText('Renova em')).toBeTruthy();
  });

  it('cancelamento agendado: a MESMA data aparece como "Acesso até" e no estado do botão', async () => {
    mockGetActive.mockResolvedValue({
      subscription_id: 'sub_1',
      status: 'active',
      price_id: 'month',
      plan_interval: 'month',
      cancel_at_period_end: true,
      current_period_end: FIM_DO_CICLO,
      trial_end: null,
    });
    const screen = await renderConta();

    expect(screen.getByText('Acesso até')).toBeTruthy();
    expect(screen.getByText('14 de setembro de 2026')).toBeTruthy();
    expect(screen.getByTestId('assinatura-cancelada').textContent).toContain('14/09/2026');
  });

  it('sem data nenhuma, a tela não afirma dia', async () => {
    mockGetActive.mockResolvedValue({
      subscription_id: 'sub_1',
      status: 'active',
      price_id: 'month',
      plan_interval: 'month',
      cancel_at_period_end: true,
      current_period_end: null,
      trial_end: null,
    });
    const screen = await renderConta();

    expect(screen.getByTestId('assinatura-cancelada').textContent).not.toMatch(/\d{2}\/\d{2}/);
  });
});
