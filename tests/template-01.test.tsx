import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Template01Slide from '@/components/slides/Template01Slide';
import {
  TEMPLATE_01_SPEC,
  TEMPLATE_01_SLIDE_COUNT,
  TEMPLATE_01_EDITABLE_SLOTS,
  TEMPLATE_01_FLOW_GROUPS,
  TEMPLATE_01_ALIGN_GROUPS,
  TEMPLATE_01_CENTER_PAIRS,
  TEMPLATE_01_DESIGN_TWEAKS,
  template01AlignBoxes,
  template01BaseType,
  template01SlotLabel,
  SpecNode,
  template01DefaultSlots,
  template01SlotsForSlide,
  template01SlotsFromContent,
  template01CornerSlots,
  template01Overflows,
  template01Measure,
  template01SpecLines,
  template01Tops,
} from '@/lib/templates/template-01';
import {
  markTemplate01CornerOverride,
  markTemplate01Override,
  template01Overrides,
} from '@/lib/templates/template-01/overrides';
import {
  DEFAULT_CORNERS,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_SLIDE,
  Slide,
  Template01CornerControl,
} from '@/types';

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
    expect(template01SlotsFromContent(0, { title: 'Título', description: 'Corpo' })).toMatchObject({
      's1.headline': 'Título',
      's1.subline': 'Corpo',
    });
    expect(template01SlotsFromContent(5, { title: 'Fecho', description: 'Final' })).toEqual({
      's6.title': 'Fecho',
      's6.body': 'Final',
    });
    // Slide inexistente não inventa slot.
    expect(template01SlotsFromContent(9, { title: 'x', description: 'y' })).toEqual({});
  });
});

/**
 * BUG do teste real: o chapéu da capa saía "*Barcelona FC cria fonte inspirada
 * na arquiterua catalã" em TODO carrossel gerado, porque a geração só preenchia
 * o par primário e o resto ficava no texto de fábrica do Figma.
 */
describe('TEMPLATE 1 — nenhum texto ilustrativo do Figma num deck gerado', () => {
  const FIGMA = TEMPLATE_01_EDITABLE_SLOTS.filter((s) => s.kind === 'text' && s.defaultValue).map(
    (s) => s.defaultValue
  );

  const deckGerado = () =>
    Array.from({ length: 6 }, (_, i) => ({
      ...template01SlotsFromContent(i, {
        title: `Título ${i + 1}`,
        description: `Corpo do slide ${i + 1}.`,
        extras: { eyebrow: '*Manchete do tema', kicker: 'Remate', botTitle: 'Eixo', botBody: 'Texto' },
      }),
      ...template01CornerSlots('Marca do Rafael', '@rafa'),
    }));

  it('preenche TODOS os slots de texto do slide, não só o par primário', () => {
    const capa = template01SlotsFromContent(0, {
      title: 'T',
      description: 'D',
      extras: { eyebrow: '*Manchete' },
    });
    expect(capa['s1.eyebrow']).toBe('*Manchete');

    const s5 = template01SlotsFromContent(4, {
      title: 'T',
      description: 'D',
      extras: { botTitle: 'Baixo', botBody: 'Corpo de baixo' },
    });
    expect(s5['s5.bot.title']).toBe('Baixo');
    expect(s5['s5.bot.body']).toBe('Corpo de baixo');
  });

  it('slot que a IA não escreveu sai VAZIO — nunca com a copy do Figma', () => {
    const capa = template01SlotsFromContent(0, { title: 'T', description: 'D' });
    expect(capa['s1.eyebrow']).toBe('');
    expect(Object.keys(capa)).toContain('s1.eyebrow');
  });

  it('nenhum slot de um deck gerado carrega texto do Figma', () => {
    for (const slots of deckGerado())
      for (const [slot, value] of Object.entries(slots))
        expect(FIGMA, `slot ${slot}`).not.toContain(value);
  });

  it('o render de um deck gerado não mostra a copy do Barcelona', () => {
    deckGerado().forEach((slots, i) => {
      const html = renderSlide(i, slots);
      expect(html).not.toContain('Barcelona');
      expect(html).not.toContain('OANDRELONA');
    });
  });

  it('os cantos saem da marca e do @ do usuário', () => {
    expect(template01CornerSlots('Marca do Rafael', 'rafa')).toEqual({
      'cantos.left': 'MARCA DO RAFAEL',
      'cantos.right': '@RAFA',
    });
    // Sem dado do onboarding, vazio — nunca o @ do Figma.
    expect(template01CornerSlots('', '')).toEqual({ 'cantos.left': '', 'cantos.right': '' });
  });

  it('o caminho SEM slots continua caindo no texto do spec (é ele que dá o 0 px)', () => {
    const html = renderSlide(0);
    expect(html).toContain('Barcelona');
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

  it('o corte bold→light do chapéu cai entre palavras, não no meio de uma', () => {
    // O índice do spec (25) cairia em "mud|a"; o corte anda para o espaço.
    const html = renderSlide(0, { 's1.eyebrow': '*Torrefação artesanal muda o sabor do grão' });
    expect(html).toContain('*Torrefação artesanal muda </span>');
    expect(html).not.toContain('mud</span>');
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
    // A única exceção é o desvio registrado em TEMPLATE_01_DESIGN_TWEAKS: o
    // Figma não centra as duas colunas da faixa de baixo do slide 5 entre si.
    const desviados = TEMPLATE_01_DESIGN_TWEAKS.verticalCenter;
    for (const slide of TEMPLATE_01_SPEC.slides) {
      const tops = template01Tops(slide.index);
      const slots = Object.keys(tops);
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        if (desviados[slot]) continue;
        expect(tops[slot]).toBe(specTop(slide.index, slot));
      }
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
    // A coluna da direita não fica onde o spec a pôs: ela é a mais BAIXA da
    // faixa agora e passa a dividir o centro da esquerda (ver o describe
    // "centro vertical" abaixo).
    expect(tops['s5.top.body']).toBeLessThan(specTop(5, 's5.top.body'));
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
 * O QUE O RAFAEL VIU: no slide 5, título de 3 linhas e descrição de 3 linhas na
 * mesma faixa saíam desencontrados — o título começava bem mais alto.
 *
 * Não era desvio do Figma: na faixa de cima ele centra as duas colunas no MESMO
 * eixo (206.0 nas duas). Quem quebrava era a nossa ancoragem — as duas colunas
 * presas à borda da imagem, com alturas diferentes, perdem o centro comum assim
 * que a contagem de linhas foge da do spec.
 */
describe('TEMPLATE 1 — slide 5: as duas colunas da faixa dividem o centro', () => {
  const node = (slide: number, slot: string): SpecNode =>
    TEMPLATE_01_SPEC.slides[slide - 1].nodes.find((n) => n.slot === slot)!;
  const lh = (slot: string) => node(5, slot).typography!.lineHeightPx;

  /** Altura do bloco: a medida quando há medição, a caixa do spec quando não há. */
  const alturaCom = (slot: string, lines?: number) =>
    lines == null ? node(5, slot).box.h : lines * lh(slot);

  const linhas = (n: Record<string, number>): Record<string, { lines: number; lineHeightPx: number }> =>
    Object.fromEntries(
      Object.entries(n).map(([slot, lines]) => [slot, { lines, lineHeightPx: lh(slot) }])
    );

  const centro = (tops: Record<string, number>, slot: string, lines?: number) =>
    tops[slot] + alturaCom(slot, lines) / 2;

  it('o Figma já centra as duas colunas da faixa de cima no mesmo eixo', () => {
    const t = node(5, 's5.top.title').box;
    const b = node(5, 's5.top.body').box;
    expect(t.y + t.h / 2).toBe(206);
    expect(b.y + b.h / 2).toBe(206);
  });

  it('o caso do Rafael: título de 3 linhas e descrição de 3 linhas ficam centrados', () => {
    const m = linhas({
      's5.top.title': 3,
      's5.top.body': 3,
      's5.bot.title': 2,
      's5.bot.body': 3,
    });
    const tops = template01Tops(5, m);
    expect(centro(tops, 's5.top.title', 3)).toBeCloseTo(centro(tops, 's5.top.body', 3), 6);
    expect(centro(tops, 's5.bot.title', 2)).toBeCloseTo(centro(tops, 's5.bot.body', 3), 6);
  });

  it('vale para qualquer contagem de linhas, dos dois lados', () => {
    for (const [titleLines, bodyLines] of [[1, 1], [1, 6], [4, 2], [2, 4], [5, 5]]) {
      const tops = template01Tops(
        5,
        linhas({
          's5.top.title': titleLines,
          's5.top.body': bodyLines,
          's5.bot.title': titleLines,
          's5.bot.body': bodyLines,
        })
      );
      expect(centro(tops, 's5.top.title', titleLines)).toBeCloseTo(
        centro(tops, 's5.top.body', bodyLines),
        6
      );
      expect(centro(tops, 's5.bot.title', titleLines)).toBeCloseTo(
        centro(tops, 's5.bot.body', bodyLines),
        6
      );
    }
  });

  it('a coluna mais alta mantém a âncora: o texto não invade a imagem', () => {
    const imagem = node(5, 's5.image').box;
    expect(imagem.y).toBe(350);
    expect(imagem.bottom).toBe(350); // a faixa de baixo começa em 1000

    for (const lines of [1, 2, 3, 4, 5, 6]) {
      // Faixa de cima: a coluna que cresce é a mais alta e continua encostada
      // na borda de cima da imagem.
      const cima = template01Tops(5, linhas({ 's5.top.title': lines, 's5.top.body': 1 }));
      expect(cima['s5.top.title'] + alturaCom('s5.top.title', lines)).toBeLessThanOrEqual(350);
      // Faixa de baixo: cresce para baixo, sem subir por cima da imagem.
      const baixo = template01Tops(5, linhas({ 's5.bot.title': lines, 's5.bot.body': 1 }));
      expect(baixo['s5.bot.title']).toBeGreaterThanOrEqual(1000);
    }
  });

  it('a coluna mais baixa fica CONTIDA na mais alta — a garantia da âncora vale para as duas', () => {
    const m = linhas({ 's5.top.title': 5, 's5.top.body': 1, 's5.bot.title': 5, 's5.bot.body': 1 });
    const tops = template01Tops(5, m);
    for (const [alta, baixa, altaLines, baixaLines] of [
      ['s5.top.title', 's5.top.body', 5, 1],
      ['s5.bot.title', 's5.bot.body', 5, 1],
    ] as const) {
      expect(tops[baixa]).toBeGreaterThanOrEqual(tops[alta]);
      expect(tops[baixa] + alturaCom(baixa, baixaLines)).toBeLessThanOrEqual(
        tops[alta] + alturaCom(alta, altaLines)
      );
    }
  });

  it('faixa de CIMA: com a contagem de linhas do spec a regra é no-op (0 px)', () => {
    const tops = template01Tops(5);
    expect(tops['s5.top.body']).toBe(node(5, 's5.top.body').box.y);
    expect(tops['s5.top.title']).toBe(node(5, 's5.top.title').box.y);
    expect(tops['s5.top.title']).toBe(147);
  });

  it('faixa de BAIXO: o desvio é o registrado em TEMPLATE_01_DESIGN_TWEAKS', () => {
    const desvio = TEMPLATE_01_DESIGN_TWEAKS.verticalCenter['s5.bot.title'];
    expect(desvio.specY).toBe(node(5, 's5.bot.title').box.y);
    const tops = template01Tops(5);
    expect(tops['s5.bot.title']).toBe(desvio.y);
    expect(desvio.y - desvio.specY).toBe(17);
    // O deslocamento é exatamente o que faltava para os centros coincidirem.
    expect(centro(tops, 's5.bot.title')).toBeCloseTo(centro(tops, 's5.bot.body'), 6);
  });

  it('o desvio NÃO vaza: nenhum outro slot muda com a contagem de linhas do spec', () => {
    expect(Object.keys(TEMPLATE_01_DESIGN_TWEAKS.verticalCenter)).toEqual(['s5.bot.title']);
  });

  it('só o slide 5 tem colunas lado a lado — o resto empilha', () => {
    const declarados = new Set(
      Object.entries(TEMPLATE_01_CENTER_PAIRS).flatMap(([slide, pares]) =>
        pares.map((p) => `${slide} ${[...p].sort().join('|')}`)
      )
    );
    const achados: string[] = [];
    for (const slide of TEMPLATE_01_SPEC.slides) {
      const textos = slide.nodes.filter((n) => n.type === 'TEXT' && n.slot);
      for (let i = 0; i < textos.length; i++) {
        for (let j = i + 1; j < textos.length; j++) {
          const a = textos[i].box;
          const b = textos[j].box;
          const ladoALado = a.x + a.w <= b.x || b.x + b.w <= a.x;
          const mesmaAltura = a.y < b.y + b.h && b.y < a.y + a.h;
          if (!ladoALado || !mesmaAltura) continue;
          const slots = [textos[i].slot!, textos[j].slot!].sort();
          // Os cantos são a exceção: mesma caixa em y, mesma altura, uma linha
          // cada — já nascem com o mesmo centro e nunca refluem.
          if (slots.every((s) => s.startsWith('cantos.'))) {
            expect(a.y).toBe(b.y);
            expect(a.h).toBe(b.h);
            continue;
          }
          achados.push(`${slide.index} ${slots.join('|')}`);
        }
      }
    }
    expect(new Set(achados)).toEqual(declarados);
  });
});

/**
 * Parte B: o spec é o VALOR PADRÃO. Sem override o render tem de sair idêntico —
 * é isso que preserva a fidelidade de 0 px; com override, o usuário vence.
 */
describe('TEMPLATE 1 — overrides do editor', () => {
  const slideBase = { ...DEFAULT_SLIDE, id: 's', position: 0 } as Slide;

  it('um slide recém-criado não produz override de fundo nem de tipografia', () => {
    const ov = template01Overrides(slideBase, DEFAULT_GLOBAL_SETTINGS);
    expect(ov.background).toBeUndefined();
    // O shadow no T1 é SEMPRE o degradê preto de legibilidade (fixo), mesmo sem
    // marca — por isso ele existe, mas é sempre preto.
    expect(ov.shadow).toContain('rgba(0,0,0');
    expect(ov.title).toMatchObject({ fontScale: 1, color: undefined, font: undefined });
    expect(ov.body).toMatchObject({ fontScale: 1, color: undefined });
    expect(ov.backgroundImage.position).toBeUndefined();
    expect(ov.hideCorners).toBe(false);
  });

  it('tipografia e margem globais entram nos dois cantos sem apagar a cor do slide', () => {
    const ov = template01Overrides(
      {
        ...slideBase,
        templateSlotStyles: { 'cantos.left': { color: '#FF0000', fontSize: 12 } },
      },
      {
        ...DEFAULT_GLOBAL_SETTINGS,
        templateCornerStyle: { font: 'Inter Display Bold', fontSize: 30, margin: 18 },
      }
    );

    expect(ov.slotStyles['cantos.left']).toMatchObject({
      color: '#FF0000',
      font: 'Inter Display Bold',
      fontSize: 30,
      margin: 18,
    });
    expect(ov.slotStyles['cantos.right']).toMatchObject({
      font: 'Inter Display Bold',
      fontSize: 30,
      margin: 18,
    });
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
      templateOverrides: { titleColor: true, titleFont: true },
    } as Partial<Slide>);
    expect(html).toContain('#FF0000');
    expect(html).toContain('Bebas Neue');
  });

  it('o tamanho de fonte é proporcional — a razão entre os blocos é preservada', () => {
    const headline = TEMPLATE_01_SPEC.slides[0].nodes.find((n) => n.slot === 's1.headline')!;
    const html = renderSlide(0, undefined, {
      fontSize: { title: DEFAULT_SLIDE.fontSize.title * 2, description: DEFAULT_SLIDE.fontSize.description },
      templateOverrides: { titleSize: true },
    } as Partial<Slide>);
    expect(html).toContain(`font-size:${headline.typography!.fontSizePx * 2}px`);
    // A entrelinha acompanha, senão as linhas colariam.
    expect(html).toContain(`line-height:${headline.typography!.lineHeightPx * 2}px`);
  });

  it('a cor de fundo do editor vence a do spec', () => {
    expect(renderSlide(3)).toContain('#FFFFFF');
    expect(
      renderSlide(3, undefined, {
        backgroundColor: '#0A0A0A',
        templateOverrides: { background: true },
      } as Partial<Slide>)
    ).toContain('#0A0A0A');
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

/**
 * O defeito mais caro do teste real: o carrossel gerado saiu com a cor da MARCA
 * do usuário (creme claro, do onboarding) no fundo, os degradês do Figma
 * apagados e o texto branco em cima — ilegível.
 *
 * A causa não era a cor: era o mecanismo. Override era "valor diferente do
 * padrão do editor", e a geração gravava valores. A regra agora é estrutural —
 * override só existe com MARCA, e só a barra lateral marca.
 */
describe('TEMPLATE 1 — geração não produz override', () => {
  const MARCA_CLARA = '#F5F1E8';

  /** O que o CreateWizard grava hoje num slide de template01. */
  const slideGerado = (i: number): Slide =>
    ({
      ...DEFAULT_SLIDE,
      id: `s${i}`,
      position: i,
      backgroundImageUrl: '',
      gridImageUrl: '',
      contentImageUrl: '',
      templateSlots: template01SlotsFromContent(i, { title: 'Título', description: 'Corpo' }),
    }) as Slide;

  it('um slide recém-gerado não tem NENHUMA marca de override', () => {
    for (let i = 0; i < 6; i++) expect(slideGerado(i).templateOverrides).toBeUndefined();
  });

  it('a paleta clara da marca NÃO vira fundo: o degradê do spec sobrevive', () => {
    // Mesmo com a cor da marca no campo, sem marca de override ela não pinta.
    const comMarca = {
      ...slideGerado(0),
      backgroundColor: MARCA_CLARA,
      fontSize: { title: 90, description: 36 },
    } as Slide;

    const ov = template01Overrides(comMarca, DEFAULT_GLOBAL_SETTINGS);
    expect(ov.background).toBeUndefined();
    expect(ov.title.fontScale).toBe(1);

    const html = renderToStaticMarkup(
      <Template01Slide
        slide={comMarca}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={TEMPLATE_01_SLIDE_COUNT}
      />
    );
    expect(html).not.toContain(MARCA_CLARA);
    // O degradê branco→preto da capa é o do Figma.
    expect(html).toContain(TEMPLATE_01_SPEC.slides[0].background[0].css!);
  });

  it('a sombra de legibilidade do T1 é fixa (preta) e sempre presente', () => {
    // No T1 o degradê preto de legibilidade existe SEMPRE — independente de marca
    // — e é sempre preto, ignorando qualquer cor de slide.shadow.
    const ov = template01Overrides(slideGerado(1), DEFAULT_GLOBAL_SETTINGS);
    expect(ov.shadow).toContain('rgba(0,0,0');
    // Não é tingido por uma cor que porventura esteja em slide.shadow.
    const comCor = template01Overrides(
      { ...slideGerado(1), shadow: { style: 'base', opacity: 88, color: '#123456' } },
      DEFAULT_GLOBAL_SETTINGS
    );
    expect(comCor.shadow).toContain('rgba(0,0,0');
  });

  it('marcar o controle — e só isso — faz o override existir', () => {
    const semMarca = { ...slideGerado(0), backgroundColor: MARCA_CLARA } as Slide;
    const comMarca = {
      ...semMarca,
      templateOverrides: markTemplate01Override(undefined, 'background'),
    } as Slide;

    expect(template01Overrides(semMarca, DEFAULT_GLOBAL_SETTINGS).background).toBeUndefined();
    expect(template01Overrides(comMarca, DEFAULT_GLOBAL_SETTINGS).background).toBe(MARCA_CLARA);
  });

  it('a marca é acumulativa: mexer num controle não apaga os outros', () => {
    const marks = markTemplate01Override(
      markTemplate01Override(undefined, 'background'),
      'titleSize'
    );
    expect(marks).toEqual({ background: true, titleSize: true });
  });

  it('os cantos seguem a mesma regra, no globalSettings', () => {
    const gs = { ...DEFAULT_GLOBAL_SETTINGS, corners: { ...DEFAULT_CORNERS, color: '#FF0000' } };
    expect(template01Overrides(slideGerado(2), gs).corner.color).toBeUndefined();

    const marcado = {
      ...gs,
      templateOverrides: markTemplate01CornerOverride(undefined, 'cornerColor'),
    };
    expect(template01Overrides(slideGerado(2), marcado).corner.color).toBe('#FF0000');
  });
});

/**
 * BUG 3: os controles estavam DESENHADOS na barra lateral mas inertes — o
 * renderer não lia nenhum deles. Cada teste aqui é "mexi no controle X, o
 * render mudou".
 */
describe('TEMPLATE 1 — cada controle da barra lateral tem efeito no render', () => {
  const com = (patch: Partial<Slide>, ...keys: Parameters<typeof markTemplate01Override>[1][]) =>
    renderSlide(0, undefined, {
      ...patch,
      templateOverrides: markTemplate01Override(undefined, ...keys),
    } as Partial<Slide>);

  const headline = TEMPLATE_01_SPEC.slides[0].nodes.find((n) => n.slot === 's1.headline')!;

  it('posição: o deslocamento move os blocos de texto', () => {
    const html = com({ textOffset: { x: 40, y: -25 } }, 'textOffset');
    expect(html).toContain(`top:${headline.box.y - 25}px`);
    expect(html).toContain('translateX(calc(-50% + 40px))');
    // Sem marca, nada se move.
    expect(renderSlide(0)).toContain(`top:${headline.box.y}px`);
  });

  it('alinhamento troca o text-align do spec', () => {
    expect(headline.typography!.textAlignHorizontal.toLowerCase()).toBe('center');
    expect(com({ textAlignment: 'left' }, 'textAlignment')).toContain('text-align:left');
  });

  it('tamanho do título escala fonte e entrelinha juntos', () => {
    const html = com(
      { fontSize: { title: DEFAULT_SLIDE.fontSize.title / 2, description: 36 } },
      'titleSize'
    );
    expect(html).toContain(`font-size:${headline.typography!.fontSizePx / 2}px`);
  });

  it('tamanho da descrição não mexe no título', () => {
    const html = com(
      { fontSize: { title: DEFAULT_SLIDE.fontSize.title, description: DEFAULT_SLIDE.fontSize.description * 2 } },
      'descriptionSize'
    );
    const subline = TEMPLATE_01_SPEC.slides[0].nodes.find((n) => n.slot === 's1.subline')!;
    expect(html).toContain(`font-size:${subline.typography!.fontSizePx * 2}px`);
    expect(html).toContain(`font-size:${headline.typography!.fontSizePx}px`);
  });

  it('cor da descrição, sublinhado, letras e entrelinha entram', () => {
    expect(com({ descriptionColor: '#00FF00' }, 'descriptionColor')).toContain('#00FF00');
    expect(com({ titleUnderline: true }, 'titleUnderline')).toContain('text-decoration:underline');
    expect(com({ titleLetterSpacing: 0.25 }, 'titleLetterSpacing')).toContain('letter-spacing:0.25em');
    const lh = com({ lineHeight: 2 }, 'lineHeight');
    expect(lh).toContain(`line-height:${headline.typography!.fontSizePx * 2}px`);
  });

  it('espaço título → descrição abre o vão dentro do grupo', () => {
    const specTop = TEMPLATE_01_SPEC.slides[0].nodes.find((n) => n.slot === 's1.headline')!.box.y;
    const tops = template01Tops(1, {}, {
      titleGapDelta: 30,
      isTitleSlot: (s) => s === 's1.headline' || s === 's1.eyebrow',
    });
    // Grupo ancorado no rodapé: a síntese fica, o título sobe 30px.
    expect(tops['s1.subline']).toBe(
      TEMPLATE_01_SPEC.slides[0].nodes.find((n) => n.slot === 's1.subline')!.box.y
    );
    expect(tops['s1.headline']).toBe(specTop - 30);
  });

  it('degradê/overlay de legibilidade entra por cima do degradê do template', () => {
    const html = com({ shadow: { style: 'base', opacity: 60, color: '#123456' } }, 'shadow');
    // No T1 o overlay é SEMPRE preto, ignorando a cor do slide.shadow.
    expect(html).toContain('rgba(0,0,0');
    expect(html).not.toContain('rgba(18,52,86');
    // O degradê do spec continua lá.
    expect(html).toContain(TEMPLATE_01_SPEC.slides[0].background[0].css!);
  });

  it('imagem: posição, zoom e opacidade valem quando marcados', () => {
    const slots = { 's1.image': 'https://exemplo/foto.jpg' };
    const semMarca = renderSlide(0, slots);
    expect(semMarca).toContain('background-size:cover');

    const html = renderSlide(0, slots, {
      imagePosition: { x: 10, y: 90, zoom: 250 },
      backgroundImageOpacity: 40,
      templateOverrides: markTemplate01Override(
        undefined,
        'backgroundImagePosition',
        'backgroundImageOpacity'
      ),
    } as Partial<Slide>);
    expect(html).toContain('scale(2.5)');
    expect(html).toContain('background-position:10% 90%');
    expect(html).toContain('opacity:0.4');
  });

  it('cantos: tamanho, cor, opacidade e distância das bordas mudam o render', () => {
    const render = (corners: Partial<typeof DEFAULT_CORNERS>, ...keys: Template01CornerControl[]) =>
      renderToStaticMarkup(
        <Template01Slide
          slide={{ ...DEFAULT_SLIDE, id: 's', position: 2 } as Slide}
          globalSettings={{
            ...DEFAULT_GLOBAL_SETTINGS,
            corners: { ...DEFAULT_CORNERS, ...corners },
            templateOverrides: markTemplate01CornerOverride(undefined, ...keys),
          }}
          slideIndex={2}
          totalSlides={TEMPLATE_01_SLIDE_COUNT}
        />
      );

    const cantoEsq = TEMPLATE_01_SPEC.slides[2].nodes.find((n) => n.slot === 'cantos.left')!;
    expect(render({ color: '#FF00FF' }, 'cornerColor')).toContain('#FF00FF');
    expect(render({ opacity: 30 }, 'cornerOpacity')).toContain('opacity:0.3');
    expect(render({ fontSize: DEFAULT_CORNERS.fontSize * 2 }, 'cornerSize')).toContain(
      `font-size:${cantoEsq.typography!.fontSizePx * 2}px`
    );
    // borderDistance padrão é 49: +20 afasta os dois cantos das bordas.
    const afastado = render({ borderDistance: DEFAULT_CORNERS.borderDistance + 20 }, 'cornerDistance');
    expect(afastado).toContain(`left:${cantoEsq.box.x + 20}px`);
    const cantoDir = TEMPLATE_01_SPEC.slides[2].nodes.find((n) => n.slot === 'cantos.right')!;
    expect(afastado).toContain(`right:${cantoDir.box.right + 20}px`);
  });
});

/**
 * DESVIOS DELIBERADOS DO FIGMA — pedidos pelo Rafael (dono do produto).
 *
 * O critério de fidelidade deixou de ser "0 px em tudo": passou a ser "0 px em
 * tudo, EXCETO estes desvios". Sem os testes abaixo o critério vira folclore e
 * qualquer refatoração desfaz o pedido sem ninguém perceber no diff.
 */
describe('TEMPLATE 1 — desvios deliberados do Figma', () => {
  const nodeOf = (slot: string): SpecNode =>
    TEMPLATE_01_SPEC.slides.flatMap((s) => s.nodes).find((n) => n.slot === slot)!;

  it('slide 3: o título renderiza CENTER, e o spec continua dizendo LEFT', () => {
    // A régua não pode ser editada junto com o desvio: o spec é o gabarito.
    expect(nodeOf('s3.title').typography!.textAlignHorizontal).toBe('LEFT');
    expect(TEMPLATE_01_DESIGN_TWEAKS.align['s3.title']).toBe('center');
    expect(template01BaseType(nodeOf('s3.title')).align).toBe('center');

    const html = renderSlide(2);
    const bloco = html.slice(html.indexOf('data-slot="s3.title"'));
    expect(bloco.slice(0, bloco.indexOf('>'))).toContain('text-align:center');
  });

  it('slide 3: só o título muda — corpo e remate seguem o spec', () => {
    for (const slot of ['s3.body', 's3.kicker']) {
      expect(TEMPLATE_01_DESIGN_TWEAKS.align[slot]).toBeUndefined();
      expect(template01BaseType(nodeOf(slot)).align).toBe(
        nodeOf(slot).typography!.textAlignHorizontal.toLowerCase()
      );
    }
  });

  it('nenhum outro slot do deck tem o alinhamento desviado', () => {
    expect(Object.keys(TEMPLATE_01_DESIGN_TWEAKS.align)).toEqual(['s3.title']);
  });

  it('slide 5: os títulos-coluna usam o tamanho reduzido, não os 55.163 do Figma', () => {
    for (const slot of ['s5.top.title', 's5.bot.title']) {
      expect(nodeOf(slot).typography!.fontSizePx).toBeCloseTo(55.163, 3);
      expect(TEMPLATE_01_DESIGN_TWEAKS.fontSizePx[slot]).toBe(44);
      expect(template01BaseType(nodeOf(slot)).fontSizePx).toBe(44);
    }
    expect(renderSlide(4)).toContain('font-size:44px');
  });

  it('slide 5: a entrelinha acompanha o tamanho, preservando a razão do spec', () => {
    const node = nodeOf('s5.top.title');
    const t = node.typography!;
    const razao = t.lineHeightPx / t.fontSizePx;
    expect(template01BaseType(node).lineHeightPx).toBeCloseTo(44 * razao, 6);
  });

  it('slide 5: o limite de caracteres é o do tamanho novo, não o do slots.json', () => {
    // slots.json (read-only): 10 no topo, 11 na base. A 44px cabem 12 nas duas.
    expect(TEMPLATE_01_SPEC.slotIndex['s5.top.title'].maxCharsPerLine).toBe(10);
    expect(TEMPLATE_01_SPEC.slotIndex['s5.bot.title'].maxCharsPerLine).toBe(11);
    for (const slot of ['s5.top.title', 's5.bot.title']) {
      expect(TEMPLATE_01_EDITABLE_SLOTS.find((s) => s.slot === slot)!.maxCharsPerLine).toBe(12);
    }
    // Uma palavra de 12 caracteres deixa de ser estouro.
    expect(template01Overflows({ 's5.top.title': 'investimento' })).toEqual([]);
  });

  it('o tamanho novo e o limite novo são coerentes entre si', () => {
    // Se alguém mexer num sem mexer no outro, o aviso da barra lateral passa a
    // mentir. Os dois só fazem sentido juntos — ver TEMPLATE_01_DESIGN_TWEAKS.
    expect(Object.keys(TEMPLATE_01_DESIGN_TWEAKS.fontSizePx).sort()).toEqual(
      Object.keys(TEMPLATE_01_DESIGN_TWEAKS.maxCharsPerLine).sort()
    );
  });

  it('os desvios NÃO vazam para os slides 1, 2, 4 e 6', () => {
    const desviados = new Set([
      ...Object.keys(TEMPLATE_01_DESIGN_TWEAKS.align),
      ...Object.keys(TEMPLATE_01_DESIGN_TWEAKS.fontSizePx),
    ]);
    for (const slide of TEMPLATE_01_SPEC.slides) {
      if (![1, 2, 4, 6].includes(slide.index)) continue;
      for (const node of slide.nodes) {
        if (node.type !== 'TEXT' || !node.typography) continue;
        expect(desviados.has(node.slot!)).toBe(false);
        const base = template01BaseType(node);
        expect(base.fontSizePx).toBe(node.typography.fontSizePx);
        expect(base.lineHeightPx).toBe(node.typography.lineHeightPx);
        expect(base.align).toBe(node.typography.textAlignHorizontal.toLowerCase());
      }
    }
  });
});

/**
 * BUG REAL do slide 4: as caixas do Figma têm larguras diferentes por bloco.
 * Com o CENTER do spec as duas são simétricas e parece certo; trocando o
 * alinhamento as bordas divergem 51px. Não é desvio de design — é defeito.
 */
describe('TEMPLATE 1 — alinhamento: blocos da mesma coluna dividem a borda', () => {
  const boxOf = (slideIndex: number, slot: string) =>
    TEMPLATE_01_SPEC.slides.find((s) => s.index === slideIndex)!.nodes.find((n) => n.slot === slot)!
      .box;

  const comAlinhamento = (index: number, align: 'left' | 'center' | 'right') =>
    renderSlide(index, undefined, {
      textAlignment: align,
      templateOverrides: markTemplate01Override(undefined, 'textAlignment'),
    } as Partial<Slide>);

  it('o problema existe no spec: título e corpo do slide 4 têm caixas diferentes', () => {
    expect(boxOf(4, 's4.title').x).toBeCloseTo(229.4, 1);
    expect(boxOf(4, 's4.body').x).toBeCloseTo(178.0, 1);
  });

  it('com override, os dois blocos do slide 4 passam a usar a caixa mais larga', () => {
    const boxes = template01AlignBoxes(4);
    const largest = boxOf(4, 's4.body'); // 725px contra 622px do título
    expect(boxes['s4.title']).toBe(largest);
    expect(boxes['s4.body']).toBe(largest);

    for (const align of ['left', 'right'] as const) {
      const html = comAlinhamento(3, align);
      // Uma largura só para os dois => bordas esquerda e direita coincidem.
      const larguras = [...html.matchAll(/data-slot="s4\.(?:title|body)"[^>]*width:([\d.]+)px/g)].map(
        (m) => m[1]
      );
      expect(larguras).toHaveLength(2);
      expect(new Set(larguras).size).toBe(1);
      expect(larguras[0]).toBe(String(largest.w));
    }
  });

  it('SEM override nada muda — cada bloco fica na caixa do spec (é o 0 px)', () => {
    const html = renderSlide(3);
    expect(html).toContain(`width:${boxOf(4, 's4.title').w}px`);
    expect(html).toContain(`width:${boxOf(4, 's4.body').w}px`);
  });

  it('a mesma regra vale nos outros slides com blocos de larguras diferentes', () => {
    // s6: título (592) e fecho (756) são a mesma coluna, separados pela seta —
    // grupos de FLUXO diferentes, mas uma coluna só para o alinhamento.
    expect(template01AlignBoxes(6)['s6.title']).toBe(boxOf(6, 's6.body'));
    // s1: o mais largo é o título (911).
    expect(template01AlignBoxes(1)['s1.subline']).toBe(boxOf(1, 's1.headline'));
    // s2: o mais largo é o corpo (813).
    expect(template01AlignBoxes(2)['s2.title']).toBe(boxOf(2, 's2.body'));
    // s5: as duas faixas são a mesma coluna; o título de baixo é o mais largo.
    expect(template01AlignBoxes(5)['s5.top.title']).toBe(boxOf(5, 's5.bot.title'));
  });

  it('todo slot de um grupo de alinhamento existe no slide', () => {
    for (const [index, grupos] of Object.entries(TEMPLATE_01_ALIGN_GROUPS)) {
      const slide = TEMPLATE_01_SPEC.slides.find((s) => s.index === Number(index))!;
      for (const slot of grupos.flat()) {
        expect(slide.nodes.some((n) => n.slot === slot)).toBe(true);
      }
    }
  });

  it('os cantos ficam de fora: têm âncoras opostas e controle próprio', () => {
    for (const index of [1, 2, 3, 4, 5, 6]) {
      const slots = Object.keys(template01AlignBoxes(index));
      expect(slots.some((s) => s.startsWith('cantos.'))).toBe(false);
    }
  });
});

describe('TEMPLATE 1 — estilo por slot', () => {
  const headline = TEMPLATE_01_SPEC.slides[0].nodes.find((n) => n.slot === 's1.headline')!;
  const eyebrow = TEMPLATE_01_SPEC.slides[0].nodes.find((n) => n.slot === 's1.eyebrow')!;

  it('a presença da chave do slot já é o gesto do usuário — sem marca à parte', () => {
    const html = renderSlide(0, undefined, {
      templateSlotStyles: { 's1.headline': { color: '#FF0000', fontSize: 30 } },
    } as Partial<Slide>);
    expect(html).toContain('#FF0000');
    expect(html).toContain('font-size:30px');
  });

  it('mexer num bloco NÃO mexe nos outros do mesmo papel', () => {
    const html = renderSlide(0, undefined, {
      templateSlotStyles: { 's1.headline': { fontSize: 30 } },
    } as Partial<Slide>);
    // O chapéu é 'title' pelo papel antigo: antes ele teria andado junto.
    expect(html).toContain(`font-size:${eyebrow.typography!.fontSizePx}px`);
  });

  it('tamanho, fonte, cor, espaçamento de letra e sublinhado valem por slot', () => {
    const html = renderSlide(0, undefined, {
      templateSlotStyles: {
        's1.subline': { color: '#00FF00', fontSize: 20, letterSpacing: 0.2, underline: true },
      },
    } as Partial<Slide>);
    expect(html).toContain('#00FF00');
    expect(html).toContain('font-size:20px');
    expect(html).toContain('letter-spacing:0.2em');
    expect(html).toContain('text-decoration:underline');
  });

  it('a entrelinha continua sendo UM controle para o bloco inteiro', () => {
    const html = renderSlide(0, undefined, {
      lineHeight: 2,
      templateOverrides: markTemplate01Override(undefined, 'lineHeight'),
      templateSlotStyles: { 's1.headline': { fontSize: 40 } },
    } as Partial<Slide>);
    // Todos os três blocos da capa seguem a mesma razão.
    expect(html).toContain('line-height:80px');
    expect(html).toContain(`line-height:${eyebrow.typography!.fontSizePx * 2}px`);
  });

  it('sem estilo por slot, o render é o do spec', () => {
    const html = renderSlide(0, undefined, { templateSlotStyles: {} } as Partial<Slide>);
    expect(html).toContain(`font-size:${headline.typography!.fontSizePx}px`);
  });

  it('um deck gerado não escreve estilo por slot', () => {
    const slots = template01SlotsFromContent(0, { title: 'A', description: 'B' });
    expect(slots).not.toHaveProperty('templateSlotStyles');
  });
});

describe('TEMPLATE 1 — rótulos da barra lateral', () => {
  it('a capa usa os nomes que o Rafael pediu', () => {
    expect(template01SlotLabel('s1.headline')).toBe('Título');
    expect(template01SlotLabel('s1.eyebrow')).toBe('Subtítulo');
    expect(template01SlotLabel('s1.subline')).toBe('Descrição');
  });

  it('renomear o rótulo NÃO renomeia a chave do slot', () => {
    // A chave está gravada no templateSlots de todo carrossel já salvo.
    const nomes = TEMPLATE_01_EDITABLE_SLOTS.map((s) => s.slot);
    expect(nomes).toContain('s1.headline');
    expect(nomes).toContain('s1.eyebrow');
    expect(nomes).toContain('s1.subline');
    expect(nomes).toContain('s2.title');
    expect(nomes).toContain('s2.body');
  });

  it('todo slot editável tem rótulo em português, nunca a chave crua', () => {
    for (const d of TEMPLATE_01_EDITABLE_SLOTS) {
      expect(d.label).not.toBe(d.slot);
      expect(d.label.length).toBeGreaterThan(0);
    }
  });

  it('a barra lateral lista os campos na ordem VISUAL do slide', () => {
    // Na capa o spec traz o título antes do chapéu, que está acima dele.
    const capa = template01SlotsForSlide(1).filter((d) => d.kind === 'text' && !d.slot.startsWith('cantos.'));
    expect(capa.map((d) => d.slot)).toEqual(['s1.eyebrow', 's1.headline', 's1.subline']);
  });

  it('as duas faixas do slide 5 têm rótulos distintos', () => {
    const labels = template01SlotsForSlide(5)
      .filter((d) => d.kind === 'text' && !d.slot.startsWith('cantos.'))
      .map((d) => d.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

/**
 * CANTOS EM TODOS OS SLIDES — pedido do Rafael.
 *
 * O switch parecia morto no slide 1 e ninguém entendia por quê. Não era o
 * switch: o Figma desenhou `cantos.left`/`cantos.right` só nos slides 3, 5 e 6,
 * então nos slides 1, 2 e 4 não havia nó nenhum para ligar ou desligar.
 *
 * A partir daqui os cantos existem nos SEIS slides. Nos três que o Figma não
 * desenhou eles são acréscimo deliberado, registrado em
 * TEMPLATE_01_DESIGN_TWEAKS.extraCorners.
 */
describe('TEMPLATE 1 — cantos nos 6 slides', () => {
  /** A constatação que originou o pedido: o Figma só desenhou 3 dos 6. */
  it('o Figma tem cantos só nos slides 3, 5 e 6 — é esta a causa do switch morto', () => {
    const comCanto = TEMPLATE_01_SPEC.slides
      .filter((s) => s.nodes.some((n) => n.slot?.startsWith('cantos.')))
      .map((s) => s.index);
    expect(comCanto).toEqual([3, 5, 6]);
  });

  it('os slides que o Figma deixou sem canto estão registrados como desvio', () => {
    expect(Object.keys(TEMPLATE_01_DESIGN_TWEAKS.extraCorners).map(Number).sort()).toEqual([1, 2, 4]);
  });

  it('todos os 6 slides renderizam os dois cantos', () => {
    for (let i = 0; i < TEMPLATE_01_SLIDE_COUNT; i++) {
      const html = renderSlide(i);
      expect(html, `slide ${i + 1} sem canto esquerdo`).toContain('data-slot="cantos.left"');
      expect(html, `slide ${i + 1} sem canto direito`).toContain('data-slot="cantos.right"');
    }
  });

  it('mantém compatibilidade com o antigo switch global de cantos', () => {
    for (let i = 0; i < TEMPLATE_01_SLIDE_COUNT; i++) {
      const html = renderToStaticMarkup(
        <Template01Slide
          slide={{ ...DEFAULT_SLIDE, id: 's', position: i } as Slide}
          globalSettings={{
            ...DEFAULT_GLOBAL_SETTINGS,
            corners: { ...DEFAULT_GLOBAL_SETTINGS.corners, show: false },
          }}
          slideIndex={i}
          totalSlides={TEMPLATE_01_SLIDE_COUNT}
        />
      );
      expect(html, `slide ${i + 1} manteve canto desligado`).not.toContain('data-slot="cantos.');
    }
  });

  it('os cantos novos nascem LIGADOS, como os dos slides 3/5/6', () => {
    // `show` ausente/true = ligado; é também o fallback para decks antigos.
    expect(DEFAULT_CORNERS.show).not.toBe(false);
    expect(renderSlide(0)).toContain('data-slot="cantos.left"');
  });

  it('a geometria dos cantos novos é a MESMA dos slides 3/5/6', () => {
    // x=71 à esquerda, right=63 à direita, y=44 nos dois — copiado do spec.
    for (let i = 0; i < TEMPLATE_01_SLIDE_COUNT; i++) {
      const html = renderSlide(i);
      const left = html.match(/data-slot="cantos\.left"[^>]*style="([^"]*)"/)?.[1] ?? '';
      const right = html.match(/data-slot="cantos\.right"[^>]*style="([^"]*)"/)?.[1] ?? '';
      expect(left, `slide ${i + 1}`).toContain('left:71px');
      expect(left, `slide ${i + 1}`).toContain('top:44px');
      expect(left, `slide ${i + 1}`).toContain('text-align:left');
      expect(right, `slide ${i + 1}`).toContain('right:63px');
      expect(right, `slide ${i + 1}`).toContain('top:44px');
      expect(right, `slide ${i + 1}`).toContain('text-align:right');
    }
  });

  it('a tipografia dos cantos novos é a MESMA dos slides 3/5/6', () => {
    for (let i = 0; i < TEMPLATE_01_SLIDE_COUNT; i++) {
      const style = renderSlide(i).match(/data-slot="cantos\.left"[^>]*style="([^"]*)"/)?.[1] ?? '';
      // 16.805px / Inter Display Medium — os números do spec, sem arredondar.
      expect(style, `slide ${i + 1}`).toContain('font-size:16.805px');
      expect(style, `slide ${i + 1}`).toContain('T01InterDisplay');
      expect(style, `slide ${i + 1}`).toContain('font-weight:500');
    }
  });

  it('o texto dos cantos é editável e vale para os 6 slides', () => {
    for (let i = 0; i < TEMPLATE_01_SLIDE_COUNT; i++) {
      const html = renderSlide(i, { 'cantos.left': 'MINHA MARCA', 'cantos.right': '@MEUARROBA' });
      expect(html, `slide ${i + 1}`).toContain('MINHA MARCA');
      expect(html, `slide ${i + 1}`).toContain('@MEUARROBA');
    }
  });

  it('continua havendo UM só par de campos de canto na barra lateral', () => {
    // Os cantos repetem no desenho, mas são um slot só — editar seis vezes o
    // mesmo texto seria o bug que o dedup evita.
    const nomes = TEMPLATE_01_EDITABLE_SLOTS.map((s) => s.slot);
    expect(nomes.filter((n) => n === 'cantos.left')).toHaveLength(1);
    expect(nomes.filter((n) => n === 'cantos.right')).toHaveLength(1);
  });

  it('nenhum canto de um deck GERADO carrega a copy do Figma', () => {
    // A regra dura da rodada passada, agora valendo também nos 3 slides novos.
    const slots = { ...template01CornerSlots('Acme', '@acme') };
    for (let i = 0; i < TEMPLATE_01_SLIDE_COUNT; i++) {
      const html = renderSlide(i, slots);
      expect(html, `slide ${i + 1}`).not.toContain('OANDRELONA');
      expect(html, `slide ${i + 1}`).not.toContain('BRANDING & DESIGN DE MARCA');
      expect(html, `slide ${i + 1}`).toContain('ACME');
    }
  });

  it('sem marca nem @, o canto sai VAZIO nos 6 slides — nunca com o do Figma', () => {
    const slots = template01CornerSlots(undefined, undefined);
    for (let i = 0; i < TEMPLATE_01_SLIDE_COUNT; i++) {
      const html = renderSlide(i, slots);
      expect(html, `slide ${i + 1}`).not.toContain('OANDRELONA');
      expect(html, `slide ${i + 1}`).not.toContain('BRANDING & DESIGN DE MARCA');
    }
  });

  it('a cor do canto novo é a do slide de fundo CLARO (slide 5), não a do escuro', () => {
    // Slides 1, 2 e 4 são brancos na faixa y=44: o degradê da capa só começa a
    // escurecer em 30.26% e o do slide 2 em 36.85%. O precedente certo é o
    // slide 5 (fundo branco, #AAAAAA), não o slide 3 (fundo #050416, #767682).
    for (const i of [0, 1, 3]) {
      const style = renderSlide(i).match(/data-slot="cantos\.left"[^>]*style="([^"]*)"/)?.[1] ?? '';
      expect(style, `slide ${i + 1}`).toContain('#AAAAAA');
    }
  });

  it('o controle de cor da barra lateral continua vencendo nos cantos novos', () => {
    const html = renderToStaticMarkup(
      <Template01Slide
        slide={{ ...DEFAULT_SLIDE, id: 's', position: 0 } as Slide}
        globalSettings={{
          ...DEFAULT_GLOBAL_SETTINGS,
          corners: { ...DEFAULT_GLOBAL_SETTINGS.corners, color: '#FF0000' },
          templateOverrides: markTemplate01CornerOverride(undefined, 'cornerColor'),
        }}
        slideIndex={0}
        totalSlides={TEMPLATE_01_SLIDE_COUNT}
      />
    );
    const style = html.match(/data-slot="cantos\.left"[^>]*style="([^"]*)"/)?.[1] ?? '';
    expect(style).toContain('#FF0000');
  });

  it('acrescentar canto NÃO mexe no resto do slide: os demais blocos ficam no y do spec', () => {
    // O confinamento que a fidelidade exige — provado aqui por posição e, no
    // relatório, por diff de pixel por região.
    for (const idx of [1, 2, 4]) {
      const spec = TEMPLATE_01_SPEC.slides.find((s) => s.index === idx)!;
      const html = renderSlide(idx - 1);
      for (const n of spec.nodes) {
        if (n.type !== 'TEXT' || !n.slot) continue;
        const style = html.match(new RegExp(`data-slot="${n.slot.replace('.', '\\.')}"[^>]*style="([^"]*)"`))?.[1] ?? '';
        expect(style, `${n.slot} saiu do y do spec`).toContain(`top:${n.box.y}px`);
      }
    }
  });
});
