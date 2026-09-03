'use client';

import { useEditorStore } from '@/hooks/useEditorStore';
import { cn } from '@/lib/utils';
import { inputCls, labelCls, numericCls } from './sidebar/tokens';
import {
  Template02SlotDescriptor,
  template02Measure,
  template02ModelOf,
  template02TextSlotsForModel,
} from '@/lib/templates/template-02';
// As pastilhas saíram daqui para serem reusadas no wizard — mesmo componente,
// mesma aparência. Ver components/editor/sidebar/HighlightWordChips.
import HighlightWordChips from './sidebar/HighlightWordChips';

/** Conteúdo de texto do Template 2, um controle por slot do modelo ativo. */
export default function Template02Slots() {
  const { slides, activeSlideIndex, updateActiveSlide } = useEditorStore();
  const slide = slides[activeSlideIndex];
  if (!slide) return null;

  const slots = slide.templateSlots ?? {};
  const model = template02ModelOf(slide, activeSlideIndex);
  const textSlots = template02TextSlotsForModel(model);

  const setSlot = (slot: string, value: string) =>
    updateActiveSlide({ templateSlots: { ...slots, [slot]: value } });

  /**
   * O destaque existe na CAPA (`cover.highlight`, do spec) e nos INTERNOS
   * (`content.highlight`, extensão — ver TEMPLATE_02_EXTENSIONS). São slots
   * diferentes marcando títulos diferentes, com a MESMA interface: as palavras
   * do título viram pastilhas clicáveis.
   *
   * O par é derivado do modelo em vez de escrito duas vezes: assim o dia em que
   * um terceiro modelo ganhar destaque não vira um terceiro `if`.
   *
   * 🔴 RESOLUÇÃO DE MERGE (integra/ciclo-2, 02/09/2026). Duas branches mexeram
   * neste mesmo bloco: a do wizard EXTRAIU as pastilhas para
   * `sidebar/HighlightWordChips` (para o wizard reusar), e a do destaque nos
   * internos GENERALIZOU o bloco para dois slots. As duas sobrevivem: fica o
   * componente extraído, alimentado pelo par derivado abaixo. Por isso os
   * helpers de palavra (`words`, `selectedWords`, `toggleHighlight`) sumiram
   * daqui — eles moram dentro do componente agora, e duplicá-los era o jeito
   * errado de resolver este conflito.
   */
  const HIGHLIGHT_PAIRS: { titulo: string; destaque: string }[] = [
    { titulo: 'cover.headline', destaque: 'cover.highlight' },
    { titulo: 'content.title', destaque: 'content.highlight' },
  ];
  const par = HIGHLIGHT_PAIRS.find((p) => textSlots.some((d) => d.slot === p.destaque));
  const headlineDescriptor = textSlots.find((descriptor) => descriptor.slot === par?.titulo);
  const highlightDescriptor = textSlots.find((descriptor) => descriptor.slot === par?.destaque);
  const headline = (par && slots[par.titulo]) ?? headlineDescriptor?.defaultValue ?? '';
  const highlight = (par && slots[par.destaque]) ?? highlightDescriptor?.defaultValue ?? '';

  const counter = (descriptor: Template02SlotDescriptor, value: string) => {
    const measurement = template02Measure(value, descriptor);
    if (descriptor.maxCharsPerLine != null) {
      return {
        over: measurement.over,
        text: [
          descriptor.maxLines != null && `${measurement.lines}/${descriptor.maxLines} linhas`,
          `${measurement.longestLine}/${descriptor.maxCharsPerLine} car. na maior linha`,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    }
    return {
      over: measurement.over,
      text:
        descriptor.maxChars != null
          ? `${measurement.chars}/${descriptor.maxChars} car.`
          : `${measurement.chars} car.`,
    };
  };

  return (
    <>
      {textSlots.map((descriptor) => {
        if (descriptor.slot === par?.destaque) {
          return (
            <div key={descriptor.slot} className="space-y-2">
              <span className={labelCls}>{descriptor.label}</span>
              <HighlightWordChips
                headline={headline}
                highlight={highlight}
                onChange={(next) => par && setSlot(par.destaque, next)}
              />
            </div>
          );
        }

        const value = slots[descriptor.slot] ?? descriptor.defaultValue;
        const measurement = counter(descriptor, value);
        const over = measurement.over && value !== descriptor.defaultValue;
        const lines = value.split('\n').length;

        return (
          <div key={descriptor.slot} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className={labelCls}>{descriptor.label}</span>
              <span className={cn(numericCls, over && 'text-red-500 font-semibold')}>
                {measurement.text}
              </span>
            </div>

            <textarea
              value={value}
              onChange={(event) => setSlot(descriptor.slot, event.target.value)}
              rows={
                descriptor.slot === 'cover.headline'
                  ? Math.min(Math.max(lines + 3, 8), 14)
                  : descriptor.multiline
                    ? Math.min(Math.max(lines + 2, 4), 12)
                    : 2
              }
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
