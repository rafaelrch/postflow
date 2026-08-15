// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { resolvePeriod } from '@/lib/admin-period';
import type { AdminOverview } from '@/lib/admin-metrics';

/**
 * A tela da Visão geral.
 *
 * O que este arquivo protege é a REGRA DE HONESTIDADE: nenhum card sem
 * definição, o destaque de "pagou e não criou conta", e a ausência das
 * métricas que o produto não sabe medir (online agora, DAU, exportações,
 * receita recebida). Um card novo dessas famílias faz o teste falhar.
 */

const { mockLoad } = vi.hoisted(() => ({ mockLoad: vi.fn() }));

vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabaseClient: () => ({}) }));
// RetryPanel usa useRouter: fora do App Router ele lança "expected app router
// to be mounted", e o teste do estado de erro nunca chegaria a olhar a tela.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/admin-metrics', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/admin-metrics')>();
  return { ...original, loadAdminOverview: mockLoad };
});

const PERIODO = resolvePeriod({ periodo: '30d' }, new Date('2026-08-15T12:00:00Z'));

function overview(overrides: Partial<AdminOverview> = {}): AdminOverview {
  return {
    generatedAt: '2026-08-15T12:00:00.000Z',
    accounts: { total: 12 },
    profiles: {
      total: 9,
      createdInPeriod: 4,
      createdInPreviousPeriod: 2,
      onboardingCompleted: 6,
      onboardingIncomplete: 3,
    },
    subscriptions: {
      active: 7,
      withAccount: 6,
      withoutAccount: 1,
      monthly: 5,
      yearly: 2,
      scheduledCancellation: 1,
    },
    recurring: { mrr: 5 * 59.5 + (2 * 499) / 12, arr: (5 * 59.5 + (2 * 499) / 12) * 12 },
    renewals: {
      next7: { monthly: 2, yearly: 1, count: 3, amount: 2 * 59.5 + 499 },
      next30: { monthly: 4, yearly: 1, count: 5, amount: 4 * 59.5 + 499 },
    },
    funnel: {
      leads: 10,
      leadsPrevious: 5,
      checkoutAttempts: 8,
      checkoutLeads: 4,
      checkoutLeadsCapped: false,
    },
    credits: { zeroBalance: 2 },
    ...overrides,
  };
}

async function renderizar(data: AdminOverview = overview()) {
  mockLoad.mockResolvedValue(data);
  vi.resetModules();
  const OverviewMetrics = (await import('../app/admin/OverviewMetrics')).default;
  render(await OverviewMetrics({ period: PERIODO }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Visão geral', () => {
  it('mostra MRR e ARR em BRL, com o anual normalizado', async () => {
    await renderizar();
    // 5 × 59,50 + 2 × 499 ÷ 12 = 380,67
    expect(within(screen.getByTestId('card-mrr')).getByText('R$ 380,67')).toBeTruthy();
    expect(within(screen.getByTestId('card-arr')).getByText('R$ 4.568,00')).toBeTruthy();
  });

  it('mostra a renovação prevista como caixa do ciclo, não como MRR', async () => {
    await renderizar();
    // 2 mensais + 1 anual = 2 × 59,50 + 499 = 618,00
    expect(within(screen.getByTestId('card-renovacoes-7')).getByText('R$ 618,00')).toBeTruthy();
  });

  it('destaca "pagou e não criou conta" com chamada para ação', async () => {
    await renderizar();
    const card = screen.getByTestId('card-pagou-sem-conta');
    expect(within(card).getByText('1')).toBeTruthy();
    expect(card.textContent).toMatch(/Precisa de ação/);
  });

  it('quando ninguém está pendurado, o card não inventa urgência', async () => {
    await renderizar(
      overview({
        subscriptions: {
          active: 7,
          withAccount: 7,
          withoutAccount: 0,
          monthly: 5,
          yearly: 2,
          scheduledCancellation: 0,
        },
      }),
    );
    expect(screen.getByTestId('card-pagou-sem-conta').textContent).toMatch(/Ninguém pendurado/);
  });

  it('todo card de métrica tem definição — número sem contrato não entra', async () => {
    await renderizar();
    const cards = screen.getAllByTestId(/^card-/);
    // O de distribuição é um gráfico rotulado, não um card de número.
    const comNumero = cards.filter((card) => card.dataset.testid !== 'card-distribuicao');
    expect(comNumero.length).toBeGreaterThan(8);
    for (const card of comNumero) {
      expect(card.dataset.hint?.length ?? 0).toBeGreaterThan(20);
      expect(within(card).getByRole('button')).toBeTruthy();
    }
  });

  it('a definição abre no clique e fecha de novo — no celular não existe hover', async () => {
    await renderizar();
    const card = screen.getByTestId('card-mrr');
    const botao = within(card).getByRole('button');

    expect(within(card).queryByRole('tooltip')).toBeNull();

    fireEvent.click(botao);
    const dica = within(card).getByRole('tooltip');
    expect(dica.textContent).toMatch(/NÃO é dinheiro recebido/);
    expect(botao.getAttribute('aria-describedby')).toBe(dica.id);

    fireEvent.click(botao);
    expect(within(card).queryByRole('tooltip')).toBeNull();
  });

  it('Escape fecha a definição', async () => {
    await renderizar();
    const card = screen.getByTestId('card-arr');
    fireEvent.click(within(card).getByRole('button'));
    expect(within(card).getByRole('tooltip')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(within(card).queryByRole('tooltip')).toBeNull();
  });

  it('compara com o período anterior só onde a comparação é honesta', async () => {
    await renderizar();
    // Leads dobraram (5 → 10).
    expect(screen.getByTestId('card-leads').textContent).toMatch(/\+100%/);
    // Sem período anterior, nada de variação inventada.
    await cleanup();
    await renderizar(
      overview({
        funnel: {
          leads: 10,
          leadsPrevious: 0,
          checkoutAttempts: 8,
          checkoutLeads: 4,
          checkoutLeadsCapped: false,
        },
      }),
    );
    expect(screen.getByTestId('card-leads').textContent).not.toMatch(/%/);
  });

  it('checkout conta pessoas e diz quantas foram as tentativas', async () => {
    await renderizar();
    const card = screen.getByTestId('card-checkouts');
    expect(within(card).getByText('4')).toBeTruthy();
    expect(card.textContent).toMatch(/8 tentativa/);
  });

  it('não exibe métrica que o produto não sabe medir', async () => {
    await renderizar();
    const tela = document.body.textContent ?? '';
    for (const proibido of [
      'Online agora',
      'DAU',
      'WAU',
      'MAU',
      'Retenção',
      'Receita recebida',
      'Exportações realizadas',
      'Churn',
    ]) {
      expect(tela).not.toMatch(new RegExp(`^${proibido}$`, 'm'));
    }
    // E diz explicitamente por que elas não estão ali.
    expect(tela).toMatch(/não tem instrumentação/);
  });

  it('falha de leitura vira estado de erro com "tentar de novo", não zeros', async () => {
    mockLoad.mockRejectedValue(new Error('boom'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();
    const OverviewMetrics = (await import('../app/admin/OverviewMetrics')).default;
    render(await OverviewMetrics({ period: PERIODO }));

    expect(screen.getByTestId('admin-tentar-de-novo')).toBeTruthy();
    expect(screen.queryByTestId('card-mrr')).toBeNull();
    erro.mockRestore();
  });
});
