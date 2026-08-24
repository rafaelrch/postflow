import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * A ROTA DE IMAGEM DEPOIS DA TASK 4 — o que NÃO podia mudar.
 *
 * A task mexeu no prompt e trouxe o contexto de marca para dentro da rota. Duas
 * coisas ficaram explicitamente fora: o fluxo de crédito (cobra ANTES, estorna
 * no catch) e o mapeamento de erro 403/402/429.
 *
 * Estes testes existem porque a marca é lida do banco DEPOIS do débito de
 * crédito. Se essa leitura caísse no `catch` de fora, um perfil ilegível
 * passaria a estornar crédito e devolver erro para o usuário — uma falha nova,
 * inventada por uma melhoria de prompt. O `try/catch` próprio em volta do
 * `getBrandContext` é o que impede isso, e é isso que se afirma aqui.
 */

// `vi.hoisted` porque as factories de `vi.mock` sobem para o topo do arquivo e
// não enxergam variável declarada depois. É o mesmo padrão de
// tests/generate-carousel-credits.test.ts.
const {
  mockImagesGenerate, mockGetUser, mockRpc, mockAdminRpc,
  mockUpload, mockGetPublicUrl, mockProfileSingle, mockAfter, mockBuildImagePrompt,
} = vi.hoisted(() => ({
  mockImagesGenerate: vi.fn(),
  // Espião, não constante: o prompt tem testes próprios, mas o que a ROTA
  // MONTA e entrega ao builder só dá para afirmar aqui.
  mockBuildImagePrompt: vi.fn((_input: {
    series?: { deckTitle?: string; size?: number; index?: number };
    hasReference?: boolean;
  }) => 'image prompt'),
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
  mockAdminRpc: vi.fn(),
  mockUpload: vi.fn(),
  mockGetPublicUrl: vi.fn(),
  mockProfileSingle: vi.fn(),
  // `after()` do Next não roda fora do request: a telemetria vira chamada
  // direta, senão a rota estoura ao registrar o evento.
  mockAfter: vi.fn((task: () => Promise<void>) => { void task().catch(() => undefined); }),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: mockAfter,
}));

vi.mock('openai', () => ({ default: class OpenAI {}, toFile: vi.fn() }));

// O prompt tem testes próprios (build-image-prompt). Aqui interessa a ROTA.
vi.mock('@/lib/openai', () => ({
  openai: { images: { generate: mockImagesGenerate, edit: vi.fn() } },
  buildImagePrompt: mockBuildImagePrompt,
  imageSizeForShape: () => '1024x1536',
}));

const ACTIVE_SUB = {
  subscription_id: 'sub_1', status: 'active', price_id: 'price_1',
  plan_interval: 'month', cancel_at_period_end: false,
  current_period_end: null, trial_end: null,
};

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === 'profiles'
              ? mockProfileSingle()
              : { data: table === 'user_active_subscription' ? ACTIVE_SUB : null, error: null },
        }),
      }),
    }),
    rpc: mockRpc,
    storage: { from: () => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl }) },
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({ rpc: mockAdminRpc }),
}));

vi.mock('@/lib/product-events', () => ({
  normalizeGenerationError: () => 'generation_failed',
  recordAiGenerationBestEffort: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '../app/api/generate-image/route';

function pedido(body: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/generate-image', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slideId: 'slide-1', title: 'Uma imagem de teste', ...body }),
  });
}

/** Quantas vezes o RPC de ESTORNO foi chamado. */
function estornos(): number {
  return [...mockRpc.mock.calls, ...mockAdminRpc.mock.calls]
    .filter(([nome]) => typeof nome === 'string' && /refund/i.test(nome)).length;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
  mockRpc.mockResolvedValue({ data: 95, error: null });
  mockAdminRpc.mockResolvedValue({ data: null, error: null });
  mockProfileSingle.mockResolvedValue({ data: null, error: null });
  mockUpload.mockResolvedValue({ error: null });
  mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn/x.png' } });
  mockImagesGenerate.mockResolvedValue({ data: [{ b64_json: 'AAAA' }], usage: {} });
});

describe('o mapeamento de erro da OpenAI continua igual', () => {
  it('organização não verificada vira 403', async () => {
    mockImagesGenerate.mockRejectedValue(new Error('Your organization must be verified'));
    const r = await POST(pedido());
    expect(r.status).toBe(403);
  });

  it('billing/quota vira 402', async () => {
    mockImagesGenerate.mockRejectedValue(new Error('insufficient quota for billing'));
    const r = await POST(pedido());
    expect(r.status).toBe(402);
  });

  it('rate limit vira 429, preservando a mensagem que diz quanto esperar', async () => {
    mockImagesGenerate.mockRejectedValue(new Error('429 Rate limit reached. Please try again in 12s.'));
    const r = await POST(pedido());
    expect(r.status).toBe(429);
    expect((await r.json()).error).toMatch(/try again in 12s/);
  });

  it('resposta sem imagem vira 502', async () => {
    mockImagesGenerate.mockResolvedValue({ data: [], usage: {} });
    const r = await POST(pedido());
    expect(r.status).toBe(502);
  });
});

describe('o estorno de crédito continua acontecendo em toda falha', () => {
  it.each([
    ['403 verificação', 'Your organization must be verified'],
    ['402 billing', 'insufficient quota'],
    ['429 rate limit', '429 Rate limit reached'],
    ['erro genérico', 'algo explodiu'],
  ])('%s estorna', async (_nome, mensagem) => {
    mockImagesGenerate.mockRejectedValue(new Error(mensagem));
    await POST(pedido());
    expect(estornos()).toBeGreaterThan(0);
  });

  it('sucesso NÃO estorna', async () => {
    const r = await POST(pedido());
    expect(r.status).toBe(200);
    expect(estornos()).toBe(0);
  });
});

describe('🔴 a leitura da marca não pode virar uma falha nova', () => {
  it('perfil que estoura NÃO derruba a geração nem estorna', async () => {
    // Se o `getBrandContext` caísse no catch de fora, isto seria 500 + estorno:
    // o usuário perderia a imagem por causa de uma linha de perfil ilegível.
    mockProfileSingle.mockRejectedValue(new Error('conexão caiu'));
    const r = await POST(pedido());
    expect(r.status).toBe(200);
    expect(estornos()).toBe(0);
  });

  it('perfil com erro do Supabase segue para o prompt genérico', async () => {
    mockProfileSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    const r = await POST(pedido());
    expect(r.status).toBe(200);
  });

  it('perfil preenchido não muda o desfecho da rota', async () => {
    mockProfileSingle.mockResolvedValue({
      data: {
        niche: 'Fitness', audience: 'Mulheres 30+', brand_story: 'x',
        audience_pains: 'y', default_tone: 'direto', brand_palette: ['#0D39E4'],
      },
      error: null,
    });
    const r = await POST(pedido());
    expect(r.status).toBe(200);
    expect(mockImagesGenerate).toHaveBeenCalledTimes(1);
  });
});

describe('os campos novos do corpo são validados — vêm do cliente', () => {
  it('surface desconhecida não quebra a rota', async () => {
    const r = await POST(pedido({ surface: 'roxo' }));
    expect(r.status).toBe(200);
  });

  it('seriesSize absurdo ou não numérico não quebra a rota', async () => {
    for (const seriesSize of [Number.NaN, -5, 1e9, 'muitos', null]) {
      vi.clearAllMocks();
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
      mockRpc.mockResolvedValue({ data: 95, error: null });
      mockProfileSingle.mockResolvedValue({ data: null, error: null });
      mockUpload.mockResolvedValue({ error: null });
      mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn/x.png' } });
      mockImagesGenerate.mockResolvedValue({ data: [{ b64_json: 'AAAA' }], usage: {} });
      const r = await POST(pedido({ seriesSize }));
      expect(r.status).toBe(200);
    }
  });

  it('🔴 seriesIndex chega ao builder dentro da série, junto de deckTitle e size', async () => {
    // A fatia 4 abriu um campo NOVO no corpo do POST. Se ele parasse na rota, o
    // enquadramento por slide existiria no builder e nunca seria usado — o
    // defeito mais fácil de não notar, porque nada quebra.
    await POST(pedido({ seriesIndex: 3, seriesSize: 6, deckTitle: 'Rotina' }));
    expect(mockBuildImagePrompt).toHaveBeenCalledTimes(1);
    expect(mockBuildImagePrompt.mock.calls[0]?.[0]).toMatchObject({
      series: { deckTitle: 'Rotina', size: 6, index: 3 },
    });
  });

  it('seriesIndex ausente continua chegando como undefined — chamada de hoje intacta', async () => {
    await POST(pedido({ seriesSize: 4 }));
    expect(mockBuildImagePrompt.mock.calls[0]?.[0].series?.index).toBeUndefined();
  });

  it('seriesIndex absurdo ou não numérico não quebra a rota nem vaza para o prompt', async () => {
    for (const seriesIndex of [Number.NaN, -5, 0, 1e9, 'terceiro', null]) {
      vi.clearAllMocks();
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
      mockRpc.mockResolvedValue({ data: 95, error: null });
      mockProfileSingle.mockResolvedValue({ data: null, error: null });
      mockUpload.mockResolvedValue({ error: null });
      mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn/x.png' } });
      mockImagesGenerate.mockResolvedValue({ data: [{ b64_json: 'AAAA' }], usage: {} });
      const r = await POST(pedido({ seriesIndex }));
      expect(r.status).toBe(200);
      const recebido = mockBuildImagePrompt.mock.calls[0]?.[0].series?.index;
      // 1e9 é finito e positivo: a rota o apara para o teto, não deixa passar.
      expect(recebido === undefined || (Number.isInteger(recebido) && recebido > 0 && recebido <= 50)).toBe(true);
    }
  });

  it('🔴 hasReference chega ao builder, derivado do referenceImageUrl', async () => {
    // É a ÚNICA coisa que a rota informa ao prompt sobre a referência. O que a
    // foto MOSTRA é pergunta para quem consegue olhar para ela — o modelo, que
    // recebe a imagem junto no images.edit.
    await POST(pedido({ referenceImageUrl: 'https://cdn/pessoa.png' }));
    expect(mockBuildImagePrompt.mock.calls[0]?.[0].hasReference).toBe(true);
  });

  it('sem referência, hasReference é falso', async () => {
    await POST(pedido());
    expect(mockBuildImagePrompt.mock.calls[0]?.[0].hasReference).toBe(false);
  });

  it('🔴 hasReference NÃO é campo do cliente — o corpo não consegue forjá-lo', async () => {
    // Se o cliente pudesse afirmar isso, haveria duas verdades sobre a mesma
    // pergunta, e a que decide images.edit poderia discordar da que monta o
    // prompt. Quem manda é sempre o referenceImageUrl.
    await POST(pedido({ hasReference: true }));
    expect(mockBuildImagePrompt.mock.calls[0]?.[0].hasReference).toBe(false);
  });

  it('🔴 os sinalizadores de modo NÃO existem mais no contrato da rota', async () => {
    // A correção de rumo do Rafael: os checkboxes saíram, e com eles os campos.
    // Mandar os antigos não pode ligar nada nem quebrar a rota — corpo de um
    // cliente velho em cache continua sendo atendido.
    const r = await POST(
      pedido({ referenceMode: 'identity', allowRequestedBrands: true, allowPublicFigures: true }),
    );
    expect(r.status).toBe(200);
    const recebido = mockBuildImagePrompt.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(recebido.referenceMode).toBeUndefined();
    expect(recebido.allowRequestedBrands).toBeUndefined();
    expect(recebido.allowPublicFigures).toBeUndefined();
  });

  it('deckTitle gigante não quebra a rota', async () => {
    const r = await POST(pedido({ deckTitle: 'x'.repeat(5000) }));
    expect(r.status).toBe(200);
  });

  it('slideId ou title ausentes continuam sendo 400, antes de cobrar', async () => {
    const semTitulo = new NextRequest('http://localhost/api/generate-image', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slideId: 'slide-1' }),
    });
    const r = await POST(semTitulo);
    expect(r.status).toBe(400);
    expect(mockImagesGenerate).not.toHaveBeenCalled();
  });
});
