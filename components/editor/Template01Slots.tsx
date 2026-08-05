'use client';

import { useEditorStore } from '@/hooks/useEditorStore';
import { cn } from '@/lib/utils';
import { labelCls, inputCls, numericCls } from './sidebar/tokens';
import {
  template01SlotsForSlide,
  template01Measure,
  template01ModelOf,
} from '@/lib/templates/template-01';

/**
 * Conteúdo de TEXTO do TEMPLATE 1 — um campo por slot do modelo.
 *
 * Só o texto mora aqui. A imagem e os cantos saíram para os painéis
 * `Imagem` e `Cantos`, que juntam conteúdo e estilo num lugar só: antes o
 * usuário via dois painéis "Cantos" e dois de imagem, um com o texto e outro
 * com a aparência, separados por outras seções.
 *
 * A forma continua imutável — não há controle de posição aqui de propósito. O
 * que existe é o limite de linha/caractere do spec: estourar não deixa
 * "apertado", empurra o elemento de baixo e quebra a composição.
 */
export default function Template01Slots() {
  const { slides, activeSlideIndex, updateActiveSlide } = useEditorStore();
  const slide = slides[activeSlideIndex];
  if (!slide) return null;

  const slots = slide.templateSlots ?? {};
  // Os campos são os do MODELO do slide, não os da posição dele: um deck pode
  // repetir modelo e passar de 6 slides.
  const model = template01ModelOf(slide, activeSlideIndex);
  const textSlots = template01SlotsForSlide(model).filter(
    (d) => d.kind === 'text' && !d.slot.startsWith('cantos.')
  );

  const setSlot = (slot: string, value: string) =>
    updateActiveSlide({ templateSlots: { ...slots, [slot]: value } });

  return (
    <>
      {textSlots.map((d) => {
        const value = slots[d.slot] ?? d.defaultValue;
        const m = template01Measure(value, d);
        // Texto de fábrica não é acusado — ver template01Overflows.
        const o = { ...m, over: m.over && value !== d.defaultValue };
        return (
          <div key={d.slot} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className={labelCls}>{d.label}</span>
              <span
                className={cn(numericCls, o.over && 'text-red-500 font-semibold')}
              >
                {o.charBudget != null
                  ? `${o.chars}/${o.charBudget} car.`
                  : [
                      d.maxLines != null && `${o.lines}/${d.maxLines} linhas`,
                      d.maxCharsPerLine != null && `${o.longestLine}/${d.maxCharsPerLine} car.`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </span>
            </div>
            {/* Campo folgado de propósito: editar aqui é apagar, trocar e
                acrescentar, e a caixa apertada de antes escondia o que já
                estava escrito. Nunca menos de 4 linhas, sempre 2 de sobra
                além do que o texto ocupa, e o usuário ainda pode arrastar. */}
            <textarea
              value={value}
              onChange={(e) => setSlot(d.slot, e.target.value)}
              rows={Math.min(Math.max(o.lines + 2, 4), 12)}
              className={cn(inputCls, 'resize-y leading-relaxed', o.over && 'border-red-500/60')}
            />
            {o.over && (
              <p className="text-[11px] text-red-500">
                Estourou o limite do slot — o texto vai empurrar o elemento de baixo.
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
