'use client';

import { cn } from '@/lib/utils';
import { template02HighlightTerms } from '@/lib/templates/template-02';

/**
 * As palavras do título como pastilhas clicáveis — quem clica escolhe o que
 * ganha o marcador.
 *
 * Estava dentro de `Template02Slots` (a barra do editor), amarrado à store.
 * Saiu para cá inteiro, sem mudar de comportamento, porque o WIZARD precisa da
 * MESMA coisa: o Rafael pediu para escolher as palavras já na criação manual,
 * e lá não existe store — o texto ainda está num rascunho local.
 *
 * O componente é PRESENTACIONAL de propósito: recebe o título e a lista de
 * termos marcados, devolve a lista nova. Quem chama decide onde isso mora
 * (`templateSlots['cover.highlight']` no editor e no wizard).
 *
 * Por que pastilhas e não um campo de texto: o marcador só pinta quando o termo
 * aparece EXATAMENTE numa linha do título. Digitando à mão é fácil errar o
 * acento, o plural ou a caixa e não descobrir por quê — clicando, o valor sai
 * do próprio título e casa por construção.
 */

export interface HighlightWord {
  display: string;
  value: string;
  normalized: string;
}

/** Tira pontuação das pontas, preservando @ e # que fazem parte da palavra. */
export function cleanHeadlineWord(word: string): string {
  return word.replace(/^[^\p{L}\p{N}@#]+|[^\p{L}\p{N}@#]+$/gu, '') || word;
}

export function normalizeHeadlineWord(word: string): string {
  return cleanHeadlineWord(word).toLocaleLowerCase('pt-BR');
}

export function headlineWords(headline: string): HighlightWord[] {
  return headline
    .split(/\s+/)
    .filter(Boolean)
    .map((display) => {
      const value = cleanHeadlineWord(display);
      return { display, value, normalized: normalizeHeadlineWord(value) };
    });
}

/**
 * O valor novo do campo de destaque depois de ligar/desligar uma palavra.
 *
 * A ordem segue a do TÍTULO, não a da clicagem, e cada palavra entra uma vez só
 * — dois cliques na mesma palavra repetida no título não geram termo duplicado.
 */
export function toggleHighlightWord(
  headline: string,
  highlight: string,
  word: HighlightWord,
): string {
  const words = headlineWords(headline);
  const selected = selectedHighlightWords(highlight);

  const next = new Set(selected);
  if (next.has(word.normalized)) next.delete(word.normalized);
  else next.add(word.normalized);

  const seen = new Set<string>();
  return words
    .flatMap((candidate) => {
      if (!next.has(candidate.normalized) || seen.has(candidate.normalized)) return [];
      seen.add(candidate.normalized);
      return [candidate.value];
    })
    .join(', ');
}

/** As palavras hoje marcadas, normalizadas para comparação. */
export function selectedHighlightWords(highlight: string): Set<string> {
  return new Set(
    template02HighlightTerms(highlight)
      .flatMap((term) => term.split(/\s+/))
      .filter(Boolean)
      .map(normalizeHeadlineWord),
  );
}

export default function HighlightWordChips({
  headline,
  highlight,
  onChange,
}: {
  headline: string;
  highlight: string;
  onChange: (next: string) => void;
}) {
  const words = headlineWords(headline);
  const selected = selectedHighlightWords(highlight);

  return (
    <div role="group" aria-label="Palavras em destaque" className="flex flex-wrap gap-1.5">
      {words.map((word, index) => {
        const isSelected = selected.has(word.normalized);
        return (
          <button
            key={`${word.display}-${index}`}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(toggleHighlightWord(headline, highlight, word))}
            className={cn(
              'rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors',
              isSelected
                ? 'border-[#C9D900] bg-[#EFFF00] text-black'
                : 'border-[var(--line)] bg-[var(--paper)] text-[var(--ink-dim)] hover:border-[var(--ink)]',
            )}
          >
            {word.display}
          </button>
        );
      })}
    </div>
  );
}
