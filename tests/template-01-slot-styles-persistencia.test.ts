import { describe, it, expect } from 'vitest';
import { mapDbSlideToSlide, mapSlideToDbRow } from '@/lib/slide-mapper';
import { DEFAULT_SLIDE, Slide, Template01SlotStyle } from '@/types';

/**
 * O estilo por SLOT do TEMPLATE 1 sobrevive ao save/reload.
 *
 * Antes destes testes a barra lateral escrevia `templateSlotStyles` no slide,
 * o `slide-mapper` não conhecia o campo e o autosave o descartava em silêncio:
 * o carrossel dizia "salvo" e ao reabrir o estilo por bloco tinha sumido.
 */

const styles: Record<string, Template01SlotStyle> = {
  's2.body': { color: '#FF0000', fontSize: 40, letterSpacing: 0.02 },
  's5.left.title': { font: 'IvyOra Text Medium', underline: true },
};

function slide(patch: Partial<Slide>): Slide {
  return { ...DEFAULT_SLIDE, id: 's1', position: 0, ...patch } as Slide;
}

describe('templateSlotStyles — persistência', () => {
  it('vai para a coluna template_slot_styles ao salvar', () => {
    const row = mapSlideToDbRow(slide({ templateSlotStyles: styles }), 'c1', 0);
    expect(row.template_slot_styles).toEqual(styles);
  });

  it('volta do banco intacto ao carregar', () => {
    const back = mapDbSlideToSlide({ id: 's1', position: 0, template_slot_styles: styles });
    expect(back.templateSlotStyles).toEqual(styles);
  });

  it('faz round-trip sem perder nem inventar chave', () => {
    const original = slide({ templateSlotStyles: styles });
    const row = mapSlideToDbRow(original, 'c1', 0);
    const back = mapDbSlideToSlide({ ...row, id: original.id });
    expect(back.templateSlotStyles).toEqual(original.templateSlotStyles);
  });

  it('slide sem estilo por slot não escreve a chave — autosave dos outros estilos não depende da migração', () => {
    const row = mapSlideToDbRow(slide({}), 'c1', 0);
    expect('template_slot_styles' in row).toBe(false);
  });

  it('deck salvo antes da coluna reabre como "segue o spec", não como objeto vazio', () => {
    const back = mapDbSlideToSlide({ id: 's1', position: 0 });
    expect(back.templateSlotStyles).toBeUndefined();
  });
});
