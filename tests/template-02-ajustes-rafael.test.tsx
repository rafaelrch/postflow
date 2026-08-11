import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Template02Slide from '@/components/slides/Template02Slide';
import {
  TEMPLATE_02_COLORS,
  TEMPLATE_02_DESIGN_TWEAKS,
  TEMPLATE_02_HIGHLIGHT_COLOR,
  TEMPLATE_02_SPEC,
  template02Addendum,
  template02Contrast,
  template02CoverTops,
  template02HighlightLine,
  template02HighlightParts,
  template02HighlightTerms,
  template02HighlightTextColor,
  template02Limits,
  template02Measure,
  template02MissingHighlightTerms,
  template02ScrimStops,
  template02SlotsForModel,
  template02Type,
} from '@/lib/templates/template-02';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide, TemplateSlotStyle } from '@/types';

/**
 * FATIA 5 — os quatro itens que o Rafael trouxe do teste no navegador.
 *
 * Cada bloco aqui trava um pedido dele E a razão técnica por trás, para que a
 * próxima pessoa não "conserte" de volta o que foi mudado de propósito.
 */

function markup(
  slots: Record<string, string>,
  slotStyles?: Record<string, TemplateSlotStyle>,
  model = 1
): string {
  return renderToStaticMarkup(
    <Template02Slide
      slide={{
        ...DEFAULT_SLIDE,
        id: 's',
        position: 0,
        templateModel: model,
        templateSlots: slots,
        ...(slotStyles ? { templateSlotStyles: slotStyles } : {}),
        backgroundImageUrl: '',
        gridImageUrl: '',
        contentImageUrl: '',
      } as Slide}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      slideIndex={0}
      totalSlides={5}
    />
  );
}

const CAPA = {
  'header.category': 'ARKE STUDIO',
  'header.handle': '@ARKEBRANDING',
  'cover.headline': '5 DICAS\nQUE TRAZEM CLIENTES\nSEM GRITAR EM ANÚNCIOS',
  'cover.cta': 'QUERO O PLANO',
};

describe('FATIA 6 — cabeçalho por slide', () => {
  it('pode ser ocultado sem afetar os outros dados do card', () => {
    const html = markup(CAPA, {
      'header.category': { visible: false },
      'header.handle': { visible: false },
    });
    expect(html).not.toContain('data-slot="header.category"');
    expect(html).not.toContain('data-slot="header.handle"');
    expect(html).toContain('data-slot="cover.headline"');
  });

  it('aceita fonte e cor próprias do cabeçalho', () => {
    const html = markup(CAPA, {
      'header.category': { color: '#123456', font: 'Montserrat' },
    });
    const header = html.slice(html.indexOf('data-slot="header.category"'));
    expect(header).toContain('color:#123456');
    expect(header).toContain("font-family:&#x27;Montserrat&#x27;, sans-serif");
  });

  it('aceita tamanho e margem para dentro sem mover os outros blocos', () => {
    const html = markup(CAPA, {
      'header.category': { fontSize: 30, margin: 20 },
      'header.handle': { fontSize: 30, margin: 20 },
    });
    const category = html.match(/data-slot="header\.category" style="([^"]*)"/)?.[1] ?? '';
    const handle = html.match(/data-slot="header\.handle" style="([^"]*)"/)?.[1] ?? '';
    expect(category).toContain('font-size:30px');
    // 44 (spec) + 20 (margem) menos metade do crescimento além da referência:
    // o canto cresce a partir do próprio centro. Era `top:64px` quando o
    // crescimento só ia para baixo — ver `tests/cantos-tamanho.test.tsx`.
    expect(category).toContain('top:57.4023px');
    expect(category).toContain('left:91px');
    expect(handle).toContain('top:57.4023px');
    expect(handle).toContain('right:91px');
    expect(html).toContain('data-slot="cover.headline"');
  });
});

// ── 1. DEGRADÊ DA CAPA ──────────────────────────────────────────

describe('FATIA 5 · 1 — degradê menor, mais forte na base', () => {
  it('a metade de cima fica limpa', () => {
    // "deixe menor, pelo menos até a metade do card" — palavras do Rafael.
    for (const s of template02ScrimStops().filter((x) => x.pos <= 0.5)) {
      expect(s.color, `parada em ${s.pos}`).toBe('rgba(0,0,0,0)');
    }
  });

  it('a base fica mais forte que a do spec', () => {
    // "um pouco mais forte da base".
    const stops = template02ScrimStops();
    const base = stops[stops.length - 1];
    expect(base.pos).toBe(1);
    expect(base.color).toBe('rgba(0,0,0,1)');
    const specBase = TEMPLATE_02_DESIGN_TWEAKS.scrim.spec.slice(-1)[0];
    expect(specBase.color).toBe('rgba(0,0,0,0.96)');
  });

  it('o degradê cresce monotonicamente do topo para a base', () => {
    // Uma parada mais clara depois de uma mais escura criaria uma faixa
    // visível no meio da foto.
    const alpha = (c: string) => Number(c.match(/[\d.]+\)$/)![0].slice(0, -1));
    const stops = template02ScrimStops();
    for (let i = 1; i < stops.length; i++) {
      expect(alpha(stops[i].color)).toBeGreaterThanOrEqual(alpha(stops[i - 1].color));
      expect(stops[i].pos).toBeGreaterThan(stops[i - 1].pos);
    }
  });

  it('as paradas ORIGINAIS do spec ficam anotadas, e o spec.json intocado', () => {
    const bg = TEMPLATE_02_SPEC.layouts[0].background;
    const doSpec = typeof bg === 'object' ? bg.camadas.find((c) => c.tipo === 'gradient')!.stops! : [];
    // O spec.json continua com as quatro paradas originais…
    expect(doSpec.map((s) => s.color)).toEqual([
      'rgba(0,0,0,0.60)',
      'rgba(0,0,0,0.25)',
      'rgba(0,0,0,0.75)',
      'rgba(0,0,0,0.96)',
    ]);
    // …e o ajuste guarda a mesma lista ao lado do valor novo.
    expect(TEMPLATE_02_DESIGN_TWEAKS.scrim.spec.map((s) => s.color)).toEqual(
      doSpec.map((s) => s.color)
    );
  });

  it('o render usa as paradas do ajuste, não as do spec', () => {
    const html = markup(CAPA);
    expect(html).toContain('rgba(0,0,0,0) 0%');
    expect(html).toContain('rgba(0,0,0,0) 50%');
    expect(html).toContain('rgba(0,0,0,1) 100%');
    expect(html).not.toContain('rgba(0,0,0,0.60) 0%');
  });
});

// ── 2. TÍTULO QUE BUGAVA AO AUMENTAR ────────────────────────────

describe('FATIA 5 · 2 — headline não sobrepõe nem invade o CTA', () => {
  it('a linha NÃO tem altura travada', () => {
    // Era a causa do texto sobre texto: com `height` fixo, a linha que o
    // navegador quebrava vazava por cima da linha de baixo.
    const html = markup(CAPA);
    const bloco = html.slice(html.indexOf('data-slot="cover.headline"'));
    const linhas = [...bloco.matchAll(/<div(?: style="([^"]*)")?>/g)].slice(0, 3);
    expect(linhas.length).toBeGreaterThan(0);
    for (const l of linhas) expect(l[1] ?? '').not.toContain('height');
  });

  it('uma linha vazia preserva uma entrelinha sem reintroduzir altura travada', () => {
    // Um div vazio colapsa para 0px. O NBSP mantém a quebra manual visível e a
    // altura continua natural, acompanhando qualquer tamanho escolhido.
    const html = markup({ ...CAPA, 'cover.headline': 'LINHA UM\n\nLINHA TRÊS' });
    expect(html).toContain('<div>LINHA UM</div><div>\u00A0</div><div>LINHA TRÊS</div>');
  });

  it('o bloco pendura pela BASE e cresce para cima', () => {
    // Ancorado pelo topo, ele crescia na direção da pílula de CTA — a 110px
    // sobravam 11.9px medidos no navegador.
    const html = markup(CAPA);
    const style = html.match(/data-slot="cover\.headline" style="([^"]*)"/)![1];
    expect(style).toContain(`bottom:${template02CoverTops(1350).headlineBottom}px`);
    expect(style).not.toMatch(/(^|;)top:/);
  });

  it('a base fica ACIMA da pílula de CTA, com o vão do desenho', () => {
    const { headlineBottom, pill } = template02CoverTops(1350);
    const baseDaHeadline = 1350 - headlineBottom;
    expect(baseDaHeadline).toBeLessThan(pill);
    // 1127 − 1089.18 = 37.8px, o mesmo vão que o spec desenha com 4 linhas.
    expect(pill - baseDaHeadline).toBeCloseTo(37.82, 1);
  });

  it('crescer ou encolher o texto NÃO muda a base', () => {
    // Vale nos dois sentidos: diminuir a fonte também não pode abrir buraco.
    const base = (html: string) =>
      html.match(/data-slot="cover\.headline" style="[^"]*bottom:([\d.]+)px/)![1];
    const uma = markup({ ...CAPA, 'cover.headline': 'UMA LINHA' });
    const seis = markup({ ...CAPA, 'cover.headline': 'A\nB\nC\nD\nE\nF' });
    const grande = markup(CAPA, { 'cover.headline': { fontSize: 110 } });
    expect(base(uma)).toBe(base(seis));
    expect(base(uma)).toBe(base(grande));
  });

  it('com as 4 linhas do spec o topo continua em 755 — fidelidade intacta', () => {
    const t = template02Type('coverHeadline');
    const { headlineBottom } = template02CoverTops(1350);
    expect(1350 - headlineBottom - 4 * t.lineHeight).toBeCloseTo(755, 6);
  });

  it('a coluna dos internos não sobe por cima do cabeçalho', () => {
    // Medido: título a 120px começava em y=47 e o cabeçalho termina em y=62.
    // `safe center` alinha ao topo quando o conteúdo não cabe.
    const html = markup(
      { 'content.title': 'Titulo grande', 'content.body': 'Corpo.' },
      { 'content.title': { fontSize: 120 } },
      2
    );
    const style = html.match(/data-block="content\.column" style="([^"]*)"/)![1];
    expect(style).toContain('justify-content:safe center');
  });
});

// ── 3. LIMITES DE CARACTERE ─────────────────────────────────────

describe('FATIA 5 · 3 — limites medidos na caixa real', () => {
  it('a headline sobe de 17 para 25 — a caixa real é 1080, não 836', () => {
    expect(TEMPLATE_02_SPEC.regrasDeGeracao.limitesDeTexto['cover.headline'].maxCharPorLinha).toBe(17);
    expect(template02Limits('cover.headline').maxCharPorLinha).toBe(25);
  });

  it('a linha de 22 caracteres do Rafael para de ser acusada', () => {
    // "SEM GRITAR EM ANÚNCIOS" — o que ele escreveu e o contador reclamava.
    const d = template02SlotsForModel(1).find((s) => s.slot === 'cover.headline')!;
    expect('SEM GRITAR EM ANÚNCIOS'.length).toBe(22);
    expect(template02Measure(CAPA['cover.headline'], d).over).toBe(false);
  });

  it('título e corpo sobem junto com o orçamento vertical', () => {
    expect(template02Limits('content.title')).toMatchObject({ maxChar: 52, maxLinhas: 4 });
    expect(template02Limits('content.body')).toMatchObject({ maxChar: 300, maxLinhas: 12 });
  });

  it('os limites novos ainda CABEM no container de 1089px', () => {
    // A justificativa dos números, verificável: 4 linhas de título + vão + 12
    // de corpo têm de caber na caixa de conteúdo.
    const titulo = template02Type('slideTitle').lineHeight;
    const corpo = template02Type('slideBody').lineHeight;
    const vao = TEMPLATE_02_SPEC.regrasDeLayout.gapTituloCorpo;
    const alto =
      template02Limits('content.title').maxLinhas! * titulo +
      vao +
      template02Limits('content.body').maxLinhas! * corpo;
    expect(alto).toBeLessThan(TEMPLATE_02_SPEC.tokens.grid.contentHeight);
  });

  it('o spec.json continua com os números originais', () => {
    const L = TEMPLATE_02_SPEC.regrasDeGeracao.limitesDeTexto;
    expect(L['content.title'].maxChar).toBe(40);
    expect(L['content.body'].maxChar).toBe(220);
  });

  it('o addendum da IA pede os limites NOVOS', () => {
    // Pedir 17 à IA e aceitar 25 na barra seria mentir para os dois lados.
    const a = template02Addendum();
    expect(a).toContain('25');
    expect(a).toContain('52');
    expect(a).toContain('300');
    expect(a).toContain('1080px');
    expect(a).not.toContain('17 caracteres POR LINHA');
    expect(a).not.toContain('836px');
  });
});

// ── 4. MARCADOR: VÁRIOS TERMOS + COR ────────────────────────────

describe('FATIA 5 · 4 — marcador com vários termos', () => {
  it('separa os termos por vírgula, tolerando espaço e vírgula sobrando', () => {
    expect(template02HighlightTerms('CLIENTES, SEM GRITAR')).toEqual(['CLIENTES', 'SEM GRITAR']);
    expect(template02HighlightTerms(' A , ,B, ')).toEqual(['A', 'B']);
    expect(template02HighlightTerms('')).toEqual([]);
    expect(template02HighlightTerms(undefined)).toEqual([]);
  });

  it('cada termo vira um marcador', () => {
    const html = markup({ ...CAPA, 'cover.highlight': 'DICAS, CLIENTES, ANÚNCIOS' });
    expect([...html.matchAll(/data-slot="cover\.highlight"/g)]).toHaveLength(3);
    expect(html).toContain('>DICAS</span>');
    expect(html).toContain('>CLIENTES</span>');
    expect(html).toContain('>ANÚNCIOS</span>');
  });

  it('vários termos na MESMA linha funcionam', () => {
    const html = markup({
      ...CAPA,
      'cover.headline': 'QUE TRAZEM CLIENTES',
      'cover.highlight': 'QUE, CLIENTES',
    });
    expect([...html.matchAll(/data-slot="cover\.highlight"/g)]).toHaveLength(2);
    // E o texto entre eles sobrevive inteiro.
    expect(html).toContain('TRAZEM');
  });

  it('cada termo marca só a PRIMEIRA ocorrência', () => {
    // Marcar todas transformaria um termo curto numa tarja em cima de meia frase.
    const parts = template02HighlightParts('A CASA E A CASA', ['CASA']);
    expect(parts.filter((p) => p.marked)).toHaveLength(1);
    expect(parts.map((p) => p.text).join('')).toBe('A CASA E A CASA');
  });

  it('no empate de posição vence o termo mais longo', () => {
    const parts = template02HighlightParts('MARCA FORTE', ['MAR', 'MARCA']);
    expect(parts.find((p) => p.marked)!.text).toBe('MARCA');
  });

  it('nenhum pedaço se perde na quebra', () => {
    for (const termos of [['QUE'], ['QUE', 'CLIENTES'], [], ['INEXISTENTE']]) {
      const parts = template02HighlightParts('QUE TRAZEM CLIENTES', termos);
      expect(parts.map((p) => p.text).join('')).toBe('QUE TRAZEM CLIENTES');
    }
  });

  it('a regra do spec continua valendo POR TERMO: nada cruza duas linhas', () => {
    const headline = 'LINHA UM\nLINHA DOIS';
    expect(template02HighlightLine(headline, 'UM\nLINHA')).toBe(-1);
    expect(template02HighlightLine(headline, 'LINHA DOIS')).toBe(1);
    // Um termo válido e outro atravessando a quebra: só o válido marca.
    const html = markup({ ...CAPA, 'cover.headline': headline, 'cover.highlight': 'LINHA DOIS, UM\nLINHA' });
    expect([...html.matchAll(/data-slot="cover\.highlight"/g)]).toHaveLength(1);
  });

  it('diz QUAIS termos falharam, não que "algo" falhou', () => {
    const faltando = template02MissingHighlightTerms('QUE TRAZEM CLIENTES', 'CLIENTES, SUMIU, TAMBÉM');
    expect(faltando).toEqual(['SUMIU', 'TAMBÉM']);
    expect(template02MissingHighlightTerms('QUE TRAZEM CLIENTES', 'CLIENTES')).toEqual([]);
  });
});

describe('FATIA 5 · 4 — cor do marcador', () => {
  it('sem escolha, é o lime do template', () => {
    expect(TEMPLATE_02_HIGHLIGHT_COLOR).toBe(TEMPLATE_02_COLORS.accent);
    const html = markup({ ...CAPA, 'cover.highlight': 'CLIENTES' });
    expect(html).toContain(`background:${TEMPLATE_02_COLORS.accent}`);
  });

  it('a cor escolhida pinta o marcador', () => {
    const html = markup(
      { ...CAPA, 'cover.highlight': 'CLIENTES' },
      { 'cover.highlight': { background: '#FF0066' } }
    );
    expect(html).toContain('background:#FF0066');
    expect(html).not.toContain(`background:${TEMPLATE_02_COLORS.accent}`);
  });

  it('o texto sobre o marcador NUNCA sai ilegível', () => {
    // Preto sobre marcador escuro era o risco de dar a cor ao usuário.
    for (const bg of ['#E1FF00', '#FFFFFF', '#000000', '#0D39E4', '#FF0066', '#777777']) {
      const cor = template02HighlightTextColor(bg);
      expect([TEMPLATE_02_COLORS.ink, TEMPLATE_02_COLORS.surface]).toContain(cor);
      // Legibilidade de texto grande (WCAG AA para 76px é 3:1); aqui exigimos 4.5.
      expect(template02Contrast(bg, cor), `${bg} → ${cor}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('no lime de fábrica o texto continua PRETO, como no template', () => {
    expect(template02HighlightTextColor(TEMPLATE_02_COLORS.accent)).toBe(TEMPLATE_02_COLORS.ink);
  });

  it('num marcador escuro o texto vira branco sozinho', () => {
    const html = markup(
      { ...CAPA, 'cover.highlight': 'CLIENTES' },
      { 'cover.highlight': { background: '#101010' } }
    );
    expect(html).toContain(`color:${TEMPLATE_02_COLORS.surface}`);
  });

  it('uma cor de texto antiga é ignorada: o contraste continua automático', () => {
    const html = markup(
      { ...CAPA, 'cover.highlight': 'CLIENTES' },
      { 'cover.highlight': { background: '#101010', color: '#FF0000' } }
    );
    expect(html).toContain(`color:${TEMPLATE_02_COLORS.surface}`);
    expect(html).not.toContain('color:#FF0000');
  });

  it('a fonte escolhida é aplicada somente ao trecho marcado', () => {
    const html = markup(
      { ...CAPA, 'cover.highlight': 'CLIENTES' },
      { 'cover.highlight': { font: 'Montserrat' } }
    );
    const marcador = html.slice(html.indexOf('data-slot="cover.highlight"'));
    expect(marcador).toContain("font-family:&#x27;Montserrat&#x27;, sans-serif");
  });

  it('a cor do marcador mora no estilo do slot, não num slot novo', () => {
    // Um `templateSlots['cover.highlightColor']` criaria um segundo lugar para
    // a mesma ideia e misturaria estilo com conteúdo.
    const style: TemplateSlotStyle = { background: '#FF0066' };
    expect(style.background).toBe('#FF0066');
    const slots = { ...CAPA, 'cover.highlight': 'CLIENTES' };
    expect(Object.keys(slots)).not.toContain('cover.highlightColor');
  });

  it('sem gesto nenhum, o render continua idêntico ao de antes do controle', () => {
    expect(markup({ ...CAPA, 'cover.highlight': 'CLIENTES' }, {})).toBe(
      markup({ ...CAPA, 'cover.highlight': 'CLIENTES' })
    );
  });
});
