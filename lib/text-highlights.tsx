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

export function renderTextWithHighlights(
  text: string,
  highlights: TextHighlight[],
  fallbackWord: string,
  fallbackColor: string,
  style: React.CSSProperties,
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
