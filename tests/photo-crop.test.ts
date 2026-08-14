import { describe, expect, it } from 'vitest';
import {
  IDENTITY_CROP,
  clampOffset,
  coverScale,
  cropGeometry,
  targetCornersInImageSpace,
  type CropState,
} from '../lib/photo-crop';

/**
 * O bug que estes testes existem para impedir: prévia e exportação eram dois
 * modelos diferentes (CSS transform x aritmética de canvas). Enquanto só havia
 * zoom e rotação centrados eles quase batiam; com arrastar, qualquer diferença
 * vira "arrastei aqui e saiu cortado diferente".
 *
 * Então há duas famílias aqui:
 *  A) PARIDADE — o mesmo estado enquadra igual em qualquer lado de quadrado.
 *  B) CLAMP — nenhum deslocamento, por mais extremo, deixa canto do quadrado
 *     fora da imagem (= área vazia dentro do círculo).
 */

const PREVIEW = 176;
const EXPORT = 640;

/** Retratos, paisagens e quadrada — o clamp é assimétrico por eixo. */
const SIZES: [number, number][] = [
  [1200, 800],
  [800, 1200],
  [1000, 1000],
  [4032, 3024],
  [640, 641],
];

const ROTATIONS = [0, 15, 45, 90, 137, 180, 270, 359];
const ZOOMS = [1, 1.2, 2, 3];

describe('geometria do recorte — paridade prévia x exportação', () => {
  it('o mesmo estado produz o mesmo enquadramento nos dois tamanhos', () => {
    const state: CropState = { zoom: 1.6, rotation: 32, offsetX: 0.08, offsetY: -0.12 };
    for (const [w, h] of SIZES) {
      const preview = cropGeometry(state, w, h, PREVIEW);
      const exported = cropGeometry(state, w, h, EXPORT);

      // Normalizado pelo lado do quadrado, tudo tem que coincidir: é isso que
      // significa "o que se vê é o que sai".
      expect(preview.translateX / PREVIEW).toBeCloseTo(exported.translateX / EXPORT, 12);
      expect(preview.translateY / PREVIEW).toBeCloseTo(exported.translateY / EXPORT, 12);
      expect(preview.drawWidth / PREVIEW).toBeCloseTo(exported.drawWidth / EXPORT, 12);
      expect(preview.drawHeight / PREVIEW).toBeCloseTo(exported.drawHeight / EXPORT, 12);
      expect(preview.rotationRad).toBe(exported.rotationRad);
      expect(preview.offsetX).toBeCloseTo(exported.offsetX, 12);
    }
  });

  it('o recorte visto pela prévia e pelo export cobre a MESMA região da imagem', () => {
    const state: CropState = { zoom: 2.1, rotation: 200, offsetX: -0.3, offsetY: 0.22 };
    for (const [w, h] of SIZES) {
      const a = targetCornersInImageSpace(state, w, h, PREVIEW);
      const b = targetCornersInImageSpace(state, w, h, EXPORT);
      a.forEach((corner, i) => {
        expect(corner.x).toBeCloseTo(b[i].x, 12);
        expect(corner.y).toBeCloseTo(b[i].y, 12);
      });
    }
  });

  it('sem zoom, sem rotação e sem offset a escala é o cover clássico', () => {
    // Trava a compatibilidade com o enquadramento de antes desta mudança:
    // quem já tinha foto não vê o recorte padrão mudar.
    for (const [w, h] of SIZES) {
      const scale = coverScale(w, h, 0, 1) * EXPORT;
      expect(scale).toBeCloseTo(Math.max(EXPORT / w, EXPORT / h), 10);
    }
  });
});

describe('clamp do arrastar — nunca abre área vazia', () => {
  /** |x|,|y| <= 1 em unidades de meia-imagem = canto dentro da imagem. */
  const dentro = (corner: { x: number; y: number }) =>
    Math.abs(corner.x) <= 1 + 1e-9 && Math.abs(corner.y) <= 1 + 1e-9;

  it('offset extremo em qualquer direção continua com o quadrado coberto', () => {
    const extremos = [
      [10, 0], [-10, 0], [0, 10], [0, -10],
      [7, 7], [-7, 7], [7, -7], [-7, -7],
      [0.5, -0.9],
    ];
    const falhas: string[] = [];

    for (const [w, h] of SIZES) {
      for (const rotation of ROTATIONS) {
        for (const zoom of ZOOMS) {
          for (const [ox, oy] of extremos) {
            const bruto: CropState = { zoom, rotation, offsetX: ox, offsetY: oy };
            const cantos = targetCornersInImageSpace(bruto, w, h, EXPORT);
            const fora = cantos.filter((c) => !dentro(c));
            if (fora.length) {
              falhas.push(
                `${w}x${h} rot=${rotation} zoom=${zoom} offset=(${ox},${oy}) → ` +
                  fora.map((c) => `(${c.x.toFixed(3)}, ${c.y.toFixed(3)})`).join(' '),
              );
            }
          }
        }
      }
    }

    expect(falhas, `canto do quadrado fora da imagem = buraco branco no círculo:\n${falhas.join('\n')}`).toEqual([]);
  });

  it('zoom 1 e sem rotação prende no centro (não há folga para arrastar)', () => {
    const preso = clampOffset({ ...IDENTITY_CROP, offsetX: 5, offsetY: -5 }, 1000, 1000, );
    expect(preso.offsetX).toBeCloseTo(0, 12);
    expect(preso.offsetY).toBeCloseTo(0, 12);
  });

  it('numa paisagem sem rotação sobra folga na horizontal, não na vertical', () => {
    // 1200x800 com zoom 1: a altura encaixa exato, a largura sobra.
    const solto = clampOffset({ ...IDENTITY_CROP, offsetX: 5, offsetY: 5 }, 1200, 800);
    expect(solto.offsetX).toBeGreaterThan(0.2);
    expect(solto.offsetY).toBeCloseTo(0, 12);
  });

  it('deslocamento pequeno passa intacto — o clamp não "puxa" o arraste', () => {
    const state: CropState = { zoom: 2, rotation: 0, offsetX: 0.05, offsetY: -0.05 };
    const resultado = clampOffset(state, 1000, 1000);
    expect(resultado.offsetX).toBeCloseTo(0.05, 12);
    expect(resultado.offsetY).toBeCloseTo(-0.05, 12);
  });

  it('o clamp é idempotente (aplicar duas vezes não move mais nada)', () => {
    for (const [w, h] of SIZES) {
      for (const rotation of ROTATIONS) {
        const uma = clampOffset({ zoom: 1.4, rotation, offsetX: 9, offsetY: -4 }, w, h);
        const duas = clampOffset({ zoom: 1.4, rotation, ...uma }, w, h);
        expect(duas.offsetX).toBeCloseTo(uma.offsetX, 12);
        expect(duas.offsetY).toBeCloseTo(uma.offsetY, 12);
      }
    }
  });

  it('imagem sem dimensão não explode nem gera NaN', () => {
    expect(clampOffset({ ...IDENTITY_CROP, offsetX: 1 }, 0, 0)).toEqual({ offsetX: 0, offsetY: 0 });
    const geometry = cropGeometry(IDENTITY_CROP, 0, 0, EXPORT);
    expect(Number.isNaN(geometry.drawWidth)).toBe(false);
  });
});
