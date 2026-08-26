// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import Template03Slide from '@/components/slides/Template03Slide';
import {
  slideImageUrls,
  preloadExportImages,
  applyEmbeddedImages,
} from '@/lib/export-images';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide } from '@/types';

function t03Slide(extra: Partial<Slide> = {}): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: 's1',
    position: 0,
    templateModel: 1,
    templateSlots: {},
    ...extra,
  } as Slide;
}

const DATA = 'data:image/png;base64,FAKE';

describe('T3 — exportação embute fundo e avatar (URL relativa no slot)', () => {
  beforeEach(() => {
    // O upload do app grava URL relativa (/uploads/...). O fetch a resolve contra
    // a origem; devolvemos um Blob para simular o download bem-sucedido.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL) => {
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(['x'], { type: 'image/png' }),
        } as Response;
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('slideImageUrls normaliza a URL relativa do avatar/fundo para absoluta', () => {
    const slide = t03Slide({
      templateSlots: {
        's1.image': '/uploads/slide.png',
        's1.avatar': '/uploads/avatar.png',
      },
    });
    const urls = slideImageUrls([slide], 'template03', DEFAULT_GLOBAL_SETTINGS);
    expect(urls).toContain('http://localhost:3000/uploads/avatar.png');
    expect(urls).toContain('http://localhost:3000/uploads/slide.png');
  });

  it('o PNG sai com fundo E avatar embutidos quando o slot usa URL relativa', async () => {
    const slide = t03Slide({
      templateSlots: {
        's1.image': '/uploads/slide.png',
        's1.avatar': '/uploads/avatar.png',
      },
    });
    const { container } = render(
      <Template03Slide
        slide={slide}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={4}
        forExport
      />
    );

    // Fluxo real: coleta -> baixa -> embute.
    const urls = slideImageUrls([slide], 'template03', DEFAULT_GLOBAL_SETTINGS);
    const map = await preloadExportImages(urls);
    applyEmbeddedImages(container, map);

    const bg = container.querySelector('[data-layer="imagem"]') as HTMLElement;
    const img = container.querySelector('[data-avatar-photo]') as HTMLImageElement;

    expect(bg?.style.backgroundImage).toContain('data:');
    expect(img?.src).toContain('data:');
    // O mapa foi chaveado pela URL absoluta, igual ao el.src normalizado.
    expect(map.get('http://localhost:3000/uploads/avatar.png')).toBeTruthy();
  });
});
