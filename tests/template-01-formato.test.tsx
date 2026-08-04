import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Template01Slide from '@/components/slides/Template01Slide';
import {
  TEMPLATE_01_SPEC,
  TEMPLATE_01_HEIGHT,
  TEMPLATE_01_WIDTH,
  TEMPLATE_01_MODELS,
  TEMPLATE_01_CENTER_PAIRS,
  TEMPLATE_01_DESIGN_TWEAKS,
  template01FormatShift,
  template01HeightRatio,
  template01NodeSpan,
  template01Tops,
  SpecNode,
} from '@/lib/templates/template-01';
import { FORMATS, FORMAT_LIST, getFormat } from '@/lib/formats';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide, SlideFormat } from '@/types';

/**
 * TEMPLATE 1 × FORMATO.
 *
 * Os três formatos compartilham a LARGURA 1080 (lib/formats.ts): só a altura
 * muda. Daí as regras que estes testes travam, e que valem em conjunto —
 * quebrar uma sozinha já deforma o template:
 *
 *   1. horizontal INTOCÁVEL: x, largura, corpo, entrelinha, tracking e
 *      alinhamento são os mesmos nos três formatos;
 *   2. BANDA (imagem dos slides 3/4/5, seta do 6) escala com a altura, mantendo
 *      a mesma % de altura do 4:5;
 *   3. MARGEM não escala: o canto fica a 44px do topo e o bloco de rodapé
 *      mantém a distância absoluta do rodapé em qualquer formato;
 *   4. 4:5 é NO-OP por construção — se qualquer conta mudar 1px ali, a régua
 *      contra o gabarito do render.py já era.
 */

const FORMAT_IDS: SlideFormat[] = FORMAT_LIST.map((f) => f.id);

function markup(model: number, format?: SlideFormat): string {
  const slide = {
    ...DEFAULT_SLIDE,
    id: 's',
    position: model - 1,
    templateModel: model,
    // Sem isto o componente cai na imagem genérica do editor e o slide muda de
    // fundo — o gabarito é o texto de fábrica, sem imagem nenhuma.
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
  } as Slide;
  return renderToStaticMarkup(
    <Template01Slide
      slide={slide}
      globalSettings={{ ...DEFAULT_GLOBAL_SETTINGS, format }}
      slideIndex={model - 1}
      totalSlides={TEMPLATE_01_MODELS.length}
    />
  );
}

/** `style` inline de cada `data-slot` do markup, já quebrado em propriedades. */
function styles(html: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const m of html.matchAll(/data-slot="([^"]+)"[^>]*?style="([^"]*)"/g)) {
    const props: Record<string, string> = {};
    for (const decl of m[2].split(';')) {
      const i = decl.indexOf(':');
      if (i > 0) props[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
    }
    out[m[1]] = props;
  }
  return out;
}

const px = (v?: string) => (v == null ? NaN : parseFloat(v));

function specNode(model: number, slot: string): SpecNode {
  const slide = TEMPLATE_01_SPEC.slides.find((s) => s.index === model)!;
  return slide.nodes.find((n) => n.slot === slot)!;
}

/** Todos os slots de texto de um modelo, cantos incluídos. */
function textSlots(model: number): string[] {
  const slide = TEMPLATE_01_SPEC.slides.find((s) => s.index === model)!;
  return slide.nodes.filter((n) => n.type === 'TEXT' && n.slot).map((n) => n.slot!);
}

describe('TEMPLATE 1 — formato: o 4:5 é no-op', () => {
  it('a razão de altura do 4:5 é exatamente 1', () => {
    expect(template01HeightRatio(FORMATS['4:5'].height)).toBe(1);
    expect(FORMATS['4:5'].height).toBe(TEMPLATE_01_HEIGHT);
  });

  it('não desloca nenhum slot no 4:5, em nenhum slide', () => {
    for (const model of TEMPLATE_01_MODELS) {
      expect(template01FormatShift(model, 1)).toEqual({});
    }
  });

  it('devolve o `top` do spec no 4:5 — é o que mantém o 0px contra o gabarito', () => {
    for (const model of TEMPLATE_01_MODELS) {
      const tops = template01Tops(model, {}, { ratio: 1 });
      for (const [slot, top] of Object.entries(tops)) {
        // O único slot que não cai no `y` do spec é o `s5.bot.title`: ele já
        // saía do centro compartilhado, desvio deliberado e anterior ao formato.
        const esperado =
          TEMPLATE_01_DESIGN_TWEAKS.verticalCenter[slot]?.y ?? specNode(model, slot).box.y;
        expect(top, slot).toBeCloseTo(esperado, 6);
      }
    }
  });

  it('o markup do 4:5 é idêntico ao do deck sem formato salvo (legado)', () => {
    for (const model of TEMPLATE_01_MODELS) {
      expect(markup(model, '4:5')).toBe(markup(model, undefined));
    }
  });

  it('a banda fica intacta no 4:5', () => {
    for (const model of TEMPLATE_01_MODELS) {
      const slide = TEMPLATE_01_SPEC.slides.find((s) => s.index === model)!;
      for (const node of slide.nodes) {
        expect(template01NodeSpan(node, 1)).toEqual({ y: node.box.y, h: node.box.h });
      }
    }
  });
});

describe('TEMPLATE 1 — formato: horizontal é intocável', () => {
  // Se o corpo, o tracking ou a largura mudassem com o formato, o texto
  // reescalaria e deixaria de ser o mesmo desenho — o 1:1 viraria outro
  // template. Os três formatos têm largura 1080: não há o que reescalar.
  const HORIZONTAIS = ['left', 'right', 'width', 'font-size', 'line-height', 'letter-spacing', 'text-align', 'transform'];

  it.each(TEMPLATE_01_MODELS)('slide %i: mesma geometria horizontal nos três formatos', (model) => {
    const base = styles(markup(model, '4:5'));
    for (const format of FORMAT_IDS) {
      const got = styles(markup(model, format));
      for (const slot of textSlots(model)) {
        for (const prop of HORIZONTAIS) {
          expect(got[slot]?.[prop], `${slot}.${prop} @ ${format}`).toBe(base[slot]?.[prop]);
        }
      }
    }
  });

  it.each(TEMPLATE_01_MODELS)('slide %i: a banda também não muda de largura', (model) => {
    const base = styles(markup(model, '4:5'));
    const slide = TEMPLATE_01_SPEC.slides.find((s) => s.index === model)!;
    const bandas = slide.nodes.filter((n) => n.type === 'RECTANGLE' && n.slot).map((n) => n.slot!);
    for (const format of FORMAT_IDS) {
      const got = styles(markup(model, format));
      for (const slot of bandas) {
        expect(got[slot]?.left, `${slot}.left @ ${format}`).toBe(base[slot]?.left);
        expect(got[slot]?.width, `${slot}.width @ ${format}`).toBe(base[slot]?.width);
      }
    }
  });
});

describe('TEMPLATE 1 — formato: a banda mantém a proporção', () => {
  const BANDAS: [number, string][] = [
    [3, 's3.image'],
    [4, 's4.image'],
    [5, 's5.image'],
    [6, 's6.arrow'],
  ];

  it.each(BANDAS)('slide %i: %s ocupa a mesma %% de altura nos três formatos', (model, slot) => {
    const node = specNode(model, slot);
    const refTop = node.box.y / TEMPLATE_01_HEIGHT;
    const refH = node.box.h / TEMPLATE_01_HEIGHT;
    for (const format of FORMAT_IDS) {
      const { height } = getFormat(format);
      const span = template01NodeSpan(node, template01HeightRatio(height));
      expect(span.y / height, `${slot}.y% @ ${format}`).toBeCloseTo(refTop, 9);
      expect(span.h / height, `${slot}.h% @ ${format}`).toBeCloseTo(refH, 9);
    }
  });

  it('a imagem full-bleed do slide 4 continua ocupando 63% da altura', () => {
    const node = specNode(4, 's4.image');
    for (const format of FORMAT_IDS) {
      const { height } = getFormat(format);
      const span = template01NodeSpan(node, template01HeightRatio(height));
      expect(span.h / height).toBeCloseTo(850 / 1350, 9);
    }
  });

  it('a banda escalada aparece no render, não só no cálculo', () => {
    const s1_1 = styles(markup(4, '1:1'));
    expect(px(s1_1['s4.image'].height)).toBeCloseTo(850 * (1080 / 1350), 6);
    const s9_16 = styles(markup(4, '9:16'));
    expect(px(s9_16['s4.image'].height)).toBeCloseTo(850 * (1920 / 1350), 6);
  });
});

describe('TEMPLATE 1 — formato: margem é absoluta e não escala', () => {
  it.each([3, 5, 6])('slide %i: o canto fica a 44px do topo em qualquer formato', (model) => {
    for (const format of FORMAT_IDS) {
      const got = styles(markup(model, format));
      expect(px(got['cantos.left'].top), `esquerdo @ ${format}`).toBe(44);
      expect(px(got['cantos.right'].top), `direito @ ${format}`).toBe(44);
    }
  });

  it.each([1, 2, 4])('slide %i: o canto sintético também fica a 44px', (model) => {
    for (const format of FORMAT_IDS) {
      const got = styles(markup(model, format));
      expect(px(got['cantos.left'].top), `esquerdo @ ${format}`).toBe(44);
    }
  });

  it.each([
    [1, 's1.subline'],
    [2, 's2.body'],
  ])('slide %i: %s mantém a distância absoluta do rodapé', (model, slot) => {
    const node = specNode(model, slot);
    const gap = TEMPLATE_01_HEIGHT - (node.box.y + node.box.h);
    for (const format of FORMAT_IDS) {
      const { height } = getFormat(format);
      const top = px(styles(markup(model, format))[slot].top);
      expect(height - (top + node.box.h), `${slot} @ ${format}`).toBeCloseTo(gap, 6);
    }
  });

  it.each([
    [3, 's3.title', 's3.image', 'acima'],
    [3, 's3.body', 's3.image', 'abaixo'],
    [4, 's4.title', 's4.image', 'abaixo'],
    [5, 's5.top.title', 's5.image', 'acima'],
    [5, 's5.bot.title', 's5.image', 'abaixo'],
    [6, 's6.title', 's6.arrow', 'acima'],
    [6, 's6.body', 's6.arrow', 'abaixo'],
  ])('slide %i: o vão de %s até a banda é o mesmo em px nos três formatos', (model, slot, bandSlot, lado) => {
    const node = specNode(model, slot);
    const band = specNode(model, bandSlot);
    const gapAt = (ratio: number) => {
      const span = template01NodeSpan(band, ratio);
      const top = template01Tops(model, {}, { ratio })[slot];
      return lado === 'acima' ? span.y - (top + node.box.h) : top - (span.y + span.h);
    };
    const ref = gapAt(1);
    for (const format of FORMAT_IDS) {
      const ratio = template01HeightRatio(getFormat(format).height);
      expect(gapAt(ratio), `${slot} @ ${format}`).toBeCloseTo(ref, 6);
    }
  });
});

describe('TEMPLATE 1 — formato: o slide 5 continua compartilhando o centro', () => {
  it.each(TEMPLATE_01_CENTER_PAIRS[5])('%s e %s dividem o mesmo eixo nos três formatos', (a, b) => {
    const na = specNode(5, a);
    const nb = specNode(5, b);
    for (const format of FORMAT_IDS) {
      const got = styles(markup(5, format));
      const ca = px(got[a].top) + na.box.h / 2;
      const cb = px(got[b].top) + nb.box.h / 2;
      // As duas colunas da faixa são o MESMO eixo: as duas recebem o mesmo
      // deslocamento de formato, então o centro compartilhado sobrevive.
      expect(ca, `${a}/${b} @ ${format}`).toBeCloseTo(cb, 6);
    }
  });
});

describe('TEMPLATE 1 — formato: o palco segue o formato', () => {
  it.each(FORMAT_IDS)('a moldura sai 1080 × altura do formato no %s', (format) => {
    const html = markup(1, format);
    const { height } = getFormat(format);
    expect(html).toContain(`width:${TEMPLATE_01_WIDTH}px`);
    expect(html).toContain(`height:${height}px`);
  });
});
