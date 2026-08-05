import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Template02Slide from '@/components/slides/Template02Slide';
import {
  TEMPLATE_02_COLORS,
  TEMPLATE_02_DEFAULT_MODELS,
  TEMPLATE_02_DESIGN_TWEAKS,
  TEMPLATE_02_GRID,
  TEMPLATE_02_HEADER_MARGIN_X,
  TEMPLATE_02_MODELS,
  TEMPLATE_02_SLOTS,
  TEMPLATE_02_SPEC,
  Template02Slots,
  template02ContentBox,
  template02CoverTops,
  template02DefaultSlots,
  template02FontStack,
  template02HeaderSlots,
  template02HighlightLine,
  template02ImageSlot,
  template02LayoutOf,
  template02Measure,
  template02ModelOf,
  template02NewSlideSlots,
  template02NextModel,
  template02Overflows,
  template02SlotsForModel,
  template02Type,
} from '@/lib/templates/template-02';
import { FORMAT_LIST, getFormat } from '@/lib/formats';
import { TEMPLATE_SIDEBAR_CONFIG } from '@/components/editor/sidebar/panels';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide, SlideFormat } from '@/types';

/**
 * TEMPLATE 2.
 *
 * O `spec.json` é a fonte da verdade da forma e o `generate.py` da skill é o
 * gabarito de render. Estes testes travam as duas coisas: se alguém arredondar
 * um tamanho de fonte, trocar uma família, perder um slot ou fazer o modelo
 * voltar a sair da posição, o carrossel muda de desenho e ninguém percebe
 * olhando o diff.
 */

function markup(model: number, slots?: Template02Slots, format?: SlideFormat, position = 0): string {
  const slide = {
    ...DEFAULT_SLIDE,
    id: 's',
    position,
    templateModel: model,
    // O T2 não usa os campos genéricos de imagem do editor: a imagem vem do
    // slot. Zerados aqui para o teste falar só do template.
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
    ...(slots ? { templateSlots: slots } : {}),
  } as Slide;
  return renderToStaticMarkup(
    <Template02Slide
      slide={slide}
      globalSettings={{ ...DEFAULT_GLOBAL_SETTINGS, format }}
      slideIndex={position}
      totalSlides={5}
    />
  );
}

/**
 * O React escapa as aspas simples do atributo `style` como `&#x27;`, e o `;` do
 * escape parte a declaração ao meio no split abaixo. Desfazer antes é o que faz
 * `font-family` e `url('…')` chegarem legíveis aqui.
 */
function decode(v: string): string {
  return v.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

/** `style` inline de cada `data-slot`/`data-block`, quebrado em propriedades. */
function styles(html: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const m of html.matchAll(/data-(?:slot|block)="([^"]+)"[^>]*?style="([^"]*)"/g)) {
    const props: Record<string, string> = {};
    for (const decl of decode(m[2]).split(';')) {
      const i = decl.indexOf(':');
      if (i > 0) props[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
    }
    out[m[1]] = props;
  }
  return out;
}

describe('TEMPLATE 2 — spec', () => {
  it('é 1080x1350 e tem os três layouts do Figma', () => {
    expect(TEMPLATE_02_SPEC.canvas).toMatchObject({ width: 1080, height: 1350 });
    expect(TEMPLATE_02_SPEC.layouts.map((l) => l.id)).toEqual([
      'cover',
      'content-left',
      'content-right',
    ]);
  });

  it('mantém os tamanhos de fonte com as casas decimais do Figma', () => {
    // Arredondar 76.5495 para 76 muda a quebra de toda a headline.
    expect(template02Type('coverHeadline').fontSize).toBeCloseTo(76.5495, 4);
    expect(template02Type('slideTitle').fontSize).toBeCloseTo(73.1693, 4);
    expect(template02Type('slideBody').fontSize).toBeCloseTo(38.2853, 4);
  });

  it('mantém as duas constantes de tipografia do spec em TODOS os papéis', () => {
    const { lineHeightRatio, letterSpacingRatio } = TEMPLATE_02_SPEC.tokens.typeRules;
    for (const [name, t] of Object.entries(TEMPLATE_02_SPEC.tokens.typeScale)) {
      expect(t.lineHeight / t.exact, `${name} entrelinha`).toBeCloseTo(lineHeightRatio, 3);
      const displayRole = name === 'coverHeadline' || name === 'slideTitle' || name === 'ctaLabel';
      const ratio = displayRole ? letterSpacingRatio.display : letterSpacingRatio.body;
      expect(t.letterSpacing / t.exact, `${name} tracking`).toBeCloseTo(ratio, 3);
    }
  });

  it('o grid fecha em 1080 e o espelhamento é exato', () => {
    const g = TEMPLATE_02_GRID;
    expect(g.marginX + g.textColumnWidth + g.columnGap + g.imageColumnWidth + g.marginX).toBe(1080);
    expect(g.contentTop + g.contentHeight).toBe(g.contentBottom);
    expect(g.verticalCenter).toBe(g.contentTop + g.contentHeight / 2);
  });
});

describe('TEMPLATE 2 — fontes', () => {
  it('usa a IvyOra do Typekit no serifado — desvio deliberado do spec', () => {
    // O spec pede Newsreader "por licença". O Rafael tem a licença da IvyOra e
    // pediu ela; o desvio é registrado, não escondido.
    expect(TEMPLATE_02_DESIGN_TWEAKS.serif.spec).toBe('Newsreader');
    expect(template02FontStack('serif')).toBe("'ivyora-text', 'T01Serif', serif");
    expect(markup(2)).toContain('ivyora-text');
  });

  it('NUNCA escreve `IvyOra Text` na pilha serifada', () => {
    // O @font-face `IvyOra Text` resolve só por local(); vazio, o Chrome pula
    // para a serif genérica (Georgia) em vez de cair no T01Serif. Já custou uma
    // sessão no Template 1 — 334px contra 305px.
    expect(template02FontStack('serif')).not.toContain('IvyOra Text');
    expect(markup(2)).not.toContain('IvyOra Text');
    expect(markup(3)).not.toContain('IvyOra Text');
  });

  it('usa as faces embutidas nas sem-serifa, sem @font-face novo', () => {
    expect(template02FontStack('display')).toContain('T01Inter');
    expect(template02FontStack('body')).toContain('T01InterDisplay');
    expect(template02FontStack('ui')).toContain('T01InterDisplay');
  });
});

describe('TEMPLATE 2 — modelo é dado, não posição', () => {
  it('respeita o `templateModel` gravado, mesmo contrariando a posição', () => {
    // Um deck pode ter capa no meio, dois `content-left` seguidos ou 12 slides:
    // quem manda é o dado.
    expect(template02ModelOf({ templateModel: 1 }, 4)).toBe(1);
    expect(template02ModelOf({ templateModel: 3 }, 0)).toBe(3);
    expect(template02ModelOf({ templateModel: 2 }, 9)).toBe(2);
    expect(markup(3, undefined, undefined, 0)).toContain('data-model="3"');
    expect(markup(1, undefined, undefined, 4)).toContain('data-model="1"');
  });

  it('sem `templateModel` deriva da posição pela sequência padrão do spec', () => {
    const derived = [0, 1, 2, 3, 4].map((p) => template02ModelOf({}, p));
    expect(derived).toEqual(TEMPLATE_02_DEFAULT_MODELS);
    expect(TEMPLATE_02_DEFAULT_MODELS).toEqual([1, 2, 3, 2, 3]);
  });

  it('a derivação nunca repete dois modelos seguidos depois da capa', () => {
    const derived = Array.from({ length: 12 }, (_, p) => template02ModelOf(undefined, p));
    for (let i = 2; i < derived.length; i++) expect(derived[i]).not.toBe(derived[i - 1]);
  });

  it('ignora modelo inválido e cai na derivação por posição', () => {
    expect(template02ModelOf({ templateModel: 7 }, 1)).toBe(2);
    expect(template02ModelOf({ templateModel: 0 }, 0)).toBe(1);
  });

  it('a alternância vai e volta entre os dois modelos de conteúdo', () => {
    expect(template02NextModel(1)).toBe(2);
    expect(template02NextModel(2)).toBe(3);
    expect(template02NextModel(3)).toBe(2);
  });
});

describe('TEMPLATE 2 — slots', () => {
  it('usa exatamente as chaves do spec, sem inventar nome', () => {
    expect(TEMPLATE_02_SLOTS).toEqual([
      'header.category',
      'header.handle',
      'cover.image',
      'cover.headline',
      'cover.highlight',
      'cover.cta',
      'content.image',
      'content.title',
      'content.body',
    ]);
  });

  it('cada modelo expõe os seus slots mais o cabeçalho global', () => {
    const cover = template02SlotsForModel(1).map((d) => d.slot);
    expect(cover).toEqual([
      'header.category',
      'header.handle',
      'cover.image',
      'cover.headline',
      'cover.highlight',
      'cover.cta',
    ]);
    for (const model of [2, 3]) {
      expect(template02SlotsForModel(model).map((d) => d.slot)).toEqual([
        'header.category',
        'header.handle',
        'content.image',
        'content.title',
        'content.body',
      ]);
    }
  });

  it('só o cabeçalho é global do deck', () => {
    for (const model of TEMPLATE_02_MODELS) {
      for (const d of template02SlotsForModel(model)) {
        expect(d.scope, d.slot).toBe(d.slot.startsWith('header.') ? 'deck' : 'slide');
      }
    }
  });

  it('lê os limites de texto do spec, sem redigitar número', () => {
    const limites = TEMPLATE_02_SPEC.regrasDeGeracao.limitesDeTexto;
    const byslot = (model: number, slot: string) =>
      template02SlotsForModel(model).find((d) => d.slot === slot)!;

    const headline = byslot(1, 'cover.headline');
    expect(headline.maxCharsPerLine).toBe(limites['cover.headline'].maxCharPorLinha);
    expect(headline.maxLines).toBe(limites['cover.headline'].maxLinhas);
    expect(byslot(1, 'cover.cta').maxChars).toBe(limites['cover.cta'].maxChar);
    expect(byslot(2, 'content.title').maxChars).toBe(limites['content.title'].maxChar);
    expect(byslot(2, 'content.body').maxChars).toBe(limites['content.body'].maxChar);
    expect(byslot(1, 'header.handle').maxChars).toBe(limites['header.handle'].maxChar);
  });

  it('o slot de imagem é o fundo na capa e o bloco nos internos', () => {
    expect(template02ImageSlot(1)).toBe('cover.image');
    expect(template02ImageSlot(2)).toBe('content.image');
    expect(template02ImageSlot(3)).toBe('content.image');
  });

  it('o conteúdo de fábrica vem do spec, e difere entre os dois internos', () => {
    const left = template02DefaultSlots(2);
    const right = template02DefaultSlots(3);
    const el = (model: number, id: string) =>
      template02LayoutOf(model).elementos.find((e) => e.id === id)?.conteudoExemplo;
    expect(left['content.title']).toBe(el(2, 'content.title'));
    expect(right['content.title']).toBe(el(3, 'content.title'));
    expect(left['content.title']).not.toBe(right['content.title']);
    // O CTA é `cover.ctaText` no spec e `cover.cta` no slot: o texto tem de vir.
    expect(template02DefaultSlots(1)['cover.cta']).toBe(el(1, 'cover.ctaText'));
    expect(template02DefaultSlots(1)['cover.cta']).toBeTruthy();
  });

  it('o cabeçalho de um deck gerado é a marca do usuário, nunca a do spec', () => {
    expect(template02HeaderSlots('Arke Studio', 'arkebranding')).toEqual({
      'header.category': 'ARKE STUDIO',
      'header.handle': '@ARKEBRANDING',
    });
    // Sem onboarding preenchido o slot sai VAZIO — nunca com "@OANDRELONA".
    expect(template02HeaderSlots()).toEqual({ 'header.category': '', 'header.handle': '' });
    expect(template02HeaderSlots('', '@já@com@arroba')['header.handle']).toBe('@JÁ@COM@ARROBA');
  });
});

describe('TEMPLATE 2 — slide novo', () => {
  it('nasce com lorem dentro dos limites, nunca com a copy do spec', () => {
    for (const model of TEMPLATE_02_MODELS) {
      const slots = template02NewSlideSlots(model, { 'header.category': 'ARKE', 'header.handle': '@ARKE' });
      expect(template02Overflows(model, slots)).toEqual([]);
      const texto = Object.values(slots).join(' ');
      expect(texto).not.toContain('Barcelona');
      expect(texto).not.toContain('OANDRELONA');
      expect(texto).not.toContain('BRANDING & DESIGN');
      // O cabeçalho é herdado do deck, não gerado.
      expect(slots['header.category']).toBe('ARKE');
      expect(slots['header.handle']).toBe('@ARKE');
      // A imagem fica vazia: quem escolhe é o usuário.
      expect(slots[template02ImageSlot(model)]).toBeUndefined();
    }
  });

  it('o marcador do slide novo cabe numa linha do headline', () => {
    const slots = template02NewSlideSlots(1);
    expect(template02HighlightLine(slots['cover.headline'], slots['cover.highlight'])).toBe(0);
  });

  it('respeita a caixa-alta que o spec pede nos blocos display', () => {
    const slots = template02NewSlideSlots(1);
    expect(slots['cover.headline']).toBe(slots['cover.headline'].toUpperCase());
    expect(slots['cover.cta']).toBe(slots['cover.cta'].toUpperCase());
    // O título interno é "Sentence case" no spec: não pode sair gritando.
    const conteudo = template02NewSlideSlots(2);
    expect(conteudo['content.title']).not.toBe(conteudo['content.title'].toUpperCase());
  });

  it('é determinístico', () => {
    expect(template02NewSlideSlots(2)).toEqual(template02NewSlideSlots(2));
  });
});

describe('TEMPLATE 2 — medição', () => {
  it('a headline é medida por LINHA, porque a quebra dela é manual', () => {
    const d = template02SlotsForModel(1).find((s) => s.slot === 'cover.headline')!;
    expect(template02Measure('POR QUE 9 EM CADA\nSTARTUPS ERRAM', d).over).toBe(false);
    // 18 caracteres numa linha: vaza a caixa de 836px.
    expect(template02Measure('POR QUE 9 EM CADA1', d).over).toBe(true);
    // 5 linhas colidem com o CTA.
    expect(template02Measure('A\nB\nC\nD\nE', d).over).toBe(true);
  });

  it('o corpo é medido pelo TOTAL de caracteres, porque quem quebra é o navegador', () => {
    const d = template02SlotsForModel(2).find((s) => s.slot === 'content.body')!;
    expect(template02Measure('a'.repeat(220), d).over).toBe(false);
    expect(template02Measure('a'.repeat(221), d).over).toBe(true);
    // Dois parágrafos separados por \n\n continuam dentro da regra.
    expect(template02Measure('Um parágrafo.\n\nOutro parágrafo.', d).over).toBe(false);
  });

  it('não acusa o conteúdo de fábrica', () => {
    for (const model of TEMPLATE_02_MODELS) {
      expect(template02Overflows(model, template02DefaultSlots(model))).toEqual([]);
    }
  });

  it('acusa o slot que o usuário estourou, dizendo qual é', () => {
    const over = template02Overflows(2, { 'content.title': 'a'.repeat(41) });
    expect(over.map((o) => o.slot)).toEqual(['content.title']);
    expect(over[0].maxChars).toBe(40);
  });
});

describe('TEMPLATE 2 — capa', () => {
  it('põe o marcador lime numa linha só, com o texto em preto', () => {
    const html = markup(1, {
      'cover.headline': 'POR QUE 9 EM CADA\nSTARTUPS ERRAM A\nIDENTIDADE VISUAL',
      'cover.highlight': 'ERRAM A',
      'cover.cta': 'ARRASTA PRO LADO',
    });
    const spans = [...html.matchAll(/data-slot="cover\.highlight"/g)];
    // Exatamente 1 marcador por carrossel — e ele não pode cruzar duas faixas.
    expect(spans).toHaveLength(1);
    const s = styles(html)['cover.highlight'];
    expect(s.background).toBe(TEMPLATE_02_COLORS.accent);
    expect(s.color).toBe(TEMPLATE_02_COLORS.ink);
    expect(s['box-decoration-break']).toBe('clone');
    // O trecho sai inteiro dentro da linha que o contém, com o resto em volta.
    expect(html).toContain('>STARTUPS <span');
    expect(html).toContain('ERRAM A</span>');
  });

  it('não desenha marcador quando o trecho não está em nenhuma linha', () => {
    const html = markup(1, {
      'cover.headline': 'LINHA UM\nLINHA DOIS',
      'cover.highlight': 'INEXISTENTE',
    });
    expect(html).not.toContain('cover.highlight');
    expect(template02HighlightLine('LINHA UM\nLINHA DOIS', 'INEXISTENTE')).toBe(-1);
  });

  it('não deixa o marcador cruzar duas linhas: ele só existe dentro de uma', () => {
    // "UM DOIS" existe no texto, mas partido pela quebra — logo, não marca.
    expect(template02HighlightLine('LINHA UM\nDOIS TRES', 'UM\nDOIS')).toBe(-1);
    expect(template02HighlightLine('LINHA UM\nDOIS TRES', 'DOIS TRES')).toBe(1);
  });

  it('o cabeçalho é BRANCO com imagem de fundo e cinza sem', () => {
    // Não é preciosismo: o #767682 tem contraste 1.07:1 contra a foto depois do
    // scrim e o texto some.
    const comImagem = styles(markup(1, { 'cover.image': 'https://x/f.jpg' }));
    expect(comImagem['header.category'].color).toBe(TEMPLATE_02_COLORS.textHeaderOnImage);
    expect(comImagem['header.handle'].color).toBe('#FFFFFF');

    const semImagem = styles(markup(1));
    expect(semImagem['header.category'].color).toBe(TEMPLATE_02_COLORS.textHeader);
    expect(semImagem['header.handle'].color).toBe('#767682');
  });

  it('nos slides internos o cabeçalho é sempre o cinza', () => {
    for (const model of [2, 3]) {
      const s = styles(markup(model, { 'content.image': 'https://x/f.jpg' }));
      expect(s['header.category'].color).toBe(TEMPLATE_02_COLORS.textHeader);
    }
  });

  it('sem imagem o fundo cai para preto sólido e o scrim continua ali', () => {
    const html = markup(1);
    expect(styles(html)['cover.scrim'].background).toContain('linear-gradient(180deg');
    expect(html).toContain(`background:${TEMPLATE_02_COLORS.ink}`);
    expect(html).not.toContain('data-slot="cover.image"');
  });

  it('monta o scrim com as quatro paradas do spec, na ordem', () => {
    const scrim = styles(markup(1))['cover.scrim'].background;
    const bg = TEMPLATE_02_SPEC.layouts[0].background;
    const stops = typeof bg === 'object' ? bg.camadas.find((c) => c.tipo === 'gradient')!.stops! : [];
    expect(stops).toHaveLength(4);
    for (const s of stops) expect(scrim).toContain(`${s.color} ${Math.round(s.pos * 100)}%`);
  });

  it('a imagem da capa é full-bleed sob o scrim', () => {
    const html = markup(1, { 'cover.image': 'https://x/f.jpg' });
    const s = styles(html);
    // A moldura posiciona; a camada de dentro é que pinta (é ela que os
    // controles de posição/zoom modulam).
    expect(s['cover.image']).toMatchObject({ inset: '0', 'z-index': '0', overflow: 'hidden' });
    expect(html).toContain('background-size:cover');
    expect(s['cover.scrim']['z-index']).toBe('1');
    expect(s['cover.headline']['z-index']).toBe('2');
  });
});

describe('TEMPLATE 2 — slides internos', () => {
  it('mostra o placeholder "Imagem" SÓ quando o slot está vazio', () => {
    for (const model of [2, 3]) {
      const vazio = markup(model);
      expect(vazio).toContain('>Imagem<');
      expect(styles(vazio)['content.image'].background).toBe(TEMPLATE_02_COLORS.imagePlaceholder);

      const cheio = markup(model, { 'content.image': 'https://x/foto.jpg' });
      expect(cheio).not.toContain('>Imagem<');
      // As aspas da `url()` saem escapadas no atributo — daí a asserção no
      // markup cru em vez do parser de estilo.
      expect(cheio).toContain('background-image:url(&#x27;https://x/foto.jpg&#x27;)');
      expect(cheio).toContain('background-size:cover');
    }
  });

  it('o `content-right` é espelho exato do `content-left`', () => {
    const left = styles(markup(2));
    const right = styles(markup(3));
    expect(left['content.image'].left).toBe('615px');
    expect(left['content.column'].left).toBe('85px');
    expect(right['content.image'].left).toBe('85px');
    expect(right['content.column'].left).toBe('586px');
    // Tudo o mais é idêntico: mesma largura, mesma caixa, mesma tipografia.
    for (const key of ['top', 'height', 'width', 'border-radius']) {
      expect(right['content.image'][key]).toBe(left['content.image'][key]);
    }
    expect(right['content.column'].width).toBe(left['content.column'].width);
    expect(right['content.title']['font-size']).toBe(left['content.title']['font-size']);
  });

  it('centra o grupo título+corpo com flexbox — sem `top` fixo no texto', () => {
    const col = styles(markup(2))['content.column'];
    expect(col.display).toBe('flex');
    expect(col['flex-direction']).toBe('column');
    expect(col['justify-content']).toBe('center');
    // O container é o MESMO do bloco de imagem: é daí que sai o centro em 691.5.
    expect(col.top).toBe('147px');
    expect(col.height).toBe('1089px');
    // E o texto NÃO carrega posição própria.
    expect(styles(markup(2))['content.title'].position).toBeUndefined();
  });

  it('separa os parágrafos do corpo por \\n\\n', () => {
    const html = markup(2, { 'content.body': 'Primeiro.\n\nSegundo.' });
    const ps = [...html.matchAll(/<p style="margin:0">(.*?)<\/p>/g)].map((m) => m[1]);
    // O parágrafo do meio é a linha vazia, e sai com `&nbsp;` para abrir o vão.
    expect(ps).toEqual(['Primeiro.', ' ', 'Segundo.']);
  });
});

describe('TEMPLATE 2 — cabeçalho', () => {
  it('fica em y=44 com margem 71 dos DOIS lados', () => {
    // O Figma tinha 71 à esquerda e 63 à direita; o spec lista isso como
    // inconsistência e recomenda normalizar para 71/71 (`grid.headerMarginX`).
    expect(TEMPLATE_02_HEADER_MARGIN_X).toBe(TEMPLATE_02_GRID.headerMarginX);
    expect(TEMPLATE_02_HEADER_MARGIN_X).toBe(71);
    const s = styles(markup(2));
    expect(s['header.category']).toMatchObject({ top: '44px', left: '71px', 'text-align': 'left' });
    expect(s['header.handle']).toMatchObject({ top: '44px', right: '71px', 'text-align': 'right' });
  });

  it('está presente e idêntico em TODOS os modelos', () => {
    for (const model of TEMPLATE_02_MODELS) {
      const s = styles(markup(model));
      expect(s['header.category'].top).toBe('44px');
      expect(s['header.handle'].top).toBe('44px');
    }
  });
});

describe('TEMPLATE 2 — formato', () => {
  const FORMAT_IDS: SlideFormat[] = FORMAT_LIST.map((f) => f.id);

  it('4:5 é NO-OP: bate número a número com o spec', () => {
    const g = TEMPLATE_02_GRID;
    expect(template02ContentBox(1350)).toEqual({ top: g.contentTop, height: g.contentHeight });
    expect(template02CoverTops(1350)).toEqual({ headline: 755, pill: 1127 });

    const conteudo = styles(markup(2, undefined, '4:5'));
    expect(conteudo['content.image']).toMatchObject({
      top: '147px',
      height: '1089px',
      width: '380px',
      'border-radius': '17px',
    });
    const capa = styles(markup(1, undefined, '4:5'));
    expect(capa['cover.headline'].top).toBe('755px');
    expect(capa['cover.cta'].top).toBe('1127px');
  });

  it('o formato ausente (projeto antigo) é idêntico ao 4:5', () => {
    expect(markup(1, undefined, undefined)).toBe(markup(1, undefined, '4:5'));
    expect(markup(2, undefined, undefined)).toBe(markup(2, undefined, '4:5'));
  });

  it('a caixa de conteúdo mantém as margens ABSOLUTAS em todo formato', () => {
    for (const id of FORMAT_IDS) {
      const h = getFormat(id).height;
      const box = template02ContentBox(h);
      expect(box.top, id).toBe(147);
      // 1350 − 1236 = 114px do rodapé, sempre. Margem que escala vira margem
      // gigante no 9:16.
      expect(h - box.top - box.height, id).toBe(114);
      expect(styles(markup(3, undefined, id))['content.image'].height).toBe(`${box.height}px`);
    }
  });

  it('a composição da capa fica ancorada ao RODAPÉ em todo formato', () => {
    for (const id of FORMAT_IDS) {
      const h = getFormat(id).height;
      const tops = template02CoverTops(h);
      expect(h - tops.headline, id).toBe(595); // 1350 − 755
      expect(h - tops.pill, id).toBe(223); // 1350 − 1127
      const s = styles(markup(1, undefined, id));
      expect(s['cover.headline'].top).toBe(`${tops.headline}px`);
      expect(s['cover.cta'].top).toBe(`${tops.pill}px`);
    }
  });

  it('nada horizontal muda entre formatos', () => {
    const base = styles(markup(2, undefined, '4:5'));
    for (const id of FORMAT_IDS) {
      const s = styles(markup(2, undefined, id));
      for (const slot of ['content.image', 'content.column', 'header.category']) {
        expect(s[slot].left, `${id} ${slot}`).toBe(base[slot].left);
        expect(s[slot].width, `${id} ${slot}`).toBe(base[slot].width);
      }
      expect(s['content.title']['font-size']).toBe(base['content.title']['font-size']);
      expect(s['content.body']['letter-spacing']).toBe(base['content.body']['letter-spacing']);
    }
  });

  it('a imagem e o scrim da capa acompanham a altura', () => {
    for (const id of FORMAT_IDS) {
      const s = styles(markup(1, { 'cover.image': 'https://x/f.jpg' }, id));
      expect(s['cover.image'].height).toBe(`${getFormat(id).height}px`);
      expect(s['cover.scrim'].inset).toBe('0');
    }
  });
});

describe('TEMPLATE 2 — integração no editor', () => {
  it('o estilo tem config própria de barra lateral', () => {
    // O detalhe dos painéis é travado em `tests/template-02-editor.test.tsx`;
    // aqui só importa que o estilo não caia num default implícito.
    expect(TEMPLATE_SIDEBAR_CONFIG.template02.length).toBeGreaterThan(0);
  });

  it('o fundo do slide é o do modelo', () => {
    expect(markup(1)).toContain(`background:${TEMPLATE_02_COLORS.ink}`);
    expect(markup(2)).toContain(`background:${TEMPLATE_02_COLORS.paper}`);
    expect(markup(3)).toContain(`background:${TEMPLATE_02_COLORS.paper}`);
  });

  it('o texto do slot vence o conteúdo de fábrica', () => {
    const html = markup(2, { 'content.title': 'Marca não é logo', 'header.category': 'ARKE STUDIO' });
    expect(html).toContain('Marca não é logo');
    expect(html).toContain('ARKE STUDIO');
    expect(html).not.toContain('BRANDING &amp; DESIGN DE MARCA');
  });

  it('slot preenchido com string vazia apaga o texto, não volta ao padrão', () => {
    // Quem esvaziou o campo quis o campo vazio.
    expect(markup(2, { 'content.title': '' })).not.toContain('Mais que um clube');
  });
});
