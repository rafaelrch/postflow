import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Template03Slide, { TEMPLATE_03_DOTS_OFFSET_Y, template03BlockTop } from '@/components/slides/Template03Slide';
import {
  TEMPLATE_03_HEIGHT,
  TEMPLATE_03_MODELS,
  TEMPLATE_03_MODEL_COVER,
  TEMPLATE_03_MODEL_STEP,
  TEMPLATE_03_STEP_TITULO_Y,
  TEMPLATE_03_TITULO_Y_COVER,
  TEMPLATE_03_WIDTH,
  Template03Node,
  template03SlotsForModel,
  template03SpecSlideOf,
} from '@/lib/templates/template-03';
import { FORMATS, FORMAT_LIST } from '@/lib/formats';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide, SlideFormat } from '@/types';

/**
 * TEMPLATE 3 × FORMATO.
 *
 * Os três formatos compartilham a LARGURA 1080 (`lib/formats.ts`): só a altura
 * muda. Daí as regras que estes testes travam, e que valem em conjunto — quebrar
 * uma sozinha já deforma o template:
 *
 *   1. horizontal INTOCÁVEL: x, largura, corpo, entrelinha e tracking são os
 *      mesmos nos três formatos;
 *   2. cantos e dots com distância ABSOLUTA às bordas — margem que escala vira
 *      margem gigante no 9:16;
 *   3. o bloco título+corpo é PROPORCIONAL à altura: a descida progressiva
 *      (358 → 536 → 750) é o que dá a sensação de avanço, e uma distância
 *      absoluta faria o terceiro passo do 9:16 parar no primeiro terço da tela;
 *   4. o 4:5 é NO-OP por construção — se qualquer conta mudar 1px ali, a régua
 *      contra o gabarito do `render.py` já era.
 */

const FORMAT_IDS: SlideFormat[] = FORMAT_LIST.map((f) => f.id);

function markup(model: number, format?: SlideFormat, position?: number, total = 4): string {
  const pos = position ?? (model === TEMPLATE_03_MODEL_COVER ? 0 : 1);
  const slide = {
    ...DEFAULT_SLIDE,
    id: 's',
    position: pos,
    templateModel: model,
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
  } as Slide;
  return renderToStaticMarkup(
    <Template03Slide
      slide={slide}
      globalSettings={{ ...DEFAULT_GLOBAL_SETTINGS, format }}
      slideIndex={pos}
      totalSlides={total}
    />
  );
}

function decode(v: string): string {
  return v.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

function styles(html: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const m of html.matchAll(/data-(?:slot|block|layer)="([^"]+)"[^>]*?style="([^"]*)"/g)) {
    const props: Record<string, string> = {};
    for (const decl of decode(m[2]).split(';')) {
      const i = decl.indexOf(':');
      if (i > 0) props[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
    }
    out[m[1]] = props;
  }
  return out;
}

const px = (v?: string) => (v == null ? NaN : parseFloat(v));

/** `top` do wrapper `data-profile-handle-layout` (handle + selo em fluxo). */
function layoutTop(html: string): number {
  const m = /data-profile-handle-layout[^>]*?style="([^"]*)"/.exec(html);
  if (!m) return NaN;
  for (const decl of decode(m[1]).split(';')) {
    const i = decl.indexOf(':');
    if (i > 0 && decl.slice(0, i).trim() === 'top') return parseFloat(decl.slice(i + 1).trim());
  }
  return NaN;
}

/** O selo acompanha o @ no mesmo wrapper; seu `top` efetivo é o do wrapper. */
function badgeTop(html: string): number {
  return layoutTop(html);
}

function specNode(model: number, name: string): Template03Node {
  const slide = template03SpecSlideOf(model);
  const slot = name.startsWith('cantos.') ? name : `s${slide.index}.${name}`;
  return slide.nodes.find((n) => n.slot === slot)!;
}

/** Todos os blocos que o slide desenha, por modelo. */
function slotsOf(model: number): string[] {
  return ['title', 'body', 'handle', 'avatar', 'badge', 'dots', 'cantos.left', 'cantos.right'].map(
    (n) => specNode(model, n).slot!
  );
}

// ── O 4:5 é no-op ───────────────────────────────────────────────

describe('TEMPLATE 3 — formato: o 4:5 é NO-OP', () => {
  it('a altura do 4:5 é a do spec', () => {
    expect(FORMATS['4:5'].height).toBe(TEMPLATE_03_HEIGHT);
    expect(FORMATS['4:5'].width).toBe(TEMPLATE_03_WIDTH);
  });

  it('o bloco de título devolve o `y` do spec no 4:5', () => {
    expect(
      template03BlockTop(TEMPLATE_03_TITULO_Y_COVER, TEMPLATE_03_HEIGHT, TEMPLATE_03_MODEL_COVER)
    ).toBe(TEMPLATE_03_TITULO_Y_COVER);
    for (const y of TEMPLATE_03_STEP_TITULO_Y) {
      expect(template03BlockTop(y, TEMPLATE_03_HEIGHT, TEMPLATE_03_MODEL_STEP)).toBe(y);
    }
  });

  /**
   * O teste mais importante do arquivo: no 4:5 NENHUMA medida pode mudar em
   * relação ao formato ausente (o legado). Um pixel aqui e a fidelidade contra
   * as imagens de `reference/` já era.
   */
  it('o markup do 4:5 é idêntico ao do formato ausente, byte a byte', () => {
    for (const model of TEMPLATE_03_MODELS) {
      for (const position of [0, 1, 2, 3, 4]) {
        expect(markup(model, '4:5', position, 6), `modelo ${model}, posição ${position}`).toBe(
          markup(model, undefined, position, 6)
        );
      }
    }
  });

  it('todo bloco cai no `y` do spec no 4:5', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const s = styles(markup(model, '4:5'));
      for (const name of ['avatar', 'cantos.left', 'cantos.right']) {
        const node = specNode(model, name);
        expect(px(s[node.slot!].top), `${node.slot} no 4:5`).toBeCloseTo(node.box.y, 4);
      }
      const dots = specNode(model, 'dots');
      expect(px(s[dots.slot!].top), `${dots.slot} no 4:5`).toBeCloseTo(
        dots.box.y + TEMPLATE_03_DOTS_OFFSET_Y,
        4,
      );
      // @ e selo vivem em fluxo no wrapper `data-profile-handle-layout`, ancorado
      // no `y` do spec — não têm mais `top` absoluto no slot.
      const html = markup(model, '4:5');
      expect(layoutTop(html), `s${model}.handle no 4:5`).toBeCloseTo(specNode(model, 'handle').box.y, 4);
      // O selo vive em fluxo no mesmo wrapper do @, então sua altura é a do
      // handle (a ancoragem de 636.59 do spec do badge é absorvida pelo alinhamento).
      expect(badgeTop(html), `s${model}.badge no 4:5`).toBeCloseTo(specNode(model, 'handle').box.y, 4);
      // O bloco em fluxo entra pelo `tituloY`, que no primeiro passo e na capa
      // é o próprio `y` do nó.
      expect(px(s.conteudo.top)).toBe(specNode(model, 'title').box.y);
    }
  });
});

// ── Horizontal intocável ────────────────────────────────────────

describe('TEMPLATE 3 — formato: nada horizontal se mexe', () => {
  it('x, largura, corpo, entrelinha e tracking são iguais nos três formatos', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const base = styles(markup(model, '4:5'));
      for (const format of FORMAT_IDS) {
        const s = styles(markup(model, format));
        for (const slot of [...slotsOf(model), 'conteudo']) {
          const a = base[slot];
          const b = s[slot];
          for (const prop of [
            'left',
            'right',
            'width',
            'font-size',
            'line-height',
            'letter-spacing',
            'text-align',
            'color',
          ]) {
            expect(b[prop], `${slot}.${prop} no ${format}`).toBe(a[prop]);
          }
        }
      }
    }
  });

  it('a largura da raiz é 1080 nos três formatos, e só a altura muda', () => {
    for (const format of FORMAT_IDS) {
      const html = markup(TEMPLATE_03_MODEL_COVER, format);
      expect(html).toContain(`width:${TEMPLATE_03_WIDTH}px`);
      expect(html).toContain(`height:${FORMATS[format].height}px`);
    }
  });
});

// ── Distâncias absolutas ────────────────────────────────────────

describe('TEMPLATE 3 — formato: cantos e dots não escalam', () => {
  it('os cantos ficam a 44px do TOPO em qualquer formato', () => {
    for (const model of TEMPLATE_03_MODELS) {
      for (const format of FORMAT_IDS) {
        const s = styles(markup(model, format));
        expect(px(s['cantos.left'].top), `${format}`).toBe(specNode(model, 'cantos.left').box.y);
        expect(px(s['cantos.right'].top), `${format}`).toBe(specNode(model, 'cantos.right').box.y);
      }
    }
  });

  /**
   * O deslocamento visual explícito reduz a folga inferior do spec em 24px, sem
   * sair do canvas e sem alterar a regra absoluta entre formatos.
   */
  it('os dots ficam a 96px do RODAPÉ em qualquer formato após o ajuste visual', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const node = specNode(model, 'dots');
      const gap = TEMPLATE_03_HEIGHT - node.box.y - node.box.h;
      expect(gap).toBe(120);
      for (const format of FORMAT_IDS) {
        const s = styles(markup(model, format));
        const top = px(s[node.slot!].top);
        expect(FORMATS[format].height - top - node.box.h, `${format}`).toBeCloseTo(
          gap - TEMPLATE_03_DOTS_OFFSET_Y,
          4,
        );
      }
    }
  });
});

// ── O bloco é proporcional ──────────────────────────────────────

describe('TEMPLATE 3 — formato: o bloco de título é PROPORCIONAL', () => {
  /**
   * Proporcional ONDE CABE. No 1:1 o teto (§4.1 do plano) entra na frente — a
   * base do bloco não passa do topo dos dots menos o vão do spec —, e é por isso
   * que a asserção ali é `<=` em vez de igualdade.
   */
  it('o `y` do bloco escala com a altura, até o teto', () => {
    for (const format of FORMAT_IDS) {
      const h = FORMATS[format].height;
      const proporcional = (TEMPLATE_03_TITULO_Y_COVER * h) / TEMPLATE_03_HEIGHT;
      const top = px(styles(markup(TEMPLATE_03_MODEL_COVER, format)).conteudo.top);
      if (format === '1:1') {
        expect(top, format).toBeLessThan(proporcional);
      } else {
        expect(top, format).toBeCloseTo(proporcional, 3);
      }
    }
  });

  it('o ciclo dos passos escala junto, mantendo a ordem da descida', () => {
    for (const format of FORMAT_IDS) {
      const tops = [1, 2, 3].map(
        (position) => px(styles(markup(TEMPLATE_03_MODEL_STEP, format, position, 5)).conteudo.top)
      );
      // A sensação de avanço é a ORDEM, e ela sobrevive ao formato — inclusive
      // no 1:1, onde o teto aproxima os degraus sem inverter nenhum.
      expect(tops[0], format).toBeLessThan(tops[1]);
      expect(tops[1], format).toBeLessThanOrEqual(tops[2]);
      for (let i = 0; i < 3; i++) {
        const proporcional =
          (TEMPLATE_03_STEP_TITULO_Y[i] * FORMATS[format].height) / TEMPLATE_03_HEIGHT;
        // Nunca ABAIXO do proporcional: o teto só puxa para cima.
        expect(tops[i], `${format} passo ${i + 1}`).toBeLessThanOrEqual(proporcional + 0.001);
        if (format !== '1:1') expect(tops[i], `${format} passo ${i + 1}`).toBeCloseTo(proporcional, 3);
      }
    }
  });

  it('a barra de perfil acompanha o bloco, à mesma distância absoluta', () => {
    for (const model of TEMPLATE_03_MODELS) {
      for (const format of FORMAT_IDS) {
        const s = styles(markup(model, format));
        const delta = specNode(model, 'title').box.y - specNode(model, 'avatar').box.y;
        expect(px(s.conteudo.top) - px(s[specNode(model, 'avatar').slot!].top)).toBeCloseTo(
          delta,
          3
        );
      }
    }
  });
});

// ── Orçamento vertical na caixa real ────────────────────────────

/**
 * O bloco de texto cabe entre o `tituloY` e os dots?
 *
 * A conta é a mesma que o desenho faz: `maxLines` do título × entrelinha, mais o
 * vão do spec, mais `maxLines` do corpo × entrelinha. É o pior caso que os
 * limites do `slotIndex` permitem — texto maior que isso o contador da barra
 * lateral já acusa.
 */
function folga(model: number, tituloY: number, height: number): number {
  const title = specNode(model, 'title');
  const body = specNode(model, 'body');
  const d = template03SlotsForModel(model);
  const maxTitle = d.find((x) => x.slot === title.slot)!.maxLines!;
  const maxBody = d.find((x) => x.slot === body.slot)!.maxLines!;
  const gap = body.box.y - (title.box.y + title.box.h);
  const alto =
    maxTitle * title.typography!.lineHeightPx + gap + maxBody * body.typography!.lineHeightPx;
  const dotsNode = specNode(model, 'dots');
  const dotsTop = height - (TEMPLATE_03_HEIGHT - dotsNode.box.y - dotsNode.box.h) - dotsNode.box.h;
  return dotsTop - template03BlockTop(tituloY, height, model) - alto;
}

describe('TEMPLATE 3 — o texto cabe na caixa real', () => {
  it('no 4:5 o pior caso dos limites do spec ainda cabe acima dos dots', () => {
    expect(folga(TEMPLATE_03_MODEL_COVER, TEMPLATE_03_TITULO_Y_COVER, 1350)).toBeGreaterThan(0);
    for (const y of TEMPLATE_03_STEP_TITULO_Y) {
      expect(folga(TEMPLATE_03_MODEL_STEP, y, 1350), `passo em ${y}`).toBeGreaterThan(0);
    }
  });

  it('no 9:16 sobra ainda mais espaço — a altura cresce mais que o bloco', () => {
    expect(folga(TEMPLATE_03_MODEL_COVER, TEMPLATE_03_TITULO_Y_COVER, 1920)).toBeGreaterThan(
      folga(TEMPLATE_03_MODEL_COVER, TEMPLATE_03_TITULO_Y_COVER, 1350)
    );
    for (const y of TEMPLATE_03_STEP_TITULO_Y) {
      expect(folga(TEMPLATE_03_MODEL_STEP, y, 1920), `passo em ${y}`).toBeGreaterThan(0);
    }
  });

  /**
   * 🔴 O TETO DO 1:1 — o defeito que ele conserta, e de onde saiu a regra.
   *
   * O proporcional puro COLIDIA: no 1:1 a altura cai 270px, os dots sobem os
   * mesmos 270 (são absolutos ao rodapé) e o bloco sobe só
   * `270 × tituloY / 1350`.
   *
   * MEDIDO NO NAVEGADOR (portal, fontes do app, conteúdo de exemplo do próprio
   * material — nem era o pior caso dos limites):
   *   · capa:             base 952,69 · topo dos dots 914  →  -38,69px
   *   · passo mais fundo: base 1006,02 · topo dos dots 914  →  -92,02px
   *
   * Decisão do Tech Lead em 25/08 (§4.1 do plano): teto. A base do bloco nunca
   * passa do topo dos dots menos o vão do spec.
   */
  it('no 1:1 o teto acaba com a invasão, no pior caso dos limites', () => {
    expect(folga(TEMPLATE_03_MODEL_COVER, TEMPLATE_03_TITULO_Y_COVER, 1080)).toBeGreaterThanOrEqual(0);
    for (const y of TEMPLATE_03_STEP_TITULO_Y) {
      expect(folga(TEMPLATE_03_MODEL_STEP, y, 1080), `passo em ${y}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('o teto preserva o VÃO do spec, não só encosta nos dots', () => {
    // A folga que sobra no 1:1 na posição mais funda é a MESMA do gabarito 4:5:
    // é dali que o vão foi derivado.
    const capa11 = folga(TEMPLATE_03_MODEL_COVER, TEMPLATE_03_TITULO_Y_COVER, 1080);
    const capa45 = folga(TEMPLATE_03_MODEL_COVER, TEMPLATE_03_TITULO_Y_COVER, 1350);
    expect(capa11).toBeCloseTo(capa45, 3);

    const fundo = Math.max(...TEMPLATE_03_STEP_TITULO_Y);
    expect(folga(TEMPLATE_03_MODEL_STEP, fundo, 1080)).toBeCloseTo(
      folga(TEMPLATE_03_MODEL_STEP, fundo, 1350),
      3
    );
  });

  /**
   * ⚠️ O teto não pode engatar no 4:5 — é a régua contra o gabarito. Aqui isso é
   * medido: o topo do bloco continua sendo exatamente o `tituloY` do spec em
   * TODA posição do ciclo, e o markup do 4:5 continua idêntico ao do formato
   * ausente (o teste "byte a byte" lá em cima).
   */
  it('o teto NUNCA engata no 4:5 nem no 9:16', () => {
    for (const [model, ys] of [
      [TEMPLATE_03_MODEL_COVER, [TEMPLATE_03_TITULO_Y_COVER]],
      [TEMPLATE_03_MODEL_STEP, TEMPLATE_03_STEP_TITULO_Y],
    ] as const) {
      for (const y of ys) {
        // 4:5 — o teto empata com o proporcional na posição mais funda e fica
        // acima dele nas outras; nos dois casos o `min` devolve o spec.
        expect(template03BlockTop(y, 1350, model), `${model} @ ${y} no 4:5`).toBe(y);
        // 9:16 — a tela cresce, o teto sobe junto e o proporcional continua
        // mandando.
        expect(template03BlockTop(y, 1920, model), `${model} @ ${y} no 9:16`).toBeCloseTo(
          (y * 1920) / 1350,
          3
        );
      }
    }
  });

  it('no 1:1 o bloco SUBIU em relação ao proporcional puro — o teto agiu', () => {
    const fundo = Math.max(...TEMPLATE_03_STEP_TITULO_Y);
    const proporcional = (fundo * 1080) / 1350;
    expect(template03BlockTop(fundo, 1080, TEMPLATE_03_MODEL_STEP)).toBeLessThan(proporcional);
    // O primeiro passo do ciclo é raso e continua no proporcional: o teto só
    // engata onde a conta não cabe.
    const raso = TEMPLATE_03_STEP_TITULO_Y[0];
    expect(template03BlockTop(raso, 1080, TEMPLATE_03_MODEL_STEP)).toBeCloseTo(
      (raso * 1080) / 1350,
      3
    );
  });

  it('a ordem da descida sobrevive ao teto no 1:1', () => {
    const tops = TEMPLATE_03_STEP_TITULO_Y.map((y) =>
      template03BlockTop(y, 1080, TEMPLATE_03_MODEL_STEP)
    );
    expect(tops[0]).toBeLessThan(tops[1]);
    expect(tops[1]).toBeLessThanOrEqual(tops[2]);
  });
});
