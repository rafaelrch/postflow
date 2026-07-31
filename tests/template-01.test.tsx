import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Template01Slide from '@/components/slides/Template01Slide';
import {
  TEMPLATE_01_SPEC,
  TEMPLATE_01_SLIDE_COUNT,
  TEMPLATE_01_EDITABLE_SLOTS,
  TEMPLATE_01_FLOW_GROUPS,
  SpecNode,
  template01DefaultSlots,
  template01SlotsForSlide,
  template01SlotsFromContent,
  template01Overflows,
  template01Measure,
  template01SpecLines,
  template01Tops,
} from '@/lib/templates/template-01';
import { template01Overrides } from '@/lib/templates/template-01/overrides';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide } from '@/types';

/**
 * O spec é a fonte da verdade da forma e foi validado pixel a pixel contra o
 * Figma. Estes testes existem para travar isso: se alguém arredondar um tamanho
 * de fonte, trocar uma família ou perder um slot, o carrossel sai diferente do
 * gabarito e ninguém percebe olhando o diff.
 */

function renderSlide(index: number, slots?: Record<string, string>, extra?: Partial<Slide>) {
  const slide = {
    ...DEFAULT_SLIDE,
    id: 's',
    position: index,
    // Sem isto o componente cai na imagem genérica do editor.
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
    ...(slots ? { templateSlots: slots } : {}),
    ...extra,
  } as Slide;
  return renderToStaticMarkup(
    <Template01Slide
      slide={slide}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      slideIndex={index}
      totalSlides={TEMPLATE_01_SLIDE_COUNT}
    />
  );
}

describe('TEMPLATE 1 — spec', () => {
  it('tem 6 slides em 1080x1350', () => {
    expect(TEMPLATE_01_SLIDE_COUNT).toBe(6);
    expect(TEMPLATE_01_SPEC.template.canvas).toMatchObject({ w: 1080, h: 1350 });
  });

  it('mantém os tamanhos de fonte com as casas decimais do Figma', () => {
    const headline = TEMPLATE_01_SPEC.slides[0].nodes.find((n) => n.slot === 's1.headline');
    // Arredondar para 81 muda a quebra de linha de todo o título.
    expect(headline?.typography?.fontSizePx).toBeCloseTo(80.865, 3);
    expect(headline?.typography?.letterSpacingEm).toBeCloseTo(-0.06, 5);
  });

  it('expõe todos os slots editáveis, incluindo os cantos e as imagens de fundo', () => {
    const names = TEMPLATE_01_EDITABLE_SLOTS.map((s) => s.slot);
    expect(names).toContain('s1.image');
    expect(names).toContain('s2.image');
    expect(names).toContain('cantos.left');
    expect(names).toContain('cantos.right');
    // s6.arrow é ornamento gráfico, não texto: não pode virar campo editável.
    expect(names).not.toContain('s6.arrow');
    // Cantos aparecem em 3 slides mas são um slot só.
    expect(names.filter((n) => n === 'cantos.left')).toHaveLength(1);
  });

  it('entrega os cantos junto de qualquer slide', () => {
    const slots = template01SlotsForSlide(1).map((s) => s.slot);
    expect(slots).toContain('s1.headline');
    expect(slots).toContain('cantos.left');
  });
});

describe('TEMPLATE 1 — conteúdo', () => {
  it('não acusa estouro no conteúdo original do Figma', () => {
    // maxCharsPerLine é limite estético, mais rígido que o técnico: o texto de
    // fábrica passa dele em alguns slots sem estourar a caixa.
    expect(template01Overflows(template01DefaultSlots())).toEqual([]);
    expect(template01Overflows({})).toEqual([]);
  });

  it('acusa estouro de linhas e de caracteres por linha escrita', () => {
    // s1.headline aceita 3 linhas de 28 caracteres.
    const linhas = template01Overflows({ 's1.headline': 'a\nb\nc\nd' });
    expect(linhas.map((o) => o.slot)).toEqual(['s1.headline']);
    expect(linhas[0].maxLines).toBe(3);

    const chars = template01Overflows({ 's1.headline': 'a\n' + 'x'.repeat(40) + '\nc' });
    expect(chars.map((o) => o.slot)).toEqual(['s1.headline']);
    expect(chars[0].longestLine).toBe(40);
  });

  it('sem quebra explícita, mede pelo orçamento total de caracteres', () => {
    const m = template01Measure('x'.repeat(90), { maxLines: 3, maxCharsPerLine: 28 });
    expect(m.charBudget).toBe(84);
    expect(m.over).toBe(true);

    expect(template01Measure('x'.repeat(80), { maxLines: 3, maxCharsPerLine: 28 }).over).toBe(false);
  });

  it('mapeia título e descrição para os slots principais de cada slide', () => {
    expect(template01SlotsFromContent(0, 'Título', 'Corpo')).toEqual({
      's1.headline': 'Título',
      's1.subline': 'Corpo',
    });
    expect(template01SlotsFromContent(5, 'Fecho', 'Final')).toEqual({
      's6.title': 'Fecho',
      's6.body': 'Final',
    });
    // Slide inexistente não inventa slot.
    expect(template01SlotsFromContent(9, 'x', 'y')).toEqual({});
  });
});

describe('TEMPLATE 1 — render', () => {
  it('posiciona os nós com a geometria do spec', () => {
    const html = renderSlide(0);
    const headline = TEMPLATE_01_SPEC.slides[0].nodes.find((n) => n.slot === 's1.headline')!;
    expect(html).toContain(`top:${headline.box.y}px`);
    expect(html).toContain(`font-size:${headline.typography!.fontSizePx}px`);
    expect(html).toContain(`line-height:${headline.typography!.lineHeightPx}px`);
  });

  it('usa as famílias embutidas do template, não as do resto do app', () => {
    const html = renderSlide(0);
    expect(html).toContain('T01Inter');
    expect(html).toContain('T01Serif');
    // A face genérica do app resolve por local() e não serve aqui.
    expect(html).not.toContain("'IvyOra Text'");
  });

  it('põe a imagem atrás e o scrim por cima na capa', () => {
    const html = renderSlide(0, { 's1.image': 'https://exemplo/foto.jpg' });
    // Camadas separadas (a imagem ganhou posição/zoom/opacidade do editor): a
    // ordem no DOM é que define quem pinta por cima.
    const img = html.indexOf('exemplo/foto.jpg');
    const scrim = html.indexOf('linear-gradient');
    expect(img).toBeGreaterThan(-1);
    expect(img).toBeLessThan(scrim);
    // Convertido para transparente→preto; branco→preto taparia a imagem.
    expect(html.slice(scrim)).toContain('rgba(0,0,0,0)');
  });

  it('sem imagem, mostra o degradê original do Figma', () => {
    expect(renderSlide(0)).toContain('#FFFFFF');
  });

  it('preserva o bold+light do eyebrow mesmo com texto editado', () => {
    const html = renderSlide(0, { 's1.eyebrow': '*Doze primeiros e o resto vem depois' });
    expect(html).toContain('font-weight:300');
    expect(html).toContain('*Doze primeir');
  });

  it('desenha a seta do slide 6 como SVG e não como texto', () => {
    const html = renderSlide(5);
    expect(html).toContain('<svg');
    expect(html).toContain('polyline');
  });

  it('não emite caixa para GROUP', () => {
    const html = renderSlide(2);
    const groups = TEMPLATE_01_SPEC.slides[2].nodes.filter((n) => n.type === 'GROUP');
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) expect(html).not.toContain(`data-slot="${g.name}"`);
  });

  it('respeita a correção da faixa full-bleed do slide 5', () => {
    const rect = TEMPLATE_01_SPEC.slides[4].nodes.find((n) => n.slot === 's5.image')!;
    expect(rect.box.x).toBe(0);
    expect(rect.box.w).toBe(1080);
  });
});

/**
 * O `y` do spec pressupõe a contagem de linhas do texto do Figma. Com texto do
 * usuário a caixa cresce ou encolhe, e `top` fixo abre buraco (slide 1) ou
 * sobrepõe o bloco de baixo (slide 4) e a imagem (slide 5). O reflow ancora o
 * grupo na borda que não pode se mexer e preserva o vão do desenho.
 */
describe('TEMPLATE 1 — reflow', () => {
  const node = (slide: number, slot: string): SpecNode =>
    TEMPLATE_01_SPEC.slides[slide - 1].nodes.find((n) => n.slot === slot)!;
  const lh = (slide: number, slot: string) => node(slide, slot).typography!.lineHeightPx;
  const specTop = (slide: number, slot: string) => node(slide, slot).box.y;

  it('conta as linhas do spec pela altura da caixa, não pelas quebras escritas', () => {
    // s6.body tem lineCount 1 no spec (nenhum \n), mas o Figma quebrou em 5.
    expect(node(6, 's6.body').text!.lineCount).toBe(1);
    expect(template01SpecLines(node(6, 's6.body'))).toBe(5);
    expect(template01SpecLines(node(1, 's1.headline'))).toBe(3);
  });

  it('com a contagem de linhas do spec, não move NADA em nenhum slide', () => {
    for (const slide of TEMPLATE_01_SPEC.slides) {
      const tops = template01Tops(slide.index);
      const slots = Object.keys(tops);
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) expect(tops[slot]).toBe(specTop(slide.index, slot));
    }
  });

  it('todo slot de um grupo existe no slide correspondente', () => {
    for (const [index, groups] of Object.entries(TEMPLATE_01_FLOW_GROUPS)) {
      const slide = TEMPLATE_01_SPEC.slides[Number(index) - 1];
      for (const g of groups)
        for (const slot of g.slots)
          expect(slide.nodes.some((n) => n.slot === slot && n.type === 'TEXT')).toBe(true);
    }
  });

  it('slide 1: título mais curto não abre buraco — o vão até a síntese é o do spec', () => {
    const specGap =
      specTop(1, 's1.subline') - (specTop(1, 's1.headline') + 3 * lh(1, 's1.headline'));
    const tops = template01Tops(1, {
      's1.headline': { lines: 2, lineHeightPx: lh(1, 's1.headline') },
    });
    // A composição encosta no rodapé: a síntese não sai do lugar.
    expect(tops['s1.subline']).toBeCloseTo(specTop(1, 's1.subline'), 6);
    const gap = tops['s1.subline'] - (tops['s1.headline'] + 2 * lh(1, 's1.headline'));
    expect(gap).toBeCloseTo(specGap, 6);
    // Com uma linha a menos, o título DESCE (o grupo encolhe para o rodapé).
    expect(tops['s1.headline']).toBeGreaterThan(specTop(1, 's1.headline'));
  });

  it('slide 4: título com 1 linha a mais não sobrepõe o corpo', () => {
    const tops = template01Tops(4, { 's4.title': { lines: 2, lineHeightPx: lh(4, 's4.title') } });
    const tituloBottom = tops['s4.title'] + 2 * lh(4, 's4.title');
    expect(tops['s4.body']).toBeGreaterThan(tituloBottom);
    // A imagem full-bleed termina em 850 e o título continua pendurado nela.
    expect(tops['s4.title']).toBe(specTop(4, 's4.title'));
    expect(tops['s4.title']).toBeGreaterThan(850);
    const specGap = specTop(4, 's4.body') - (specTop(4, 's4.title') + lh(4, 's4.title'));
    expect(tops['s4.body'] - tituloBottom).toBeCloseTo(specGap, 6);
  });

  it('slide 5: título de coluna com 4 linhas não cruza a borda da imagem (y=350)', () => {
    const imagem = TEMPLATE_01_SPEC.slides[4].nodes.find((n) => n.slot === 's5.image')!;
    expect(imagem.box.y).toBe(350);
    const tops = template01Tops(5, {
      's5.top.title': { lines: 4, lineHeightPx: lh(5, 's5.top.title') },
    });
    expect(tops['s5.top.title'] + 4 * lh(5, 's5.top.title')).toBeLessThanOrEqual(350);
    // As duas colunas da faixa são independentes: a da direita não se mexe.
    expect(tops['s5.top.body']).toBe(specTop(5, 's5.top.body'));
  });

  it('a entrelinha do override entra na conta do reflow', () => {
    const dobro = lh(4, 's4.title') * 2;
    const tops = template01Tops(4, { 's4.title': { lines: 1, lineHeightPx: dobro } });
    expect(tops['s4.body']).toBeCloseTo(specTop(4, 's4.body') + lh(4, 's4.title'), 6);
  });

  it('o aviso de estouro acusa o texto que não cabe depois do reflow', () => {
    // 4 linhas num slot de 2 é o caso do s5.top.title do teste acima.
    const over = template01Overflows({ 's5.top.title': 'uma\nduas\ntres\nquatro' });
    expect(over.map((o) => o.slot)).toEqual(['s5.top.title']);
    expect(over[0].lines).toBe(4);
    expect(over[0].maxLines).toBe(2);
  });
});

/**
 * Parte B: o spec é o VALOR PADRÃO. Sem override o render tem de sair idêntico —
 * é isso que preserva a fidelidade de 0 px; com override, o usuário vence.
 */
describe('TEMPLATE 1 — overrides do editor', () => {
  const slideBase = { ...DEFAULT_SLIDE, id: 's', position: 0 } as Slide;

  it('um slide recém-criado não produz nenhum override', () => {
    const ov = template01Overrides(slideBase, DEFAULT_GLOBAL_SETTINGS);
    expect(ov.background).toBeUndefined();
    expect(ov.shadow).toBeUndefined();
    expect(ov.title).toMatchObject({ fontScale: 1, color: undefined, font: undefined });
    expect(ov.body).toMatchObject({ fontScale: 1, color: undefined });
    expect(ov.backgroundImage.position).toBeUndefined();
    expect(ov.hideCorners).toBe(false);
  });

  it('sem override, o render é o do spec', () => {
    const headline = TEMPLATE_01_SPEC.slides[0].nodes.find((n) => n.slot === 's1.headline')!;
    const html = renderSlide(0);
    expect(html).toContain(`top:${headline.box.y}px`);
    expect(html).toContain(`font-size:${headline.typography!.fontSizePx}px`);
    expect(html).toContain(headline.fills![0].css!);
  });

  it('cor e fonte do título vencem o spec', () => {
    const html = renderSlide(0, undefined, {
      titleColor: '#FF0000',
      titleFont: 'Bebas Neue',
    } as Partial<Slide>);
    expect(html).toContain('#FF0000');
    expect(html).toContain('Bebas Neue');
  });

  it('o tamanho de fonte é proporcional — a razão entre os blocos é preservada', () => {
    const headline = TEMPLATE_01_SPEC.slides[0].nodes.find((n) => n.slot === 's1.headline')!;
    const html = renderSlide(0, undefined, {
      fontSize: { title: DEFAULT_SLIDE.fontSize.title * 2, description: DEFAULT_SLIDE.fontSize.description },
    } as Partial<Slide>);
    expect(html).toContain(`font-size:${headline.typography!.fontSizePx * 2}px`);
    // A entrelinha acompanha, senão as linhas colariam.
    expect(html).toContain(`line-height:${headline.typography!.lineHeightPx * 2}px`);
  });

  it('a cor de fundo do editor vence a do spec', () => {
    expect(renderSlide(3)).toContain('#FFFFFF');
    expect(renderSlide(3, undefined, { backgroundColor: '#0A0A0A' } as Partial<Slide>)).toContain(
      '#0A0A0A'
    );
  });

  it('desligar os cantos some com eles', () => {
    expect(renderSlide(2)).toContain('data-slot="cantos.left"');
    const html = renderToStaticMarkup(
      <Template01Slide
        slide={{ ...slideBase, position: 2 } as Slide}
        globalSettings={{
          ...DEFAULT_GLOBAL_SETTINGS,
          corners: { ...DEFAULT_GLOBAL_SETTINGS.corners, show: false },
        }}
        slideIndex={2}
        totalSlides={TEMPLATE_01_SLIDE_COUNT}
      />
    );
    expect(html).not.toContain('data-slot="cantos.left"');
  });
});
