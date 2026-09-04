'use client';

import { useEditorStore } from '@/hooks/useEditorStore';
import { cn } from '@/lib/utils';
import { inputCls, labelCls, numericCls } from './sidebar/tokens';
import {
  Template02SlotDescriptor,
  template02IsHighlightSlot,
  template02Measure,
  template02ModelOf,
  template02TextSlotsForModel,
} from '@/lib/templates/template-02';

/** Conteúdo de texto do Template 2, um controle por slot do modelo ativo. */
export default function Template02Slots() {
  const { slides, activeSlideIndex, updateActiveSlide } = useEditorStore();
  const slide = slides[activeSlideIndex];
  if (!slide) return null;

  const slots = slide.templateSlots ?? {};
  const model = template02ModelOf(slide, activeSlideIndex);

  /**
   * O DESTAQUE NÃO MORA MAIS AQUI — ordem do Rafael (03/09/2026), palavras
   * dele: *"essa parte de destaque eu quero que fique na aba do Estilo do
   * texto. A aba do Conteúdo é só pra colocar o texto, tipo conteúdo, então o
   * título, a chamada para ação etc."*
   *
   * O critério que ele deu vale para além deste painel: CONTEÚDO é o que a
   * pessoa ESCREVE; ESTILO é COMO aquilo aparece. Escolher quais palavras
   * ganham o marcador é a segunda coisa — o texto já existe, o que se decide é
   * a aparência dele.
   *
   * 🔴 O filtro é necessário, não cosmético: `cover.highlight` e
   * `content.highlight` são slots de TEXTO no spec, então chegam sozinhos em
   * `template02TextSlotsForModel` e apareceriam aqui como um textarea cru — o
   * campo que as pastilhas existem justamente para substituir (digitando à mão
   * é fácil errar o acento e o marcador não pintar). As pastilhas passaram
   * INTEIRAS para o painel de estilo (ver EditorSidebar, ramo `estiloDoTexto`),
   * então o slot aparece uma vez só, do outro lado.
   */
  const textSlots = template02TextSlotsForModel(model).filter(
    (descriptor) => !template02IsHighlightSlot(descriptor.slot),
  );

  const setSlot = (slot: string, value: string) =>
    updateActiveSlide({ templateSlots: { ...slots, [slot]: value } });

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
