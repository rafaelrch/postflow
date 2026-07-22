import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCheckout: vi.fn(),
  resolveEmail: vi.fn(),
  upsertSubscription: vi.fn(),
  createUser: vi.fn(),
  resend: vi.fn(),
  inviteUserByEmail: vi.fn(),
  updateUserById: vi.fn(),
  signInWithOtp: vi.fn(),
  refMaybeSingle: vi.fn(),
  subscriptionMaybeSingle: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/app-url', () => ({
  appUrl: (path = '') => `https://creatools.test${path}`,
}));
vi.mock('@/lib/abacatepay', () => ({ getCheckout: mocks.getCheckout }));
vi.mock('../lib/abacatepay-sync', () => ({
  resolveEmail: mocks.resolveEmail,
  upsertSubscription: mocks.upsertSubscription,
}));
vi.mock('../lib/rate-limit', () => ({
  rateLimit: () => ({ ok: true }),
  clientIp: () => '203.0.113.10',
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      resend: mocks.resend,
      signInWithOtp: mocks.signInWithOtp,
    },
  }),
}));
vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({
    auth: {
      admin: {
        createUser: mocks.createUser,
        inviteUserByEmail: mocks.inviteUserByEmail,
        updateUserById: mocks.updateUserById,
      },
    },
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table === 'abacatepay_checkout_refs') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                gt: () => ({ maybeSingle: mocks.refMaybeSingle }),
              }),
            }),
          }),
        };
      }
      if (table === 'subscriptions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({ maybeSingle: mocks.subscriptionMaybeSingle }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { POST } from '../app/api/abacatepay/passwordless/start/route';

function request() {
  return {
    json: async () => ({ checkout_ref: 'valid-ref-123' }),
    headers: {
      get: (name: string) => {
        if (name === 'origin') return 'https://creatools.test';
        if (name === 'x-real-ip') return '203.0.113.10';
        return null;
      },
    },
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  mocks.getCheckout.mockResolvedValue({
    id: 'bill_paid',
    status: 'PAID',
    frequency: 'SUBSCRIPTION',
    items: [],
  });
  mocks.resolveEmail.mockResolvedValue('paid@example.com');
  mocks.upsertSubscription.mockResolvedValue({});
  mocks.refMaybeSingle.mockResolvedValue({ data: { checkout_id: 'bill_paid' } });
  mocks.subscriptionMaybeSingle.mockResolvedValue({ data: { id: 'bill_paid' } });
  mocks.createUser.mockResolvedValue({ data: { user: { id: 'user-paid' } }, error: null });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'consume_passwordless_rate') return { data: true, error: null };
    if (name === 'prepare_paid_signup_intent') return { data: { state: 'pending' }, error: null };
    throw new Error(`unexpected rpc ${name}`);
  });
  mocks.resend.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => vi.clearAllMocks());

describe('POST /api/abacatepay/passwordless/start — create + prepare + resend', () => {
  it('novo usuário segue createUser → prepare → resend com marker e redirect fixo', async () => {
    const order: string[] = [];
    mocks.createUser.mockImplementation(async () => {
      order.push('create');
      return { data: { user: { id: 'user-paid' } }, error: null };
    });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'consume_passwordless_rate') return { data: true, error: null };
      order.push('prepare');
      return { data: { state: 'pending' }, error: null };
    });
    mocks.resend.mockImplementation(async () => {
      order.push('resend');
      return { data: {}, error: null };
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(order).toEqual(['create', 'prepare', 'resend']);
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: 'paid@example.com',
      email_confirm: false,
      app_metadata: { origin: 'paid_passwordless' },
    });
    expect(mocks.rpc).toHaveBeenCalledWith('prepare_paid_signup_intent', {
      p_subscription_id: 'bill_paid',
      p_email: 'paid@example.com',
    });
    expect(mocks.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'paid@example.com',
      options: { emailRedirectTo: 'https://creatools.test/definir-senha' },
    });
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
    expect(mocks.updateUserById).not.toHaveBeenCalled();
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it.each(['email_exists', 'user_already_exists'])('retry com %s só prossegue quando o RPC aceita o marker existente', async (code) => {
    mocks.createUser.mockResolvedValue({ data: { user: null }, error: { code } });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('prepare_paid_signup_intent', expect.any(Object));
    expect(mocks.resend).toHaveBeenCalledOnce();
  });

  it('email_exists sem marker falha no RPC e nunca reenvia confirmação', async () => {
    mocks.createUser.mockResolvedValue({ data: { user: null }, error: { code: 'email_exists' } });
    mocks.rpc.mockImplementation(async (name: string) => name === 'consume_passwordless_rate'
      ? { data: true, error: null }
      : { data: null, error: { code: 'P0001', message: 'signup_user_not_eligible' } });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });

  it('usuário confirmado sem marker também é rejeitado pelo RPC simulado', async () => {
    mocks.createUser.mockResolvedValue({ data: { user: null }, error: { code: 'user_already_exists' } });
    mocks.rpc.mockImplementation(async (name: string) => name === 'consume_passwordless_rate'
      ? { data: true, error: null }
      : { data: null, error: { code: 'P0001', message: 'signup_user_not_eligible' } });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.resend).not.toHaveBeenCalled();
  });

  it('erro inesperado de createUser interrompe antes de prepare e resend', async () => {
    mocks.createUser.mockResolvedValue({ data: { user: null }, error: { code: 'unexpected_failure' } });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalledWith('prepare_paid_signup_intent', expect.any(Object));
    expect(mocks.resend).not.toHaveBeenCalled();
  });

  it('falha no prepare interrompe antes do resend', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'consume_passwordless_rate'
      ? { data: true, error: null }
      : { data: null, error: { code: 'unexpected_failure' } });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.resend).not.toHaveBeenCalled();
  });

  it('state claimed também é aceito antes do resend', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'consume_passwordless_rate'
      ? { data: true, error: null }
      : { data: { state: 'claimed' }, error: null });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.resend).toHaveBeenCalledOnce();
  });

  it('falha do resend retorna 403 depois de create e prepare bem-sucedidos', async () => {
    mocks.resend.mockResolvedValue({ data: {}, error: { code: 'over_email_send_rate_limit' } });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.createUser).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith('prepare_paid_signup_intent', expect.any(Object));
  });
});
