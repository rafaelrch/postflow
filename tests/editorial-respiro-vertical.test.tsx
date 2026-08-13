// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import EditorialSlide from '@/components/slides/EditorialSlide';
import {
  DEFAULT_CORNERS,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_SLIDE,
  type ContentLayout,
  type GlobalSettings,
  type SlideFormat,
  type Slide,
  type TextPosition,
} from '@/types';

/**
 * EDITORIAL — respiro nas âncoras verticais extremas.
 *
 * Medido no navegador ANTES da correção, e igual nas TRÊS sequências e nos TRÊS
 * formatos (é o quadro do container, não um layout específico):
 *
 *   - âncora no TOPO:   o conteúdo começava em y=96, a só 20 px da base dos
 *                       cantos (@handle / título do carrossel, que terminam em
 *                       y≈76 com a config padrão);
 *   - âncora no RODAPÉ: o conteúdo terminava a 56 px da borda de baixo.
 *
 * A correção não mexe nos limites do container — mexer moveria a âncora do
 * MEIO, que já está certa. Ela entra como padding aplicado só na banda extrema
 * correspondente, então `center` continua exatamente onde estava.
 *
 * Os números são reaproveitados do próprio renderer: a folga abaixo dos cantos é
 * o `PAD_X` (56), o mesmo respiro que o template já usa na horizontal; e o
 * recuo do rodapé passa a ser o `CONTENT_TOP` (96), o inset vertical que o
 * template já adotava em cima — o quadro fica simétrico.
 */

const SEQUENCIAS: ContentLayout[] = ['text-image-text', 'text-text-image', 'image-text-text'];
const FORMATOS: SlideFormat[] = ['4:5', '1:1', '9:16'];

const TOPO: TextPosition[] = ['top-left', 'top-center', 'top-right'];
const RODAPE: TextPosition[] = ['bottom-left', 'bottom-center', 'bottom-right'];
const MEIO: TextPosition[] = ['middle-left', 'center', 'middle-right'];

/** Valores esperados com a config de cantos padrão (bd 49 + fonte 27 => base 76). */
const PADDING_TOPO_PADRAO = '36px'; // (76 + 56) - 96
const PADDING_RODAPE = '40px';      // 96 - 56

function slideEditorial(extra: Partial<Slide> = {}): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: 'e1',
    position: 1,
    title: 'Peça tarefas pequenas',
    description: 'Descrição do slide',
    contentLayout: 'image-text-text',
    ...extra,
  } as Slide;
}

function colunaDe(slide: Slide, gs: GlobalSettings = DEFAULT_GLOBAL_SETTINGS): HTMLElement {
  const { container } = render(
    <EditorialSlide slide={slide} globalSettings={gs} slideIndex={1} totalSlides={4} />,
  );
  const bloco = container.querySelector<HTMLElement>('[data-block]');
  if (!bloco?.parentElement) throw new Error('coluna de conteúdo não renderizou');
  return bloco.parentElement;
}

afterEach(cleanup);

describe('âncora no TOPO ganha respiro abaixo dos cantos', () => {
  it.each(TOPO)('%s afasta o conteúdo da faixa dos cantos', (textPosition) => {
    const col = colunaDe(slideEditorial({ textPosition }));
    expect(col.style.justifyContent).toBe('flex-start');
    expect(col.style.paddingTop).toBe(PADDING_TOPO_PADRAO);
    expect(col.style.paddingBottom).toBe('0px');
  });

  it.each(SEQUENCIAS)('%s: vale nas três sequências', (contentLayout) => {
    const col = colunaDe(slideEditorial({ contentLayout, textPosition: 'top-left' }));
    expect(col.style.paddingTop).toBe(PADDING_TOPO_PADRAO);
  });

  it.each(FORMATOS)('%s: vale nos três formatos', (format) => {
    // Os cantos são posicionados em px absolutos, então o respiro que os limpa
    // também é absoluto — muda a altura do slide, não a faixa dos cantos.
    const col = colunaDe(slideEditorial({ textPosition: 'top-left' }), {
      ...DEFAULT_GLOBAL_SETTINGS,
      format,
    });
    expect(col.style.paddingTop).toBe(PADDING_TOPO_PADRAO);
  });

  it('canto mais afastado ou maior empurra o conteúdo mais para baixo', () => {
    const col = colunaDe(slideEditorial({ textPosition: 'top-left' }), {
      ...DEFAULT_GLOBAL_SETTINGS,
      corners: { ...DEFAULT_CORNERS, show: true, borderDistance: 100, fontSize: 32 },
    });
    // O canto cresce a partir do próprio centro, então fonte 32 acima da
    // referência 27 sobe o bloco em 2,5: topo = 100 - 2,5 = 97,5; base =
    // 97,5 + 32 = 129,5; +56 de folga = 185,5; -96 do quadro = 89,5.
    expect(col.style.paddingTop).toBe('89.5px');
  });

  it('sem cantos visíveis o quadro de sempre já basta', () => {
    const col = colunaDe(slideEditorial({ textPosition: 'top-left' }), {
      ...DEFAULT_GLOBAL_SETTINGS,
      corners: { ...DEFAULT_CORNERS, show: false },
    });
    expect(col.style.paddingTop).toBe('0px');
  });

  it('cantos ligados mas os dois escondidos contam como sem faixa', () => {
    const col = colunaDe(slideEditorial({ textPosition: 'top-left' }), {
      ...DEFAULT_GLOBAL_SETTINGS,
      corners: {
        ...DEFAULT_CORNERS,
        show: true,
        topLeft: { text: '@handle', visible: false },
        topRight: { text: 'Título', visible: false },
      },
    });
    expect(col.style.paddingTop).toBe('0px');
  });
});

describe('âncora no RODAPÉ ganha respiro da borda de baixo', () => {
  it.each(RODAPE)('%s afasta o conteúdo do rodapé', (textPosition) => {
    const col = colunaDe(slideEditorial({ textPosition }));
    expect(col.style.justifyContent).toBe('flex-end');
    expect(col.style.paddingBottom).toBe(PADDING_RODAPE);
    expect(col.style.paddingTop).toBe('0px');
  });

  it.each(SEQUENCIAS)('%s: vale nas três sequências', (contentLayout) => {
    const col = colunaDe(slideEditorial({ contentLayout, textPosition: 'bottom-left' }));
    expect(col.style.paddingBottom).toBe(PADDING_RODAPE);
  });

  it.each(FORMATOS)('%s: vale nos três formatos', (format) => {
    const col = colunaDe(slideEditorial({ textPosition: 'bottom-left' }), {
      ...DEFAULT_GLOBAL_SETTINGS,
      format,
    });
    expect(col.style.paddingBottom).toBe(PADDING_RODAPE);
  });

  it('os cantos não interferem no rodapé — eles só existem em cima', () => {
    const col = colunaDe(slideEditorial({ textPosition: 'bottom-left' }), {
      ...DEFAULT_GLOBAL_SETTINGS,
      corners: { ...DEFAULT_CORNERS, show: true, borderDistance: 120, fontSize: 32 },
    });
    expect(col.style.paddingBottom).toBe(PADDING_RODAPE);
  });
});

describe('a CAPA é exceção — o respiro não a alcança', () => {
  /** O bloco de texto da capa, que vive fora da coluna das sequências. */
  function capa(format: SlideFormat = '4:5', textPosition: TextPosition = 'bottom-center') {
    const { container } = render(
      <EditorialSlide
        slide={slideEditorial({ position: 0, contentLayout: 'cover', textPosition })}
        globalSettings={{ ...DEFAULT_GLOBAL_SETTINGS, format }}
        slideIndex={0}
        totalSlides={6}
      />,
    );
    const el = container.querySelector<HTMLElement>('[data-block="cover-text"]');
    if (!el) throw new Error('bloco da capa não renderizou');
    return el;
  }

  it.each(['4:5', '1:1', '9:16'] as SlideFormat[])(
    '%s: o bloco é ancorado pelo RODAPÉ, com o respiro dos internos',
    (format) => {
      // Escolha do Rafael: `bottom: CONTENT_TOP` no lugar do antigo
      // `top: 58% da altura`. Sem número novo — é o mesmo 96 que os slides
      // internos usam de recuo do rodapé.
      const el = capa(format);
      expect(el.style.bottom).toBe('96px');
      // Ponto fixo de topo não existe mais: é o que fazia o bloco flutuar
      // conforme a altura do título.
      expect(el.style.top).toBe('');
    },
  );

  it('a distância ao rodapé não depende da altura do slide', () => {
    // Era o defeito do 58%: proporcional à altura, então cada formato punha o
    // bloco a uma distância diferente do rodapé.
    const distancias = (['4:5', '1:1', '9:16'] as SlideFormat[]).map((f) => capa(f).style.bottom);
    expect(new Set(distancias).size).toBe(1);
  });

  it('título de duas linhas não muda a distância ao rodapé — o bloco cresce para cima', () => {
    const umaLinha = capa();
    const { container } = render(
      <EditorialSlide
        slide={slideEditorial({
          position: 0,
          contentLayout: 'cover',
          textPosition: 'bottom-center',
          title: 'Um título bem mais longo que ocupa duas linhas inteiras na capa',
        })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={6}
      />,
    );
    const duasLinhas = container.querySelector<HTMLElement>('[data-block="cover-text"]')!;
    expect(duasLinhas.style.bottom).toBe(umaLinha.style.bottom);
  });

  it('a capa não tem o padding das âncoras extremas', () => {
    const el = capa();
    expect(el.style.paddingTop).toBe('');
    expect(el.style.paddingBottom).toBe('');
  });

  it('a capa não usa a coluna flex das sequências', () => {
    // Se um dia alguém unificar a capa com as sequências, este teste cai e o
    // respiro voltaria a subir o bloco da capa sem ninguém perceber.
    const { container } = render(
      <EditorialSlide
        slide={slideEditorial({ position: 0, contentLayout: 'cover' })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={6}
      />,
    );
    expect(container.querySelector('[data-block="title"]')).toBeNull();
    expect(container.querySelector('[data-block="description"]')).toBeNull();
  });

  it('as âncoras da capa continuam com o comportamento próprio dela', () => {
    // topo tem o +40 histórico da capa; meio centraliza por transform.
    expect(capa('4:5', 'top-left').style.top).toBe('136px');
    expect(capa('4:5', 'middle-left').style.top).toBe('50%');
    expect(capa('4:5', 'middle-left').style.transform).toBe('translateY(-50%)');
  });
});

describe('a âncora do MEIO não se mexe', () => {
  it.each(MEIO)('%s continua sem padding nenhum', (textPosition) => {
    const col = colunaDe(slideEditorial({ textPosition }));
    expect(col.style.justifyContent).toBe('center');
    expect(col.style.paddingTop).toBe('0px');
    expect(col.style.paddingBottom).toBe('0px');
  });

  it('os limites do container continuam os de sempre nas três bandas', () => {
    // É isto que garante que o respiro das pontas não arrastou o centro junto.
    for (const textPosition of [...TOPO, ...MEIO, ...RODAPE]) {
      const col = colunaDe(slideEditorial({ textPosition }));
      expect(col.style.top).toBe('96px');
      expect(col.style.bottom).toBe('56px');
      cleanup();
    }
  });
});
