'use client';

import { useEditorStore } from '@/hooks/useEditorStore';
import { cn } from '@/lib/utils';
import { helpCls, inputCls, labelCls, numericCls } from './sidebar/tokens';
import {
  Template02SlotDescriptor,
  template02HighlightLine,
  template02Measure,
  template02ModelOf,
  template02TextSlotsForModel,
} from '@/lib/templates/template-02';

/**
 * Conteúdo de TEXTO do TEMPLATE 2 — um campo por slot do modelo ativo.
 *
 * Só o texto do SLIDE mora aqui. O cabeçalho (categoria e @) é do deck inteiro e
 * tem painel próprio; a imagem tem o painel "Imagem". Juntar tudo aqui repetiria
 * o problema que a barra do Template 1 foi refatorada para acabar: dois painéis
 * com o mesmo nome, um com o texto e outro com a aparência.
 *
 * A forma continua imutável — não há controle de posição de propósito. O que
 * existe é o limite do spec: estourar não deixa "apertado", empurra o desenho.
 */
export default function Template02Slots() {
  const { slides, activeSlideIndex, updateActiveSlide } = useEditorStore();
  const slide = slides[activeSlideIndex];
  if (!slide) return null;

  const slots = slide.templateSlots ?? {};
  // Os campos são os do MODELO do slide, não os da posição dele: o deck não tem
  // tamanho fixo e o usuário pode reordenar à vontade.
  const model = template02ModelOf(slide, activeSlideIndex);
  const textSlots = template02TextSlotsForModel(model);

  const setSlot = (slot: string, value: string) =>
    updateActiveSlide({ templateSlots: { ...slots, [slot]: value } });

  const headline = slots['cover.headline'] ?? '';
  const highlight = slots['cover.highlight'] ?? '';

  /** Contador do campo, na língua do limite que de fato prende aquele slot. */
  const counter = (d: Template02SlotDescriptor, value: string) => {
    const m = template02Measure(value, d);
    if (d.maxCharsPerLine != null) {
      return {
        over: m.over,
        text: [
          d.maxLines != null && `${m.lines}/${d.maxLines} linhas`,
          `${m.longestLine}/${d.maxCharsPerLine} car. na maior linha`,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    }
    return {
      over: m.over,
      text: d.maxChars != null ? `${m.chars}/${d.maxChars} car.` : `${m.chars} car.`,
    };
  };

  return (
    <>
      {textSlots.map((d) => {
        const value = slots[d.slot] ?? d.defaultValue;
        const m = counter(d, value);
        // Texto de fábrica não é acusado — ver `template02Overflows`.
        const over = m.over && value !== d.defaultValue;
        const lines = value.split('\n').length;

        // O marcador só aparece no slide se o trecho estiver contido em UMA
        // linha do headline. Sem este aviso ele simplesmente não desenha e o
        // usuário não tem como descobrir por quê.
        const highlightMissing =
          d.slot === 'cover.highlight' &&
          value.trim() !== '' &&
          template02HighlightLine(headline || d.defaultValue, value) === -1;

        return (
          <div key={d.slot} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className={labelCls}>{d.label}</span>
              <span className={cn(numericCls, over && 'text-red-500 font-semibold')}>{m.text}</span>
            </div>

            <textarea
              value={value}
              onChange={(e) => setSlot(d.slot, e.target.value)}
              rows={d.multiline ? Math.min(Math.max(lines + 2, 4), 12) : 2}
              className={cn(
                inputCls,
                'resize-y leading-relaxed',
                (over || highlightMissing) && 'border-red-500/60'
              )}
            />

            {/* A quebra da capa é DECISÃO do usuário, não do navegador: o spec
                manda quebrar por sentido. Se a interface não disser isso, ele
                escreve corrido e o template quebra onde couber. */}
            {d.slot === 'cover.headline' && (
              <p className={helpCls}>
                Enter quebra a linha, e é você que decide onde. Quebre por sentido — nunca deixe
                uma linha com uma palavra só.
              </p>
            )}
            {d.slot === 'content.body' && (
              <p className={helpCls}>Deixe uma linha em branco para separar parágrafos.</p>
            )}
            {d.slot === 'cover.highlight' && !highlightMissing && (
              <p className={helpCls}>
                O trecho precisa estar escrito no título, numa linha só — é ele que ganha o
                marcador amarelo.
              </p>
            )}

            {highlightMissing && (
              <p className="text-[11px] text-red-500">
                Este trecho não está em nenhuma linha do título, então o marcador não aparece.
                Escreva exatamente como está lá — e sem atravessar a quebra de linha.
              </p>
            )}
            {over && (
              <p className="text-[11px] text-red-500">
                Estourou o limite do slot — o texto vai furar a composição.
              </p>
            )}
          </div>
        );
      })}

      {/* Sem marcador nenhum a capa perde a ênfase que o template inteiro foi
          desenhado para ter. O spec pede exatamente 1 por carrossel. */}
      {model === 1 && highlight.trim() === '' && (
        <p className={helpCls}>
          Sem destaque, a capa sai sem o marcador amarelo. Escolha a palavra que carrega a
          tensão da frase.
        </p>
      )}
    </>
  );
}
