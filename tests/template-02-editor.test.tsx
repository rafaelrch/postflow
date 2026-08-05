import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Template02Slide from '@/components/slides/Template02Slide';
import {
  TEMPLATE_02_COLORS,
  TEMPLATE_02_MODELS,
  Template02Slots,
  template02HeaderSlotsForModel,
  template02ImageSlot,
  template02SlotColor,
  template02SlotDefaults,
  template02SlotType,
  template02TextSlotsForModel,
  template02Type,
} from '@/lib/templates/template-02';
import {
  markTemplate02Override,
  template02Overrides,
  template02SlideChanges,
  template02TypeFor,
} from '@/lib/templates/template-02/overrides';
import {
  template02ClearImage,
  template02SetImage,
  template02SlideImageUrl,
} from '@/lib/templates/template-02/image';
import {
  PANEL_REGISTRY,
  PanelContext,
  TEMPLATE_SIDEBAR_CONFIG,
  visiblePanels,
} from '@/components/editor/sidebar/panels';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide } from '@/types';

/**
 * TEMPLATE 2 × EDITOR (fatia S2).
 *
 * O que estes testes travam, e por quê:
 *
 * 1. **Uma verdade só para a imagem.** No Template 1 o upload escrevia no slot e
 *    a IA nos campos genéricos; o slot vencia no render, então gerar por cima de
 *    um upload dizia "pronto!" sem mudar nada. Aqui os três caminhos (upload, IA
 *    e remoção) têm de escrever no MESMO lugar.
 * 2. **Sem gesto do usuário, o render é o do spec.** É a marca em
 *    `templateOverrides` — nunca o valor — que faz o override existir.
 * 3. **O cabeçalho é do DECK.** Editar num slide e ver outro divergir seria bug.
 * 4. **Rótulo não mente.** O grupo global do T2 é conteúdo, não estilo.
 */

function slideOf(model: number, extra?: Partial<Slide>): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: 's',
    position: 0,
    templateModel: model,
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
    ...extra,
  } as Slide;
}

function markup(model: number, extra?: Partial<Slide>): string {
  return renderToStaticMarkup(
    <Template02Slide
      slide={slideOf(model, extra)}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      slideIndex={0}
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

const ctxFor = (model: number): PanelContext => ({
  style: 'template02',
  slide: slideOf(model),
  activeSlideIndex: 0,
  globalSettings: DEFAULT_GLOBAL_SETTINGS,
  template01Model: null,
  template02Model: model,
  isEditorialCover: false,
});

describe('TEMPLATE 2 — imagem tem uma verdade só', () => {
  it('upload e IA escrevem no MESMO slot, e zeram os genéricos', () => {
    for (const model of TEMPLATE_02_MODELS) {
      const slide = slideOf(model, {
        backgroundImageUrl: 'https://velho/bg.jpg',
        gridImageUrl: 'https://velho/grid.jpg',
        contentImageUrl: 'https://velho/content.jpg',
      });
      const patch = template02SetImage(slide, model, 'https://novo/foto.jpg');
      expect(patch.templateSlots?.[template02ImageSlot(model)]).toBe('https://novo/foto.jpg');
      // Deixar um genérico preenchido recriaria a segunda verdade.
      expect(patch.backgroundImageUrl).toBe('');
      expect(patch.gridImageUrl).toBe('');
      expect(patch.contentImageUrl).toBe('');
    }
  });

  it('a capa escreve em `cover.image` e os internos em `content.image`', () => {
    expect(template02SetImage(slideOf(1), 1, 'u').templateSlots).toHaveProperty('cover.image', 'u');
    expect(template02SetImage(slideOf(2), 2, 'u').templateSlots).toHaveProperty('content.image', 'u');
    expect(template02SetImage(slideOf(3), 3, 'u').templateSlots).toHaveProperty('content.image', 'u');
  });

  it('remover limpa dos DOIS lados, senão a imagem volta sozinha', () => {
    const slide = slideOf(2, {
      templateSlots: { 'content.image': 'https://x/a.jpg' },
      contentImageUrl: 'https://x/generico.jpg',
    });
    const patch = template02ClearImage(slide, 2);
    expect(patch.templateSlots?.['content.image']).toBe('');
    expect(patch.contentImageUrl).toBe('');
    // E o render some com a imagem de verdade: volta o placeholder.
    expect(markup(2, { ...slide, ...patch })).toContain('>Imagem<');
  });

  it('preserva os outros slots ao gravar a imagem', () => {
    const slide = slideOf(2, { templateSlots: { 'content.title': 'Marca não é logo' } });
    expect(template02SetImage(slide, 2, 'u').templateSlots).toMatchObject({
      'content.title': 'Marca não é logo',
      'content.image': 'u',
    });
  });

  it('a barra lateral e o render concordam sobre qual imagem está no slide', () => {
    const slide = slideOf(3, { templateSlots: { 'content.image': 'https://x/f.jpg' } });
    expect(template02SlideImageUrl(slide, 3)).toBe('https://x/f.jpg');
    expect(markup(3, slide)).toContain('https://x/f.jpg');
    // Campo genérico NÃO conta: o T2 nasceu com uma verdade só e não ganha uma
    // segunda pela porta dos fundos.
    expect(template02SlideImageUrl(slideOf(3, { contentImageUrl: 'https://x/g.jpg' }), 3)).toBe('');
  });
});

describe('TEMPLATE 2 — estilo por slot', () => {
  it('SEM estilo nenhum, o render sai idêntico ao spec', () => {
    // A régua da fidelidade: um slide sem gesto do usuário não pode mudar 1px.
    for (const model of TEMPLATE_02_MODELS) {
      expect(markup(model, { templateSlotStyles: {} })).toBe(markup(model));
      expect(markup(model, { templateSlotStyles: undefined })).toBe(markup(model));
    }
  });

  it('a tipografia de fábrica sai do spec, com as dízimas intactas', () => {
    const ov = template02Overrides(slideOf(2));
    const t = template02TypeFor('content.title', TEMPLATE_02_COLORS.ink, ov);
    const spec = template02Type('slideTitle');
    expect(t.fontSize).toBe(spec.fontSize);
    expect(t.lineHeight).toBe(spec.lineHeight);
    expect(t.letterSpacing).toBe(spec.letterSpacing);
    expect(t.color).toBe(TEMPLATE_02_COLORS.ink);
    expect(t.underline).toBe(false);
  });

  it('trocar o tamanho leva a entrelinha e o tracking na mesma razão', () => {
    const spec = template02Type('slideTitle');
    const ov = template02Overrides(
      slideOf(2, { templateSlotStyles: { 'content.title': { fontSize: spec.fontSize * 2 } } })
    );
    const t = template02TypeFor('content.title', TEMPLATE_02_COLORS.ink, ov);
    // Escalar só a fonte colaria as linhas e apertaria as letras.
    expect(t.lineHeight).toBeCloseTo(spec.lineHeight * 2, 6);
    expect(t.letterSpacing).toBeCloseTo(spec.letterSpacing * 2, 6);
  });

  it('o tracking do usuário vem em `em` e vira px contra o tamanho efetivo', () => {
    const ov = template02Overrides(
      slideOf(2, { templateSlotStyles: { 'content.title': { fontSize: 100, letterSpacing: -0.1 } } })
    );
    expect(template02TypeFor('content.title', '#000', ov).letterSpacing).toBeCloseTo(-10, 6);
  });

  it('a cor, a fonte e o sublinhado do usuário chegam ao markup', () => {
    const html = markup(2, {
      templateSlotStyles: {
        'content.title': { color: '#FF0000', underline: true, font: 'Bebas Neue' },
      },
    });
    const s = styles(html)['content.title'];
    expect(s.color).toBe('#FF0000');
    expect(s['text-decoration']).toBe('underline');
    expect(s['font-family']).toContain('Bebas Neue');
  });

  it('escolher a serifada do template resolve na IvyOra, nunca em Georgia', () => {
    // `getElementFontCSS('IvyOra Text Medium')` tem de dar a pilha do Typekit.
    // Escrever `'IvyOra Text'` ali entregaria Georgia — o bug que já custou uma
    // sessão no Template 1.
    const s = styles(
      markup(2, { templateSlotStyles: { 'content.body': { font: 'IvyOra Text Medium' } } })
    )['content.body'];
    expect(s['font-family']).toContain('ivyora-text');
    expect(s['font-family']).not.toContain('IvyOra Text');
  });

  it('o estilo de um bloco não vaza para o vizinho', () => {
    const s = styles(markup(2, { templateSlotStyles: { 'content.title': { color: '#FF0000' } } }));
    expect(s['content.title'].color).toBe('#FF0000');
    expect(s['content.body'].color).toBe(TEMPLATE_02_COLORS.textMuted);
  });

  it('todo slot de texto editável tem papel tipográfico e padrões para o painel', () => {
    // Sem isto o slider de tamanho abriria num número inventado em vez do que
    // está na tela.
    for (const model of TEMPLATE_02_MODELS) {
      for (const d of template02TextSlotsForModel(model)) {
        expect(template02SlotType(d.slot), d.slot).toBeDefined();
        const base = template02SlotDefaults(d.slot)!;
        expect(base.fontSizePx, d.slot).toBeGreaterThan(0);
        // O tracking do spec é negativo em todo bloco do template.
        expect(base.letterSpacingEm, d.slot).toBeLessThan(0);
      }
    }
  });

  it('a cor de fábrica de cada slot vem do spec', () => {
    expect(template02SlotColor('content.title', 2)).toBe(TEMPLATE_02_COLORS.ink);
    expect(template02SlotColor('content.body', 2)).toBe(TEMPLATE_02_COLORS.textMuted);
    expect(template02SlotColor('cover.headline', 1)).toBe(TEMPLATE_02_COLORS.surface);
    expect(template02SlotColor('cover.cta', 1)).toBe(TEMPLATE_02_COLORS.ink);
    expect(template02SlotColor('cover.highlight', 1)).toBe(TEMPLATE_02_COLORS.ink);
    expect(template02SlotColor('header.category', 2)).toBe(TEMPLATE_02_COLORS.textHeader);
  });
});

describe('TEMPLATE 2 — fundo do slide', () => {
  it('sem a MARCA, o fundo é o do template mesmo com `backgroundColor` gravado', () => {
    // A geração grava a cor da marca do usuário em todo slide. Se o valor
    // valesse por si, ela apagaria o creme do template — foi assim que a paleta
    // apagou o degradê do Template 1.
    const html = markup(2, { backgroundColor: '#FF00FF' });
    expect(html).toContain(`background:${TEMPLATE_02_COLORS.paper}`);
    expect(html).not.toContain('#FF00FF');
  });

  it('com a marca, a cor do usuário vale', () => {
    const html = markup(2, {
      backgroundColor: '#FF00FF',
      templateOverrides: markTemplate02Override(undefined, 'background'),
    });
    expect(html).toContain('background:#FF00FF');
  });

  it('a marca preserva as anteriores', () => {
    const marks = markTemplate02Override(
      markTemplate02Override(undefined, 'background'),
      'backgroundImageOpacity'
    );
    expect(marks).toEqual({ background: true, backgroundImageOpacity: true });
  });
});

describe('TEMPLATE 2 — ajuste de imagem', () => {
  it('sem marca, o enquadramento é o do spec', () => {
    const html = markup(1, {
      templateSlots: { 'cover.image': 'https://x/f.jpg' },
      // Valores presentes, mas NÃO marcados: o `DEFAULT_SLIDE` já vem com
      // `imagePosition` preenchido, e ele não é gesto de ninguém.
      imagePosition: { x: 10, y: 90, zoom: 300 },
    });
    expect(html).toContain('background-position:50% 50%');
    expect(html).not.toContain('scale(3)');
  });

  it('com marca, posição e zoom entram', () => {
    const html = markup(1, {
      templateSlots: { 'cover.image': 'https://x/f.jpg' },
      imagePosition: { x: 10, y: 90, zoom: 300 },
      templateOverrides: markTemplate02Override(undefined, 'backgroundImagePosition'),
    });
    expect(html).toContain('background-position:10% 90%');
    expect(html).toContain('scale(3)');
  });

  it('a opacidade só entra marcada', () => {
    const base = { templateSlots: { 'content.image': 'https://x/f.jpg' } };
    expect(markup(2, { ...base, backgroundImageOpacity: 40 })).not.toContain('opacity:0.4');
    expect(
      markup(2, {
        ...base,
        backgroundImageOpacity: 40,
        templateOverrides: markTemplate02Override(undefined, 'backgroundImageOpacity'),
      })
    ).toContain('opacity:0.4');
  });
});

describe('TEMPLATE 2 — cabeçalho é do deck', () => {
  it('os dois slots globais aparecem em todos os modelos', () => {
    for (const model of TEMPLATE_02_MODELS) {
      expect(template02HeaderSlotsForModel(model).map((d) => d.slot)).toEqual([
        'header.category',
        'header.handle',
      ]);
    }
  });

  it('o painel de conteúdo do slide NÃO repete o cabeçalho', () => {
    // Se ele aparecesse nos dois lugares, editar num deles divergiria do outro.
    for (const model of TEMPLATE_02_MODELS) {
      const slots = template02TextSlotsForModel(model).map((d) => d.slot);
      expect(slots.some((s) => s.startsWith('header.'))).toBe(false);
    }
  });

  it('o grupo global do T2 se chama CONTEÚDO, não "Estilo global"', () => {
    // O cabeçalho é conteúdo do carrossel. Rótulo que mente foi o que a
    // refatoração desta barra veio acabar.
    const grupo = visiblePanels(ctxFor(1)).find((g) => g.scope === 'global')!;
    expect(grupo.ids).toEqual(['cabecalho']);
    expect(grupo.label).toBe('Conteúdo do carrossel');
    expect(grupo.label).not.toMatch(/estilo/i);
    // E o Template 1 continua no padrão do escopo — nada mudou para ele.
    const t01 = visiblePanels({ ...ctxFor(1), style: 'template01', template01Model: 1 }).find(
      (g) => g.scope === 'global'
    )!;
    expect(t01.label).toBeUndefined();
  });
});

describe('TEMPLATE 2 — painéis', () => {
  it('mostra os painéis pedidos, com o restaurar sempre por último', () => {
    for (const model of TEMPLATE_02_MODELS) {
      const grupos = visiblePanels(ctxFor(model));
      const slideGroup = grupos.find((g) => g.scope === 'slide')!;
      expect(slideGroup.ids).toEqual([
        'conteudoSlide',
        'imagem',
        'estiloDoTexto',
        'fundoDoSlide',
        'restaurarTemplate',
      ]);
      // É o que desfaz o que está acima: fora do fim, ele desfaz o que o
      // usuário ainda nem viu.
      expect(slideGroup.ids[slideGroup.ids.length - 1]).toBe('restaurarTemplate');
    }
  });

  it('todo painel configurado existe no registry', () => {
    for (const g of TEMPLATE_SIDEBAR_CONFIG.template02) {
      for (const p of g.panels) {
        const id = typeof p === 'string' ? p : p.id;
        expect(PANEL_REGISTRY[id], id).toBeDefined();
        expect(PANEL_REGISTRY[id].scope).toBe(g.scope);
      }
    }
  });

  it('TODO modelo tem painel de imagem — não há o caso "modelo sem imagem" do T1', () => {
    for (const model of TEMPLATE_02_MODELS) {
      expect(visiblePanels(ctxFor(model)).flatMap((g) => g.ids)).toContain('imagem');
      expect(template02ImageSlot(model)).toBeTruthy();
    }
  });
});

describe('TEMPLATE 2 — restaurar', () => {
  it('conta os gestos do usuário para o badge', () => {
    expect(template02SlideChanges(slideOf(2))).toBe(0);
    expect(
      template02SlideChanges(
        slideOf(2, {
          templateOverrides: markTemplate02Override(undefined, 'background'),
          templateSlotStyles: { 'content.title': { color: '#f00' } },
        })
      )
    ).toBe(2);
  });

  it('limpar os dois campos devolve o render do template', () => {
    const mexido = slideOf(2, {
      backgroundColor: '#FF00FF',
      templateOverrides: markTemplate02Override(undefined, 'background'),
      templateSlotStyles: { 'content.title': { color: '#FF0000', fontSize: 20 } },
    });
    expect(markup(2, mexido)).not.toBe(markup(2));
    // O texto e a imagem NÃO fazem parte da restauração — só cor/fonte/posição.
    const restaurado = { ...mexido, templateOverrides: undefined, templateSlotStyles: undefined };
    expect(markup(2, restaurado)).toBe(markup(2, { backgroundColor: '#FF00FF' }));
    expect(markup(2, restaurado)).toBe(markup(2));
  });

  it('restaurar não apaga o texto nem a imagem do slide', () => {
    const slots: Template02Slots = { 'content.title': 'Marca não é logo', 'content.image': 'u' };
    const html = decode(markup(2, { templateSlots: slots, templateOverrides: undefined, templateSlotStyles: undefined }));
    expect(html).toContain('Marca não é logo');
    expect(html).toContain("url('u')");
  });
});
