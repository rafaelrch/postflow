import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockUserRpc, mockAdminRpc, mockSubscriptionRow } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUserRpc: vi.fn(),
  mockAdminRpc: vi.fn(),
  mockSubscriptionRow: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: { customers: { create: vi.fn() } },
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mockSubscriptionRow }),
      }),
    }),
    rpc: mockUserRpc,
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({ rpc: mockAdminRpc }),
}));

import { refundCredits, requireCredits } from '../lib/subscription';

const USER = { id: 'user-123', email: 'assinante@test.com' };
const ACTIVE_SUB = {
  subscription_id: 'sub_1',
  status: 'active',
  price_id: 'price_1',
  plan_interval: 'month',
  cancel_at_period_end: false,
  current_period_end: null,
  trial_end: null,
};

/** Erro no formato que o supabase-js devolve para `raise ... using errcode = 'P0001'`. */
function pgError(message: string) {
  return { code: 'P0001', message, details: null, hint: null };
}

beforeEach(() => {
  mockGetUser.mockResolvedValue({ data: { user: USER }, error: null });
  mockSubscriptionRow.mockResolvedValue({ data: ACTIVE_SUB, error: null });
  mockUserRpc.mockResolvedValue({ data: 110, error: null });
  mockAdminRpc.mockResolvedValue({ data: null, error: null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('requireCredits — caminho feliz', () => {
  it('debita pelo cliente do usuário e devolve o novo saldo', async () => {
    const guard = await requireCredits(5);

    expect(guard.ok).toBe(true);
    expect(mockUserRpc).toHaveBeenCalledWith('consume_credits', { p_user: USER.id, p_cost: 5 });
    if (guard.ok) expect(guard.balance).toBe(110);
  });
});

describe('requireCredits — mapeamento de erro do Postgres (discrimina pela MENSAGEM, não pelo errcode)', () => {
  it('insufficient_credits → 402 com code insufficient_credits', async () => {
    mockUserRpc.mockResolvedValue({ data: null, error: pgError('insufficient_credits') });

    const guard = await requireCredits(5);

    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.response.status).toBe(402);
      expect((await guard.response.json()).code).toBe('insufficient_credits');
    }
  });

  it('credit_user_mismatch → 500, e NÃO diz que os créditos acabaram', async () => {
    mockUserRpc.mockResolvedValue({ data: null, error: pgError('credit_user_mismatch') });

    const guard = await requireCredits(5);

    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.response.status).toBe(500);
      const body = await guard.response.json();
      expect(body.code).not.toBe('insufficient_credits');
      expect(body.error).not.toMatch(/crédito/i);
    }
    expect(console.error).toHaveBeenCalled();
  });

  it('invalid_credit_cost → 500 (bug interno, não falta de saldo)', async () => {
    mockUserRpc.mockResolvedValue({ data: null, error: pgError('invalid_credit_cost') });

    const guard = await requireCredits(5);

    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.response.status).toBe(500);
      expect((await guard.response.json()).code).not.toBe('insufficient_credits');
    }
    expect(console.error).toHaveBeenCalled();
  });

  it('P0001 desconhecido → 500 (falha fechada, não vira falta de saldo)', async () => {
    mockUserRpc.mockResolvedValue({ data: null, error: pgError('permission denied for function consume_credits') });

    const guard = await requireCredits(5);

    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.response.status).toBe(500);
      expect((await guard.response.json()).code).not.toBe('insufficient_credits');
    }
    expect(console.error).toHaveBeenCalled();
  });

  it('erro sem code P0001 → 500', async () => {
    mockUserRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });

    const guard = await requireCredits(5);

    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(500);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('requireCredits — guardas de acesso (não regridem)', () => {
  it('sem usuário → 401 e não debita', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const guard = await requireCredits(5);

    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(401);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it('sem assinatura ativa → 402 subscription_required e não debita', async () => {
    mockSubscriptionRow.mockResolvedValue({ data: null, error: null });

    const guard = await requireCredits(5);

    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.response.status).toBe(402);
      expect((await guard.response.json()).code).toBe('subscription_required');
    }
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it('custo 0 não chama RPC nenhuma (só exige assinatura)', async () => {
    const guard = await requireCredits(0);

    expect(guard.ok).toBe(true);
    expect(mockUserRpc).not.toHaveBeenCalled();
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });
});

describe('refundCredits — RPC dedicada, valor positivo, service-role', () => {
  it('estorna via refund_credits com p_amount POSITIVO', async () => {
    await refundCredits(USER.id, 5);

    expect(mockAdminRpc).toHaveBeenCalledWith('refund_credits', { p_user: USER.id, p_amount: 5 });
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it('amount <= 0 é no-op', async () => {
    await refundCredits(USER.id, 0);
    await refundCredits(USER.id, -3);

    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it('best-effort: erro na RPC loga e não lança', async () => {
    mockAdminRpc.mockResolvedValue({ data: null, error: pgError('credits_not_found') });

    await expect(refundCredits(USER.id, 5)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
