import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Suíte da rota /api/refine-text.
 *
 * A OpenAI é MOCKADA em todos os casos — nenhuma chamada real, nenhum crédito
 * e nenhuma chave. O que interessa aqui não é o texto que a IA escreve, é o
 * que a rota ACEITA de volta dela: as regras duras (só texto, contagem
 * imutável, chaves de slot imutáveis, escopo literal, teto de tamanho) são
 * garantidas no servidor, então cada uma é provada mandando a IA violá-la.
 */

const { mockGetUser, mockSubscriptionActive, mockRpc, mockAdminRpc, mockResponsesCreate, mockAfter } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSubscriptionActive: { value: true },
  mockRpc: vi.fn(),
  mockAdminRpc: vi.fn(),
  mockResponsesCreate: vi.fn(),
  mockAfter: vi.fn((task: () => Promise<void>) => { void task().catch(() => undefined); }),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: mockAfter,
}));

vi.mock('openai', () => ({ default: class OpenAI {}, toFile: vi.fn() }));

// Só o CLIENT da OpenAI é mockado. REFINE_SYSTEM_PROMPT e o resto de
// lib/refine-text.ts entram de verdade — são puros e é o que está sob teste.
vi.mock('@/lib/openai', async () => ({
  openai: { responses: { create: mockResponsesCreate } },
  REFINE_SYSTEM_PROMPT: (await import('../lib/refine-text')).REFINE_SYSTEM_PROMPT,
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
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabaseClient: () => ({ rpc: mockAdminRpc }) }));

vi.mock('@/lib/product-events', () => ({
  normalizeGenerationError: () => 'generation_failed',
  recordAiGenerationBestEffort: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '../app/api/refine-text/route';
import { __resetRateLimit } from '../lib/rate-limit';
import { MAX_INSTRUCTION_LENGTH, maxLengthFor } from '../lib/refine-text';

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

/** Três slides com todos os tipos de campo em jogo, inclusive um slot de imagem. */
function baseSlides() {
  return [
    {
      position: 1,
      title: 'O erro que trava seu carrossel',
      description: 'A maioria escreve para si mesma, não para quem lê.',
      subtitle: 'Capa',
      templateSlots: { 's1.headline': '*Um estudo de 2026', 's1.image': 'https://cdn.test/capa.png' },
    },
    {
      position: 2,
      title: 'Comece pelo fim',
      description: 'Defina a ação antes de escrever a primeira frase.',
    },
    {
      position: 3,
      title: 'Me segue pra mais',
      description: 'Toda semana um carrossel novo.',
    },
  ];
}

function body(extra: Record<string, unknown> = {}) {
  return { scope: 'carousel', style: 'editorial', slides: baseSlides(), ...extra };
}

function request(payload: unknown) {
  return new NextRequest('http://localhost/api/refine-text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Faz a IA "responder" exatamente estes slides. */
function aiReturns(slides: unknown) {
  mockResponsesCreate.mockResolvedValue({ output_text: JSON.stringify({ slides }), usage: {} });
}

/** A resposta ideal: a IA devolve o carrossel inalterado. */
function echoSlides() {
  return baseSlides();
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimit();
  mockGetUser.mockResolvedValue({ data: { user: USER }, error: null });
  mockSubscriptionActive.value = true;
  mockRpc.mockResolvedValue({ data: 95, error: null });
  mockAdminRpc.mockResolvedValue({ data: null, error: null });
  aiReturns(echoSlides());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => { vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------

describe('POST /api/refine-text — contrato de acesso', () => {
  it('sem sessão retorna 401 antes de chamar a OpenAI', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const res = await POST(request(body()));

    expect(res.status).toBe(401);
    expect(mockResponsesCreate).not.toHaveBeenCalled();
  });

  it('sem assinatura ativa retorna 402 subscription_required antes de chamar a OpenAI', async () => {
    mockSubscriptionActive.value = false;

    const res = await POST(request(body()));

    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe('subscription_required');
    expect(mockResponsesCreate).not.toHaveBeenCalled();
  });

  it('não debita nem estorna crédito — refinar reusa o custo 0 do carrossel', async () => {
    const res = await POST(request(body()));

    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/refine-text — corpo inválido devolve 400 com motivo', () => {
  const casos: Array<[string, unknown]> = [
    ['scope fora do conjunto', body({ scope: 'tudo' })],
    ['scope ausente', { style: 'editorial', slides: baseSlides() }],
    ['style fora do conjunto', body({ style: 'neon' })],
    ['slides vazio', body({ slides: [] })],
    ['slides não é array', body({ slides: 'nada' })],
    ['slideIndex ausente em scope slide', body({ scope: 'slide' })],
    ['slideIndex fora do intervalo', body({ scope: 'slide', slideIndex: 9 })],
    ['field ausente em scope field', body({ scope: 'field', slideIndex: 0 })],
    ['field inexistente no slide', body({ scope: 'field', slideIndex: 0, field: 'backgroundColor' })],
    ['title não é string', body({ slides: [{ position: 1, title: 42 }] })],
  ];

  it.each(casos)('%s', async (_nome, payload) => {
    const res = await POST(request(payload));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('invalid_body');
    expect(typeof json.error).toBe('string');
    expect(json.error.length).toBeGreaterThan(0);
    expect(mockResponsesCreate).not.toHaveBeenCalled();
  });

  it('corpo que não é JSON devolve 400 sem chamar a OpenAI', async () => {
    const res = await POST(new NextRequest('http://localhost/api/refine-text', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'isto não é json',
    }));

    expect(res.status).toBe(400);
    expect(mockResponsesCreate).not.toHaveBeenCalled();
  });

  it(`instruction acima de ${MAX_INSTRUCTION_LENGTH} caracteres é REJEITADA, não aparada`, async () => {
    const res = await POST(request(body({ instruction: 'a'.repeat(MAX_INSTRUCTION_LENGTH + 1) })));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(String(MAX_INSTRUCTION_LENGTH));
    expect(mockResponsesCreate).not.toHaveBeenCalled();
  });

  it(`instruction de exatamente ${MAX_INSTRUCTION_LENGTH} caracteres passa`, async () => {
    const res = await POST(request(body({ instruction: 'a'.repeat(MAX_INSTRUCTION_LENGTH) })));

    expect(res.status).toBe(200);
  });
});

describe('POST /api/refine-text — escopo é literal', () => {
  it('scope carousel altera todos os slides e preserva quantidade e positions', async () => {
    aiReturns([
      { ...baseSlides()[0], title: 'O erro que trava tudo' },
      { ...baseSlides()[1], title: 'Comece pelo final' },
      { ...baseSlides()[2], title: 'Me segue pra ver' },
    ]);

    const res = await POST(request(body()));
    const { slides } = await res.json();

    expect(res.status).toBe(200);
    expect(slides).toHaveLength(3);
    expect(slides.map((s: { position: number }) => s.position)).toEqual([1, 2, 3]);
    expect(slides[0].title).toBe('O erro que trava tudo');
    expect(slides[1].title).toBe('Comece pelo final');
    expect(slides[2].title).toBe('Me segue pra ver');
  });

  it('scope slide só altera o slideIndex — os outros voltam idênticos', async () => {
    // A IA tenta mexer nos três; o servidor só deixa passar o slide 1.
    aiReturns([
      { ...baseSlides()[0], title: 'INVADIU A CAPA', description: 'INVADIU TAMBÉM' },
      { ...baseSlides()[1], title: 'Comece pelo final', description: 'Defina a ação antes de tudo.' },
      { ...baseSlides()[2], title: 'INVADIU O FIM' },
    ]);

    const res = await POST(request(body({ scope: 'slide', slideIndex: 1 })));
    const { slides } = await res.json();

    expect(slides[0]).toEqual(baseSlides()[0]);
    expect(slides[2]).toEqual(baseSlides()[2]);
    expect(slides[1].title).toBe('Comece pelo final');
    expect(slides[1].description).toBe('Defina a ação antes de tudo.');
  });

  it('scope field só altera aquele campo daquele slide', async () => {
    aiReturns([
      { ...baseSlides()[0], title: 'INVADIU O TÍTULO', description: 'Quase todo mundo escreve pra si.', subtitle: 'INVADIU' },
      { ...baseSlides()[1], title: 'INVADIU' },
      { ...baseSlides()[2], title: 'INVADIU' },
    ]);

    const res = await POST(request(body({ scope: 'field', slideIndex: 0, field: 'description' })));
    const { slides } = await res.json();

    expect(slides[0].title).toBe(baseSlides()[0].title);
    expect(slides[0].subtitle).toBe(baseSlides()[0].subtitle);
    expect(slides[0].templateSlots).toEqual(baseSlides()[0].templateSlots);
    expect(slides[0].description).toBe('Quase todo mundo escreve pra si.');
    expect(slides[1]).toEqual(baseSlides()[1]);
    expect(slides[2]).toEqual(baseSlides()[2]);
  });

  it('scope field aceita uma chave de templateSlots e não toca no resto', async () => {
    aiReturns([
      {
        ...baseSlides()[0],
        title: 'INVADIU',
        templateSlots: { 's1.headline': '*Um estudo recente', 's1.image': 'https://cdn.test/OUTRA.png' },
      },
      baseSlides()[1],
      baseSlides()[2],
    ]);

    const res = await POST(request(body({ scope: 'field', slideIndex: 0, field: 's1.headline' })));
    const { slides } = await res.json();

    expect(slides[0].title).toBe(baseSlides()[0].title);
    expect(slides[0].templateSlots['s1.headline']).toBe('*Um estudo recente');
    // Slot de imagem nunca muda: esta é uma rota de TEXTO.
    expect(slides[0].templateSlots['s1.image']).toBe('https://cdn.test/capa.png');
  });
});

describe('POST /api/refine-text — só texto sai da rota', () => {
  it('descarta qualquer chave de imagem, cor, fonte ou layout inventada pela IA', async () => {
    aiReturns([
      {
        ...baseSlides()[0],
        backgroundColor: '#FF0000',
        backgroundImageUrl: 'https://cdn.test/invadiu.png',
        titleFont: 'serif',
        fontSize: 'xl',
        contentLayout: 'split',
      },
      baseSlides()[1],
      baseSlides()[2],
    ]);

    const res = await POST(request(body()));
    const { slides } = await res.json();

    expect(Object.keys(slides[0]).sort()).toEqual(['description', 'position', 'subtitle', 'templateSlots', 'title']);
    expect(Object.keys(slides[1]).sort()).toEqual(['description', 'position', 'title']);
  });
});

describe('POST /api/refine-text — templateSlots têm chaves imutáveis', () => {
  it('chave nova inventada pela IA é descartada', async () => {
    aiReturns([
      {
        ...baseSlides()[0],
        templateSlots: { ...baseSlides()[0].templateSlots, 's1.inventado': 'texto que não existia' },
      },
      baseSlides()[1],
      baseSlides()[2],
    ]);

    const res = await POST(request(body()));
    const { slides } = await res.json();

    expect(Object.keys(slides[0].templateSlots).sort()).toEqual(['s1.headline', 's1.image']);
    expect(slides[0].templateSlots['s1.inventado']).toBeUndefined();
  });

  it('chave omitida pela IA volta com o valor original', async () => {
    aiReturns([
      { ...baseSlides()[0], templateSlots: { 's1.image': 'https://cdn.test/capa.png' } },
      baseSlides()[1],
      baseSlides()[2],
    ]);

    const res = await POST(request(body()));
    const { slides } = await res.json();

    expect(slides[0].templateSlots['s1.headline']).toBe('*Um estudo de 2026');
  });

  it('templateSlots inteiro omitido pela IA volta idêntico', async () => {
    const semSlots = { ...baseSlides()[0] } as Record<string, unknown>;
    delete semSlots.templateSlots;
    aiReturns([semSlots, baseSlides()[1], baseSlides()[2]]);

    const res = await POST(request(body()));
    const { slides } = await res.json();

    expect(slides[0].templateSlots).toEqual(baseSlides()[0].templateSlots);
  });
});

describe('POST /api/refine-text — teto de tamanho', () => {
  it('apara o campo que estoura original + 20%', async () => {
    const original = baseSlides()[0].title;
    const teto = maxLengthFor(original);
    aiReturns([
      { ...baseSlides()[0], title: 'palavra '.repeat(40).trim() },
      baseSlides()[1],
      baseSlides()[2],
    ]);

    const res = await POST(request(body()));
    const { slides } = await res.json();

    expect(slides[0].title.length).toBeLessThanOrEqual(teto);
    expect(slides[0].title.length).toBeGreaterThan(0);
  });

  it('texto dentro do teto passa inteiro, sem aparar', async () => {
    const curto = 'Curto e forte';
    aiReturns([{ ...baseSlides()[0], title: curto }, baseSlides()[1], baseSlides()[2]]);

    const res = await POST(request(body()));
    const { slides } = await res.json();

    expect(slides[0].title).toBe(curto);
  });

  it('o prompt DIZ o teto de cada campo, não só o servidor apara', async () => {
    await POST(request(body()));

    const prompt = mockResponsesCreate.mock.calls[0][0].input[0].content as string;
    expect(prompt).toContain(`máx ${maxLengthFor(baseSlides()[0].title)} caracteres`);
  });
});

describe('POST /api/refine-text — falha explícita, nunca melhor esforço', () => {
  it('JSON inválido da IA vira 502 e nada é alterado', async () => {
    mockResponsesCreate.mockResolvedValue({ output_text: 'desculpa, não consegui', usage: {} });

    const res = await POST(request(body()));

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.code).toBe('invalid_ai_response');
    expect(json.slides).toBeUndefined();
  });

  it('slides a MENOS vira erro — não completa o que faltou', async () => {
    aiReturns([baseSlides()[0], baseSlides()[1]]);

    const res = await POST(request(body()));

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.code).toBe('slide_count_mismatch');
    expect(json.slides).toBeUndefined();
  });

  it('slides a MAIS vira erro — não corta o excedente', async () => {
    aiReturns([...baseSlides(), { position: 4, title: 'Slide extra' }]);

    const res = await POST(request(body()));

    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('slide_count_mismatch');
  });

  it('position trocada vira erro', async () => {
    aiReturns([baseSlides()[0], { ...baseSlides()[1], position: 7 }, baseSlides()[2]]);

    const res = await POST(request(body()));

    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('position_mismatch');
  });

  it('resposta sem a lista "slides" vira erro', async () => {
    mockResponsesCreate.mockResolvedValue({ output_text: JSON.stringify({ texto: 'melhorado' }), usage: {} });

    const res = await POST(request(body()));

    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('invalid_shape');
  });

  it('OpenAI indisponível vira 500 sem estornar crédito nenhum', async () => {
    mockResponsesCreate.mockRejectedValueOnce(new Error('OpenAI indisponível'));

    const res = await POST(request(body()));

    expect(res.status).toBe(500);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/refine-text — idioma e direção do usuário chegam no prompt', () => {
  it('language pedido entra no prompt', async () => {
    await POST(request(body({ language: 'en-US' })));

    const prompt = mockResponsesCreate.mock.calls[0][0].input[0].content as string;
    expect(prompt).toContain('inglês (EUA)');
  });

  it('sem language, o prompt manda preservar o idioma original', async () => {
    await POST(request(body()));

    const prompt = mockResponsesCreate.mock.calls[0][0].input[0].content as string;
    expect(prompt).toContain('mantenha o mesmo idioma do texto original');
  });

  it('instruction do usuário entra no prompt', async () => {
    await POST(request(body({ instruction: 'deixe mais direto e sem adjetivo' })));

    const prompt = mockResponsesCreate.mock.calls[0][0].input[0].content as string;
    expect(prompt).toContain('deixe mais direto e sem adjetivo');
  });
});
