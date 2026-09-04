import React from 'react';
import { ElementFont, TextHighlight } from '@/types';
import { getElementFontCSS } from '@/lib/utils';

/**
 * DESTAQUE POR PALAVRA — a implementação única dos estilos que a têm.
 *
 * O Editorial e o Minimalista mantinham cópias idênticas (só comentário e
 * formatação divergiam) e o Perfil não tinha nenhuma, que é por que não dava
 * para deixar ALGUMAS palavras em negrito ali. Uma cópia só resolve o Perfil e
 * tira a divergência silenciosa das outras duas.
 *
 * Negrito PARCIAL sai daqui: o destaque carrega `font?: ElementFont`, então
 * escolher uma face bold para as palavras selecionadas engrossa só elas — o
 * bloco inteiro segue com a fonte dele.
 */

// Sublinhado via border-bottom — text-decoration sai diferente no html2canvas
// (export). O inline-block é essencial: em elemento inline o navegador pinta a
// borda na caixa de conteúdo do texto, mas o html2canvas pinta no retângulo do
// elemento (altura da linha). Com inline-block as caixas coincidem nos dois.
export const UNDERLINE_STYLE: React.CSSProperties = {
  display: 'inline-block',
  lineHeight: 1.1,
  borderBottom: '0.05em solid currentColor',
};

interface IndexedHighlight extends TextHighlight {
  /** Qual ocorrência (0-based) da palavra no texto. */
  wordIdx?: number;
}

/**
 * O QUE marcar uma palavra faz, por estilo.
 *
 * - `color` — o comportamento de sempre: a palavra ganha a cor gravada no
 *   destaque, mais a face e o sublinhado se houver. É o do Editorial e o do
 *   Minimalista, e continua sendo o padrão de quem não pede nada.
 * - `bold` — a palavra ganha NEGRITO e nada mais. Ordem do Rafael para o
 *   PROFILE (04/09/2026), palavras dele: *"no template de Profile o destaque é
 *   só pra deixar a fonte BOLD. Não é pra mudar a cor, não é pra mudar nada. É
 *   só pra deixar a fonte bold."*
 *
 * 🔴 POR QUE UM PARÂMETRO, e não um `if (style === 'profile')` aqui dentro:
 * esta função é COMPARTILHADA pelos três estilos que têm destaque (ProfileSlide,
 * MinimalistSlide, EditorialSlide — medido, são esses três). O Rafael falou só
 * do Profile. Mudar o corpo da função mudaria os três de uma vez; duplicá-la
 * para o Profile devolveria a divergência silenciosa que a extração dela veio
 * acabar (o cabeçalho deste arquivo conta essa história). Quem decide é o
 * CHAMADOR, que é quem sabe de que template ele é.
 */
export type HighlightMode = 'color' | 'bold';

export function renderTextWithHighlights(
  text: string,
  highlights: TextHighlight[],
  fallbackWord: string,
  fallbackColor: string,
  style: React.CSSProperties,
  mode: HighlightMode = 'color',
): React.ReactNode {
  const effective = (highlights.length > 0
    ? highlights
    : (fallbackWord ? [{ text: fallbackWord, color: fallbackColor }] : [])) as IndexedHighlight[];

  // Sublinhado do bloco inteiro (título/descrição) vira border por palavra.
  const underlineAll = style.textDecoration === 'underline';
  const { textDecoration: _td, ...outerStyle } = style;

  if ((effective.length === 0 && !underlineAll) || !text) return <span style={outerStyle}>{text}</span>;

  // Fatia o texto em palavras e vãos, preservando o espaço em branco.
  interface Token { raw: string; isWord: boolean }
  const tokens: Token[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const wm = remaining.match(/^\S+/);
    if (wm) { tokens.push({ raw: wm[0], isWord: true }); remaining = remaining.slice(wm[0].length); continue; }
    const sm = remaining.match(/^\s+/);
    if (sm) { tokens.push({ raw: sm[0], isWord: false }); remaining = remaining.slice(sm[0].length); continue; }
    tokens.push({ raw: remaining[0], isWord: false }); remaining = remaining.slice(1);
  }

  // Índice da ocorrência de cada palavra, sem diferenciar maiúscula.
  const seen: Record<string, number> = {};
  const wordOccurrences: number[] = tokens.map((t) => {
    if (!t.isWord) return -1;
    const lc = t.raw.toLowerCase();
    const occ = seen[lc] ?? 0;
    seen[lc] = occ + 1;
    return occ;
  });

  // A ocorrência exata vence; sem ela vale o destaque sem `wordIdx`, que é como
  // os carrosséis antigos gravaram.
  const getHl = (word: string, occIdx: number): IndexedHighlight | undefined =>
    effective.find((h) => h.text.toLowerCase() === word.toLowerCase() && h.wordIdx === occIdx)
    ?? effective.find((h) => h.text.toLowerCase() === word.toLowerCase() && h.wordIdx === undefined);

  return (
    <span style={outerStyle}>
      {tokens.map((token, i) => {
        if (!token.isWord) return token.raw;
        const hl = getHl(token.raw, wordOccurrences[i]);

        // MODO NEGRITO: o destaque é só peso de fonte. A cor, a face e o
        // sublinhado GRAVADOS no highlight são ignorados de propósito — decks
        // de Profile salvos antes de 04/09/2026 têm `color` no objeto, e a
        // regra nova é que ele deixe de ser aplicado, não que o deck quebre.
        // O sublinhado do BLOCO (`style.textDecoration`) é outra coisa: é do
        // bloco, não do destaque, e continua valendo nos dois modos.
        if (mode === 'bold') {
          if (!hl && !underlineAll) return token.raw;
          return (
            <span key={i} style={{
              ...(hl ? { fontWeight: 700 } : {}),
              ...(underlineAll ? UNDERLINE_STYLE : {}),
            }}>{token.raw}</span>
          );
        }

        const underlined = hl?.underline || underlineAll;
        if (!hl && !underlined) return token.raw;
        const hlFontCSS = hl?.font ? getElementFontCSS(hl.font as ElementFont) : null;
        return (
          <span key={i} style={{
            ...(hl ? { color: hl.color } : {}),
            ...(underlined ? UNDERLINE_STYLE : {}),
            ...(hlFontCSS ? {
              fontFamily: hlFontCSS.fontFamily,
              fontWeight: hlFontCSS.fontWeight,
              fontStyle: hlFontCSS.fontStyle,
            } : {}),
          }}>{token.raw}</span>
        );
      })}
    </span>
  );
}
