import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetUser,
  mockSubscriptionActive,
  mockRpc,
  mockAdminRpc,
  mockResponsesCreate,
  mockImagesGenerate,
  mockUpload,
  mockGetPublicUrl,
  mockAfter,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSubscriptionActive: { value: true },
  mockRpc: vi.fn(),
  mockAdminRpc: vi.fn(),
  mockResponsesCreate: vi.fn(),
  mockImagesGenerate: vi.fn(),
  mockUpload: vi.fn(),
  mockGetPublicUrl: vi.fn(),
  mockAfter: vi.fn((task: () => Promise<void>) => { void task().catch(() => undefined); }),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: mockAfter,
}));

vi.mock('openai', () => ({
  default: class OpenAI {},
  toFile: vi.fn(),
}));

vi.mock('@/lib/openai', () => ({
  openai: {
    responses: { create: mockResponsesCreate },
    images: { generate: mockImagesGenerate },
  },
  CAROUSEL_SYSTEM_PROMPT: 'SYSTEM_CAROUSEL',
  TWITTER_CAROUSEL_SYSTEM_PROMPT: 'SYSTEM_TWITTER',
  WEB_SEARCH_PROMPT_ADDENDUM: 'ADDENDUM',
  buildImagePrompt: () => 'image prompt',
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === 'user_active_subscription' && mockSubscriptionActive.value ? ACTIVE_SUB : null,
            error: null,
          }),
        }),
      }),
    }),
    rpc: mockRpc,
    storage: {
      from: () => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl }),
    },
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({ rpc: mockAdminRpc }),
}));

vi.mock('@/lib/product-events', () => ({
  normalizeGenerationError: () => 'generation_failed',
  recordAiGenerationBestEffort: vi.fn().mockResolvedValue(undefined),
}));

import { POST as generateCarousel } from '../app/api/generate-carousel/route';
import { POST as generateImage } from '../app/api/generate-image/route';

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

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function carouselRequest(extra: Record<string, unknown> = {}) {
  return request('/api/generate-carousel', {
    prompt: 'como criar conteúdo melhor',
    style: 'editorial',
    slideCount: 5,
    imageType: 'none',
    generateImages: false,
    ...extra,
  });
}

function imageRequest() {
  return request('/api/generate-image', {
    slideId: 'slide-1',
    title: 'Uma imagem de teste',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: USER }, error: null });
  mockSubscriptionActive.value = true;
  mockRpc.mockResolvedValue({ data: 95, error: null });
  mockAdminRpc.mockResolvedValue({ data: null, error: null });
  mockResponsesCreate.mockResolvedValue({
    output_text: JSON.stringify({ slides: [], caption: '', hashtags: [] }),
    usage: {},
  });
  mockImagesGenerate.mockResolvedValue({ data: [{ b64_json: 'aW1hZ2U=' }] });
  mockUpload.mockResolvedValue({ error: null });
  mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.test/image.png' } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/generate-carousel — assinatura e créditos', () => {
  it('assinante gera carrossel sem chamar consumo nem estorno de créditos', async () => {
    const response = await generateCarousel(carouselRequest());

    expect(response.status).toBe(200);
    expect(mockResponsesCreate).toHaveBeenCalledTimes(1);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it('falha de geração sem cobrança não tenta estornar zero', async () => {
    mockResponsesCreate.mockRejectedValueOnce(new Error('OpenAI indisponível'));

    const response = await generateCarousel(carouselRequest());

    expect(response.status).toBe(500);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it('sem sessão retorna 401 antes de OpenAI e dos RPCs', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const response = await generateCarousel(carouselRequest());

    expect(response.status).toBe(401);
    expect(mockResponsesCreate).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('sem assinatura ativa retorna 402 subscription_required antes de gerar', async () => {
    mockSubscriptionActive.value = false;

    const response = await generateCarousel(carouselRequest());

    expect(response.status).toBe(402);
    expect((await response.json()).code).toBe('subscription_required');
    expect(mockResponsesCreate).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('imagem continua cobrando 5 créditos via consume_credits_tracked', async () => {
    const response = await generateImage(imageRequest());

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('consume_credits_tracked', expect.objectContaining({
      p_user: USER.id,
      p_cost: 5,
      p_feature: 'image',
      p_idempotency_key: expect.any(String),
    }));
    expect(mockImagesGenerate).toHaveBeenCalledTimes(1);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });
});
