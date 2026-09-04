'use client';

import { cn } from '@/lib/utils';
import { template02HighlightTermsParsed } from '@/lib/templates/template-02';

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
  /**
   * Qual ocorrência desta palavra na headline, 1-based.
   *
   * Existe desde 04/09/2026, quando marcar a 2ª de duas palavras iguais passou
   * a ser possível. Antes as pastilhas só sabiam o TEXTO, então marcar um FEED
   * acendia os dois — e o render, que já marcava só o primeiro, mostrava outra
   * coisa. As duas pontas erravam em direções opostas.
   */
  occurrence: number;
}

/** Tira pontuação das pontas, preservando @ e # que fazem parte da palavra. */
export function cleanHeadlineWord(word: string): string {
  return word.replace(/^[^\p{L}\p{N}@#]+|[^\p{L}\p{N}@#]+$/gu, '') || word;
}

export function normalizeHeadlineWord(word: string): string {
  return cleanHeadlineWord(word).toLocaleLowerCase('pt-BR');
}

export function headlineWords(headline: string): HighlightWord[] {
  const vistas = new Map<string, number>();
  return headline
    .split(/\s+/)
    .filter(Boolean)
    .map((display) => {
      const value = cleanHeadlineWord(display);
      const normalized = normalizeHeadlineWord(value);
      const occurrence = (vistas.get(normalized) ?? 0) + 1;
      vistas.set(normalized, occurrence);
      return { display, value, normalized, occurrence };
    });
}

/**
 * O valor novo do campo de destaque depois de ligar/desligar uma palavra.
 *
 * A ordem segue a do TÍTULO, não a da clicagem.
 *
 * 🔴 CADA OCORRÊNCIA É INDEPENDENTE desde 04/09/2026. Antes, palavras iguais
 * eram agrupadas numa entrada só ("dois cliques na mesma palavra repetida não
 * geram termo duplicado" era a regra antiga) — e era essa regra que impedia o
 * Rafael de marcar só o segundo FEED. Agora o segundo FEED é uma entrada
 * própria, escrita `FEED::2`.
 *
 * O sufixo `::1` é OMITIDO de propósito: a primeira ocorrência continua sendo
 * escrita `FEED`, exatamente como antes. Assim o campo de um deck que nunca usou
 * a segunda ocorrência permanece byte a byte o que já era, e nada precisa ser
 * migrado.
 */
export function toggleHighlightWord(
  headline: string,
  highlight: string,
  word: HighlightWord,
): string {
  const words = headlineWords(headline);
  const selected = selectedHighlightWords(highlight, headline);

  const alvo = highlightWordKey(word.normalized, word.occurrence);
  const next = new Set(selected);
  if (next.has(alvo)) next.delete(alvo);
  else next.add(alvo);

  return words
    .filter((candidate) => next.has(highlightWordKey(candidate.normalized, candidate.occurrence)))
    .map((candidate) =>
      candidate.occurrence > 1 ? `${candidate.value}::${candidate.occurrence}` : candidate.value,
    )
    .join(', ');
}

/** A chave de uma palavra marcada: texto normalizado + ocorrência. */
export function highlightWordKey(normalized: string, occurrence: number): string {
  return `${normalized}::${occurrence}`;
}

/**
 * As palavras hoje marcadas, como chaves `normalizada::ocorrência`.
 *
 * 🔴 A OCORRÊNCIA ENTRA NA CHAVE, e é isso que faz a pastilha parar de mentir.
 * Antes a chave era só o texto, então "FEED" marcado acendia TODOS os FEED da
 * headline enquanto o slide pintava um só — as duas pontas erravam em direções
 * opostas.
 *
 * 🔴 O TERMO É CASADO COMO SEQUÊNCIA DE PALAVRAS NA HEADLINE, e não somando o
 * índice pedido ao deslocamento dentro do termo. Somar parece funcionar e não
 * funciona: em "O FEED MUDOU", a 1ª ocorrência do termo inteiro tem "MUDOU" na
 * posição 3 dele, mas "MUDOU" é a 1ª ocorrência DELE PRÓPRIO, não a 3ª. Cada
 * palavra acende com a ocorrência que ela tem na headline — a mesma contagem
 * que o render usa, que é o que faz as duas pontas concordarem.
 *
 * Termo sem sufixo continua valendo como ocorrência 1, que é o comportamento de
 * sempre e o que mantém deck antigo e saída da IA funcionando.
 */
export function selectedHighlightWords(highlight: string, headline = ''): Set<string> {
  const palavras = headlineWords(headline);
  const chaves = new Set<string>();

  for (const termo of template02HighlightTermsParsed(highlight, headline)) {
    const alvo = termo.texto.split(/\s+/).filter(Boolean).map(normalizeHeadlineWord);
    if (alvo.length === 0) continue;

    // A N-ésima vez que a SEQUÊNCIA inteira aparece na headline.
    let vistas = 0;
    for (let i = 0; i + alvo.length <= palavras.length; i++) {
      if (!alvo.every((n, k) => palavras[i + k].normalized === n)) continue;
      if (++vistas !== termo.ocorrencia) continue;
      alvo.forEach((_, k) =>
        chaves.add(highlightWordKey(palavras[i + k].normalized, palavras[i + k].occurrence)),
      );
      break;
    }
  }
  return chaves;
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
  const selected = selectedHighlightWords(highlight, headline);

  return (
    <div role="group" aria-label="Palavras em destaque" className="flex flex-wrap gap-1.5">
      {words.map((word, index) => {
        // A ocorrência entra na comparação: duas pastilhas com a MESMA palavra
        // acendem de forma independente, que é o pedido do Rafael.
        const isSelected = selected.has(highlightWordKey(word.normalized, word.occurrence));
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
