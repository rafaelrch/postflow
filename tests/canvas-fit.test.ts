import { describe, it, expect } from 'vitest';
import { fitCard } from '@/lib/canvas-fit';
import { getFormat } from '@/lib/formats';

/**
 * A faixa do editor era fit-to-height puro. Funcionava por sorte: a janela
 * costuma ser mais larga que alta. Com a barra lateral em 300px e uma janela
 * estreita e alta, o card passava da área e escapava horizontalmente.
 *
 * Estes testes travam as duas metades: a altura continua mandando quando cabe,
 * e a largura vira teto quando não cabe — sem nunca deformar o card.
 */

const F45 = getFormat('4:5');
const F11 = getFormat('1:1');
const F916 = getFormat('9:16');

/** Área útil real: janela menos barra lateral (300) e os respiros da faixa. */
function area(winW: number, winH: number) {
  return { w: winW - 300 - 64, h: winH - 90 - 56 };
}

describe('fitCard', () => {
  it('mantém a proporção do formato em qualquer situação', () => {
    for (const f of [F45, F11, F916]) {
      for (const [w, h] of [[1500, 800], [400, 900], [900, 900], [120, 2000]]) {
        const { cardW, cardH } = fitCard(w, h, f);
        expect(cardW / cardH).toBeCloseTo(f.width / f.height, 2);
      }
    }
  });

  it('nunca estoura a área — nem em largura nem em altura', () => {
    for (const f of [F45, F11, F916]) {
      for (const [w, h] of [[1500, 800], [400, 900], [900, 900], [640, 1400]]) {
        const { cardW, cardH } = fitCard(w, h, f);
        expect(cardW).toBeLessThanOrEqual(w + 1);
        expect(cardH).toBeLessThanOrEqual(h + 1);
      }
    }
  });

  it('em janela larga a altura manda — o card preenche a altura disponível', () => {
    const a = area(1908, 897);
    for (const f of [F45, F11, F916]) {
      expect(fitCard(a.w, a.h, f).cardH).toBe(a.h);
    }
  });

  it('em janela estreita e alta o teto de largura entra — e antes dele o card estourava', () => {
    const a = area(1000, 1000); // área útil ≈ 636 × 854
    const { cardW } = fitCard(a.w, a.h, F11);
    const semTeto = Math.round(F11.width * (a.h / F11.height)); // fórmula antiga
    expect(semTeto).toBeGreaterThan(a.w); // o bug que o teto resolve
    expect(cardW).toBeLessThanOrEqual(a.w);
    expect(cardW).toBe(a.w);
  });

  it('9:16 é o formato que mais sobra em largura — o teto quase nunca o pega', () => {
    const a = area(1000, 1000);
    expect(fitCard(a.w, a.h, F916).cardH).toBe(a.h); // altura ainda manda
  });

  it('antes da primeira medição devolve o palpite histórico de 0.4', () => {
    expect(fitCard(0, 0, F45).scale).toBe(0.4);
  });
});
