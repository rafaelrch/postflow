import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockSubscription, mockUserRpc, mockAdminRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSubscription: vi.fn(),
  mockUserRpc: vi.fn(),
  mockAdminRpc: vi.fn(),
}));

vi.mock('../lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mockSubscription }),
      }),
    }),
    rpc: mockUserRpc,
  }),
}));

vi.mock('../lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({ rpc: mockAdminRpc }),
}));

import { refundCredits, requireCredits } from '../lib/subscription';

beforeEach(() => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mockSubscription.mockResolvedValue({
    data: {
      subscription_id: 'bill-1',
      status: 'active',
      price_id: 'prod-1',
      plan_interval: 'month',
      cancel_at_period_end: false,
      current_period_end: null,
      trial_end: null,
    },
    error: null,
  });
  mockUserRpc.mockResolvedValue({ data: 195, error: null });
  mockAdminRpc.mockResolvedValue({ data: 200, error: null });
});

afterEach(() => vi.clearAllMocks());

describe('RPCs de crédito com menor privilégio', () => {
  it('debita pelo client autenticado, para o SQL validar auth.uid()', async () => {
    const result = await requireCredits(5);

    expect(result.ok).toBe(true);
    expect(mockUserRpc).toHaveBeenCalledWith('consume_credits', { p_user: 'user-1', p_cost: 5 });
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it('estorna por RPC dedicado service-role e nunca por custo negativo', async () => {
    await refundCredits('user-1', 5);

    expect(mockAdminRpc).toHaveBeenCalledWith('refund_credits', { p_user: 'user-1', p_amount: 5 });
    expect(mockAdminRpc).not.toHaveBeenCalledWith('consume_credits', expect.objectContaining({ p_cost: -5 }));
  });
});
