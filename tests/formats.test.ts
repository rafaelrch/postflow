import { describe, expect, it } from 'vitest';
import { FORMATS, FORMAT_LIST, DEFAULT_FORMAT, getFormat } from '../lib/formats';
import { getImageLayerStyle } from '../lib/utils';

describe('lib/formats', () => {
  it('todos os formatos compartilham a largura 1080 (só a altura muda)', () => {
    for (const f of FORMAT_LIST) {
      expect(f.width).toBe(1080);
    }
  });

  it('dimensões aprovadas: 4:5=1080x1350, 1:1=1080x1080, 9:16=1080x1920', () => {
    expect(FORMATS['4:5']).toMatchObject({ width: 1080, height: 1350 });
    expect(FORMATS['1:1']).toMatchObject({ width: 1080, height: 1080 });
    expect(FORMATS['9:16']).toMatchObject({ width: 1080, height: 1920 });
  });

  it('o padrão/legado é 4:5', () => {
    expect(DEFAULT_FORMAT).toBe('4:5');
    expect(getFormat(DEFAULT_FORMAT).height).toBe(1350);
  });

  it('projeto antigo sem formato (undefined/null) cai em 4:5, nunca deforma', () => {
    expect(getFormat(undefined).id).toBe('4:5');
    expect(getFormat(null).id).toBe('4:5');
    expect(getFormat(undefined).height).toBe(1350);
  });

  it('valor inválido também cai no fallback 4:5', () => {
    // @ts-expect-error — força um valor fora do union pra provar o fallback
    expect(getFormat('16:9').id).toBe('4:5');
  });

  it('resolve cada formato válido corretamente', () => {
    expect(getFormat('1:1').height).toBe(1080);
    expect(getFormat('9:16').height).toBe(1920);
  });

  it('aspectRatio bate com width/height', () => {
    for (const f of FORMAT_LIST) {
      expect(f.aspectRatio).toBeCloseTo(f.width / f.height, 5);
    }
  });
});

describe('zoom das imagens', () => {
  it('parte de cover em 100% e aplica o zoom como escala relativa', () => {
    expect(getImageLayerStyle({ x: 25, y: 75, zoom: 100 })).toMatchObject({
      backgroundSize: 'cover',
      backgroundPosition: '25% 75%',
      transform: 'scale(1)',
    });
    expect(getImageLayerStyle({ x: 25, y: 75, zoom: 175 })).toMatchObject({
      backgroundSize: 'cover',
      backgroundPosition: '25% 75%',
      transform: 'scale(1.75)',
    });
  });
});
