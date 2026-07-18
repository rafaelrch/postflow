import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockCreateCheckoutSession, mockGetUser, mockLimit } = vi.hoisted(() => ({
  mockCreateCheckoutSession: vi.fn(),
  mockGetUser: vi.fn(),
  mockLimit: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: { checkout: { sessions: { create: mockCreateCheckoutSession } } },
  appUrl: (path = '') => `http://localhost:3000${path.startsWith('/') ? path : `/${path}`}`,
  priceIdForInterval: () => 'price_test_123',
  STRIPE_TRIAL_DAYS_YEARLY: 90,
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            limit: mockLimit,
          }),
        }),
      }),
    }),
  }),
}));

import { POST } from '../app/api/stripe/checkout/route';

function jsonRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/stripe/checkout', () => {
  it('retorna 409 alreadySubscribed e NÃO cria sessão Stripe quando usuário logado já assina (B1)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'assinante@test.com' } },
      error: null,
    });
    mockLimit.mockResolvedValue({ data: [{ id: 'sub_1' }], error: null });

    const res = await POST(jsonRequest({ interval: 'month' }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.alreadySubscribed).toBe(true);
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('mantém o fluxo atual intacto quando não há usuário logado (checkout pré-login)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockCreateCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/session_abc' });

    const res = await POST(jsonRequest({ interval: 'month' }));

    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://checkout.stripe.com/session_abc');
  });
});
