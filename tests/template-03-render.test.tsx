import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import Template03Slide, { TEMPLATE_03_DOTS_OFFSET_Y } from '@/components/slides/Template03Slide';
import {
  TEMPLATE_03_MODELS,
  TEMPLATE_03_MODEL_COVER,
  TEMPLATE_03_MODEL_STEP,
  TEMPLATE_03_BADGE_ASSET,
  TEMPLATE_03_PALETTE,
  TEMPLATE_03_SPEC,
  TEMPLATE_03_STEP_TITULO_Y,
  TEMPLATE_03_TITULO_Y_COVER,
  Template03Node,
  Template03Slots,
  template03DefaultSlots,
  template03SpecSlideOf,
  template03TituloY,
} from '@/lib/templates/template-03';
import {
  template03ProfileAlignmentFor,
  template03ProfileScaleOrigin,
  template03ProfileGeometry,
} from '@/lib/templates/template-03/profile';
import { template03GradientSlide } from '@/lib/templates/template-03/overrides';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide, SlideFormat } from '@/types';

/**
 * TEMPLATE 3 — "FlowLine", fatia S2: o desenho.
 *
 * O gabarito é o `render.py` do material (`creatools-flowline`), conferido
 * contra `exemplos/deck-final.html` e as quatro imagens de `reference/`. Estes
 * testes travam o que, se mudar, muda o carrossel sem ninguém perceber olhando o
 * diff: o degradê de FAIXA, as camadas, os dots calculados, a tipografia do spec
 * e a ausência de altura travada nos blocos de texto.
 */

function markup(
  model: number,
  opts: {
    slots?: Template03Slots;
    format?: SlideFormat;
    position?: number;
    total?: number;
    slotStyles?: Slide['templateSlotStyles'];
    templateOverrides?: Slide['templateOverrides'];
  } = {}
): string {
  const position = opts.position ?? (model === TEMPLATE_03_MODEL_COVER ? 0 : 1);
  const slide = {
    ...DEFAULT_SLIDE,
    id: 's',
    position,
    templateModel: model,
    // O FlowLine não usa os campos genéricos de imagem do editor: a imagem vem
    // do slot, e só dele. Zerados aqui para o teste falar só do template.
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
    ...(opts.slots ? { templateSlots: opts.slots } : {}),
    ...(opts.slotStyles ? { templateSlotStyles: opts.slotStyles } : {}),
    ...(opts.templateOverrides ? { templateOverrides: opts.templateOverrides } : {}),
  } as Slide;
  return renderToStaticMarkup(
    <Template03Slide
      slide={slide}
      globalSettings={{ ...DEFAULT_GLOBAL_SETTINGS, format: opts.format }}
      slideIndex={position}
      totalSlides={opts.total ?? 4}
    />
  );
}

/** O React escapa aspas simples do `style`; o `;` do escape parte o split. */
function decode(v: string): string {
  return v.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

/** `style` inline de cada `data-slot`/`data-block`/`data-layer`. */
function styles(html: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const m of html.matchAll(
    /data-(?:slot|block|layer)="([^"]+)"[^>]*?style="([^"]*)"/g
  )) {
    const props: Record<string, string> = {};
    for (const decl of decode(m[2]).split(';')) {
      const i = decl.indexOf(':');
      if (i > 0) props[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
    }
    out[m[1]] = props;
  }
  return out;
}

/** O `style` da raiz do slide. */
function rootStyle(html: string): Record<string, string> {
  const m = /class="t03-slide"[^>]*?style="([^"]*)"/.exec(html)!;
  const props: Record<string, string> = {};
  for (const decl of decode(m[1]).split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) props[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return props;
}

function profileGroupStyle(html: string): Record<string, string> {
  const m = /data-profile-group[^>]*?style="([^"]*)"/.exec(html)!;
  const props: Record<string, string> = {};
  for (const decl of decode(m[1]).split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) props[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return props;
}

/** `style` do wrapper `data-profile-handle-layout` (handle + selo em fluxo). */
function layoutStyle(html: string): Record<string, string> {
  const m = /data-profile-handle-layout[^>]*?style="([^"]*)"/.exec(html);
  const props: Record<string, string> = {};
  if (!m) return props;
  for (const decl of decode(m[1]).split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) props[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return props;
}

/** `style` do `<img data-slot="s1.badge">` — em fluxo, sem `left` absoluto. */
function badgeStyleOf(html: string): string {
  return /<img[^>]*data-slot="s1\.badge"[^>]*style="([^"]*)"/.exec(html)?.[1] ?? '';
}

/** Os círculos do SVG de dots, na ordem. */
function dots(html: string): { r: number; fill: string; cx: number }[] {
  const svg = /<svg[^>]*data-dots-total[\s\S]*?<\/svg>/.exec(html)![0];
  return [...svg.matchAll(/<circle cx="([\d.]+)"[^>]*r="([\d.]+)" fill="([^"]+)"/g)].map((m) => ({
    cx: parseFloat(m[1]),
    r: parseFloat(m[2]),
    fill: m[3],
  }));
}

function specNode(model: number, name: string): Template03Node {
  const slide = template03SpecSlideOf(model);
  const slot = name.startsWith('cantos.') ? name : `s${slide.index}.${name}`;
  return slide.nodes.find((n) => n.slot === slot)!;
}

const px = (v?: string) => (v == null ? NaN : parseFloat(v));

// ── Render por modelo ───────────────────────────────────────────

describe('Template 3 — render por modelo', () => {
  it('a capa desenha título, corpo, barra de perfil, cantos e dots', () => {
    const s = styles(markup(TEMPLATE_03_MODEL_COVER));
    for (const slot of [
      's1.title',
      's1.body',
      's1.handle',
      's1.avatar',
      's1.badge',
      's1.dots',
      'cantos.left',
      'cantos.right',
    ]) {
      expect(s[slot], slot).toBeDefined();
    }
  });

  it('o passo desenha a mesma estrutura, com as chaves do MODELO', () => {
    const s = styles(markup(TEMPLATE_03_MODEL_STEP));
    for (const slot of ['s2.title', 's2.body', 's2.handle', 's2.avatar', 's2.badge', 's2.dots']) {
      expect(s[slot], slot).toBeDefined();
    }
    // 🔴 Um passo NUNCA desenha s3/s4: a chave é por modelo.
    expect(Object.keys(s).some((k) => /^s[34]\./.test(k))).toBe(false);
  });

  it('o passo em qualquer posição continua gravando e desenhando s2.*', () => {
    for (const position of [1, 2, 3, 6, 11]) {
      const s = styles(markup(TEMPLATE_03_MODEL_STEP, { position, total: 12 }));
      expect(s['s2.title'], `posição ${position}`).toBeDefined();
      expect(s['s3.title']).toBeUndefined();
    }
  });

  it('sem slots, o conteúdo é o texto de fábrica do Figma', () => {
    const html = markup(TEMPLATE_03_MODEL_COVER);
    expect(html).toContain('dolor sit amet.');
    const passo = markup(TEMPLATE_03_MODEL_STEP);
    expect(passo).toContain('Passo 01 - ');
  });

  it('slot presente e VAZIO é vazio de verdade, não o texto de fábrica', () => {
    const html = markup(TEMPLATE_03_MODEL_STEP, { slots: { 's2.title': '', 's2.body': '' } });
    expect(html).not.toContain('Passo 01');
    expect(html).not.toContain('Antes de digitar');
  });

  it('cada slot desenha o texto do usuário', () => {
    const html = markup(TEMPLATE_03_MODEL_STEP, {
      slots: { 's2.title': 'Passo 09 - Fim', 's2.body': 'corpo do usuário' },
    });
    expect(html).toContain('Passo 09 - Fim');
    expect(html).toContain('corpo do usuário');
  });

  it('a cor de cada bloco é a do spec, e MUDA com o modelo', () => {
    const capa = styles(markup(TEMPLATE_03_MODEL_COVER));
    const passo = styles(markup(TEMPLATE_03_MODEL_STEP));
    // Corpo: cinza na capa, branco no passo.
    expect(capa['s1.body'].color).toBe(TEMPLATE_03_PALETTE.cinza_corpo);
    expect(passo['s2.body'].color).toBe(TEMPLATE_03_PALETTE.branco);
    // Cantos: brancos na capa, cinza no passo.
    expect(capa['cantos.left'].color).toBe(TEMPLATE_03_PALETTE.branco);
    expect(passo['cantos.left'].color).toBe(TEMPLATE_03_PALETTE.cinza_cantos);
  });

  it('a posição de cada bloco é a do spec — 0px contra o gabarito', () => {
    const html = markup(TEMPLATE_03_MODEL_COVER);
    const s = styles(html);
    // Os números conferidos contra exemplos/deck-final.html do material.
    expect(px(s['cantos.left'].left)).toBe(71);
    expect(px(s['cantos.left'].top)).toBe(44);
    expect(px(s['cantos.right'].right)).toBe(63);
    // O @ vive no wrapper `data-profile-handle-layout`, ancorado exatamente na
    // posição do spec (195/636); o selo acompanha em fluxo ao lado dele.
    expect(px(layoutStyle(html).left)).toBe(195);
    expect(px(layoutStyle(html).top)).toBe(636);
    expect(px(s['s1.avatar'].left)).toBe(134);
    expect(px(s['s1.avatar'].top)).toBe(627);
    // Badge em fluxo: sem left/top absoluto (era left:409px no spec).
    expect(badgeStyleOf(html)).not.toContain('left:409px');
    expect(badgeStyleOf(html)).not.toContain('top:');
    expect(px(s['s1.dots'].left)).toBe(484);
    expect(px(s['s1.dots'].top)).toBe(1184 + TEMPLATE_03_DOTS_OFFSET_Y);
    expect(px(s.conteudo.top)).toBe(TEMPLATE_03_TITULO_Y_COVER);
    expect(px(s.conteudo.left)).toBe(134);
  });

  /**
   * O corpo cai exatamente no `y` do spec quando o título tem as linhas do
   * gabarito — é isso que prova que o bloco em fluxo não desloca nada.
   */
  it('o corpo herda do spec a distância ao título', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const s = styles(markup(model));
      const title = specNode(model, 'title');
      const body = specNode(model, 'body');
      const gap = px(s[body.slot!]['margin-top']);
      expect(gap).toBeCloseTo(body.box.y - (title.box.y + title.box.h), 3);
      // Somado ao topo do bloco e à altura da caixa do título, dá o `y` do spec.
      const topDoCorpo = px(s.conteudo.top) + title.box.h + gap;
      expect(topDoCorpo).toBeCloseTo(body.box.y, 3);
    }
  });
});

// ── Camadas e degradê ───────────────────────────────────────────

describe('Template 3 — camadas e o degradê de FAIXA', () => {
  it('com imagem: foto embaixo, scrim por cima, texto acima de tudo', () => {
    const s = styles(markup(TEMPLATE_03_MODEL_COVER, { slots: { 's1.image': 'https://x/f.jpg' } }));
    expect(s.imagem['background-image']).toBe("url('https://x/f.jpg')");
    expect(s.imagem['background-size']).toBe('cover');
    expect(Number(s.imagem['z-index'])).toBeLessThan(Number(s.scrim['z-index']));
    expect(Number(s.scrim['z-index'])).toBeLessThan(Number(s.conteudo['z-index']));
    expect(Number(s.scrim['z-index'])).toBeLessThan(Number(s['s1.dots']['z-index']));
  });

  it('sem override, o overlay usa exatamente o degradê do spec', () => {
    const html = markup(TEMPLATE_03_MODEL_COVER, { slots: { 's1.image': 'https://x/f.jpg' } });
    const expected = template03GradientSlide(TEMPLATE_03_MODEL_COVER).backgroundLayers!
      .find((layer) => layer.type === 'GRADIENT_SCRIM')!.css;
    expect(styles(html).scrim.background).toBe(expected);
  });

  it('sem imagem não existe camada nenhuma — só o degradê do Figma', () => {
    const s = styles(markup(TEMPLATE_03_MODEL_COVER));
    expect(s.imagem).toBeUndefined();
    expect(s.scrim).toBeUndefined();
    // E o degradê sozinho já é um slide válido: é o fundo da raiz.
    expect(rootStyle(markup(TEMPLATE_03_MODEL_COVER)).background).toBe(
      TEMPLATE_03_SPEC.slides[0].background[0].css
    );
  });

  /**
   * 🔴 O degradê do FlowLine é uma FAIXA: os handles do Figma cobrem um trecho
   * do eixo e o `extract_spec.py` já reprojetou as paradas para a % de CSS. Se
   * alguém "arrumar" para 0%/100%, o degradê estica de borda a borda e o
   * template muda de cara sem erro nenhum.
   */
  it('o scrim usa as paradas reprojetadas do spec, não 0%/100%', () => {
    const s = styles(markup(TEMPLATE_03_MODEL_COVER, { slots: { 's1.image': 'https://x/f.jpg' } }));
    const layer = TEMPLATE_03_SPEC.slides[0].backgroundLayers!.find(
      (l) => l.type === 'GRADIENT_SCRIM'
    )!;
    expect(s.scrim.background).toBe(layer.css);
    // As % vêm de cssStopsPercent — a faixa, não a tela inteira.
    const stops = TEMPLATE_03_SPEC.slides[0].background[0].cssStopsPercent!;
    for (const stop of stops) expect(s.scrim.background).toContain(String(stop));
    expect(s.scrim.background).not.toMatch(/\b0%/);
    expect(s.scrim.background).toContain('rgba(0,0,0,0)');
  });

  /**
   * `TEMPLATE_03_DESIGN_TWEAKS.scrimDoPasso`: o slide 2 do spec traz o degradê a
   * 358.75deg e os 3 e 4 a 180deg — o MESMO passo em direções opostas. Num deck
   * aberto, alternar por paridade faz o carrossel piscar, então todo passo usa
   * o do slide 3.
   */
  it('todo passo usa o degradê do slide 3 do spec, não o invertido do slide 2', () => {
    const slide3 = TEMPLATE_03_SPEC.slides.find((s) => s.index === 3)!;
    const slide2 = TEMPLATE_03_SPEC.slides.find((s) => s.index === 2)!;
    expect(slide2.background[0].angleDeg).toBe(358.75);
    expect(slide3.background[0].angleDeg).toBe(180);

    expect(rootStyle(markup(TEMPLATE_03_MODEL_STEP)).background).toBe(slide3.background[0].css);
    const s = styles(markup(TEMPLATE_03_MODEL_STEP, { slots: { 's2.image': 'https://x/f.jpg' } }));
    expect(s.scrim.background).toBe(
      slide3.backgroundLayers!.find((l) => l.type === 'GRADIENT_SCRIM')!.css
    );
    // E nenhum passo pode sair com o degradê invertido, em nenhuma posição.
    for (const position of [1, 2, 3, 4, 5]) {
      const html = markup(TEMPLATE_03_MODEL_STEP, { position, total: 6 });
      expect(html, `posição ${position}`).not.toContain('358.75');
    }
  });
});

// ── Dots ────────────────────────────────────────────────────────

describe('Template 3 — os dots são CALCULADOS', () => {
  it('o texto "....." do slot do spec nunca aparece', () => {
    const node = specNode(TEMPLATE_03_MODEL_COVER, 'dots');
    expect(node.text!.characters).toBe('.....');
    expect(markup(TEMPLATE_03_MODEL_COVER)).not.toContain('.....');
  });

  it('o número de pontos é o tamanho do DECK, não os 4 do Figma', () => {
    expect(specNode(TEMPLATE_03_MODEL_COVER, 'dots').dotsConfig!.total).toBe(4);
    for (const total of [2, 4, 7, 12]) {
      expect(dots(markup(TEMPLATE_03_MODEL_COVER, { total })), `deck de ${total}`).toHaveLength(
        total
      );
    }
  });

  /** O teste que o plano exige: deck de 7 acende o 7º ponto no último slide. */
  it('deck de 7 slides acende o 7º ponto no último slide', () => {
    const d = dots(markup(TEMPLATE_03_MODEL_STEP, { position: 6, total: 7 }));
    expect(d).toHaveLength(7);
    expect(d[6].fill).toBe('#FFFFFF');
    expect(d.filter((c) => c.fill === '#FFFFFF')).toHaveLength(1);
    // E o aceso é MAIOR que os apagados.
    expect(d[6].r).toBeGreaterThan(d[0].r);
  });

  it('o ponto aceso segue a posição do slide, um a um', () => {
    for (let position = 0; position < 7; position++) {
      const d = dots(
        markup(position === 0 ? TEMPLATE_03_MODEL_COVER : TEMPLATE_03_MODEL_STEP, {
          position,
          total: 7,
        })
      );
      const aceso = d.findIndex((c) => c.fill === '#FFFFFF');
      expect(aceso, `posição ${position}`).toBe(position);
    }
  });

  /**
   * O `SKILL.md` avisa: dentro de um SVG já posicionado, coordenada ABSOLUTA da
   * página manda o elemento para fora da área visível sem erro nenhum. Todo
   * `cx`/`cy` tem de caber na caixa do próprio SVG.
   */
  it('as coordenadas dos círculos são LOCAIS ao SVG', () => {
    const node = specNode(TEMPLATE_03_MODEL_COVER, 'dots');
    for (const total of [1, 4, 7, 12]) {
      for (const c of dots(markup(TEMPLATE_03_MODEL_COVER, { total }))) {
        expect(c.cx).toBeGreaterThanOrEqual(0);
        expect(c.cx).toBeLessThanOrEqual(node.box.w);
      }
    }
  });

  it('a geometria é a do gabarito — conferida contra deck-final.html', () => {
    const d = dots(markup(TEMPLATE_03_MODEL_COVER, { total: 4 }));
    expect(d.map((c) => c.cx)).toEqual([14.125, 42.375, 70.625, 98.875]);
    expect(d[0].r).toBe(4.2);
    expect(d[1].r).toBe(3.024);
    expect(d[1].fill).toBe('rgba(255,255,255,0.45)');
  });

  it('deck de 1 slide não divide por zero nem some da tela', () => {
    const d = dots(markup(TEMPLATE_03_MODEL_COVER, { total: 1, position: 0 }));
    expect(d).toHaveLength(1);
    expect(d[0].fill).toBe('#FFFFFF');
  });
});

// ── Tipografia ──────────────────────────────────────────────────

describe('Template 3 — a tipografia sai do spec', () => {
  it('corpo, entrelinha e tracking de cada bloco são os do nó do spec', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const s = styles(markup(model));
      for (const name of ['title', 'body', 'handle', 'cantos.left', 'cantos.right']) {
        const node = specNode(model, name);
        const css = s[node.slot!];
        const t = node.typography!;
        expect(px(css['font-size']), node.slot).toBe(t.fontSizePx);
        expect(px(css['line-height']), node.slot).toBe(t.lineHeightPx);
        expect(css['letter-spacing'], node.slot).toBe(`${t.letterSpacingEm}em`);
        expect(css['text-align'], node.slot).toBe(t.textAlignHorizontal.toLowerCase());
      }
    }
  });

  it('o título da capa é 113px e o do passo 92px, ambos lidos do spec', () => {
    expect(specNode(TEMPLATE_03_MODEL_COVER, 'title').typography!.fontSizePx).toBeCloseTo(113.658, 3);
    expect(specNode(TEMPLATE_03_MODEL_STEP, 'title').typography!.fontSizePx).toBeCloseTo(92.067, 3);
    expect(px(styles(markup(TEMPLATE_03_MODEL_COVER))['s1.title']['font-size'])).toBeCloseTo(113.658, 3);
    expect(px(styles(markup(TEMPLATE_03_MODEL_STEP))['s2.title']['font-size'])).toBeCloseTo(92.067, 3);
  });

  /**
   * A régua do `designSystem`: 100.5% nos títulos, 109.14% no corpo, e o
   * tracking por papel. Se um nó do spec deixar de bater com a razão, é o spec
   * que mudou — e o desenho muda junto, calado. Este teste é o alarme.
   */
  it('entrelinha e tracking batem com as razões de designSystem', () => {
    const { lineHeightRatio, letterSpacingEm } = TEMPLATE_03_SPEC.designSystem;
    const casos: [string, number, number][] = [
      ['title', lineHeightRatio.titulo, letterSpacingEm.titulo],
      ['body', lineHeightRatio.corpo, letterSpacingEm.corpo],
      ['cantos.left', lineHeightRatio.corpo, letterSpacingEm.cantos],
      ['cantos.right', lineHeightRatio.corpo, letterSpacingEm.cantos],
    ];
    for (const model of TEMPLATE_03_MODELS) {
      for (const [name, ratio, tracking] of casos) {
        const t = specNode(model, name).typography!;
        // 3 casas, e não 4: o spec guarda `lineHeightPx` com duas decimais, e
        // nos corpos pequenos (16.805px dos cantos) esse arredondamento move a
        // razão em 6e-5. A tolerância cobre o arredondamento e continua pegando
        // qualquer troca de verdade — 1.0 contra 1.0914 salta aos olhos.
        expect(t.lineHeightPx / t.fontSizePx, `${name} entrelinha`).toBeCloseTo(ratio, 3);
        expect(t.letterSpacingEm, `${name} tracking`).toBe(tracking);
      }
      // O divisor (os dots) é o único com tracking positivo, +0.17em.
      expect(specNode(model, 'dots').typography!.letterSpacingEm).toBe(letterSpacingEm.divider);
    }
  });

  it('as famílias são as que o app já serve — nenhum @font-face novo', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const s = styles(markup(model));
      expect(s[`s${model}.title`]['font-family']).toBe("'T01Inter', sans-serif");
      for (const slot of [`s${model}.body`, `s${model}.handle`, 'cantos.left']) {
        expect(s[slot]['font-family'], slot).toBe("'T01InterDisplay', sans-serif");
      }
    }
  });

  /**
   * ⚠️ Armadilha #5 do estudo, uma sessão inteira já queimada nela: o app tem um
   * `@font-face` chamado `'IvyOra Text'` que resolve só por `local()`. Sem a
   * fonte instalada o Chrome trata a família como definida-e-vazia e pula para a
   * `serif` genérica em vez de cair no `T01Serif`. Medido no T1: 334px contra
   * 305px.
   */
  it("nenhuma pilha de fonte contém 'IvyOra Text'", () => {
    for (const model of TEMPLATE_03_MODELS) {
      const html = markup(model);
      expect(decode(html)).not.toContain('IvyOra Text');
      for (const css of Object.values(styles(html))) {
        if (css['font-family']) expect(css['font-family']).not.toContain('IvyOra');
      }
    }
  });

  /**
   * 🔴 Armadilha #6 do estudo: com `height` travado no `lineHeight`, a segunda
   * linha visual de um texto que não coube cai POR CIMA da linha seguinte —
   * texto sobre texto. Medido no T2 a 110px: `scrollHeight` 247 num div de 120.
   */
  it('nenhum bloco de texto tem height fixo', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const s = styles(markup(model));
      for (const name of ['title', 'body', 'handle', 'cantos.left', 'cantos.right']) {
        const slot = specNode(model, name).slot!;
        expect(s[slot].height, slot).toBeUndefined();
        expect(s[slot]['max-height'], slot).toBeUndefined();
      }
    }
  });

  /**
   * A caixa dos cantos no Figma ABRAÇA o texto de fábrica (104px para
   * "LOREM IPSUM"), mas o spec permite 19 caracteres. Largura fixa faria o
   * primeiro nome de marca um pouco maior quebrar em duas linhas. É a mesma
   * correção que o Template 1 já fez nos cantos dele.
   */
  it('os cantos usam max-content; o corpo usa a largura real do spec', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const s = styles(markup(model));
      expect(s['cantos.left'].width).toBe('max-content');
      expect(s['cantos.right'].width).toBe('max-content');
      // O corpo é `textAutoResize: HEIGHT` — ali a caixa é restrição de verdade.
      expect(specNode(model, 'body').typography!.textAutoResize).toBe('HEIGHT');
      expect(px(s.conteudo.width)).toBe(specNode(model, 'body').box.w);
    }
  });
});

// ── Avatar e badge ──────────────────────────────────────────────

describe('Template 3 — avatar e badge', () => {
  it('o badge acompanha o handle curto e longo em layout de fluxo', () => {
    const renderHandle = (handle: string) =>
      markup(TEMPLATE_03_MODEL_COVER, { slots: { 's1.handle': handle } });

    const short = renderHandle('@userinstagram');
    const long = renderHandle('@username-muito-longo-que-nao-pode-sobrepor-o-badge');
    const layout = (html: string) => /data-profile-handle-layout[^>]*style="([^"]*)"/.exec(html)?.[1] ?? '';
    const badge = (html: string) => /<img[^>]*data-slot="s1\.badge"[^>]*style="([^"]*)"/.exec(html)?.[1] ?? '';

    expect(layout(short)).toContain('display:inline-flex');
    expect(layout(short)).toContain('min-width:201px');
    expect(layout(long)).toContain('display:inline-flex');
    expect(layout(long)).toContain('min-width:201px');
    expect(badge(short)).not.toContain('left:409px');
    expect(badge(long)).not.toContain('left:409px');
    expect(long).toContain('@username-muito-longo-que-nao-pode-sobrepor-o-badge');
    expect((short.match(/data-profile-handle-layout/g) ?? []).length).toBe(1);
    expect((long.match(/data-profile-handle-layout/g) ?? []).length).toBe(1);
  });

  it('sem foto, o avatar é a elipse sólida do spec', () => {
    const s = styles(markup(TEMPLATE_03_MODEL_COVER));
    expect(s['s1.avatar'].background).toBe(TEMPLATE_03_PALETTE.vermelho_avatar);
    expect(s['s1.avatar']['border-radius']).toBe('50%');
    expect(s['s1.avatar'].border).toContain(TEMPLATE_03_PALETTE.branco);
  });

  it('com foto, o avatar recebe a imagem em cover e continua redondo', () => {
    const html = markup(TEMPLATE_03_MODEL_COVER, { slots: { 's1.avatar': 'https://x/eu.jpg' } });
    const s = styles(html);
    const photo = /data-avatar-photo[^>]*?style="([^"]*)"/.exec(html)![1];
    expect(photo).toContain('object-fit:cover');
    expect(photo).toContain('object-position:50% 50%');
    expect(photo).toContain('transform:scale(1)');
    expect(s['s1.avatar']['border-radius']).toBe('50%');
    expect(s['s1.avatar'].overflow).toBe('hidden');
  });

  it('o badge usa o asset local fornecido, no preview e no export', () => {
    const html = markup(TEMPLATE_03_MODEL_COVER);
    const badge = /<img[^>]*data-slot="s1\.badge"[^>]*>/.exec(html)![0];
    const asset = readFileSync('public/templates/icons8-instagram-verification-badge.svg', 'utf8');
    expect(existsSync('public/templates/icons8-instagram-verification-badge.svg')).toBe(true);
    expect(asset).toContain('#42a5f5');
    expect(asset).toContain('#fff');
    expect(badge).toContain(`src="${TEMPLATE_03_BADGE_ASSET}"`);
    expect(html).not.toContain('lucide-badge-check');
  });

  it('sem ajustes, a barra mantém geometria do spec e escala 100%', () => {
    const html = markup(TEMPLATE_03_MODEL_COVER);
    const s = styles(html);
    const group = profileGroupStyle(html);
    expect(group.transform).toBe('scale(1)');
    expect(s['s1.avatar'].left).toBe('134px');
    expect(s['s1.avatar'].top).toBe('627px');
    // @ e selo vivem no wrapper em fluxo ancorado no spec (195/636); badge sem left absoluto.
    expect(px(layoutStyle(html).left)).toBe(195);
    expect(badgeStyleOf(html)).not.toContain('left:409px');
  });

  it('escala a barra inteira a partir da âncora da coluna do conteúdo', () => {
    const html = markup(TEMPLATE_03_MODEL_COVER, {
      slots: {},
    });
    const withStyle = renderToStaticMarkup(
      <Template03Slide
        slide={{
          ...DEFAULT_SLIDE,
          id: 'scaled',
          position: 0,
          templateModel: TEMPLATE_03_MODEL_COVER,
          templateSlotStyles: { 's1.avatar': { profileScale: 120 } },
        } as Slide}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={4}
      />
    );
    expect(profileGroupStyle(html).transform).toBe('scale(1)');
    expect(profileGroupStyle(withStyle).transform).toBe('scale(1.2)');
    expect(profileGroupStyle(withStyle)['transform-origin']).toBe('0px 0px');
    // A geometria interna continua sendo a do spec; é o grupo que transforma
    // avatar, @, badge e check juntos.
    expect(styles(withStyle)['s1.avatar'].left).toBe('134px');
    // @/selo em fluxo ancorados no spec; badge sem left absoluto (era 409px).
    expect(px(layoutStyle(withStyle).left)).toBe(195);
    expect(badgeStyleOf(withStyle)).not.toContain('left:409px');
  });

  it('usa LEFT do Group 6 no preview e suporta RIGHT sem controle persistido', () => {
    const geometry = template03ProfileGeometry(TEMPLATE_03_MODEL_COVER, 702);
    expect(template03ProfileAlignmentFor(TEMPLATE_03_MODEL_COVER)).toBe('left');
    expect(geometry.group.alignment).toBe('left');
    expect(geometry.group.originX).toBe(134);
    expect(profileGroupStyle(markup(TEMPLATE_03_MODEL_COVER))['transform-origin']).toBe('0px 0px');

    const bounds = { left: 134, right: 438.44, top: 627, bottom: 675.07 };
    expect(template03ProfileScaleOrigin(bounds, 'left')).toEqual({
      originX: bounds.left,
      originY: (bounds.top + bounds.bottom) / 2,
    });
    expect(template03ProfileScaleOrigin(bounds, 'right')).toEqual({
      originX: bounds.right,
      originY: (bounds.top + bounds.bottom) / 2,
    });
  });

  it('o toggle de perfil oculta o grupo inteiro e religa preservando escala/origem', () => {
    const hidden = markup(TEMPLATE_03_MODEL_COVER, {
      slotStyles: {
        's1.handle': { visible: false },
        's1.avatar': { profileScale: 120 },
      },
    });
    const hiddenGroup = profileGroupStyle(hidden);
    expect(hiddenGroup.display).toBe('none');
    expect(hidden).toContain('data-slot="s1.avatar"');
    // O wrapper é a fonte de visibilidade do conjunto. O texto é omitido pelo
    // SpecText quando invisível, enquanto avatar e badge continuam no wrapper
    // oculto para que o estado seja reversível sem perder a geometria.
    expect(hidden).not.toContain('data-slot="s1.handle"');
    expect(hidden).toContain(`src="${TEMPLATE_03_BADGE_ASSET}"`);
    expect(hiddenGroup.transform).toBe('scale(1.2)');

    const visible = markup(TEMPLATE_03_MODEL_COVER, {
      slotStyles: {
        's1.handle': { visible: true },
        's1.avatar': { profileScale: 120 },
      },
    });
    expect(profileGroupStyle(visible).display).toBeUndefined();
    expect(visible).toContain('data-slot="s1.handle"');
    expect(profileGroupStyle(visible).transform).toBe('scale(1.2)');
    expect(profileGroupStyle(visible)['transform-origin']).toBe(
      profileGroupStyle(hidden)['transform-origin']
    );
  });

  it('zoom e posições mudam somente o crop da foto', () => {
    const html = renderToStaticMarkup(
      <Template03Slide
        slide={{
          ...DEFAULT_SLIDE,
          id: 'crop',
          position: 0,
          templateModel: TEMPLATE_03_MODEL_COVER,
          templateSlots: { 's1.avatar': 'https://x/eu.jpg' },
          templateSlotStyles: {
            's1.avatar': {
              avatarZoom: 180,
              avatarPositionX: 20,
              avatarPositionY: 75,
            },
          },
        } as Slide}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={4}
      />
    );
    const photo = /data-avatar-photo[^>]*?style="([^"]*)"/.exec(html)![1];
    expect(photo).toContain('object-position:20% 75%');
    expect(photo).toContain('transform:scale(1.8)');
    expect(styles(html)['s1.avatar'].left).toBe('134px');
    expect(styles(html)['s1.avatar'].top).toBe('627px');
    expect(profileGroupStyle(html).transform).toBe('scale(1)');
  });

  it('a barra de perfil anda junto com o bloco de título', () => {
    // No spec ela está 75px acima do título nos quatro slides.
    for (const model of TEMPLATE_03_MODELS) {
      const title = specNode(model, 'title');
      const avatar = specNode(model, 'avatar');
      expect(title.box.y - avatar.box.y).toBe(75);
    }
    // E quando o passo desce no ciclo, ela desce junto.
    const s = styles(markup(TEMPLATE_03_MODEL_STEP, { position: 3, total: 5 }));
    expect(px(s.conteudo.top)).toBe(template03TituloY(2));
    expect(px(s['s2.avatar'].top)).toBe(template03TituloY(2) - 75);
  });
});

// ── O ciclo do tituloY ──────────────────────────────────────────

describe('Template 3 — o tituloY cicla no render', () => {
  it('a capa fica no 702 do spec, em qualquer deck', () => {
    for (const total of [1, 4, 9]) {
      const s = styles(markup(TEMPLATE_03_MODEL_COVER, { position: 0, total }));
      expect(px(s.conteudo.top)).toBe(TEMPLATE_03_TITULO_Y_COVER);
    }
  });

  it('os passos descem 358 → 536 → 750 e o quarto volta ao início', () => {
    const [a, b, c] = TEMPLATE_03_STEP_TITULO_Y;
    const topOf = (position: number) =>
      px(styles(markup(TEMPLATE_03_MODEL_STEP, { position, total: 9 })).conteudo.top);
    expect(topOf(1)).toBe(a);
    expect(topOf(2)).toBe(b);
    expect(topOf(3)).toBe(c);
    expect(topOf(4)).toBe(a);
    expect(topOf(5)).toBe(b);
    expect(topOf(6)).toBe(c);
    expect(topOf(7)).toBe(a);
  });

  it('o primeiro passo cai no `y` do nó do spec — fidelidade preservada', () => {
    expect(TEMPLATE_03_STEP_TITULO_Y[0]).toBe(specNode(TEMPLATE_03_MODEL_STEP, 'title').box.y);
  });
});

// ── Modelo é dado do slide ──────────────────────────────────────

describe('Template 3 — o desenho vem do modelo, não da posição', () => {
  it('capa gravada na posição 5 continua desenhando a capa', () => {
    const s = styles(markup(TEMPLATE_03_MODEL_COVER, { position: 5, total: 8 }));
    expect(s['s1.title']).toBeDefined();
    expect(px(s.conteudo.top)).toBe(TEMPLATE_03_TITULO_Y_COVER);
  });

  it('slide SEM templateModel volta a derivar da posição — compatibilidade', () => {
    const semModelo = (position: number) =>
      renderToStaticMarkup(
        <Template03Slide
          slide={{ ...DEFAULT_SLIDE, id: 's', position } as Slide}
          globalSettings={{ ...DEFAULT_GLOBAL_SETTINGS }}
          slideIndex={position}
          totalSlides={4}
        />
      );
    expect(semModelo(0)).toContain('data-model="1"');
    expect(semModelo(1)).toContain('data-model="2"');
    expect(semModelo(3)).toContain('data-model="2"');
  });

  it('o texto de fábrica do render bate com template03DefaultSlots', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const html = markup(model);
      for (const [, texto] of Object.entries(template03DefaultSlots(model))) {
        if (!texto) continue;
        // O React escapa e a quebra manual vira texto puro no markup.
        expect(decode(html), texto).toContain(texto.split('\n')[0]);
      }
    }
  });
});
