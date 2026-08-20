import { describe, it, expect } from 'vitest';
import { getImageLayerStyle, MIN_IMAGE_ZOOM } from '@/lib/utils';

/**
 * OS SLIDERS DE POSIÇÃO E ZOOM — dois bugs achados pelo Rafael testando.
 *
 * 1. O slider X não fazia nada. `background-position` em porcentagem só desloca
 *    no eixo em que a imagem TRANSBORDA a caixa; com `cover` e uma imagem mais
 *    estreita que o slot (1024x1536 numa moldura 1080x1350 — toda imagem
 *    gerada), o transbordo é só vertical e a folga horizontal é zero.
 * 2. Zoom < 100 encolhia a CAMADA em vez do conteúdo, e o fundo do slide
 *    aparecia atrás dela.
 *
 * A correção é em CSS puro, sem medir a imagem, porque este mesmo estilo
 * alimenta o html-to-image da exportação. Estes testes travam as duas
 * propriedades que fazem a solução ser correta: a camada SEMPRE cobre o slot, e
 * o curso do x/y é limitado exatamente à folga que o zoom criou.
 */

/** `scale(k) translate(tx%, ty%)` → os três números. */
function parse(transform: string): { k: number; tx: number; ty: number } {
  const m = transform.match(
    /^scale\(([\d.]+)\) translate\((-?[\d.]+)%, (-?[\d.]+)%\)$/
  );
  if (!m) throw new Error(`transform fora do formato esperado: ${transform}`);
  return { k: parseFloat(m[1]), tx: parseFloat(m[2]), ty: parseFloat(m[3]) };
}

/**
 * A borda da camada, em frações da largura do slot, depois de escalar e
 * transladar. Cobrir o slot = esquerda <= 0 e direita >= 1.
 *
 * `scale(k) translate(t)` desloca `k·t` na tela, e o `scale` é em torno do
 * centro: a camada vai de `-(k-1)/2` a `1 + (k-1)/2` antes do deslocamento.
 */
function bordas(transform: string, eixo: 'x' | 'y') {
  const { k, tx, ty } = parse(transform);
  const t = (eixo === 'x' ? tx : ty) / 100;
  const desloca = k * t;
  const sobra = (k - 1) / 2;
  return { inicio: -sobra + desloca, fim: 1 + sobra + desloca };
}

const EXTREMOS = [0, 25, 50, 75, 100];

describe('a camada cobre o slot inteiro, sempre', () => {
  it('zoom 100: a camada é exatamente o slot', () => {
    const { k, tx, ty } = parse(getImageLayerStyle({ x: 50, y: 50, zoom: 100 }).transform as string);
    expect(k).toBe(1);
    expect(tx).toBe(0);
    expect(ty).toBe(0);
  });

  it('em qualquer combinação de x, y e zoom não sobra fundo aparecendo', () => {
    // É a propriedade que o bug 2 violava. Uma folga de arredondamento de 1e-9
    // é tolerada; um buraco visível, não.
    for (const zoom of [100, 101, 125, 175, 300]) {
      for (const x of EXTREMOS) {
        for (const y of EXTREMOS) {
          const t = getImageLayerStyle({ x, y, zoom }).transform as string;
          for (const eixo of ['x', 'y'] as const) {
            const { inicio, fim } = bordas(t, eixo);
            expect(inicio, `${eixo} início em zoom ${zoom} x${x} y${y}`).toBeLessThanOrEqual(1e-9);
            expect(fim, `${eixo} fim em zoom ${zoom} x${x} y${y}`).toBeGreaterThanOrEqual(1 - 1e-9);
          }
        }
      }
    }
  });

  it('x e y extremos encostam na borda e param — não passam dela', () => {
    // "Nunca dá para arrastar além da borda da imagem e revelar vazio."
    const emX0 = bordas(getImageLayerStyle({ x: 0, y: 50, zoom: 200 }).transform as string, 'x');
    expect(emX0.inicio).toBeCloseTo(0, 9);

    const emX100 = bordas(getImageLayerStyle({ x: 100, y: 50, zoom: 200 }).transform as string, 'x');
    expect(emX100.fim).toBeCloseTo(1, 9);
  });

  it('valores fora da faixa são grampeados, não extrapolados', () => {
    // Dado salvo torto não pode abrir buraco no render.
    const t = getImageLayerStyle({ x: -80, y: 900, zoom: 200 }).transform as string;
    expect(bordas(t, 'x').inicio).toBeCloseTo(0, 9);
    expect(bordas(t, 'y').fim).toBeCloseTo(1, 9);
  });
});

describe('zoom > 100 dá folga nos DOIS eixos, e o x/y a percorre', () => {
  it('o X finalmente anda — era o bug 1', () => {
    const esquerda = parse(getImageLayerStyle({ x: 0, y: 50, zoom: 200 }).transform as string).tx;
    const centro = parse(getImageLayerStyle({ x: 50, y: 50, zoom: 200 }).transform as string).tx;
    const direita = parse(getImageLayerStyle({ x: 100, y: 50, zoom: 200 }).transform as string).tx;

    expect(centro).toBe(0);
    expect(esquerda).toBeGreaterThan(0);
    expect(direita).toBeLessThan(0);
    // x menor mostra a parte esquerda da imagem: a camada anda para a direita.
    expect(esquerda).toBeCloseTo(-direita, 9);
  });

  it('o Y anda igual, e os dois eixos têm o mesmo curso', () => {
    const t = getImageLayerStyle({ x: 0, y: 0, zoom: 150 }).transform as string;
    const { tx, ty } = parse(t);
    expect(ty).toBeGreaterThan(0);
    expect(tx).toBeCloseTo(ty, 9);
  });

  it('quanto maior o zoom, maior o curso disponível', () => {
    const curso = (zoom: number) =>
      parse(getImageLayerStyle({ x: 0, y: 50, zoom }).transform as string).tx;
    expect(curso(300)).toBeGreaterThan(curso(150));
    expect(curso(150)).toBeGreaterThan(curso(101));
  });

  it('em zoom 100 o curso do translate é zero — e isso é o CORRETO', () => {
    // Aqui a única folga é a natural do `cover`, que depende da proporção do
    // arquivo e é o `background-position` quem aproveita. Saber qual eixo tem
    // folga exigiria medir a imagem, o que quebraria a exportação.
    const t = getImageLayerStyle({ x: 0, y: 100, zoom: 100 }).transform as string;
    expect(parse(t)).toMatchObject({ k: 1, tx: 0, ty: 0 });
    expect(getImageLayerStyle({ x: 0, y: 100, zoom: 100 }).backgroundPosition).toBe('0% 100%');
  });
});

describe('zoom salvo abaixo de 100', () => {
  it('é normalizado na leitura, sem migration', () => {
    // Existe em carrossel de usuário: não pode quebrar o render nem sumir.
    for (const zoom of [10, 50, 99]) {
      expect(parse(getImageLayerStyle({ x: 50, y: 50, zoom }).transform as string).k).toBe(1);
    }
  });

  it('o piso exportado é o mesmo que o render aplica', () => {
    // Se o slider e o render discordarem, o usuário vê um número que a tela não
    // obedece — que é como o bug 2 se manifestava.
    expect(MIN_IMAGE_ZOOM).toBe(100);
    expect(parse(getImageLayerStyle({ zoom: MIN_IMAGE_ZOOM - 40 }).transform as string).k).toBe(1);
  });

  it('nem por isso a camada deixa de cobrir', () => {
    const t = getImageLayerStyle({ x: 0, y: 0, zoom: 20 }).transform as string;
    expect(bordas(t, 'x').inicio).toBeLessThanOrEqual(0);
    expect(bordas(t, 'y').fim).toBeGreaterThanOrEqual(1);
  });
});

describe('objectFit contain não regride', () => {
  it('continua usando contain, com posição e zoom iguais ao cover', () => {
    const contain = getImageLayerStyle({ x: 25, y: 75, zoom: 150, objectFit: 'contain' });
    const cover = getImageLayerStyle({ x: 25, y: 75, zoom: 150, objectFit: 'cover' });

    expect(contain.backgroundSize).toBe('contain');
    expect(cover.backgroundSize).toBe('cover');
    expect(contain.backgroundPosition).toBe(cover.backgroundPosition);
    expect(contain.transform).toBe(cover.transform);
  });

  it('sem objectFit o padrão continua sendo cover', () => {
    expect(getImageLayerStyle({ x: 50, y: 50, zoom: 100 }).backgroundSize).toBe('cover');
    expect(getImageLayerStyle(null).backgroundSize).toBe('cover');
    expect(getImageLayerStyle().backgroundRepeat).toBe('no-repeat');
  });

  it('sem posição nenhuma, o padrão é o centro em zoom 1', () => {
    expect(getImageLayerStyle(null)).toMatchObject({
      backgroundPosition: '50% 50%',
      transform: 'scale(1) translate(0%, 0%)',
    });
  });
});
