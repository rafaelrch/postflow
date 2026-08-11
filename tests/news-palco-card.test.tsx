// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import NewsCardStage, { fitScale } from '@/components/news/NewsCardStage';
import { NEWS_CARD_H, NEWS_CARD_W } from '@/components/news/NewsCardStrip';
import { DEFAULT_STYLE, type NewsCardItem } from '@/components/news/NewsCard';

/**
 * PALCO DO CARD PRINCIPAL — os dois pedidos do Rafael.
 *
 * 1. O preview não pode gerar rolagem. Era escala FIXA (0,38 => 410x513 px)
 *    numa coluna `overflow-y-auto`: em janela baixa o card não cabia e a coluna
 *    do meio ganhava barra. Agora a escala sai da medição da área disponível.
 * 2. As setas saíram de cima do card ("< Card 1 de 10 >") para as LATERAIS.
 */

function item(numero: number): NewsCardItem {
  return {
    ...DEFAULT_STYLE,
    numero,
    tema: 'Tema',
    titulo_card: `Card ${numero}`,
    imagem_url: '',
    legenda: '',
  };
}

function palco(selectedIdx: number, total = 10) {
  const onPrev = vi.fn();
  const onNext = vi.fn();
  render(
    <NewsCardStage
      item={item(selectedIdx + 1)}
      selectedIdx={selectedIdx}
      total={total}
      onPrev={onPrev}
      onNext={onNext}
    />,
  );
  return {
    onPrev,
    onNext,
    anterior: screen.getByRole('button', { name: 'Card anterior' }) as HTMLButtonElement,
    proximo: screen.getByRole('button', { name: 'Próximo card' }) as HTMLButtonElement,
  };
}

afterEach(cleanup);

describe('setas laterais navegam entre os cards', () => {
  it('no meio do deck as duas funcionam', () => {
    const { anterior, proximo, onPrev, onNext } = palco(4);
    expect(anterior.disabled).toBe(false);
    expect(proximo.disabled).toBe(false);

    fireEvent.click(anterior);
    expect(onPrev).toHaveBeenCalledTimes(1);
    fireEvent.click(proximo);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('no PRIMEIRO card a seta de voltar fica desabilitada', () => {
    const { anterior, proximo, onPrev } = palco(0);
    expect(anterior.disabled).toBe(true);
    expect(proximo.disabled).toBe(false);

    fireEvent.click(anterior);
    expect(onPrev).not.toHaveBeenCalled();
  });

  it('no ÚLTIMO card a seta de avançar fica desabilitada', () => {
    const { anterior, proximo, onNext } = palco(9, 10);
    expect(proximo.disabled).toBe(true);
    expect(anterior.disabled).toBe(false);

    fireEvent.click(proximo);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('com um único card as duas ficam desabilitadas', () => {
    const { anterior, proximo } = palco(0, 1);
    expect(anterior.disabled).toBe(true);
    expect(proximo.disabled).toBe(true);
  });

  it('o contador "Card N de M" saiu de cima do card', () => {
    palco(2);
    expect(screen.queryByText(/Card 3 de 10/)).toBeNull();
  });
});

describe('o card cabe na altura disponível, sem rolagem', () => {
  it('a altura é o limite quando a caixa é baixa e larga', () => {
    // 900x400: pela largura caberia 0,833; pela altura só 0,296. Vence a altura.
    expect(fitScale(900, 400)).toBeCloseTo(400 / NEWS_CARD_H, 6);
  });

  it('a largura é o limite quando a caixa é estreita e alta', () => {
    expect(fitScale(300, 2000)).toBeCloseTo(300 / NEWS_CARD_W, 6);
  });

  it('o card escalado nunca ultrapassa a caixa — é a definição de caber', () => {
    for (const [w, h] of [[900, 400], [300, 2000], [412, 515], [1600, 900], [200, 180]]) {
      const s = fitScale(w, h);
      expect(NEWS_CARD_W * s).toBeLessThanOrEqual(w + 1e-6);
      expect(NEWS_CARD_H * s).toBeLessThanOrEqual(h + 1e-6);
    }
  });

  it('a proporção do card é preservada em qualquer caixa', () => {
    for (const [w, h] of [[900, 400], [300, 2000], [1600, 900]]) {
      const s = fitScale(w, h);
      expect((NEWS_CARD_W * s) / (NEWS_CARD_H * s)).toBeCloseTo(NEWS_CARD_W / NEWS_CARD_H, 6);
    }
  });

  it('janela baixa encolhe o card em vez de estourar — era o caso do screenshot', () => {
    // Área útil de ~420 px de altura: a escala fixa de 0,38 pedia 513 px.
    const s = fitScale(700, 420);
    expect(NEWS_CARD_H * 0.38).toBeGreaterThan(420);   // o que acontecia antes
    expect(NEWS_CARD_H * s).toBeLessThanOrEqual(420);  // o que acontece agora
  });

  it('caixa ainda não medida não renderiza card com escala zero', () => {
    expect(fitScale(0, 0)).toBe(0);
    expect(fitScale(500, 0)).toBe(0);
    // No jsdom clientWidth/clientHeight são 0, então o preview nem entra no DOM.
    palco(0);
    expect(screen.queryByTestId('news-card-preview')).toBeNull();
  });
});
