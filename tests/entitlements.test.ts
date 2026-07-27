import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockPlanRow } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockPlanRow: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table !== 'user_entitlements') throw new Error(`Tabela inesperada: ${table}`);
      return { select: () => ({ eq: () => ({ maybeSingle: mockPlanRow }) }) };
    },
  }),
}));

import { getEntitlement, requireEntitlement } from '../lib/entitlements';

beforeEach(() => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mockPlanRow.mockResolvedValue({ data: { plan: 'free' }, error: null });
});

afterEach(() => vi.clearAllMocks());

describe('getEntitlement — falha fechada para o lado pago', () => {
  function supa() {
    return {
      from: (table: string) => {
        if (table !== 'user_entitlements') throw new Error(`Tabela inesperada: ${table}`);
        return { select: () => ({ eq: () => ({ maybeSingle: mockPlanRow }) }) };
      },
    } as never;
  }

  it('lê o plano armazenado quando é pro', async () => {
    mockPlanRow.mockResolvedValue({ data: { plan: 'pro' }, error: null });
    expect(await getEntitlement(supa(), 'user-1')).toBe('pro');
  });

  it('linha ausente NUNCA vira pro: vira free', async () => {
    mockPlanRow.mockResolvedValue({ data: null, error: null });
    expect(await getEntitlement(supa(), 'user-1')).toBe('free');
  });

  it('erro de leitura degrada para free, nunca libera pro', async () => {
    mockPlanRow.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await getEntitlement(supa(), 'user-1')).toBe('free');
  });

  it('valor inesperado no plano vira free', async () => {
    mockPlanRow.mockResolvedValue({ data: { plan: 'enterprise' }, error: null });
    expect(await getEntitlement(supa(), 'user-1')).toBe('free');
  });
});

describe('requireEntitlement — guard de rota', () => {
  it('401 quando não autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const result = await requireEntitlement();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('superfície manual (sem requirePlan): aceita free', async () => {
    mockPlanRow.mockResolvedValue({ data: { plan: 'free' }, error: null });
    const result = await requireEntitlement();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan).toBe('free');
  });

  it('superfície de IA: nega free com 402 plan_required', async () => {
    mockPlanRow.mockResolvedValue({ data: { plan: 'free' }, error: null });
    const result = await requireEntitlement({ requirePlan: 'pro' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(402);
      const body = await result.response.json();
      expect(body.code).toBe('plan_required');
    }
  });

  it('superfície de IA: libera pro', async () => {
    mockPlanRow.mockResolvedValue({ data: { plan: 'pro' }, error: null });
    const result = await requireEntitlement({ requirePlan: 'pro' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan).toBe('pro');
  });
});
