'use client';

import { useEditorStore } from '@/hooks/useEditorStore';
import { cn } from '@/lib/utils';
import { inputCls, labelCls, numericCls } from './sidebar/tokens';
import {
  Template03SlotDescriptor,
  template03Measure,
  template03ModelOf,
  template03TextSlotsForModel,
} from '@/lib/templates/template-03';

/**
 * Conteúdo de texto do Template 3 — um controle por slot do MODELO ativo.
 *
 * 🔴 Os campos saem do MODELO do slide, nunca da posição dele: o FlowLine é um
 * deck ABERTO, e num deck reordenado a posição mostraria os campos de outro
 * slide. Como todo conteúdo compartilha as chaves `s2.*`, é o modelo que diz quais
 * controles existem.
 *
 * A barra de perfil (o @) e os cantos ficam de fora: cada um tem painel próprio,
 * e repeti-los aqui criaria dois lugares para editar a mesma coisa — divergir
 * seria só questão de tempo.
 */
export default function Template03Slots() {
  const { slides, activeSlideIndex, updateActiveSlide } = useEditorStore();
  const slide = slides[activeSlideIndex];
  if (!slide) return null;

  const slots = slide.templateSlots ?? {};
  const model = template03ModelOf(slide, activeSlideIndex);
  const textSlots = template03TextSlotsForModel(model);

  const setSlot = (slot: string, value: string) =>
    updateActiveSlide({ templateSlots: { ...slots, [slot]: value } });

  /**
   * O contador fala a MESMA língua que `template03Measure` mede.
   *
   * Com quebra manual (`\n`) o limite do spec é POR LINHA escrita. Sem ela não
   * há linhas para contar — a quebra é do navegador — e o que vale é o orçamento
   * total (`maxLines × maxCharsPerLine`). Mostrar "linhas" num texto de linha
   * única faria o contador acusar o que a medição não acusa.
   */
  const counter = (d: Template03SlotDescriptor, value: string) => {
    const m = template03Measure(value, d);
    if (m.charBudget != null) {
      return { over: m.over, text: `${m.chars}/${m.charBudget} car.` };
    }
    return {
      over: m.over,
      text: [
        d.maxLines != null && `${m.lines}/${d.maxLines} linhas`,
        d.maxCharsPerLine != null && `${m.longestLine}/${d.maxCharsPerLine} car. na maior linha`,
      ]
        .filter(Boolean)
        .join(' · '),
    };
  };

  return (
    <>
      {textSlots.map((d) => {
        // Chave AUSENTE cai no texto de fábrica do spec; chave presente e vazia
        // é vazio de verdade. É a mesma regra do render — ver Template03Slide.
        const value = slots[d.slot] ?? d.defaultValue;
        const measurement = counter(d, value);
        // O conteúdo de fábrica não é acusado: os limites do spec são estéticos
        // e o texto que veio do Figma passa de alguns sem estourar a caixa.
        const over = measurement.over && value !== d.defaultValue;
        const lines = value.split('\n').length;

        return (
          <div key={d.slot} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className={labelCls}>{d.label}</span>
              <span className={cn(numericCls, over && 'text-red-500 font-semibold')}>
                {measurement.text}
              </span>
            </div>

            <textarea
              data-slot-input={d.slot}
              value={value}
              onChange={(event) => setSlot(d.slot, event.target.value)}
              rows={Math.min(Math.max(lines + 2, 4), 12)}
              className={cn(inputCls, 'resize-y leading-relaxed', over && 'border-red-500/60')}
            />

            {over && (
              <p className="text-[11px] text-red-500">
                Estourou o limite do slot — o texto vai furar a composição.
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
