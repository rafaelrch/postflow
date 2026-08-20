// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, GlobalSettings, Slide, SlideStyle } from '@/types';
import { useEditorStore } from '@/hooks/useEditorStore';
import {
  ExportImageError,
  applyEmbeddedImages,
  preloadExportImages,
  slideImageUrls,
} from '@/lib/export-images';

/**
 * BLINDAGEM DA EXPORTAÇÃO — decisão do Rafael depois do bug do PNG sem imagem.
 *
 * O html-to-image guarda no cache de módulo dele também o FRACASSO de um
 * download: a partir de uma falha, toda exportação daquela aba sai sem imagem,
 * em silêncio, até um reload. A saída é baixar as imagens nós mesmos e entregar
 * o slide já com `data:` — a lib pula o que já é data URL e nunca chega àquele
 * cache — e, quando um download falha, avisar em vez de entregar arquivo mudo.
 */

const FOTO = 'https://abc.supabase.co/storage/v1/object/public/postflow-assets/u/foto.png';
const OUTRA = 'https://abc.supabase.co/storage/v1/object/public/postflow-assets/u/outra.png';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const redeOk = (registro?: string[]) =>
  vi.stubGlobal('fetch', async (u: string) => {
    registro?.push(u);
    return { ok: true, status: 200, blob: async () => new Blob([PNG], { type: 'image/png' }) };
  });

const s = (extra: Partial<Slide> = {}): Slide => ({ ...DEFAULT_SLIDE, ...extra }) as Slide;
const G = DEFAULT_GLOBAL_SETTINGS as GlobalSettings;

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('slideImageUrls — a coleta sai do ESTADO, não do DOM', () => {
  it('minimalist: fundo e imagem de conteúdo', () => {
    const urls = slideImageUrls(
      [s({ backgroundImageUrl: FOTO }), s({ contentImageUrl: OUTRA })],
      'minimalist',
      G
    );
    expect(urls).toEqual([FOTO, OUTRA]);
  });

  it('de-duplica a mesma imagem repetida entre slides', () => {
    // É o caso do ZIP: N slides, a mesma imagem. Baixar uma vez, não N.
    const urls = slideImageUrls(
      [s({ backgroundImageUrl: FOTO }), s({ backgroundImageUrl: FOTO }), s({ contentImageUrl: FOTO })],
      'minimalist',
      G
    );
    expect(urls).toEqual([FOTO]);
  });

  it('templates: pega os slots de imagem, e ignora os slots de TEXTO', () => {
    const urls = slideImageUrls(
      [s({ templateSlots: { 'cover.image': FOTO, 'cover.title': 'Um título qualquer' } })],
      'template02',
      G
    );
    expect(urls).toEqual([FOTO]);
  });

  it('editorial: a capa entra pelo fundo, o interno pelo card', () => {
    const urls = slideImageUrls(
      [
        s({ contentLayout: 'cover', backgroundImageUrl: FOTO }),
        s({ contentLayout: 'text-image-text', contentImageUrl: OUTRA }),
      ],
      'editorial',
      G
    );
    expect(urls).toEqual([FOTO, OUTRA]);
  });

  it('editorial: fundo salvo em slide INTERNO não é baixado', () => {
    // É dado morto de deck antigo — no Editorial a imagem do interno vai no
    // card. Baixá-lo poderia barrar a exportação por uma imagem que nem aparece.
    const urls = slideImageUrls(
      [s({ contentLayout: 'cover' }), s({ contentLayout: 'text-image-text', backgroundImageUrl: FOTO })],
      'editorial',
      G
    );
    expect(urls).toEqual([]);
  });

  it('profile: a foto do selo entra junto com a mídia do post', () => {
    const settings = {
      ...G,
      profileBadge: { ...G.profileBadge, photo: OUTRA },
    } as GlobalSettings;
    expect(slideImageUrls([s({ gridImageUrl: FOTO })], 'profile', settings)).toEqual([OUTRA, FOTO]);
  });

  it('ignora data URL e caminho local — não há o que baixar', () => {
    const urls = slideImageUrls(
      [s({ backgroundImageUrl: 'data:image/png;base64,AAAA' }), s({ contentImageUrl: '/local.png' })],
      'minimalist',
      G
    );
    expect(urls).toEqual([]);
  });
});

describe('preloadExportImages', () => {
  it('baixa cada URL uma vez e devolve o mapa', async () => {
    const pedidos: string[] = [];
    redeOk(pedidos);

    const mapa = await preloadExportImages([FOTO, OUTRA]);

    expect(pedidos).toEqual([FOTO, OUTRA]);
    expect(mapa.get(FOTO)).toMatch(/^data:image\/png;base64,/);
  });

  it('não gruda cache-bust na URL', async () => {
    const pedidos: string[] = [];
    redeOk(pedidos);
    await preloadExportImages([FOTO]);
    expect(pedidos[0]).not.toMatch(/\?/);
  });

  it('estoura com ExportImageError quando a rede falha', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(preloadExportImages([FOTO])).rejects.toBeInstanceOf(ExportImageError);
  });

  it('estoura também em resposta não-ok, não só em exceção', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 403, blob: async () => new Blob() }));
    await expect(preloadExportImages([FOTO])).rejects.toBeInstanceOf(ExportImageError);
  });
});

describe('applyEmbeddedImages', () => {
  it('troca a URL pelo data URL e desfaz depois', () => {
    const root = document.createElement('div');
    const camada = document.createElement('div');
    camada.style.backgroundImage = `url("${FOTO}")`;
    root.appendChild(camada);

    const desfazer = applyEmbeddedImages(root, new Map([[FOTO, 'data:image/png;base64,AAA']]));
    expect(camada.style.backgroundImage).toContain('data:image/png;base64,AAA');
    expect(camada.style.backgroundImage).not.toContain('supabase');

    desfazer();
    expect(camada.style.backgroundImage).toContain(FOTO);
  });

  // ⚠️ Hoje NENHUM estilo desenha imagem de slide num `<img>`: o Perfil foi o
  // último e voltou para a camada de background. O ramo continua aqui de
  // propósito — a mídia do Perfil já trocou de forma três vezes, e no dia em
  // que ela (ou outra) virar `<img>` de novo, apagar isto faria a exportação
  // sair sem imagem em silêncio, que é justamente a falha que a blindagem
  // existe para impedir.
  it('vale para `<img>` também, para o dia em que um slide voltar a usar um', () => {
    const root = document.createElement('div');
    const img = document.createElement('img');
    img.src = FOTO;
    root.appendChild(img);

    const desfazer = applyEmbeddedImages(root, new Map([[FOTO, 'data:image/png;base64,AAA']]));
    expect(img.src).toBe('data:image/png;base64,AAA');
    desfazer();
    expect(img.src).toBe(FOTO);
  });

  it('deixa quieto o que não está no mapa', () => {
    const root = document.createElement('div');
    root.style.backgroundImage = `url("${OUTRA}")`;
    applyEmbeddedImages(root, new Map([[FOTO, 'data:image/png;base64,AAA']]));
    expect(root.style.backgroundImage).toContain(OUTRA);
  });
});

/* ── O caminho de falha, no hook de verdade ─────────────────────────────── */

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: {
    loading: vi.fn(),
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    dismiss: vi.fn(),
  },
}));
vi.mock('@/lib/product-events', () => ({ trackProductEvent: vi.fn() }));

import { useExport } from '@/hooks/useExport';

function montaDeck(style: SlideStyle = 'minimalist') {
  useEditorStore.setState({
    slides: [s({ id: 'a', position: 0, backgroundImageUrl: FOTO })],
    activeSlideIndex: 0,
    style,
    globalSettings: G,
  });
}

describe('a exportação falha VISÍVEL, sem entregar arquivo', () => {
  beforeEach(() => {
    toastError.mockClear();
    toastSuccess.mockClear();
  });

  it('slide solo: imagem que não baixa vira toast de erro e nenhum download', async () => {
    montaDeck();
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { result } = renderHook(() => useExport());
    act(() => {
      result.current.registerSlideRef('a', document.createElement('div'));
    });
    await act(async () => {
      await result.current.downloadSlide(0);
    });

    expect(clique).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0][0])).toMatch(/imagem do carrossel não pôde ser carregada/i);
  });

  it('ZIP: o mesmo, e o ZIP nem começa a ser montado', async () => {
    montaDeck();
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });

    const { result } = renderHook(() => useExport());
    act(() => {
      result.current.registerSlideRef('a', document.createElement('div'));
    });
    await act(async () => {
      await result.current.downloadAll();
    });

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0][0])).toMatch(/ZIP não saiu/i);
  });
});

describe('com a rede boa, a blindagem sai do caminho', () => {
  it('não é a imagem que barra a exportação', async () => {
    // Não dá para rasterizar em jsdom (não há canvas), então este teste NÃO
    // prova que o PNG sai certo — só que, com a rede respondendo, o preload
    // passa e quem falha depois é o rasterizador, não a blindagem. É o que
    // impede a blindagem de barrar exportação boa por engano.
    toastError.mockClear();
    montaDeck();
    redeOk();

    const { result } = renderHook(() => useExport());
    act(() => {
      result.current.registerSlideRef('a', document.createElement('div'));
    });
    await act(async () => {
      await result.current.downloadSlide(0);
    });

    const msg = String(toastError.mock.calls[0]?.[0] ?? '');
    expect(msg).not.toMatch(/imagem do carrossel não pôde ser carregada/i);
  });
});

describe('escopo do preload no slide solo', () => {
  it('exportar o slide 1 não baixa (nem quebra por causa da) imagem do slide 5', () => {
    const deck = [s({ backgroundImageUrl: FOTO }), s({ backgroundImageUrl: OUTRA })];
    expect(slideImageUrls(deck, 'minimalist', G, 0)).toEqual([FOTO]);
    expect(slideImageUrls(deck, 'minimalist', G, 1)).toEqual([OUTRA]);
  });

  it('o índice real é preservado: interno do Editorial não vira capa', () => {
    // Passar `[slide]` em vez do deck inteiro faria o slide 2 cair no padrão
    // `i === 0 → cover` e baixar um fundo que ele não desenha.
    const deck = [
      s({ contentLayout: 'cover', backgroundImageUrl: OUTRA }),
      s({ backgroundImageUrl: FOTO, contentImageUrl: '' }),
    ];
    expect(slideImageUrls(deck, 'editorial', G, 1)).toEqual([]);
  });

  it('sem índice, continua sendo o deck inteiro — é o caminho do ZIP', () => {
    const deck = [s({ backgroundImageUrl: FOTO }), s({ backgroundImageUrl: OUTRA })];
    expect(slideImageUrls(deck, 'minimalist', G)).toEqual([FOTO, OUTRA]);
  });
});
