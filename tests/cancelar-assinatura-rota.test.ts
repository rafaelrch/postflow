/**
 * POST /api/asaas/cancel — a rota que a UI de cancelamento chama.
 *
 * A assinatura é resolvida pela SESSÃO, nunca por id vindo do cliente. E o
 * cancelamento é o AGENDADO (fim do ciclo), não o imediato.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockGetActive, mockSchedule, mockCancelNow } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetActive: vi.fn(),
  mockSchedule: vi.fn(),
  mockCancelNow: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mockGetUser } }),
}));
vi.mock('@/lib/subscription', () => ({ getActiveSubscription: mockGetActive }));
vi.mock('@/lib/asaas-subscription-admin', () => ({
  scheduleSubscriptionCancellation: mockSchedule,
  cancelSubscriptionNow: mockCancelNow,
}));

const PERIOD_END = '2026-09-12T00:00:00.000Z';

beforeEach(() => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  mockGetActive.mockResolvedValue({
    subscription_id: 'sub_1',
    status: 'active',
    cancel_at_period_end: false,
    current_period_end: PERIOD_END,
  });
  mockSchedule.mockResolvedValue({ ok: true, alreadyCanceled: false });
});

afterEach(() => vi.clearAllMocks());

describe('POST /api/asaas/cancel', () => {
  it('agenda o cancelamento e devolve a data de fim de acesso', async () => {
    const { POST } = await import('../app/api/asaas/cancel/route');
    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      canceled: true,
      alreadyCanceled: false,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: PERIOD_END,
    });
    expect(mockSchedule).toHaveBeenCalledWith('sub_1');
    // O imediato é da troca de plano; aqui ele cortaria o mês já pago.
    expect(mockCancelNow).not.toHaveBeenCalled();
  });

  it('401 sem sessão, sem tocar em assinatura nenhuma', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await import('../app/api/asaas/cancel/route');

    expect((await POST()).status).toBe(401);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('404 no_active_subscription quando não há assinatura ativa', async () => {
    mockGetActive.mockResolvedValue(null);
    const { POST } = await import('../app/api/asaas/cancel/route');
    const res = await POST();

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('no_active_subscription');
  });

  it('502 quando o gateway falha — nada de "cancelado"', async () => {
    mockSchedule.mockResolvedValue({ ok: false, reason: 'provider_error' });
    const { POST } = await import('../app/api/asaas/cancel/route');
    const res = await POST();

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('provider_error');
    expect(body.canceled).toBeUndefined();
  });
});
