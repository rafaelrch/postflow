'use client';

import { useRef, useState, useEffect } from 'react';
import { Download, Archive, Upload, Image, X, Underline, Sparkles } from 'lucide-react';
import { useEditorStore } from '@/hooks/useEditorStore';
import { useGenerateCarouselImages, isEditorialCoverSlide } from '@/hooks/useGenerateCarouselImages';
import Slider from './Slider';
import Section from './Section';
import { cn } from '@/lib/utils';
import { uploadImageFile } from '@/lib/upload-image';
import toast from 'react-hot-toast';
import { TextPosition, TextHighlight, ElementFont } from '@/types';

// ── ImageThumb: miniatura da imagem anexada com X para remover ───────────────
function ImageThumb({ url, onRemove }: { url: string; onRemove: () => void }) {
  return (
    <div className="relative w-full h-24 rounded-lg overflow-hidden border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Imagem anexada" className="w-full h-full object-cover" />
      <button
        onClick={onRemove}
        title="Remover imagem"
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white/80 hover:text-white flex items-center justify-center transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── AiGenPanel: painel expansível de geração de imagem por IA ─────────────────
// Ao abrir: referência (upload + preview + X), prompt livre, conteúdo do slide
// (somente leitura) e o botão Gerar. Estado local; reseta ao trocar de slide
// via key={activeSlideIndex} no uso.
function AiGenPanel({
  buttonLabel,
  generating,
  slideTitle,
  slideDescription,
  onGenerate,
}: {
  buttonLabel: string;
  generating: boolean;
  slideTitle: string;
  slideDescription: string;
  onGenerate: (opts: { userPrompt?: string; referenceImageUrl?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [refUrl, setRefUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    const toastId = toast.loading('Enviando referência…');
    try {
      const url = await uploadImageFile(file, 'reference-images');
      setRefUrl(url);
      toast.success('Referência adicionada', { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha no upload', { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const slideContent = [slideTitle, slideDescription].filter(Boolean).join('\n\n');
  const panelLabelCls = 'text-[9px] font-semibold text-gray-900/40 dark:text-white/35 uppercase tracking-[0.08em]';
  const fieldCls = 'w-full px-3 py-2 rounded-lg bg-[var(--surface-elevated)] border border-black/[0.07] dark:border-white/[0.07] text-gray-900 dark:text-white text-[11px] placeholder-black/20 dark:placeholder-white/20 focus:outline-none focus:border-black/20 dark:focus:border-white/20 transition-all resize-none';

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-semibold transition-opacity',
          open
            ? 'border border-black/[0.1] dark:border-white/[0.1] text-gray-900/70 dark:text-white/70'
            : 'bg-gray-900 dark:bg-white text-white dark:text-black hover:opacity-90'
        )}
      >
        <Sparkles className="w-3 h-3" />
        {buttonLabel}
      </button>

      {open && (
        <div className="flex flex-col gap-2 p-2.5 rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02]">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          {/* Imagem de referência */}
          <span className={panelLabelCls}>Imagem de referência (opcional)</span>
          {refUrl ? (
            <ImageThumb url={refUrl} onRemove={() => setRefUrl('')} />
          ) : (
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-black/[0.1] dark:border-white/[0.1] rounded-lg p-3 text-center cursor-pointer hover:border-black/20 dark:hover:border-white/20 transition-all"
            >
              <Upload className="w-3.5 h-3.5 mx-auto mb-1 text-gray-900/25 dark:text-white/25" />
              <span className="text-[10px] text-gray-900/35 dark:text-white/35 font-medium">
                {uploading ? 'Enviando…' : 'Clique para anexar referência'}
              </span>
            </div>
          )}

          {/* Prompt livre */}
          <span className={panelLabelCls}>Prompt</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Descreva a imagem que você quer gerar…"
            className={fieldCls}
            style={{ minHeight: 64 }}
          />

          {/* Conteúdo do slide — somente leitura */}
          <span className={panelLabelCls}>Conteúdo do slide</span>
          <textarea
            readOnly
            value={slideContent}
            className={cn(fieldCls, 'opacity-60 cursor-default')}
            style={{ minHeight: 48 }}
          />

          {/* Gerar */}
          <button
            onClick={() =>
              onGenerate({
                userPrompt: prompt.trim() || undefined,
                referenceImageUrl: refUrl || undefined,
              })
            }
            disabled={generating || uploading}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-[10px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-3 h-3" />
            {generating ? 'Gerando…' : 'Gerar'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── ColorPicker: swatch + hex input ─────────────────────────────────────────

interface ColorPickerProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

// ── ElementFontPicker ────────────────────────────────────────────────────────

type FontFamily = 'SF Pro Display' | 'IvyOra Text' | 'Bebas Neue' | 'Montserrat';

interface FontVariant { value: ElementFont; label: string; weight: number; style: 'normal' | 'italic' }

const FONT_FAMILIES: { value: FontFamily; label: string; family: string; variants: FontVariant[] }[] = [
  {
    value: 'SF Pro Display',
    label: 'SF Display',
    family: "'SF Pro Display', -apple-system, 'Helvetica Neue', sans-serif",
    variants: [
      { value: 'SF Pro Display Light',    label: 'Light',    weight: 300, style: 'normal' },
      { value: 'SF Pro Display Regular',  label: 'Regular',  weight: 400, style: 'normal' },
      { value: 'SF Pro Display Medium',   label: 'Medium',   weight: 500, style: 'normal' },
      { value: 'SF Pro Display SemiBold', label: 'SemiBold', weight: 600, style: 'normal' },
      { value: 'SF Pro Display Bold',     label: 'Bold',     weight: 700, style: 'normal' },
    ],
  },
  {
    value: 'IvyOra Text',
    label: 'IvyOra Text',
    family: "'IvyOra Text', Georgia, serif",
    variants: [
      { value: 'IvyOra Text Medium',        label: 'Medium',        weight: 500, style: 'normal' },
      { value: 'IvyOra Text Medium Italic', label: 'Medium Italic', weight: 500, style: 'italic' },
    ],
  },
  {
    value: 'Bebas Neue',
    label: 'Bebas Neue',
    family: "'Bebas Neue', sans-serif",
    variants: [
      { value: 'Bebas Neue', label: 'Regular', weight: 400, style: 'normal' },
    ],
  },
  {
    value: 'Montserrat',
    label: 'Montserrat',
    family: "'Montserrat', sans-serif",
    variants: [
      { value: 'Montserrat', label: 'SemiBold', weight: 600, style: 'normal' },
    ],
  },
];

// Derive family + variant from an ElementFont value
function splitElementFont(font: ElementFont | undefined): { family: FontFamily | null; variant: ElementFont | null } {
  if (!font) return { family: null, variant: null };
  for (const fam of FONT_FAMILIES) {
    if (fam.variants.some((v) => v.value === font)) {
      return { family: fam.value, variant: font };
    }
  }
  return { family: null, variant: null };
}

interface ElementFontPickerProps {
  value: ElementFont | undefined;
  onChange: (v: ElementFont | undefined) => void;
}

function ElementFontPicker({ value, onChange }: ElementFontPickerProps) {
  const { family: currentFamily, variant: currentVariant } = splitElementFont(value);
  const selectedFam = FONT_FAMILIES.find((f) => f.value === currentFamily) ?? null;

  const handleFamilyChange = (raw: string) => {
    if (!raw) { onChange(undefined); return; }
    const fam = FONT_FAMILIES.find((f) => f.value === raw);
    if (!fam) return;
    // Auto-select first variant (or keep current if same family)
    const keep = fam.variants.find((v) => v.value === currentVariant);
    onChange((keep ?? fam.variants[0]).value);
  };

  const handleVariantChange = (raw: string) => {
    onChange(raw as ElementFont || undefined);
  };

  const selectCls = 'w-full px-2 py-1.5 rounded-lg bg-[var(--surface-elevated)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-xs focus:outline-none focus:border-black/30 dark:focus:border-white/30 cursor-pointer';

  return (
    <div className="flex flex-col gap-1.5">
      {/* Família */}
      <select value={currentFamily ?? ''} onChange={(e) => handleFamilyChange(e.target.value)} className={selectCls}
        style={{ fontFamily: selectedFam?.family }}>
        <option value="">Herdar global</option>
        {FONT_FAMILIES.map((f) => (
          <option key={f.value} value={f.value} style={{ fontFamily: f.family }}>{f.label}</option>
        ))}
      </select>

      {/* Variante — só mostra se há família selecionada com mais de 1 opção */}
      {selectedFam && selectedFam.variants.length > 1 && (
        <select value={currentVariant ?? ''} onChange={(e) => handleVariantChange(e.target.value)} className={selectCls}
          style={{ fontFamily: selectedFam.family, fontWeight: selectedFam.variants.find((v) => v.value === currentVariant)?.weight, fontStyle: selectedFam.variants.find((v) => v.value === currentVariant)?.style }}>
          {selectedFam.variants.map((v) => (
            <option key={v.value} value={v.value} style={{ fontWeight: v.weight, fontStyle: v.style }}>{v.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}

// ── WordHighlightPicker ──────────────────────────────────────────────────────

// Each token = one word occurrence with its position index in the original text
interface Token { word: string; idx: number }

function tokenizeAll(text: string): Token[] {
  const tokens: Token[] = [];
  let idx = 0;
  for (const match of (text || '').matchAll(/\S+/g)) {
    tokens.push({ word: match[0], idx });
    idx++;
  }
  return tokens;
}

// A highlight keyed by word index so each occurrence is independent
interface IndexedHighlight extends TextHighlight {
  wordIdx: number; // which occurrence (0-based) of this word in the text
}

// Convert flat TextHighlight[] (stored in slide) to IndexedHighlight[]
function toIndexed(text: string, highlights: TextHighlight[]): IndexedHighlight[] {
  const tokens = tokenizeAll(text);
  const result: IndexedHighlight[] = [];
  // Count occurrences seen per normalised word
  const seen: Record<string, number> = {};
  for (const token of tokens) {
    const lc = token.word.toLowerCase();
    const occurrenceIdx = seen[lc] ?? 0;
    seen[lc] = occurrenceIdx + 1;
    const hl = highlights.find(
      (h) => h.text.toLowerCase() === lc && (h as IndexedHighlight).wordIdx === occurrenceIdx
    );
    if (hl) result.push({ ...hl, wordIdx: occurrenceIdx });
  }
  return result;
}

// The stored highlights use wordIdx to distinguish occurrences of the same word
function getHighlightForToken(highlights: TextHighlight[], word: string, wordIdx: number): TextHighlight | undefined {
  return highlights.find(
    (h) => h.text.toLowerCase() === word.toLowerCase() && (h as IndexedHighlight).wordIdx === wordIdx
  );
}

interface WordHighlightPickerProps {
  label: string;
  text: string;
  highlights: TextHighlight[];
  onChange: (highlights: TextHighlight[]) => void;
  accentColor: string;
}

function WordHighlightPicker({ label, text, highlights, onChange, accentColor }: WordHighlightPickerProps) {
  // Selection = set of "word::idx" strings
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingColor, setPendingColor] = useState(accentColor);
  const [pendingFont, setPendingFont] = useState<ElementFont | undefined>(undefined);
  const [pendingUnderline, setPendingUnderline] = useState(false);

  const tokens = tokenizeAll(text);

  // Track occurrence index per word
  const tokensWithIdx: Array<{ word: string; wordIdx: number; tokenIdx: number }> = (() => {
    const seen: Record<string, number> = {};
    return tokens.map((t, i) => {
      const lc = t.word.toLowerCase();
      const wordIdx = seen[lc] ?? 0;
      seen[lc] = wordIdx + 1;
      return { word: t.word, wordIdx, tokenIdx: i };
    });
  })();

  const selKey = (word: string, wordIdx: number) => `${word.toLowerCase()}::${wordIdx}`;

  // Aplica o estilo às palavras do conjunto imediatamente — o preview do slide
  // atualiza ao vivo conforme o usuário mexe em cor/fonte/sublinhado.
  const applyLive = (sel: Set<string>, color: string, font: ElementFont | undefined, underline: boolean) => {
    if (sel.size === 0) return;
    const next = highlights.filter((h) => {
      const ih = h as IndexedHighlight;
      return !sel.has(selKey(h.text, ih.wordIdx ?? 0));
    });
    sel.forEach((key) => {
      const [word, idxStr] = key.split('::');
      next.push({
        text: word,
        color,
        underline,
        font,
        wordIdx: parseInt(idxStr, 10),
      } as IndexedHighlight);
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
    const existing = getHighlightForToken(highlights, word, wordIdx);
    let color = pendingColor;
    let font = pendingFont;
    let underline = pendingUnderline;
    if (existing) {
      color = existing.color;
      font = existing.font;
      underline = existing.underline ?? false;
      setPendingColor(color);
      setPendingFont(font);
      setPendingUnderline(underline);
    }
    setSelected(next);
    // Palavra recém-selecionada já ganha o destaque na hora
    applyLive(new Set([key]), color, font, underline);
  };

  const changeColor = (c: string) => {
    setPendingColor(c);
    applyLive(selected, c, pendingFont, pendingUnderline);
  };

  const changeFont = (f: ElementFont | undefined) => {
    setPendingFont(f);
    applyLive(selected, pendingColor, f, pendingUnderline);
  };

  const toggleUnderline = () => {
    const v = !pendingUnderline;
    setPendingUnderline(v);
    applyLive(selected, pendingColor, pendingFont, v);
  };

  const removeSelected = () => {
    if (selected.size === 0) return;
    onChange(highlights.filter((h) => {
      const ih = h as IndexedHighlight;
      return !selected.has(selKey(h.text, ih.wordIdx ?? 0));
    }));
    setSelected(new Set());
  };

  if (tokensWithIdx.length === 0) return null;

  const hasSelection = selected.size > 0;

  return (
    <div>
      <span className="text-[9px] font-semibold text-gray-900/40 dark:text-white/35 uppercase tracking-[0.08em] block mb-2">{label}</span>

      {/* Word chips */}
      <div className="flex flex-wrap gap-1 mb-2">
        {tokensWithIdx.map(({ word, wordIdx, tokenIdx }) => {
          const hl = getHighlightForToken(highlights, word, wordIdx);
          const key = selKey(word, wordIdx);
          const isSelected = selected.has(key);
          return (
            <button
              key={tokenIdx}
              onClick={() => toggleToken(word, wordIdx)}
              className={cn(
                'px-2 py-0.5 rounded-lg text-[10px] border transition-all font-medium',
                isSelected
                  ? 'border-blue-500/60 bg-blue-500/15 text-blue-500 dark:text-blue-400'
                  : 'border-black/[0.07] dark:border-white/[0.07] text-gray-900/50 dark:text-white/40 hover:border-black/20 dark:hover:border-white/20 hover:text-gray-900 dark:hover:text-white bg-[var(--surface-elevated)]'
              )}
              style={hl && !isSelected ? { borderColor: hl.color + '80', backgroundColor: hl.color + '15', color: hl.color } : {}}
            >
              {word}
            </button>
          );
        })}
      </div>

      {/* Options panel */}
      {hasSelection && (
        <div className="rounded-xl border border-black/[0.07] dark:border-white/[0.07] p-3 flex flex-col gap-2.5 bg-[var(--surface-elevated)]">
          <span className="text-[9px] font-semibold text-gray-900/40 dark:text-white/35">
            {selected.size} palavra{selected.size > 1 ? 's' : ''} selecionada{selected.size > 1 ? 's' : ''}
          </span>
          <ColorPicker label="Cor" value={pendingColor} onChange={changeColor} />
          <div>
            <span className="text-[9px] font-semibold text-gray-900/40 dark:text-white/35 uppercase tracking-[0.08em] block mb-1.5">Fonte</span>
            <ElementFontPicker value={pendingFont} onChange={changeFont} />
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div onClick={toggleUnderline}
              className={cn('w-8 h-4 rounded-full relative transition-colors shrink-0', pendingUnderline ? 'bg-blue-500' : 'bg-black/10 dark:bg-white/10')}>
              <div className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all', pendingUnderline ? 'left-[18px]' : 'left-0.5')} />
            </div>
            <span className="text-[10px] text-gray-900/50 dark:text-white/40">Sublinhado</span>
          </label>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set())}
              className="flex-1 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-[10px] font-bold transition-colors hover:bg-gray-700 dark:hover:bg-white/90">
              Concluir
            </button>
            <button onClick={removeSelected}
              className="px-3 py-2 rounded-xl border border-red-400/30 text-red-400/60 hover:text-red-400 hover:border-red-400/60 text-[10px] font-medium transition-colors">
              Remover
            </button>
          </div>
        </div>
      )}

      {/* Active highlights list */}
      {highlights.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {highlights.map((hl, i) => (
            <div key={i} className="flex items-center gap-1 px-1.5 py-1 rounded-lg border text-[9px] font-medium"
              style={{ borderColor: hl.color + '50', background: hl.color + '12' }}>
              <span style={{ color: hl.color }}>{hl.text}</span>
              <button onClick={() => onChange(highlights.filter((_, j) => j !== i))}
                className="text-gray-900/30 dark:text-white/30 hover:text-red-400 transition-colors ml-0.5">
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ColorPicker({ label, value, onChange, className }: ColorPickerProps) {
  const [hex, setHex] = useState(value);
  useEffect(() => { setHex(value); }, [value]);

  const handleHex = (raw: string) => {
    setHex(raw);
    if (/^#[0-9A-Fa-f]{6}$/.test(raw)) onChange(raw);
  };

  const validHex = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : value;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {label && (
        <span className="text-[9px] font-semibold text-gray-900/40 dark:text-white/35 uppercase tracking-[0.08em] shrink-0">
          {label}
        </span>
      )}
      <label className="relative shrink-0 cursor-pointer group">
        <span
          className="block w-7 h-7 rounded-lg border border-black/10 dark:border-white/10 shadow-sm group-hover:scale-105 transition-transform"
          style={{ background: validHex }}
        />
        <input
          type="color"
          value={validHex}
          onChange={(e) => { onChange(e.target.value); setHex(e.target.value); }}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </label>
      <input
        type="text"
        value={hex}
        onChange={(e) => handleHex(e.target.value)}
        className="w-[76px] px-2 py-1.5 rounded-lg bg-[var(--surface-elevated)] border border-black/[0.07] dark:border-white/[0.07] text-gray-900 dark:text-white text-[10px] font-mono focus:outline-none focus:border-black/20 dark:focus:border-white/20 transition-colors"
        placeholder="#000000"
        maxLength={7}
      />
    </div>
  );
}

interface EditorSidebarProps {
  onOpenWizard: () => void;
  onDownloadSlide: () => void;
  onDownloadAll: () => void;
}

const TEXT_POSITIONS: TextPosition[] = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

export default function EditorSidebar({ onDownloadSlide, onDownloadAll }: EditorSidebarProps) {
  const {
    slides, activeSlideIndex, style, globalSettings,
    updateActiveSlide, updateGlobalSettings, updateCornersConfig,
  } = useEditorStore();

  const slide = slides[activeSlideIndex];
  const { corners, profileBadge, accentColor, theme } = globalSettings;

  const bgImageRef = useRef<HTMLInputElement>(null);
  const gridImageRef = useRef<HTMLInputElement>(null);
  const contentImageRef = useRef<HTMLInputElement>(null);
  const profilePhotoRef = useRef<HTMLInputElement>(null);

  const { generateAll, generateOne, generating, progress } = useGenerateCarouselImages();

  if (!slide) return null;

  // Capa do Editorial (layout 'cover'): não tem shape de imagem de conteúdo —
  // a imagem da capa vai no fundo do slide.
  const isEditorialCover = isEditorialCoverSlide(style, slide, activeSlideIndex);
  // Quantos slides recebem imagem de conteúdo no "gerar para todos" (capa fora)
  const contentSlidesCount = slides.filter((s, i) => !isEditorialCoverSlide(style, s, i)).length;

  const handleImageFile = async (file: File) => {
    const toastId = toast.loading('Enviando imagem…');
    try {
      const url = await uploadImageFile(file, 'slide-images');
      // Sync both fields so templates that read either one (editorial prefers
      // gridImageUrl, minimalist switches on imageType) stay consistent.
      updateActiveSlide({ backgroundImageUrl: url, gridImageUrl: url });
      toast.success('Imagem adicionada', { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha no upload', { id: toastId });
    }
  };

  // Imagem de conteúdo (entre os textos) — distinta do fundo do slide.
  const handleContentImageFile = async (file: File) => {
    const toastId = toast.loading('Enviando imagem…');
    try {
      const url = await uploadImageFile(file, 'slide-images');
      updateActiveSlide({ contentImageUrl: url });
      toast.success('Imagem adicionada', { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha no upload', { id: toastId });
    }
  };

  const labelCls = 'text-[9px] font-semibold text-gray-900/40 dark:text-white/35 uppercase tracking-[0.08em]';
  const inputCls = 'w-full px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-black/[0.07] dark:border-white/[0.07] text-gray-900 dark:text-white text-[11px] placeholder-black/20 dark:placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-black/[0.06] dark:focus:ring-white/[0.06] focus:border-black/20 dark:focus:border-white/20 transition-all';

  /* ─────────────────────────────────────────────────────────────────────────
     Hidden file inputs (used by both modes)
  ───────────────────────────────────────────────────────────────────────── */
  const fileInputs = (
    <>
      <input ref={bgImageRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])} />
      <input ref={gridImageRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])} />
      <input ref={contentImageRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => e.target.files?.[0] && handleContentImageFile(e.target.files[0])} />
      <input ref={profilePhotoRef} type="file" accept="image/*" className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const toastId = toast.loading('Enviando foto…');
          try {
            const url = await uploadImageFile(f, 'profile-photos');
            updateGlobalSettings({ profileBadge: { ...profileBadge, photo: url } });
            toast.success('Foto atualizada', { id: toastId });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Falha no upload', { id: toastId });
          }
        }} />
    </>
  );

  return (
    <div className="w-[272px] shrink-0 bg-[var(--surface)] border-r border-black/[0.05] dark:border-white/[0.05] flex flex-col h-full overflow-hidden">
      {fileInputs}

      {/* Theme toggle — only for profile (Twitter) style */}
      {style === 'profile' && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.05] dark:border-white/[0.05]">
          <span className={labelCls}>Tema do slide</span>
          <div className="flex rounded-lg overflow-hidden bg-black/[0.05] dark:bg-white/[0.05] p-0.5 gap-0.5">
            <button
              onClick={() => updateGlobalSettings({ theme: 'dark' })}
              className={cn('px-3 py-1 text-[9px] font-semibold rounded-md transition-all', theme === 'dark' ? 'bg-gray-900 dark:bg-white text-white dark:text-black shadow-sm' : 'text-gray-900/40 dark:text-white/40 hover:text-gray-900/70 dark:hover:text-white/70')}
            >
              Escuro
            </button>
            <button
              onClick={() => updateGlobalSettings({ theme: 'light' })}
              className={cn('px-3 py-1 text-[9px] font-semibold rounded-md transition-all', theme === 'light' ? 'bg-gray-900 dark:bg-white text-white dark:text-black shadow-sm' : 'text-gray-900/40 dark:text-white/40 hover:text-gray-900/70 dark:hover:text-white/70')}
            >
              Claro
            </button>
          </div>
        </div>
      )}

      {/* ── SCROLLABLE CONTENT ── */}
      <div className="flex-1 overflow-y-auto">

        {style === 'profile' ? (
          /* ══════════════════════════════════
             PROFILE SIDEBAR — focused & clean
             ══════════════════════════════════ */
          <>
            {/* 1. Perfil */}
            <Section title="Perfil" defaultOpen>
              <div className="flex items-center gap-2">
                <div
                  className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden cursor-pointer border border-black/10 dark:border-white/10 shrink-0"
                  onClick={() => profilePhotoRef.current?.click()}
                  title="Clique para trocar a foto"
                >
                  {profileBadge.photo
                    ? <img src={profileBadge.photo} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-gray-900/20 dark:text-white/20 text-[8px]">foto</div>}
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <input
                    className={inputCls}
                    placeholder="Nome"
                    value={profileBadge.name}
                    onChange={(e) => updateGlobalSettings({ profileBadge: { ...profileBadge, name: e.target.value } })}
                  />
                  <input
                    className={inputCls}
                    placeholder="@handle"
                    value={profileBadge.handle}
                    onChange={(e) => updateGlobalSettings({ profileBadge: { ...profileBadge, handle: e.target.value } })}
                  />
                </div>
              </div>
              <Slider
                label="Tamanho nome/handle"
                value={profileBadge.headerFontSize ?? 26}
                min={14}
                max={60}
                onChange={(v) => updateGlobalSettings({ profileBadge: { ...profileBadge, headerFontSize: v } })}
                unit="px"
              />
            </Section>

            {/* 2. Texto */}
            <Section title={`Texto — Slide ${activeSlideIndex + 1}`} defaultOpen>
              <div>
                <span className={labelCls}>Conteúdo</span>
                <input
                  className={cn(inputCls, 'mt-1')}
                  value={slide.title}
                  onChange={(e) => updateActiveSlide({ title: e.target.value })}
                  placeholder="Título / primeiro parágrafo"
                />
              </div>
              <div className="mt-1">
                <textarea
                  className={cn(inputCls, 'resize-none overflow-hidden')}
                  style={{ minHeight: 80 }}
                  value={slide.description || ''}
                  onChange={(e) => {
                    updateActiveSlide({ description: e.target.value });
                    const el = e.target;
                    el.style.height = 'auto';
                    el.style.height = `${el.scrollHeight}px`;
                  }}
                  ref={(el) => {
                    if (el) {
                      el.style.height = 'auto';
                      el.style.height = `${el.scrollHeight}px`;
                    }
                  }}
                  placeholder="Continua o raciocínio..."
                />
              </div>
              <Slider
                label="Tamanho do texto"
                value={slide.fontSize.title}
                min={16}
                max={80}
                onChange={(v) => updateActiveSlide({ fontSize: { ...slide.fontSize, title: v } })}
                unit="px"
              />
              <Slider
                label="Espaçamento de linhas"
                value={slide.lineHeight}
                min={1.0}
                max={2.5}
                step={0.1}
                onChange={(v) => updateActiveSlide({ lineHeight: v })}
              />
              <Slider
                label="Espaço título → descrição"
                value={slide.titleDescriptionGap ?? 16}
                min={0}
                max={80}
                step={1}
                onChange={(v) => updateActiveSlide({ titleDescriptionGap: v })}
                unit="px"
              />
            </Section>

            {/* 3. Mídia */}
            <Section title="Imagem / Vídeo">
              {/* Image upload */}
              <div
                className="border-2 border-dashed border-black/[0.1] dark:border-white/[0.1] rounded-xl p-4 text-center cursor-pointer hover:border-black/20 dark:hover:border-white/20 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-all group"
                onClick={() => bgImageRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f?.type.startsWith('image/')) handleImageFile(f);
                }}
              >
                <Image className="w-4 h-4 mx-auto mb-1.5 text-gray-900/25 dark:text-white/25 group-hover:text-gray-900/40 dark:group-hover:text-white/40 transition-colors" />
                <span className="text-[10px] font-medium text-gray-900/35 dark:text-white/35">Arraste ou clique para adicionar</span>
              </div>

              {/* AI image generation — painel expansível */}
              <div className="flex flex-col gap-1.5 pt-1">
                <AiGenPanel
                  key={`profile-bg-${activeSlideIndex}`}
                  buttonLabel={`Gerar imagem com IA (slide ${activeSlideIndex + 1})`}
                  generating={generating}
                  slideTitle={slide.title}
                  slideDescription={slide.description || ''}
                  onGenerate={(opts) => generateOne(activeSlideIndex, 'background', opts)}
                />
                <button
                  onClick={() => generateAll()}
                  disabled={generating}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-black/[0.07] dark:border-white/[0.07] text-[10px] font-medium text-gray-900/50 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:border-black/20 dark:hover:border-white/20 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-3 h-3" />
                  {generating && progress.total > 1
                    ? `Gerando ${progress.done}/${progress.total}…`
                    : `Gerar para todos os ${slides.length} slides`}
                </button>
              </div>

              {/* Miniatura da imagem anexada */}
              {(slide.backgroundImageUrl || slide.gridImageUrl) && (
                <ImageThumb
                  url={slide.backgroundImageUrl || slide.gridImageUrl || ''}
                  onRemove={() => updateActiveSlide({ backgroundImageUrl: '', gridImageUrl: '' })}
                />
              )}
              {/* Position controls — only when media exists */}
              {(slide.backgroundImageUrl || slide.gridImageUrl) && (
                <>
                  <Slider label="Posição X" value={slide.imagePosition.x} min={0} max={100}
                    onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, x: v } })} unit="%" />
                  <Slider label="Posição Y" value={slide.imagePosition.y} min={0} max={100}
                    onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, y: v } })} unit="%" />
                  <Slider label="Zoom" value={slide.imagePosition.zoom} min={50} max={300}
                    onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, zoom: v } })} unit="%" />
                </>
              )}
            </Section>

          </>
        ) : (
          /* ════════════════════════════════
             MINIMALIST SIDEBAR — full editor
             ════════════════════════════════ */
          <>
            {/* IMAGEM — a capa do Editorial não tem shape de conteúdo */}
            <Section title={`Conteúdo — Slide ${activeSlideIndex + 1}`} defaultOpen>
              {!isEditorialCover && (
              <Section title="Imagem" defaultOpen>
                <div
                  className="border-2 border-dashed border-black/[0.1] dark:border-white/[0.1] rounded-xl p-4 text-center cursor-pointer hover:border-black/20 dark:hover:border-white/20 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-all group"
                  onClick={() => contentImageRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (f) handleContentImageFile(f);
                  }}
                >
                  <Upload className="w-4 h-4 mx-auto mb-1.5 text-gray-900/25 dark:text-white/25 group-hover:text-gray-900/40 dark:group-hover:text-white/40 transition-colors" />
                  <span className="text-[10px] text-gray-900/35 dark:text-white/35 font-medium">Clique ou arraste</span>
                </div>
                {/* AI image generation — painel expansível */}
                <div className="flex flex-col gap-1.5">
                  <AiGenPanel
                    key={`content-${activeSlideIndex}`}
                    buttonLabel={`Gerar imagem com IA (slide ${activeSlideIndex + 1})`}
                    generating={generating}
                    slideTitle={slide.title}
                    slideDescription={slide.description || ''}
                    onGenerate={(opts) => generateOne(activeSlideIndex, 'content', opts)}
                  />
                  <button
                    onClick={() => generateAll('content')}
                    disabled={generating}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-black/[0.07] dark:border-white/[0.07] text-[10px] font-medium text-gray-900/50 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:border-black/20 dark:hover:border-white/20 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Sparkles className="w-3 h-3" />
                    {generating && progress.total > 1
                      ? `Gerando ${progress.done}/${progress.total}…`
                      : `Gerar para os ${contentSlidesCount} slides`}
                  </button>
                </div>

                {slide.contentImageUrl && (
                  <ImageThumb url={slide.contentImageUrl} onRemove={() => updateActiveSlide({ contentImageUrl: '' })} />
                )}
                <Slider label="Posição X" value={slide.contentImagePosition?.x ?? 50} min={0} max={100} onChange={(v) => updateActiveSlide({ contentImagePosition: { x: v, y: slide.contentImagePosition?.y ?? 50, zoom: slide.contentImagePosition?.zoom ?? 100 } })} unit="%" />
                <Slider label="Posição Y" value={slide.contentImagePosition?.y ?? 50} min={0} max={100} onChange={(v) => updateActiveSlide({ contentImagePosition: { x: slide.contentImagePosition?.x ?? 50, y: v, zoom: slide.contentImagePosition?.zoom ?? 100 } })} unit="%" />
                <Slider label="Zoom" value={slide.contentImagePosition?.zoom ?? 100} min={50} max={300} onChange={(v) => updateActiveSlide({ contentImagePosition: { x: slide.contentImagePosition?.x ?? 50, y: slide.contentImagePosition?.y ?? 50, zoom: v, objectFit: slide.contentImagePosition?.objectFit } })} unit="%" />
              </Section>
              )}

              <Section title="Sombra / Overlay">
                <label className="flex items-center gap-2 cursor-pointer">
                  <div
                    onClick={() => updateActiveSlide({ shadow: { ...slide.shadow, style: slide.shadow.style === 'none' ? 'base' : 'none' } })}
                    className={cn('w-8 h-4 rounded-full relative transition-colors', slide.shadow.style !== 'none' ? 'bg-blue-500' : 'bg-black/10 dark:bg-white/10')}
                  >
                    <div className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all', slide.shadow.style !== 'none' ? 'left-[18px]' : 'left-0.5')} />
                  </div>
                  <span className="text-[10px] text-gray-900/50 dark:text-white/50">Exibir sombra</span>
                </label>
                {slide.shadow.style !== 'none' && (
                  <>
                    <Slider label="Opacidade" value={slide.shadow.opacity} min={0} max={100} onChange={(v) => updateActiveSlide({ shadow: { ...slide.shadow, opacity: v } })} unit="%" />
                    <Slider label="Tamanho" value={slide.shadow.size ?? 85} min={10} max={100} onChange={(v) => updateActiveSlide({ shadow: { ...slide.shadow, size: v } })} unit="%" />
                    <Slider label="Distância" value={slide.shadow.distance ?? 55} min={10} max={100} onChange={(v) => updateActiveSlide({ shadow: { ...slide.shadow, distance: v } })} unit="%" />
                    <ColorPicker
                      label="Cor"
                      value={slide.shadow.color || '#000000'}
                      onChange={(v) => updateActiveSlide({ shadow: { ...slide.shadow, color: v } })}
                    />
                  </>
                )}
              </Section>

              <Section title="Fundo do Slide" defaultOpen={isEditorialCover}>
                <ColorPicker
                  label="Cor"
                  value={slide.backgroundColor || '#111111'}
                  onChange={(v) => updateActiveSlide({ backgroundColor: v })}
                />
                <div
                  className="border-2 border-dashed border-black/[0.1] dark:border-white/[0.1] rounded-xl p-4 text-center cursor-pointer hover:border-black/20 dark:hover:border-white/20 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-all group"
                  onClick={() => bgImageRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (f) handleImageFile(f);
                  }}
                >
                  <Upload className="w-4 h-4 mx-auto mb-1.5 text-gray-900/25 dark:text-white/25 group-hover:text-gray-900/40 dark:group-hover:text-white/40 transition-colors" />
                  <span className="text-[10px] text-gray-900/35 dark:text-white/35 font-medium">Clique ou arraste uma imagem de fundo</span>
                </div>
                {isEditorialCover && (
                  <AiGenPanel
                    key={`cover-bg-${activeSlideIndex}`}
                    buttonLabel="Gerar imagem com IA (capa)"
                    generating={generating}
                    slideTitle={slide.title}
                    slideDescription={slide.description || ''}
                    onGenerate={(opts) => generateOne(activeSlideIndex, 'background', opts)}
                  />
                )}
                {(slide.backgroundImageUrl || slide.gridImageUrl) && (
                  <>
                    <ImageThumb url={slide.backgroundImageUrl || slide.gridImageUrl || ''} onRemove={() => updateActiveSlide({ backgroundImageUrl: '', gridImageUrl: '' })} />
                    <Slider label="Opacidade" value={slide.backgroundImageOpacity ?? 100} min={0} max={100} onChange={(v) => updateActiveSlide({ backgroundImageOpacity: v })} unit="%" />
                    <Slider label="Posição X" value={slide.imagePosition.x} min={0} max={100} onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, x: v } })} unit="%" />
                    <Slider label="Posição Y" value={slide.imagePosition.y} min={0} max={100} onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, y: v } })} unit="%" />
                    <Slider label="Zoom" value={slide.imagePosition.zoom} min={50} max={300} onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, zoom: v } })} unit="%" />
                  </>
                )}
              </Section>
            </Section>

            {/* TEXTO */}
            <Section title="Texto do Slide" defaultOpen>

              {/* ── Título ── */}
              <div>
                <span className={labelCls}>Título</span>
                <textarea
                  className={cn(inputCls, 'mt-1 resize-none')}
                  rows={3}
                  value={slide.title}
                  onChange={(e) => updateActiveSlide({ title: e.target.value })}
                  placeholder="Título do slide"
                />
              </div>
              <Slider label="Tamanho título" value={slide.fontSize.title} min={16} max={160}
                onChange={(v) => updateActiveSlide({ fontSize: { ...slide.fontSize, title: v } })} unit="px" />
              <div className="flex items-center gap-2 flex-wrap">
                <ColorPicker value={slide.titleColor || '#FFFFFF'} onChange={(v) => updateActiveSlide({ titleColor: v })} label="Cor" />
                <button
                  onClick={() => updateActiveSlide({ titleUnderline: !slide.titleUnderline })}
                  title="Sublinhado"
                  className={cn(
                    'w-7 h-7 rounded border flex items-center justify-center transition-colors shrink-0',
                    slide.titleUnderline
                      ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-black shadow-sm'
                      : 'border-black/[0.07] dark:border-white/[0.07] bg-[var(--surface-elevated)] text-gray-900/40 dark:text-white/35 hover:border-black/20 dark:hover:border-white/20 hover:text-gray-900 dark:hover:text-white'
                  )}
                >
                  <Underline className="w-3 h-3" />
                </button>
              </div>
              <div>
                <span className={labelCls + ' block mb-1'}>Fonte título</span>
                <ElementFontPicker
                  value={slide.titleFont}
                  onChange={(v) => updateActiveSlide({ titleFont: v })}
                />
              </div>

              {/* ── Descrição ── */}
              <div className="mt-2">
                <span className={labelCls}>Descrição</span>
                <textarea className={cn(inputCls, 'mt-1 resize-none h-16')} value={slide.description || ''}
                  onChange={(e) => updateActiveSlide({ description: e.target.value })} placeholder="Descrição do slide" />
              </div>
              <Slider label="Tamanho descrição" value={slide.fontSize.description} min={10} max={80}
                onChange={(v) => updateActiveSlide({ fontSize: { ...slide.fontSize, description: v } })} unit="px" />
              <div className="flex items-center gap-2 flex-wrap">
                <ColorPicker value={slide.descriptionColor || 'rgba(255,255,255,0.7)'} onChange={(v) => updateActiveSlide({ descriptionColor: v })} label="Cor" />
                <button
                  onClick={() => updateActiveSlide({ descriptionUnderline: !slide.descriptionUnderline })}
                  title="Sublinhado"
                  className={cn(
                    'w-7 h-7 rounded border flex items-center justify-center transition-colors shrink-0',
                    slide.descriptionUnderline
                      ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-black shadow-sm'
                      : 'border-black/[0.07] dark:border-white/[0.07] bg-[var(--surface-elevated)] text-gray-900/40 dark:text-white/35 hover:border-black/20 dark:hover:border-white/20 hover:text-gray-900 dark:hover:text-white'
                  )}
                >
                  <Underline className="w-3 h-3" />
                </button>
              </div>
              <div>
                <span className={labelCls + ' block mb-1'}>Fonte descrição</span>
                <ElementFontPicker
                  value={slide.descriptionFont}
                  onChange={(v) => updateActiveSlide({ descriptionFont: v })}
                />
              </div>

              {/* ── Espaçamento entre título e descrição ── */}
              <Slider
                label="Espaço título → descrição"
                value={slide.titleDescriptionGap ?? 16}
                min={0}
                max={80}
                step={1}
                onChange={(v) => updateActiveSlide({ titleDescriptionGap: v })}
                unit="px"
              />

              {/* ── Espaçamento de letras (título) ── */}
              <Slider
                label="Espaçamento de letras (título)"
                value={slide.titleLetterSpacing ?? -0.02}
                min={-0.1}
                max={0.3}
                step={0.01}
                onChange={(v) => updateActiveSlide({ titleLetterSpacing: v })}
                unit="em"
              />

              {/* ── Destaques título ── */}
              <WordHighlightPicker
                label="Destaques no título"
                text={slide.title}
                highlights={(slide.highlights || []).filter(h => slide.title.toLowerCase().includes(h.text.toLowerCase()))}
                onChange={(titleHls) => {
                  const otherHls = (slide.highlights || []).filter(h => !slide.title.toLowerCase().includes(h.text.toLowerCase()));
                  updateActiveSlide({ highlights: [...otherHls, ...titleHls] });
                }}
                accentColor={accentColor}
              />

              {/* ── Destaques descrição ── */}
              {slide.description && (
                <WordHighlightPicker
                  label="Destaques na descrição"
                  text={slide.description}
                  highlights={(slide.highlights || []).filter(h => (slide.description || '').toLowerCase().includes(h.text.toLowerCase()))}
                  onChange={(descHls) => {
                    const otherHls = (slide.highlights || []).filter(h => !(slide.description || '').toLowerCase().includes(h.text.toLowerCase()));
                    updateActiveSlide({ highlights: [...otherHls, ...descHls] });
                  }}
                  accentColor={accentColor}
                />
              )}

              <Slider label="Espaçamento entre linhas" value={slide.lineHeight} min={1.0} max={2.5} step={0.1}
                onChange={(v) => updateActiveSlide({ lineHeight: v })} />

              {/* ── Posição do texto ── */}
              <div>
                <span className={labelCls + ' block mb-1.5'}>Posição do texto</span>
                <div className="grid grid-cols-3 gap-1">
                  {TEXT_POSITIONS.map((pos) => (
                    <button key={pos} onClick={() => {
                      const autoAlign = (pos === 'top-center' || pos === 'center' || pos === 'bottom-center') ? 'center'
                        : (pos === 'top-right' || pos === 'middle-right' || pos === 'bottom-right') ? 'right'
                        : 'left';
                      updateActiveSlide({ textPosition: pos, textOffset: undefined, textAlignment: autoAlign });
                    }} title={pos}
                      className={cn('h-7 rounded text-[8px] transition-colors border',
                        slide.textPosition === pos ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white shadow-sm' : 'bg-[var(--surface-elevated)] text-gray-900/30 dark:text-white/25 border-black/[0.07] dark:border-white/[0.07] hover:border-black/20 dark:hover:border-white/20 hover:text-gray-900/60 dark:hover:text-white/60'
                      )}
                    >
                      {pos === 'top-left' ? '↖' : pos === 'top-center' ? '↑' : pos === 'top-right' ? '↗'
                        : pos === 'middle-left' ? '←' : pos === 'center' ? '·' : pos === 'middle-right' ? '→'
                        : pos === 'bottom-left' ? '↙' : pos === 'bottom-center' ? '↓' : '↘'}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1">
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <button
                      key={align}
                      onClick={() => updateActiveSlide({ textAlignment: align })}
                      className={cn('h-7 rounded text-[8px] transition-colors border',
                        slide.textAlignment === align ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white shadow-sm' : 'bg-[var(--surface-elevated)] text-gray-900/30 dark:text-white/25 border-black/[0.07] dark:border-white/[0.07] hover:border-black/20 dark:hover:border-white/20 hover:text-gray-900/60 dark:hover:text-white/60'
                      )}
                    >
                      {align === 'left' ? '⬅ esq' : align === 'center' ? '↔ centro' : '➡ dir'}
                    </button>
                  ))}
                </div>
                {style === 'editorial' && (
                  <div className="mt-3 space-y-2">
                    <Slider
                      label="Mover título ↕"
                      value={slide.editorialTitleOffsetY ?? 0}
                      min={-500} max={500} step={1}
                      onChange={(v) => updateActiveSlide({ editorialTitleOffsetY: v })}
                      unit="px"
                    />
                    <Slider
                      label="Mover descrição ↕"
                      value={slide.editorialDescOffsetY ?? 0}
                      min={-500} max={500} step={1}
                      onChange={(v) => updateActiveSlide({ editorialDescOffsetY: v })}
                      unit="px"
                    />
                  </div>
                )}
              </div>
            </Section>

            {/* CANTOS */}
            <Section title="Cantos">
              <label className="flex items-center gap-2 cursor-pointer">
                <div onClick={() => updateCornersConfig({ show: !corners.show })} className={cn('w-8 h-4 rounded-full relative transition-colors', corners.show ? 'bg-blue-500' : 'bg-black/10 dark:bg-white/10')}>
                  <div className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all', corners.show ? 'left-[18px]' : 'left-0.5')} />
                </div>
                <span className="text-[10px] text-gray-900/50 dark:text-white/50">Exibir cantos</span>
              </label>
              {corners.show && (
                <>
                  {(['topLeft', 'topRight'] as const).map((key) => (
                    <div key={key} className="flex items-center gap-2">
                      <div onClick={() => updateCornersConfig({ [key]: { ...corners[key], visible: !corners[key].visible } } as never)}
                        className={cn('w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer shrink-0', corners[key].visible ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white' : 'border-black/30 dark:border-white/30')}>
                        {corners[key].visible && <span className="text-black text-[8px] font-bold">✓</span>}
                      </div>
                      <input className={cn(inputCls, 'flex-1 text-[10px]')} value={corners[key].text}
                        onChange={(e) => updateCornersConfig({ [key]: { ...corners[key], text: e.target.value } } as never)} placeholder={key} />
                    </div>
                  ))}
                  <Slider label="Tamanho fonte" value={corners.fontSize} min={8} max={32} onChange={(v) => updateCornersConfig({ fontSize: v })} unit="px" />
                  <Slider label="Distância bordas" value={corners.borderDistance} min={0} max={150} onChange={(v) => updateCornersConfig({ borderDistance: v })} unit="px" />
                  <Slider label="Opacidade" value={corners.opacity} min={0} max={100} onChange={(v) => updateCornersConfig({ opacity: v })} unit="%" />
                  <ColorPicker
                    label="Cor"
                    value={corners.color || '#FFFFFF'}
                    onChange={(v) => updateCornersConfig({ color: v })}
                  />
                  <div>
                    <span className={labelCls + ' block mb-1'}>Fonte</span>
                    <ElementFontPicker
                      value={corners.elementFont}
                      onChange={(v) => updateCornersConfig({ elementFont: v })}
                    />
                  </div>
                </>
              )}
            </Section>

          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-black/[0.05] dark:border-white/[0.05] px-4 py-4 flex flex-col gap-2.5 bg-[var(--surface)]">
        <button
          onClick={onDownloadSlide}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-[11px] font-bold hover:bg-gray-700 dark:hover:bg-white/90 active:scale-[0.98] transition-all shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          Baixar Slide {activeSlideIndex + 1}
        </button>
        <button
          onClick={onDownloadAll}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-black/[0.07] dark:border-white/[0.07] text-[11px] font-medium text-gray-900/50 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:border-black/20 dark:hover:border-white/20 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-all"
        >
          <Archive className="w-3.5 h-3.5" />
          Baixar todos os slides
        </button>
      </div>
    </div>
  );
}
