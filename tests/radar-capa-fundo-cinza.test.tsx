// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import Template02Slide from '@/components/slides/Template02Slide';
import {
  TEMPLATE_02_COLORS,
  TEMPLATE_02_DESIGN_TWEAKS,
  template02Background,
} from '@/lib/templates/template-02';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, type Slide } from '@/types';

/**
 * FUNDO DA CAPA DO RADAR — cinza, para o degradê aparecer.
 *
 * Pedido do Rafael (02/09/2026): *"hoje o fundo da capa está totalmente preto e
 * a pessoa não consegue ver o degradê. Ao invés de preto, quero cinza. Aí na
 * capa vai ser o fundo cinza, por cima o degradê padrão, depois os textos."*
 *
 * O QUE A MEDIÇÃO MOSTROU:
 *  · o preto vinha de `template02Background(1)` = `tokens.color.ink` (#000000),
 *    o fundo CHAPADO do slide;
 *  · o scrim (o "degradê padrão") é uma camada à parte, SEMPRE pintada, que vai
 *    de transparente até PRETO SÓLIDO na base. Sobre fundo preto ele existia e
 *    era invisível — o próprio componente já documentava isso;
 *  · com FOTO o problema não aparecia: a imagem entra entre o fundo e o scrim.
 *    A queixa vale para a capa SEM foto, que é um retângulo preto liso.
 *
 * A ordem de camadas que o Rafael descreveu já era a do código. O que mudou foi
 * só o fundo — o degradê e os textos não foram tocados.
 */

/**
 * Lido com `?.`: sem o tweak, o arquivo tem de FALHAR NOS TESTES, e não estourar
 * na carga. Um suite que nem abre não diz quantos casos o conserto sustenta.
 */
const CINZA =
  (TEMPLATE_02_DESIGN_TWEAKS as { coverBackground?: { value: string } }).coverBackground?.value ??
  '';

function capa(extra: Partial<Slide> = {}, slots: Record<string, string> = {}): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: 'capa',
    position: 0,
    templateModel: 1,
    templateSlots: { 'cover.headline': 'TITULO DA CAPA', ...slots },
    ...extra,
  } as Slide;
}

function desenha(slide: Slide, slideIndex = 0) {
  const { container } = render(
    <Template02Slide
      slide={slide}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      slideIndex={slideIndex}
      totalSlides={5}
    />,
  );
  return {
    raiz: container.querySelector('div') as HTMLElement,
    scrim: container.querySelector('[data-slot="cover.scrim"]') as HTMLElement | null,
    imagem: container.querySelector('[data-slot="cover.image"]') as HTMLElement | null,
    headline: container.querySelector('[data-slot="cover.headline"]') as HTMLElement | null,
  };
}

/** '#2E2E2E' → 'rgb(46, 46, 46)', que é como o jsdom serializa o style inline. */
function rgbDe(hex: string): string {
  const [r, g, b] = hex.replace('#', '').match(/../g)!.map((h) => parseInt(h, 16));
  return `rgb(${r}, ${g}, ${b})`;
}

afterEach(cleanup);

describe('a capa não é mais preta', () => {
  it('o fundo chapado da capa é o cinza do tweak, não #000000', () => {
    // A cor foi ESCOLHIDA pelo Rafael em 03/09/2026 (antes era #2E2E2E). Está
    // travada no valor exato porque é ordem dele, não um número derivado.
    expect(CINZA).toBe('#B5B5B5');
    expect(template02Background(1)).toBe(CINZA);
    expect(template02Background(1)).not.toBe('#000000');
    expect(template02Background(1)).not.toBe(TEMPLATE_02_COLORS.ink);
  });

  it('o cinza está registrado como desvio, com o valor do spec ao lado', () => {
    // O padrão da casa: o spec.json é a régua e não se edita; o desvio mora no
    // tweak, com o original anotado. Sem isso, ninguém saberia do que se desviou.
    const tweak = (
      TEMPLATE_02_DESIGN_TWEAKS as { coverBackground?: { spec: string; motivo: string } }
    ).coverBackground;
    expect(tweak, 'o desvio do fundo da capa não está registrado').toBeTruthy();
    expect(tweak!.spec).toBe('#000000');
    expect(tweak!.motivo).toMatch(/Rafael/);
    // O motivo carrega o custo medido, não só a autoria do pedido.
    expect(tweak!.motivo).toMatch(/2\.19:1/);
  });

  it('o slide desenhado sai com o fundo cinza', () => {
    expect(desenha(capa()).raiz.style.background).toBe(rgbDe(CINZA));
  });

  it('os slides INTERNOS não mudaram — continuam no creme do spec', () => {
    // O pedido era só a capa.
    expect(template02Background(2)).toBe(TEMPLATE_02_COLORS.paper);
    expect(template02Background(3)).toBe(TEMPLATE_02_COLORS.paper);
  });
});

describe('a ordem das camadas: fundo → degradê → textos', () => {
  it('o degradê continua sendo pintado por cima do fundo', () => {
    const { scrim } = desenha(capa());

    expect(scrim, 'o degradê da capa sumiu').not.toBeNull();
    expect(scrim!.style.background).toContain('linear-gradient');
    // Ele termina em preto sólido na base — é essa ponta que só se vê agora.
    expect(scrim!.style.background).toContain('rgb(0, 0, 0)');
  });

  it('o degradê fica ACIMA do fundo e ABAIXO do texto', () => {
    const { scrim, headline } = desenha(capa());

    expect(Number(scrim!.style.zIndex)).toBe(1);
    expect(Number(headline!.style.zIndex)).toBeGreaterThan(Number(scrim!.style.zIndex));
  });

  it('com foto, a imagem fica ENTRE o fundo e o degradê', () => {
    const { imagem, scrim } = desenha(capa({}, { 'cover.image': 'https://x/foto.jpg' }));

    expect(imagem).not.toBeNull();
    expect(Number(imagem!.style.zIndex)).toBeLessThan(Number(scrim!.style.zIndex));
  });
});

describe('dá para ver o degradê — o critério de aceite de verdade', () => {
  /** Luminância relativa (WCAG). */
  function lum(rgb: number[]): number {
    const canal = rgb
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * canal[0] + 0.7152 * canal[1] + 0.0722 * canal[2];
  }
  const rgbHex = (hex: string) => hex.replace('#', '').match(/../g)!.map((h) => parseInt(h, 16));
  const contraste = (a: string | number[], b: string | number[]) => {
    const par = [a, b].map((c) => lum(typeof c === 'string' ? rgbHex(c) : c));
    const [x, y] = par.sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };

  /**
   * O scrim composto sobre o fundo, na altura `p` (0 = topo, 1 = base).
   *
   * As paradas são as do tweak (`scrim.stops`): transparente até 50%, 45% em
   * 78%, preto sólido na base. Medir a cor do TEXTO contra o hex do fundo puro
   * mentiria: quem está atrás do texto é o fundo JÁ escurecido pelo scrim.
   */
  function fundoComScrim(hex: string, p: number): number[] {
    const stops = TEMPLATE_02_DESIGN_TWEAKS.scrim.stops.map((s) => ({
      pos: s.pos,
      alpha: Number(s.color.match(/,\s*([\d.]+)\)$/)?.[1] ?? 1),
    }));
    let alpha = stops[stops.length - 1].alpha;
    for (let i = 1; i < stops.length; i++) {
      if (p <= stops[i].pos) {
        const a = stops[i - 1];
        const b = stops[i];
        alpha = a.alpha + ((b.alpha - a.alpha) * (p - a.pos)) / (b.pos - a.pos);
        break;
      }
    }
    return rgbHex(hex).map((v) => Math.round(v * (1 - alpha)));
  }

  it('o topo do degradê e a base dele são visivelmente diferentes', () => {
    // Antes: fundo #000 contra base do scrim #000 = 1.00:1, ou seja, NADA.
    expect(contraste('#000000', '#000000')).toBe(1);
    // Com o #B5B5B5 a rampa deixou de ser sutil: 10.24:1 entre o fundo e a base.
    expect(contraste(CINZA, '#000000')).toBeGreaterThan(10);
  });

  /**
   * 🔴 OS DOIS TESTES ABAIXO REGISTRAM UMA PERDA ACEITA, NÃO UM ALVO.
   *
   * O Rafael escolheu o `#B5B5B5` em 03/09/2026 sabendo do custo — os números
   * foram calculados e comunicados ANTES da troca. Eles ficam travados aqui
   * para que ninguém "conserte" o fundo achando que é bug: se um dia alguém
   * quiser o contraste de volta, o caminho é mudar a COR DO TEXTO, não o fundo,
   * e a conversa é com ele.
   */
  it('CUSTO ACEITO: o cabeçalho da capa não cumpre mais o piso de 3:1', () => {
    // Ele mora em headerY = 44, na metade limpa do scrim: é desenhado direto
    // sobre o fundo. 3.03:1 sobre o #2E2E2E antigo → 2.19:1 sobre o #B5B5B5.
    const atras = fundoComScrim(CINZA, 44 / 1350);
    const medido = contraste(TEMPLATE_02_COLORS.textHeader, atras);
    expect(medido).toBeLessThan(3);
    expect(medido).toBeCloseTo(2.19, 1);
    // A saída, se ele quiser o contraste de volta, é escurecer o CABEÇALHO:
    // #606069 é a cor mais clara que passa preservando a matiz, e #4A4A52 sobra.
    expect(contraste('#606069', atras)).toBeGreaterThanOrEqual(3);
    expect(contraste('#4A4A52', atras)).toBeGreaterThan(4);
  });

  it('CUSTO ACEITO: o TOPO da headline branca também cai abaixo de 3:1', () => {
    // Achado que o pedido não previa: a headline pendura pela base a partir de
    // y=755 (55.9%), onde o scrim ainda está quase transparente. O topo do bloco
    // cai de 14.35:1 para 2.49:1 — a base dele, mais fundo no degradê, segura.
    const topo = contraste(TEMPLATE_02_COLORS.surface, fundoComScrim(CINZA, 755 / 1350));
    expect(topo).toBeLessThan(3);
    expect(topo).toBeCloseTo(2.49, 1);

    const base = contraste(TEMPLATE_02_COLORS.surface, fundoComScrim(CINZA, 1089 / 1350));
    expect(base).toBeGreaterThan(7);
  });
});

describe('carrossel já salvo não muda de forma inesperada', () => {
  it('cor de fundo gravada no slide continua vencendo o padrão', () => {
    const salvo = capa({
      backgroundColor: '#123456',
      templateOverrides: { background: true },
    } as Partial<Slide>);

    expect(desenha(salvo).raiz.style.background).toBe('rgb(18, 52, 86)');
  });

  it('sem marca de fundo própria, o slide salvo adota o cinza novo', () => {
    // É o comportamento esperado: quem nunca escolheu cor segue o template, e o
    // template mudou. Só quem escolheu é que fica onde estava.
    expect(desenha(capa()).raiz.style.background).toBe(rgbDe(CINZA));
  });
});
