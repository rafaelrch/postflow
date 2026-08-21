// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, GlobalSettings, Slide } from '@/types';
import { useEditorStore } from '@/hooks/useEditorStore';

/**
 * O NOME CHEGA NO ARQUIVO — o elo entre a fonte única e a exportação.
 *
 * `tests/export-filename.test.ts` prova as REGRAS do nome. Este prova o que
 * elas não alcançam: que `hooks/useExport.ts` realmente pergunta o nome ao
 * módulo, com o título do deck que está aberto, em vez de montar string por
 * conta própria. Sem este teste, alguém troca uma linha de volta para
 * "slide-1.png" e nenhum teste reclama.
 *
 * jsdom não rasteriza (não há canvas), então o `html-to-image` entra dublado —
 * o que está em julgamento aqui é o NOME, não o pixel.
 */

vi.mock('react-hot-toast', () => ({
  default: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));
vi.mock('@/lib/product-events', () => ({ trackProductEvent: vi.fn() }));

/**
 * Só as chamadas que interessam: nome da entrada do ZIP e nome do arquivo
 * salvo. `vi.hoisted` porque as factories de `vi.mock` sobem para o topo do
 * arquivo e não enxergam variável declarada depois.
 */
const capturado = vi.hoisted(() => ({ entradasDoZip: [] as string[], nomeDoArquivoSalvo: '' }));

/** Canvas dublê: entrega data URL e blob sem precisar de pixel de verdade. */
vi.mock('html-to-image', () => ({
  toCanvas: vi.fn(async () => ({
    toDataURL: () => 'data:image/png;base64,AAA',
    toBlob: (cb: (b: Blob) => void) => cb(new Blob(['x'], { type: 'image/png' })),
  })),
}));
vi.mock('jszip', () => ({
  default: class {
    file(nome: string) { capturado.entradasDoZip.push(nome); }
    async generateAsync() { return new Blob(['zip']); }
  },
}));
vi.mock('file-saver', () => ({
  saveAs: (_blob: Blob, nome: string) => { capturado.nomeDoArquivoSalvo = nome; },
}));

import { useExport } from '@/hooks/useExport';

const s = (extra: Partial<Slide> = {}): Slide => ({ ...DEFAULT_SLIDE, ...extra }) as Slide;

function montaDeck(carouselTitle: string) {
  useEditorStore.setState({
    slides: [s({ id: 'a', position: 0 }), s({ id: 'b', position: 1 }), s({ id: 'c', position: 2 })],
    activeSlideIndex: 0,
    style: 'minimalist',
    globalSettings: DEFAULT_GLOBAL_SETTINGS as GlobalSettings,
    carouselTitle,
  });
}

function registra(result: { current: ReturnType<typeof useExport> }) {
  act(() => {
    for (const id of ['a', 'b', 'c']) result.current.registerSlideRef(id, document.createElement('div'));
  });
}

beforeEach(() => {
  capturado.entradasDoZip.length = 0;
  capturado.nomeDoArquivoSalvo = '';
  vi.clearAllMocks();
});

describe('useExport — o nome vem da fonte única', () => {
  it('slide avulso baixa como "Creatools - <TÍTULO> - <NN>.png"', async () => {
    montaDeck('Meu Deck');
    const nomes: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      nomes.push(this.download);
    });

    const { result } = renderHook(() => useExport());
    registra(result);
    await act(async () => { await result.current.downloadSlide(2); });

    // O índice 2 vira "03": base 1 e 2 dígitos, para a pasta ordenar certo.
    expect(nomes).toEqual(['Creatools - Meu Deck - 03.png']);
  });

  it('ZIP: arquivo sem número, entradas numeradas — e todas com o título do deck', async () => {
    montaDeck('Meu Deck');
    const { result } = renderHook(() => useExport());
    registra(result);
    await act(async () => { await result.current.downloadAll(); });

    expect(capturado.nomeDoArquivoSalvo).toBe('Creatools - Meu Deck.zip');
    expect(capturado.entradasDoZip).toEqual([
      'Creatools - Meu Deck - 01.png',
      'Creatools - Meu Deck - 02.png',
      'Creatools - Meu Deck - 03.png',
    ]);
  });

  it('título com caractere inválido não vaza para o nome do arquivo', async () => {
    montaDeck('IA/Robótica: 2026');
    const { result } = renderHook(() => useExport());
    registra(result);
    await act(async () => { await result.current.downloadAll(); });

    expect(capturado.nomeDoArquivoSalvo).toBe('Creatools - IA Robótica 2026.zip');
    expect(capturado.nomeDoArquivoSalvo).not.toMatch(/[/\\:*?"<>|]/);
  });

  it('nenhum nome antigo sobrou ("slide-N.png", "carrossel-postflow.zip")', async () => {
    montaDeck('Novo Carrossel');
    const { result } = renderHook(() => useExport());
    registra(result);
    await act(async () => { await result.current.downloadAll(); });

    expect(capturado.nomeDoArquivoSalvo).not.toBe('carrossel-postflow.zip');
    for (const nome of capturado.entradasDoZip) expect(nome).not.toMatch(/^slide-\d+\.png$/);
  });
});
