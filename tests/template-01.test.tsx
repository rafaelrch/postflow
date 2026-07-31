import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Template01Slide from '@/components/slides/Template01Slide';
import {
  TEMPLATE_01_SPEC,
  TEMPLATE_01_SLIDE_COUNT,
  TEMPLATE_01_EDITABLE_SLOTS,
  template01DefaultSlots,
  template01SlotsForSlide,
  template01SlotsFromContent,
  template01Overflows,
  template01Measure,
} from '@/lib/templates/template-01';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide } from '@/types';

/**
 * O spec é a fonte da verdade da forma e foi validado pixel a pixel contra o
 * Figma. Estes testes existem para travar isso: se alguém arredondar um tamanho
 * de fonte, trocar uma família ou perder um slot, o carrossel sai diferente do
 * gabarito e ninguém percebe olhando o diff.
 */

function renderSlide(index: number, slots?: Record<string, string>) {
  const slide = {
    ...DEFAULT_SLIDE,
    id: 's',
    position: index,
    // Sem isto o componente cai na imagem genérica do editor.
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
    ...(slots ? { templateSlots: slots } : {}),
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
    const bg = html.match(/background:([^;"]+)/)![1];
    expect(bg.indexOf('linear-gradient')).toBeLessThan(bg.indexOf('url('));
    // Convertido para transparente→preto; branco→preto taparia a imagem.
    expect(bg).toContain('rgba(0,0,0,0)');
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
