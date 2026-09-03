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
  function lum(hex: string): number {
    const canal = hex
      .replace('#', '')
      .match(/../g)!
      .map((h) => parseInt(h, 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * canal[0] + 0.7152 * canal[1] + 0.0722 * canal[2];
  }
  const contraste = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };

  it('o topo do degradê e a base dele são visivelmente diferentes', () => {
    // Antes: fundo #000 contra base do scrim #000 = 1.00:1, ou seja, NADA.
    expect(contraste('#000000', '#000000')).toBe(1);
    // Agora há uma rampa de verdade entre o cinza e o preto da base.
    expect(contraste(CINZA, '#000000')).toBeGreaterThan(1.4);
  });

  it('o cabeçalho da capa continua legível sobre o novo fundo', () => {
    // Ele mora no topo, onde o scrim é transparente: é desenhado direto sobre o
    // fundo. Clarear o fundo cobra este preço, e o piso é o 3:1 de texto
    // grande. Se alguém clarear mais o cinza, este teste cai — de propósito.
    expect(contraste(TEMPLATE_02_COLORS.textHeader, CINZA)).toBeGreaterThanOrEqual(3);
  });

  it('a headline branca segue com folga', () => {
    expect(contraste(TEMPLATE_02_COLORS.surface, CINZA)).toBeGreaterThan(7);
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
