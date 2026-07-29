import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Split de guards no generate-carousel: a superfície MANUAL aceita free; a
 * superfície de IA exige plano pago e nega o free CEDO (code 'plan_required'),
 * ANTES de qualquer débito de crédito ou chamada à OpenAI.
 *
 * Cenário load-bearing: usuário COM assinatura ativa mas entitlement 'free'.
 * O guard de entitlement é a autoridade — sem ele, a mera presença da
 * assinatura deixaria requireCredits debitar e a OpenAI ser chamada. Com ele,
 * o free é barrado antes de tudo. Remover a linha requireEntitlement({
 * requirePlan: 'pro' }) da rota faz este teste FALHAR (openai/consume_credits
 * passam a ser chamados).
 */

const { mockGetUser, mockFrom, mockRpc, mockOpenAiCreate, mockAdminRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockOpenAiCreate: vi.fn(),
  mockAdminRpc: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({ rpc: mockAdminRpc }),
}));

vi.mock('@/lib/openai', () => ({
  openai: { responses: { create: mockOpenAiCreate } },
  CAROUSEL_SYSTEM_PROMPT: 'sys',
  TWITTER_CAROUSEL_SYSTEM_PROMPT: 'sys-tw',
  WEB_SEARCH_PROMPT_ADDENDUM: 'ws',
}));

vi.mock('@/lib/brand-context', () => ({
  getBrandContext: vi.fn(async () => undefined),
  formatBrandContextAsPrompt: () => '',
}));

const ACTIVE_SUB = {
  subscription_id: 'sub-1',
  status: 'active',
  price_id: 'prod-1',
  plan_interval: 'month',
  cancel_at_period_end: false,
  current_period_end: null,
  trial_end: null,
};

function configureSupabase({ plan, sub }: { plan: string | null; sub: unknown }) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'user_entitlements') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: plan ? { plan } : null, error: null }) }),
        }),
      };
    }
    if (table === 'user_active_subscription') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: sub, error: null }) }),
        }),
      };
    }
    throw new Error(`Tabela inesperada: ${table}`);
  });
}

async function route() {
  vi.resetModules();
  return import('../app/api/generate-carousel/route');
}

function req(body: unknown) {
  return new Request('http://local/api/generate-carousel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mockRpc.mockResolvedValue({ data: 195, error: null });
  mockAdminRpc.mockResolvedValue({ data: 200, error: null });
  mockOpenAiCreate.mockResolvedValue({
    output_text: JSON.stringify({
      slides: [{ id: 1, title: 't', description: 'd', highlightWord: '', backgroundColor: '#000' }],
      caption: 'c',
      hashtags: ['#a'],
    }),
  });
});

afterEach(() => vi.clearAllMocks());

const AI_BODY = { prompt: 'tema', slideCount: 5, imageType: 'ai', style: 'minimalist' };

describe('POST /api/generate-carousel — split de guards', () => {
  it('IA + free (mesmo com assinatura ativa) → 402 plan_required, sem OpenAI e sem débito', async () => {
    configureSupabase({ plan: 'free', sub: ACTIVE_SUB });
    const res = await (await route()).POST(req({ ...AI_BODY, manual: false }) as never);

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe('plan_required');
    expect(mockOpenAiCreate).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled(); // consume_credits nunca chamado
  });

  it('IA + entitlement ausente → tratado como free, 402 plan_required', async () => {
    configureSupabase({ plan: null, sub: ACTIVE_SUB });
    const res = await (await route()).POST(req({ ...AI_BODY, manual: false }) as never);

    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe('plan_required');
    expect(mockOpenAiCreate).not.toHaveBeenCalled();
  });

  it('MANUAL + free → 200 com esqueleto, sem OpenAI e sem débito', async () => {
    configureSupabase({ plan: 'free', sub: null });
    const res = await (await route()).POST(req({ manual: true, slideCount: 3 }) as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slides).toHaveLength(3);
    expect(mockOpenAiCreate).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('MANUAL sem sessão → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    configureSupabase({ plan: null, sub: null });
    const res = await (await route()).POST(req({ manual: true, slideCount: 3 }) as never);
    expect(res.status).toBe(401);
    expect(mockOpenAiCreate).not.toHaveBeenCalled();
  });

  it('IA + pro → gera: OpenAI chamada e crédito debitado', async () => {
    configureSupabase({ plan: 'pro', sub: ACTIVE_SUB });
    const res = await (await route()).POST(req({ ...AI_BODY, manual: false }) as never);

    expect(res.status).toBe(200);
    expect(mockOpenAiCreate).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('consume_credits', { p_user: 'user-1', p_cost: 5 });
  });
});
