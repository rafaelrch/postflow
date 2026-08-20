// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide, SlideStyle } from '@/types';
import { useEditorStore } from '@/hooks/useEditorStore';

/**
 * QUEM ENTRA NO LOTE — uma pergunta, uma resposta.
 *
 * A conta estava espalhada: o filtro inline do `generateAll` decidia quem
 * gerava, e o `EditorSidebar` recontava por fora para o rótulo do botão. Duas
 * contas para a mesma pergunta, e a lista de conteúdo do painel (rodada 3)
 * seria a terceira.
 *
 * Este arquivo trava o acordo pela ponta que importa: os slides que
 * `batchTargets` promete têm de ser EXATAMENTE os slides que `generateAll` de
 * fato manda gerar. Se alguém reintroduzir um filtro paralelo em qualquer um
 * dos dois lados, quebra aqui.
 */

vi.mock('react-hot-toast', () => ({
  default: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), custom: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('@/hooks/useCreditsStore', () => ({
  useCreditsStore: { getState: () => ({ refresh: vi.fn() }) },
  handleInsufficientCredits: vi.fn(),
}));

import { batchTargets, useGenerateCarouselImages } from '@/hooks/useGenerateCarouselImages';

/** Os `slideId` que a geração pediu à API, na ordem em que foram pedidos. */
function idsGerados(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .map(([, init]) => JSON.parse((init as RequestInit).body as string).slideId as string)
    .sort();
}

function montaDeck(style: SlideStyle, n = 5) {
  const slides = Array.from({ length: n }, (_, i) => ({
    ...DEFAULT_SLIDE,
    id: `s${i}`,
    position: i,
    title: `Slide ${i + 1}`,
  })) as Slide[];
  useEditorStore.setState({ slides, activeSlideIndex: 0, style, globalSettings: DEFAULT_GLOBAL_SETTINGS });
  return slides;
}

beforeEach(() => {
  vi.restoreAllMocks();
  useEditorStore.setState({ slides: [], activeSlideIndex: 0 });
});

describe('batchTargets é a fonte única do lote', () => {
  const CASOS: Array<[SlideStyle, 'background' | 'content']> = [
    ['minimalist', 'background'],
    ['minimalist', 'content'],
    ['profile', 'background'],
    ['template01', 'background'],
    ['template02', 'background'],
    // O caso que separa as duas contas: no Editorial em 'content' a capa fica
    // de fora, porque a imagem dela vai no fundo pelo painel próprio.
    ['editorial', 'content'],
    ['editorial', 'background'],
  ];

  for (const [style, target] of CASOS) {
    it(`${style}/${target}: generateAll gera exatamente o que batchTargets promete`, async () => {
      const slides = montaDeck(style);
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ url: 'https://x/y.png' }),
      })) as unknown as ReturnType<typeof vi.fn>;
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useGenerateCarouselImages());
      await act(async () => {
        await result.current.generateAll(target);
      });

      const prometidos = batchTargets(slides, style, target).map((t) => t.slide.id).sort();
      expect(idsGerados(fetchMock)).toEqual(prometidos);
    });
  }

  it('Editorial: em conteúdo entram os internos; em fundo, só a capa', () => {
    // Sem esta asserção, os testes acima passariam com um `batchTargets` que
    // devolve tudo sempre — eles só comparam as duas pontas entre si.
    const slides = montaDeck('editorial');

    // A capa não tem shape de conteúdo.
    expect(batchTargets(slides, 'editorial', 'content').map((t) => t.index)).toEqual([1, 2, 3, 4]);
    // E os INTERNOS não desenham fundo: a imagem deles vai no card. A
    // expectativa antiga aqui era 5 — ou seja, gerar fundo para 4 slides que
    // não pintam fundo nenhum, cobrando por cada um.
    expect(batchTargets(slides, 'editorial', 'background').map((t) => t.index)).toEqual([0]);
  });

  it('nos outros estilos o lote é o deck inteiro, nos dois targets', () => {
    const slides = montaDeck('minimalist');
    expect(batchTargets(slides, 'minimalist', 'content')).toHaveLength(5);
    expect(batchTargets(slides, 'minimalist', 'background')).toHaveLength(5);
  });

  it('devolve o índice REAL do slide, não a posição dentro do lote', () => {
    // O `index` alimenta o `imagePatch` e o `imageShape` de cada slide: se ele
    // virasse 0..n-1 do lote filtrado, o Editorial gravaria no slide errado.
    const slides = montaDeck('editorial');
    for (const { slide, index } of batchTargets(slides, 'editorial', 'content')) {
      expect(slides[index].id).toBe(slide.id);
    }
  });
});

/**
 * O LOTE É "DESTE SLIDE EM DIANTE" — decisão do Rafael na rodada 4.
 *
 * Antes o segundo escopo era o deck inteiro. Ele testou no portal: num Atelier
 * de 5 slides, estando no slide 4, o botão dizia "Gerar nos 4 slides" — o
 * número estava certo para a regra antiga (a capa fora, elegíveis 2..5), mas
 * não era o que ele queria. Gerar do slide 4 tem de pegar 4 e 5.
 *
 * Estes testes existem porque a suíte acima passaria intacta na mudança: ela
 * compara as duas pontas entre si com `fromIndex` no padrão, e as duas se
 * moveram juntas. Aqui o parâmetro é exercitado de verdade.
 */
describe('fromIndex: o lote começa no slide atual', () => {
  it('slide 4 de 5: o lote é [4, 5], não o deck inteiro', () => {
    const slides = montaDeck('minimalist', 5);
    const alvos = batchTargets(slides, 'minimalist', 'content', 3);

    expect(alvos.map((t) => t.index)).toEqual([3, 4]);
  });

  it('o slide atual ENTRA no lote — é "restantes", não "seguintes"', () => {
    const slides = montaDeck('minimalist', 5);
    expect(batchTargets(slides, 'minimalist', 'content', 2)[0].index).toBe(2);
  });

  it('último slide: o lote é só ele', () => {
    const slides = montaDeck('minimalist', 5);
    expect(batchTargets(slides, 'minimalist', 'content', 4).map((t) => t.index)).toEqual([4]);
  });

  it('Editorial na capa: "em diante" ainda exclui a própria capa em conteúdo', () => {
    // Estar em cima da capa não a torna elegível: a imagem dela vai no fundo,
    // pelo painel próprio. Partindo do slide 1 o lote é 2..5.
    const slides = montaDeck('editorial', 5);
    expect(batchTargets(slides, 'editorial', 'content', 0).map((t) => t.index)).toEqual([1, 2, 3, 4]);
  });

  it('fromIndex além do fim: lote vazio, e generateAll não gera nada', async () => {
    const slides = montaDeck('minimalist', 5);
    expect(batchTargets(slides, 'minimalist', 'content', 5)).toEqual([]);

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useGenerateCarouselImages());
    await act(async () => {
      await result.current.generateAll('content', 5);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('generateAll respeita o fromIndex: gera exatamente o que batchTargets promete', async () => {
    const slides = montaDeck('editorial', 5);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://x/y.png' }),
    })) as unknown as ReturnType<typeof vi.fn>;
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useGenerateCarouselImages());
    await act(async () => {
      await result.current.generateAll('content', 3);
    });

    expect(idsGerados(fetchMock)).toEqual(
      batchTargets(slides, 'editorial', 'content', 3).map((t) => t.slide.id).sort()
    );
    // E o número é o novo, não o antigo: 2 slides, não os 4 elegíveis do deck.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

/**
 * SLIDE SEM ONDE PÔR A IMAGEM NÃO ENTRA NO LOTE — bug nosso, achado auditando.
 *
 * Cada geração debita CREDIT_COSTS.image. No Manifesto (template01) o modelo 6
 * não tem imagem nenhuma no desenho: `template01ImageSlot` devolve `undefined`
 * e `template01SetImage` devolve `{}`. O lote incluía esse slide assim mesmo —
 * chamava a API, cobrava 5 créditos, recebia a URL e aplicava um patch vazio.
 * Crédito queimado, nenhuma imagem, nenhum aviso.
 *
 * A causa foi a elegibilidade ser um `if` escrito à mão para a capa do
 * Editorial, em vez da pergunta geral "este slide tem destino para a imagem?".
 * Estes testes trancam a pergunta geral, nos cinco estilos.
 */
describe('elegibilidade: só entra quem tem onde pôr a imagem', () => {
  it('template01: o modelo 6 fica FORA — era o bug', () => {
    const slides = montaDeck('template01', 6);
    const alvos = batchTargets(slides, 'template01', 'background', 0);

    expect(alvos.map((t) => t.index)).toEqual([0, 1, 2, 3, 4]);
    expect(alvos).toHaveLength(5);
  });

  it('template01: nem sendo o ponto de partida o modelo 6 entra', () => {
    // Estar em cima dele não o torna elegível.
    const slides = montaDeck('template01', 6);
    expect(batchTargets(slides, 'template01', 'background', 5)).toEqual([]);
  });

  it('template01: e o generateAll não chama a API para ele', () => {
    // A ponta que custa dinheiro: uma requisição a menos é 5 créditos a menos.
    const slides = montaDeck('template01', 6);
    expect(batchTargets(slides, 'template01', 'background').map((t) => t.slide.id))
      .not.toContain(slides[5].id);
  });

  it('template02: todo modelo tem imagem, ninguém fica de fora', () => {
    const slides = montaDeck('template02', 6);
    expect(batchTargets(slides, 'template02', 'background')).toHaveLength(6);
  });

  it('editorial text-only fica de fora: não tem card onde a imagem entre', () => {
    // Terceiro caso da mesma família, achado na varredura. `showImageBox` em
    // `EditorialSlide` exclui o `text-only`, então a imagem nunca apareceria.
    const slides = montaDeck('editorial', 4).map((s, i) =>
      i === 2 ? { ...s, contentLayout: 'text-only' as const } : s
    );
    expect(batchTargets(slides, 'editorial', 'content').map((t) => t.index)).toEqual([1, 3]);
  });

  it('profile: gerar imagem de CONTEÚDO não muda nada — fica fora', () => {
    // O ProfileSlide desenha a mídia de `gridImageUrl`/`backgroundImageUrl` e
    // nunca lê `contentImageUrl`.
    const slides = montaDeck('profile', 3);
    expect(batchTargets(slides, 'profile', 'content')).toEqual([]);
    expect(batchTargets(slides, 'profile', 'background')).toHaveLength(3);
  });

  it('minimalist: desenha fundo e card, então os dois targets valem', () => {
    const slides = montaDeck('minimalist', 3);
    expect(batchTargets(slides, 'minimalist', 'content')).toHaveLength(3);
    expect(batchTargets(slides, 'minimalist', 'background')).toHaveLength(3);
  });
});
