/**
 * Cancelamento pedido pelo usuário — lado servidor.
 *
 * A regra que estes testes protegem: cancelar NÃO derruba o acesso na hora.
 * Cancela no Asaas (para não cobrar de novo) e marca cancel_at_period_end,
 * mantendo o status que dá acesso até o fim do ciclo já pago. Quem derruba o
 * status no fim é o webhook ('end_of_cycle', lib/asaas-webhook.ts).
 *
 * O cancelamento IMEDIATO continua existindo — é o que a troca de plano usa
 * para cancelar a atual antes de criar outra —, mas agora com nome próprio.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCancelSubscription, mockGetSubscription, mockUpdate, mockMaybeSingle } = vi.hoisted(
  () => ({
    mockCancelSubscription: vi.fn(),
    mockGetSubscription: vi.fn(),
    mockUpdate: vi.fn(),
    mockMaybeSingle: vi.fn(),
  }),
);

vi.mock('@/lib/asaas/subscriptions', () => ({
  cancelSubscription: mockCancelSubscription,
  getSubscription: mockGetSubscription,
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
      update: (patch: Record<string, unknown>) => {
        mockUpdate(patch);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

const DAQUI_UM_MES = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

beforeEach(() => {
  mockCancelSubscription.mockResolvedValue({ deleted: true });
  mockMaybeSingle.mockResolvedValue({
    data: {
      id: 'sub_1',
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: DAQUI_UM_MES,
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('scheduleSubscriptionCancellation — acesso até o fim do ciclo', () => {
  it('cancela no Asaas e marca cancel_at_period_end SEM derrubar o status', async () => {
    const { scheduleSubscriptionCancellation } = await import('../lib/asaas-subscription-admin');
    const result = await scheduleSubscriptionCancellation('sub_1');

    expect(result).toEqual({ ok: true, alreadyCanceled: false });
    expect(mockCancelSubscription).toHaveBeenCalledWith('sub_1');

    const patch = mockUpdate.mock.calls[0][0];
    expect(patch.cancel_at_period_end).toBe(true);
    // O status é o que dá acesso: mexer nele aqui cortaria o mês já pago.
    expect(patch).not.toHaveProperty('status');
  });

  it('não derruba o status nem quando current_period_end é nulo', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { id: 'sub_1', status: 'active', cancel_at_period_end: false, current_period_end: null },
    });
    const { scheduleSubscriptionCancellation } = await import('../lib/asaas-subscription-admin');

    await scheduleSubscriptionCancellation('sub_1');

    const patch = mockUpdate.mock.calls[0][0];
    expect(patch.cancel_at_period_end).toBe(true);
    expect(patch).not.toHaveProperty('status');
  });

  it('assinatura já agendada não chama o Asaas de novo', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'sub_1',
        status: 'active',
        cancel_at_period_end: true,
        current_period_end: DAQUI_UM_MES,
      },
    });
    const { scheduleSubscriptionCancellation } = await import('../lib/asaas-subscription-admin');

    expect(await scheduleSubscriptionCancellation('sub_1')).toEqual({
      ok: true,
      alreadyCanceled: true,
    });
    expect(mockCancelSubscription).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('linha inexistente devolve not_found e não toca no gateway', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null });
    const { scheduleSubscriptionCancellation } = await import('../lib/asaas-subscription-admin');

    expect(await scheduleSubscriptionCancellation('sub_x')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(mockCancelSubscription).not.toHaveBeenCalled();
  });

  it('falha do gateway não marca nada no banco', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCancelSubscription.mockRejectedValue(new Error('boom'));
    const { scheduleSubscriptionCancellation } = await import('../lib/asaas-subscription-admin');

    expect(await scheduleSubscriptionCancellation('sub_1')).toEqual({
      ok: false,
      reason: 'provider_error',
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('cancelSubscriptionNow — o cancelamento imediato da troca de plano', () => {
  it('derruba o status na hora, de propósito', async () => {
    const { cancelSubscriptionNow } = await import('../lib/asaas-subscription-admin');

    expect(await cancelSubscriptionNow('sub_1')).toEqual({ ok: true, alreadyCanceled: false });
    expect(mockUpdate.mock.calls[0][0].status).toBe('canceled');
  });

  it('preparePlanChange continua cancelando IMEDIATAMENTE a assinatura atual', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'sub_1',
        status: 'active',
        plan_interval: 'month',
        cancel_at_period_end: false,
        current_period_end: DAQUI_UM_MES,
      },
    });
    const { preparePlanChange } = await import('../lib/asaas-subscription-admin');

    const result = await preparePlanChange('sub_1', 'year');

    expect(result).toEqual({ ok: true, canceledId: 'sub_1', nextInterval: 'year' });
    expect(mockCancelSubscription).toHaveBeenCalledWith('sub_1');
    const patch = mockUpdate.mock.calls[0][0];
    expect(patch.status).toBe('canceled');
    // Trocar de plano não pode deixar a antiga "ativa até o fim do ciclo":
    // a nova assinatura entra agora, no lugar dela.
    expect(patch.cancel_at_period_end).toBeUndefined();
  });
});
