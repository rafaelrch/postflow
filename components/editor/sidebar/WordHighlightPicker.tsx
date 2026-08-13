'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ElementFont, TextHighlight } from '@/types';
import ColorPicker from './ColorPicker';
import ElementFontPicker from './ElementFontPicker';
import { labelCls } from './tokens';

/**
 * Destaque de palavras do texto do slide.
 *
 * Cada OCORRÊNCIA é independente: a mesma palavra repetida pode ter destaques
 * diferentes, e é por isso que o highlight guarda `wordIdx` além do texto.
 */

interface IndexedHighlight extends TextHighlight {
  /** Qual ocorrência (0-based) desta palavra no texto. */
  wordIdx: number;
}

function tokenize(text: string): string[] {
  return [...(text || '').matchAll(/\S+/g)].map((m) => m[0]);
}

function getHighlightForToken(
  highlights: TextHighlight[],
  word: string,
  wordIdx: number
): TextHighlight | undefined {
  return highlights.find(
    (h) => h.text.toLowerCase() === word.toLowerCase() && (h as IndexedHighlight).wordIdx === wordIdx
  );
}

export default function WordHighlightPicker({
  label,
  text,
  highlights,
  onChange,
  accentColor,
  defaultFontName,
}: {
  label: string;
  text: string;
  highlights: TextHighlight[];
  onChange: (highlights: TextHighlight[]) => void;
  accentColor: string;
  /** Fonte herdada do bloco enquanto o destaque não tem uma fonte própria. */
  defaultFontName: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingColor, setPendingColor] = useState(accentColor);
  const [pendingFont, setPendingFont] = useState<ElementFont | undefined>(undefined);
  const [pendingUnderline, setPendingUnderline] = useState(false);

  const tokensWithIdx = (() => {
    const seen: Record<string, number> = {};
    return tokenize(text).map((word, tokenIdx) => {
      const lc = word.toLowerCase();
      const wordIdx = seen[lc] ?? 0;
      seen[lc] = wordIdx + 1;
      return { word, wordIdx, tokenIdx };
    });
  })();

  const selKey = (word: string, wordIdx: number) => `${word.toLowerCase()}::${wordIdx}`;

  // Aplica na hora: o preview do slide acompanha o usuário mexendo em
  // cor/fonte/sublinhado, sem passo de "confirmar".
  const applyLive = (
    sel: Set<string>,
    color: string,
    font: ElementFont | undefined,
    underline: boolean
  ) => {
    if (sel.size === 0) return;
    const next = highlights.filter(
      (h) => !sel.has(selKey(h.text, (h as IndexedHighlight).wordIdx ?? 0))
    );
    sel.forEach((key) => {
      const [word, idxStr] = key.split('::');
      next.push({ text: word, color, underline, font, wordIdx: parseInt(idxStr, 10) } as IndexedHighlight);
    });
    onChange(next);
  };

  const toggleToken = (word: string, wordIdx: number) => {
    const key = selKey(word, wordIdx);
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
      setSelected(next);
      return;
    }
    next.add(key);
    // Selecionar uma palavra já destacada traz o estilo dela para os controles,
    // senão o primeiro clique apagaria o que já estava lá.
    const existing = getHighlightForToken(highlights, word, wordIdx);
    const color = existing?.color ?? pendingColor;
    const font = existing?.font ?? pendingFont;
    const underline = existing?.underline ?? pendingUnderline;
    if (existing) {
      setPendingColor(color);
      setPendingFont(font);
      setPendingUnderline(underline);
    }
    setSelected(next);
    applyLive(new Set([key]), color, font, underline);
  };

  const removeSelected = () => {
    if (selected.size === 0) return;
    onChange(
      highlights.filter((h) => !selected.has(selKey(h.text, (h as IndexedHighlight).wordIdx ?? 0)))
    );
    setSelected(new Set());
  };

  if (tokensWithIdx.length === 0) return null;

  return (
    <div>
      <span className={cn(labelCls, 'block mb-2')}>{label}</span>

      <div className="flex flex-wrap gap-1 mb-2">
        {tokensWithIdx.map(({ word, wordIdx, tokenIdx }) => {
          const hl = getHighlightForToken(highlights, word, wordIdx);
          const isSelected = selected.has(selKey(word, wordIdx));
          return (
            <button
              key={tokenIdx}
              onClick={() => toggleToken(word, wordIdx)}
              className={cn(
                'px-2 py-0.5 rounded-lg text-[11px] border transition-all font-medium',
                isSelected
                  ? 'border-[var(--accent)]/60 bg-[var(--accent)]/15 text-[var(--accent)] dark:text-[var(--accent)]'
                  : 'border-[var(--line)] text-[var(--ink-dim)] hover:border-[var(--ink)] hover:text-[var(--ink)] bg-[var(--paper)]'
              )}
              style={
                hl && !isSelected
                  ? { borderColor: hl.color + '80', backgroundColor: hl.color + '15', color: hl.color }
                  : {}
              }
            >
              {word}
            </button>
          );
        })}
      </div>

      {selected.size > 0 && (
        <div className="rounded-xl border border-[var(--line)] p-3 flex flex-col gap-2.5 bg-[var(--paper)]">
          <span className="text-[11px] font-semibold text-[var(--ink-dim)]">
            {selected.size} palavra{selected.size > 1 ? 's' : ''} selecionada
            {selected.size > 1 ? 's' : ''}
          </span>
          <ColorPicker
            label="Cor"
            value={pendingColor}
            onChange={(c) => { setPendingColor(c); applyLive(selected, c, pendingFont, pendingUnderline); }}
          />
          <div>
            <span className={cn(labelCls, 'block mb-1.5')}>Fonte</span>
            <ElementFontPicker
              value={pendingFont}
              defaultFontName={defaultFontName}
              onChange={(f) => { setPendingFont(f); applyLive(selected, pendingColor, f, pendingUnderline); }}
            />
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div
              onClick={() => {
                const v = !pendingUnderline;
                setPendingUnderline(v);
                applyLive(selected, pendingColor, pendingFont, v);
              }}
              className={cn(
                'w-8 h-4 rounded-full relative transition-colors shrink-0',
                pendingUnderline ? 'bg-[var(--accent)]' : 'bg-black/10 dark:bg-white/10'
              )}
            >
              <div
                className={cn(
                  'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all',
                  pendingUnderline ? 'left-[18px]' : 'left-0.5'
                )}
              />
            </div>
            <span className="text-[11px] text-[var(--ink-dim)]">Sublinhado</span>
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="flex-1 py-2 rounded-[var(--radius-sm)] bg-[var(--ink)] text-[var(--paper)] text-[11px] font-bold transition-colors hover:bg-[var(--ink-2)]"
            >
              Concluir
            </button>
            <button
              onClick={removeSelected}
              className="px-3 py-2 rounded-xl border border-red-400/30 text-red-400/60 hover:text-red-400 hover:border-red-400/60 text-[11px] font-medium transition-colors"
            >
              Remover
            </button>
          </div>
        </div>
      )}

      {highlights.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {highlights.map((hl, i) => (
            <div
              key={i}
              className="flex items-center gap-1 px-1.5 py-1 rounded-lg border text-[10px] font-medium"
              style={{ borderColor: hl.color + '50', background: hl.color + '12' }}
            >
              <span style={{ color: hl.color }}>{hl.text}</span>
              <button
                onClick={() => onChange(highlights.filter((_, j) => j !== i))}
                className="text-[var(--ink-muted)] hover:text-red-400 transition-colors ml-0.5"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
