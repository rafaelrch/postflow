'use client';

import { useEditorStore } from '@/hooks/useEditorStore';
import { cn } from '@/lib/utils';
import { inputCls, labelCls, numericCls } from './sidebar/tokens';
import {
  Template02SlotDescriptor,
  template02HighlightTerms,
  template02Measure,
  template02ModelOf,
  template02TextSlotsForModel,
} from '@/lib/templates/template-02';

interface HeadlineWord {
  display: string;
  value: string;
  normalized: string;
}

function cleanHeadlineWord(word: string): string {
  return word.replace(/^[^\p{L}\p{N}@#]+|[^\p{L}\p{N}@#]+$/gu, '') || word;
}

function normalizeHeadlineWord(word: string): string {
  return cleanHeadlineWord(word).toLocaleLowerCase('pt-BR');
}

function headlineWords(headline: string): HeadlineWord[] {
  return headline
    .split(/\s+/)
    .filter(Boolean)
    .map((display) => {
      const value = cleanHeadlineWord(display);
      return { display, value, normalized: normalizeHeadlineWord(value) };
    });
}

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

  const headlineDescriptor = textSlots.find((descriptor) => descriptor.slot === 'cover.headline');
  const highlightDescriptor = textSlots.find((descriptor) => descriptor.slot === 'cover.highlight');
  const headline = slots['cover.headline'] ?? headlineDescriptor?.defaultValue ?? '';
  const highlight = slots['cover.highlight'] ?? highlightDescriptor?.defaultValue ?? '';
  const words = headlineWords(headline);
  const selectedWords = new Set(
    template02HighlightTerms(highlight)
      .flatMap((term) => term.split(/\s+/))
      .filter(Boolean)
      .map(normalizeHeadlineWord)
  );

  const toggleHighlight = (word: HeadlineWord) => {
    const nextSelected = new Set(selectedWords);
    if (nextSelected.has(word.normalized)) nextSelected.delete(word.normalized);
    else nextSelected.add(word.normalized);

    const seen = new Set<string>();
    const ordered = words.flatMap((candidate) => {
      if (!nextSelected.has(candidate.normalized) || seen.has(candidate.normalized)) return [];
      seen.add(candidate.normalized);
      return [candidate.value];
    });
    setSlot('cover.highlight', ordered.join(', '));
  };

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
        if (descriptor.slot === 'cover.highlight') {
          return (
            <div key={descriptor.slot} className="space-y-2">
              <span className={labelCls}>{descriptor.label}</span>
              <div
                role="group"
                aria-label="Palavras em destaque"
                className="flex flex-wrap gap-1.5"
              >
                {words.map((word, index) => {
                  const selected = selectedWords.has(word.normalized);
                  return (
                    <button
                      key={`${word.display}-${index}`}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleHighlight(word)}
                      className={cn(
                        'rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors',
                        selected
                          ? 'border-[#C9D900] bg-[#EFFF00] text-black'
                          : 'border-[var(--line)] bg-[var(--paper)] text-[var(--ink-dim)] hover:border-[var(--ink)]'
                      )}
                    >
                      {word.display}
                    </button>
                  );
                })}
              </div>
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
