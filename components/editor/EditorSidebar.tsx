'use client';

import { useRef, useState } from 'react';
import { Sparkles, Download, RefreshCw, Archive, Upload, Clipboard, Wand2, Image, X } from 'lucide-react';
import { useEditorStore } from '@/hooks/useEditorStore';
import Slider from './Slider';
import Section from './Section';
import { cn } from '@/lib/utils';
import { TextPosition, ShadowStyle, CornerIcon, BadgeStyle, CtaStyle, FontPair } from '@/types';
import toast from 'react-hot-toast';

interface EditorSidebarProps {
  onOpenWizard: () => void;
  onDownloadSlide: () => void;
  onDownloadAll: () => void;
  onRefreshSlide: () => void;
}

const TEXT_POSITIONS: TextPosition[] = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

const SHADOW_STYLES: { value: ShadowStyle; label: string }[] = [
  { value: 'base', label: 'Base' },
  { value: 'top-strong', label: 'Topo Forte' },
  { value: 'base-strong', label: 'Base Forte' },
  { value: 'gradient-full', label: 'Gradiente Total' },
  { value: 'none', label: 'Sem Sombra' },
];

const CORNER_ICONS: { value: CornerIcon; label: string }[] = [
  { value: 'none', label: '—' },
  { value: 'bookmark', label: '🔖' },
  { value: 'arrow', label: '→' },
  { value: 'heart', label: '♡' },
];

const FONT_PAIRS: { value: FontPair; label: string }[] = [
  { value: 'SF Pro Display + IvyOra Text', label: 'SF Pro + IvyOra' },
  { value: 'Space Grotesk + Inter', label: 'Space Grotesk' },
  { value: 'Playfair Display + Lato', label: 'Playfair + Lato' },
  { value: 'Oswald + Roboto', label: 'Oswald + Roboto' },
  { value: 'Montserrat + Open Sans', label: 'Montserrat' },
  { value: 'Bebas Neue + Inter', label: 'Bebas Neue' },
  { value: 'Syne + DM Sans', label: 'Syne + DM Sans' },
];

export default function EditorSidebar({ onOpenWizard, onDownloadSlide, onDownloadAll, onRefreshSlide }: EditorSidebarProps) {
  const {
    slides, activeSlideIndex, style, globalSettings,
    updateActiveSlide, updateGlobalSettings, updateCornersConfig,
    applyLayoutToNext, setStyle,
  } = useEditorStore();

  const slide = slides[activeSlideIndex];
  const { corners, profileBadge, accentColor, fontPair, theme } = globalSettings;

  const bgImageRef = useRef<HTMLInputElement>(null);
  const gridImageRef = useRef<HTMLInputElement>(null);
  const profilePhotoRef = useRef<HTMLInputElement>(null);

  const [refineInstruction, setRefineInstruction] = useState('');
  const [refining, setRefining] = useState(false);

  if (!slide) return null;

  const handleImageFile = (file: File, type: 'background' | 'grid') => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      if (type === 'background') updateActiveSlide({ backgroundImageUrl: url });
      else updateActiveSlide({ gridImageUrl: url });
    };
    reader.readAsDataURL(file);
  };

  const handlePasteImage = async (type: 'background' | 'grid') => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (imgType) {
          const blob = await item.getType(imgType);
          handleImageFile(new File([blob], 'paste.png', { type: imgType }), type);
          return;
        }
      }
      toast.error('Nenhuma imagem no clipboard');
    } catch { toast.error('Clipboard indisponível'); }
  };

  const handleRefine = async () => {
    if (!refineInstruction.trim()) { toast.error('Digite uma instrução'); return; }
    setRefining(true);
    try {
      const res = await fetch('/api/refine-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slideId: activeSlideIndex + 1,
          currentContent: `${slide.title}\n${slide.description}`,
          instruction: refineInstruction,
          allSlides: slides,
        }),
      });
      const data = await res.json();
      if (data.title) {
        updateActiveSlide({
          title: data.title,
          description: data.description || slide.description,
          highlightWord: data.highlightWord || slide.highlightWord,
        });
        setRefineInstruction('');
        toast.success('Slide refinado!');
      }
    } catch { toast.error('Erro ao refinar'); }
    finally { setRefining(false); }
  };

  const labelCls = 'text-[10px] text-gray-900/40 dark:text-white/40 uppercase tracking-wider';
  const inputCls = 'w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-elevated)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-xs placeholder-black/20 dark:placeholder-white/20 focus:outline-none focus:border-black/30 dark:focus:border-white/30';

  /* ─────────────────────────────────────────────────────────────────────────
     Hidden file inputs (used by both modes)
  ───────────────────────────────────────────────────────────────────────── */
  const fileInputs = (
    <>
      <input ref={bgImageRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0], 'background')} />
      <input ref={gridImageRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0], 'grid')} />
      <input ref={profilePhotoRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = (ev) => updateGlobalSettings({ profileBadge: { ...profileBadge, photo: ev.target?.result as string } });
          r.readAsDataURL(f);
        }} />
    </>
  );

  return (
    <div className="w-[290px] shrink-0 bg-[var(--surface)] border-r border-black/[0.06] dark:border-white/[0.06] flex flex-col h-full overflow-hidden">
      {fileInputs}

      {/* Style tabs */}
      <div className="flex border-b border-black/[0.06] dark:border-white/[0.06]">
        {(['minimalist', 'profile'] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setStyle(s);
              // Profile defaults to light theme; minimalist defaults to dark
              if (s === 'profile') updateGlobalSettings({ theme: 'light' });
              else updateGlobalSettings({ theme: 'dark' });
            }}
            className={cn(
              'flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors',
              style === s ? 'text-gray-900 dark:text-white border-b-2 border-gray-900 dark:border-white' : 'text-gray-900/30 dark:text-white/30 hover:text-gray-900/60 dark:hover:text-white/60'
            )}
          >
            {s === 'minimalist' ? 'Minimalista' : 'Profile'}
          </button>
        ))}
      </div>

      {/* Theme toggle — slide content theme (dark/light slide) */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-black/[0.06] dark:border-white/[0.06]">
        <span className={labelCls}>Tema do slide</span>
        <div className="flex rounded-lg overflow-hidden border border-black/10 dark:border-white/10">
          <button
            onClick={() => updateGlobalSettings({ theme: 'dark' })}
            className={cn('px-2.5 py-1 text-[10px] transition-colors', theme === 'dark' ? 'bg-gray-900 dark:bg-white text-white dark:text-black' : 'text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white')}
          >
            Escuro
          </button>
          <button
            onClick={() => updateGlobalSettings({ theme: 'light' })}
            className={cn('px-2.5 py-1 text-[10px] transition-colors', theme === 'light' ? 'bg-gray-900 dark:bg-white text-white dark:text-black' : 'text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white')}
          >
            Claro
          </button>
        </div>
      </div>

      {/* Generate with AI */}
      <button
        onClick={onOpenWizard}
        className="flex items-center gap-2 px-3 py-2.5 text-xs text-gray-900/60 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-black/[0.06] dark:border-white/[0.06] w-full text-left"
      >
        <Sparkles className="w-3.5 h-3.5 text-blue-400" />
        Gerar com IA
      </button>

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
            </Section>

            {/* 3. Mídia */}
            <Section title="Imagem / Vídeo">
              {/* Image upload */}
              <div
                className="border border-dashed border-black/20 dark:border-white/20 rounded-lg p-3 text-center text-xs text-gray-900/30 dark:text-white/30 cursor-pointer hover:border-black/40 dark:hover:border-white/40 hover:text-gray-900/50 dark:hover:text-white/50 transition-colors"
                onClick={() => bgImageRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f?.type.startsWith('image/')) handleImageFile(f, 'background');
                }}
              >
                <div className="flex items-center justify-center gap-3 text-gray-900/20 dark:text-white/20 mb-1">
                  <Image className="w-4 h-4" />
                </div>
                <span className="text-[10px]">Arraste ou clique para adicionar</span>
              </div>

              {/* Quick actions row */}
              <div className="flex gap-1">
                <button
                  onClick={() => bgImageRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-[10px] text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:border-black/30 dark:hover:border-white/30 transition-colors"
                >
                  <Image className="w-3 h-3" /> Imagem
                </button>
                <button
                  onClick={() => handlePasteImage('background')}
                  className="py-1.5 px-2 rounded-lg border border-black/10 dark:border-white/10 text-[10px] text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:border-black/30 dark:hover:border-white/30 transition-colors"
                  title="Colar do clipboard"
                >
                  <Clipboard className="w-3 h-3" />
                </button>
              </div>

              {/* Current media status */}
              {(slide.backgroundImageUrl || slide.gridImageUrl) && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-green-400/80">Imagem carregada</span>
                  <button
                    onClick={() => updateActiveSlide({ backgroundImageUrl: '', gridImageUrl: '' })}
                    className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Remover
                  </button>
                </div>
              )}
              {/* Position controls — only when media exists */}
              {(slide.backgroundImageUrl || slide.gridImageUrl) && (
                <>
                  <Slider label="Posição X" value={slide.imagePosition.x} min={0} max={100}
                    onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, x: v } })} unit="%" />
                  <Slider label="Posição Y" value={slide.imagePosition.y} min={0} max={100}
                    onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, y: v } })} unit="%" />
                </>
              )}
            </Section>

            {/* 4. Tipografia */}
            <Section title="Tipografia">
              <div className="flex flex-col gap-1">
                {FONT_PAIRS.map((fp) => (
                  <button
                    key={fp.value}
                    onClick={() => updateGlobalSettings({ fontPair: fp.value })}
                    className={cn(
                      'w-full px-2.5 py-1.5 rounded-lg text-[10px] text-left transition-colors border',
                      fontPair === fp.value
                        ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white font-semibold'
                        : 'bg-black/5 dark:bg-white/5 text-gray-900/50 dark:text-white/50 border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'
                    )}
                  >
                    {fp.label}
                  </button>
                ))}
              </div>
            </Section>
          </>
        ) : (
          /* ════════════════════════════════
             MINIMALIST SIDEBAR — full editor
             ════════════════════════════════ */
          <>
            {/* IMAGEM DE FUNDO */}
            <Section title={`Conteúdo — Slide ${activeSlideIndex + 1}`} defaultOpen>
              <Section title="Imagem de Fundo" defaultOpen>
                <div
                  className="border border-dashed border-black/20 dark:border-white/20 rounded-lg p-3 text-center text-xs text-gray-900/30 dark:text-white/30 cursor-pointer hover:border-black/40 dark:hover:border-white/40 hover:text-gray-900/50 dark:hover:text-white/50 transition-colors"
                  onClick={() => bgImageRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (f) handleImageFile(f, 'background');
                  }}
                >
                  <Upload className="w-4 h-4 mx-auto mb-1 opacity-50" />
                  Clique ou arraste
                </div>
                <button onClick={() => handlePasteImage('background')} className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-white/10 text-[10px] text-white/40 hover:text-white hover:border-white/30 transition-colors">
                  <Clipboard className="w-3 h-3" /> Colar do clipboard
                </button>
                {slide.backgroundImageUrl && (
                  <div className="flex gap-1">
                    <button onClick={() => updateActiveSlide({ gridImageUrl: slide.backgroundImageUrl, backgroundImageUrl: '' })} className="flex-1 text-[10px] text-gray-900/40 dark:text-white/40 hover:text-gray-900/60 dark:hover:text-white/60 transition-colors text-left">
                      → Aplicar ao Fundo
                    </button>
                    <button onClick={() => updateActiveSlide({ backgroundImageUrl: '' })} className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors">
                      Limpar
                    </button>
                  </div>
                )}
                <Slider label="Posição X" value={slide.imagePosition.x} min={0} max={100} onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, x: v } })} unit="%" />
                <Slider label="Posição Y" value={slide.imagePosition.y} min={0} max={100} onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, y: v } })} unit="%" />
                <Slider label="Zoom" value={slide.imagePosition.zoom} min={50} max={300} onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, zoom: v } })} unit="%" />
              </Section>

              <Section title="Sombra / Overlay">
                <div>
                  <span className={labelCls}>Estilo</span>
                  <select
                    value={slide.shadow.style}
                    onChange={(e) => updateActiveSlide({ shadow: { ...slide.shadow, style: e.target.value as ShadowStyle } })}
                    className={cn(inputCls, 'mt-1')}
                  >
                    {SHADOW_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <Slider label="Opacidade" value={slide.shadow.opacity} min={0} max={100} onChange={(v) => updateActiveSlide({ shadow: { ...slide.shadow, opacity: v } })} unit="%" />
              </Section>

              <Section title="Fundo do Slide">
                <div className="flex items-center gap-2">
                  <span className={labelCls}>Cor</span>
                  <input
                    type="color"
                    value={slide.backgroundColor || '#111111'}
                    onChange={(e) => updateActiveSlide({ backgroundColor: e.target.value })}
                    className="w-8 h-7 rounded cursor-pointer bg-transparent border border-black/10 dark:border-white/10"
                  />
                </div>
              </Section>
            </Section>

            {/* TEXTO */}
            <Section title="Texto do Slide" defaultOpen>
              <div>
                <span className={labelCls}>Título</span>
                <input className={cn(inputCls, 'mt-1')} value={slide.title}
                  onChange={(e) => updateActiveSlide({ title: e.target.value })} placeholder="Título do slide" />
              </div>
              <Slider label="Tamanho título" value={slide.fontSize.title} min={16} max={120}
                onChange={(v) => updateActiveSlide({ fontSize: { ...slide.fontSize, title: v } })} unit="px" />
              <div>
                <span className={labelCls}>Descrição</span>
                <textarea className={cn(inputCls, 'mt-1 resize-none h-16')} value={slide.description || ''}
                  onChange={(e) => updateActiveSlide({ description: e.target.value })} placeholder="Descrição do slide" />
              </div>
              <div className="mt-2">
                <span className={labelCls}>Texto extra (subtítulo)</span>
                <input className={cn(inputCls, 'mt-1')} value={slide.subtitle || ''}
                  onChange={(e) => updateActiveSlide({ subtitle: e.target.value })} placeholder="Subtítulo opcional" />
              </div>
              <Slider label="Tamanho descrição" value={slide.fontSize.description} min={10} max={60}
                onChange={(v) => updateActiveSlide({ fontSize: { ...slide.fontSize, description: v } })} unit="px" />
              <div>
                <span className={labelCls}>Palavra em destaque</span>
                <input className={cn(inputCls, 'mt-1')} value={slide.highlightWord || ''}
                  onChange={(e) => updateActiveSlide({ highlightWord: e.target.value })} placeholder="palavra" />
              </div>
              <Slider label="Espaçamento entre linhas" value={slide.lineHeight} min={1.0} max={2.5} step={0.1}
                onChange={(v) => updateActiveSlide({ lineHeight: v })} />
              <div>
                <span className={labelCls + ' block mb-1.5'}>Posição do texto</span>
                <div className="grid grid-cols-3 gap-1">
                  {TEXT_POSITIONS.map((pos) => (
                    <button key={pos} onClick={() => updateActiveSlide({ textPosition: pos, textOffset: undefined })} title={pos}
                      className={cn('h-7 rounded text-[8px] transition-colors border',
                        slide.textPosition === pos ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white' : 'bg-black/5 dark:bg-white/5 text-gray-900/30 dark:text-white/30 border-black/10 dark:border-white/10 hover:border-black/30 dark:hover:border-white/30'
                      )}
                    >
                      {pos === 'top-left' ? '↖' : pos === 'top-center' ? '↑' : pos === 'top-right' ? '↗'
                        : pos === 'middle-left' ? '←' : pos === 'center' ? '·' : pos === 'middle-right' ? '→'
                        : pos === 'bottom-left' ? '↙' : pos === 'bottom-center' ? '↓' : '↘'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3">
                <span className={labelCls + ' block mb-1.5'}>Posição livre (use os sliders ou arraste o texto)</span>
                <Slider label="X (%)" value={slide.textOffset?.x ?? 15} min={0} max={100}
                  onChange={(v) => updateActiveSlide({ textOffset: { x: v, y: slide.textOffset?.y ?? 80 } })} unit="%" />
                <Slider label="Y (%)" value={slide.textOffset?.y ?? 80} min={0} max={100}
                  onChange={(v) => updateActiveSlide({ textOffset: { x: slide.textOffset?.x ?? 15, y: v } })} unit="%" />
                <div className="mt-2 grid grid-cols-3 gap-1">
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <button
                      key={align}
                      onClick={() => updateActiveSlide({ textAlignment: align })}
                      className={cn('h-7 rounded text-[8px] transition-colors border',
                        slide.textAlignment === align ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white' : 'bg-black/5 dark:bg-white/5 text-gray-900/30 dark:text-white/30 border-black/10 dark:border-white/10 hover:border-black/30 dark:hover:border-white/30'
                      )}
                    >
                      {align}
                    </button>
                  ))}
                </div>
              </div>
            </Section>

            {/* REFINAR COM IA */}
            <Section title="Refinar com IA">
              <textarea className={cn(inputCls, 'resize-none h-14')}
                placeholder="Ex: deixe mais resumido, tom humorístico..."
                value={refineInstruction} onChange={(e) => setRefineInstruction(e.target.value)} />
              <button onClick={handleRefine} disabled={refining}
                className="w-full py-1.5 rounded-lg bg-black/10 dark:bg-white/10 text-gray-900 dark:text-white text-[10px] font-bold hover:bg-black/20 dark:hover:bg-white/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                <Wand2 className="w-3 h-3" />
                {refining ? 'Refinando...' : 'Refinar slide'}
              </button>
            </Section>

            {/* ESTILO GLOBAL */}
            <Section title="Estilo Global">
              <div className="flex items-center gap-2">
                <span className={labelCls}>Cor de destaque</span>
                <input type="color" value={accentColor}
                  onChange={(e) => updateGlobalSettings({ accentColor: e.target.value })}
                  className="w-8 h-7 rounded cursor-pointer bg-transparent border border-black/10 dark:border-white/10" />
                <span className="text-[10px] text-gray-900/40 dark:text-white/40 font-mono">{accentColor}</span>
              </div>
              <button onClick={applyLayoutToNext} className="w-full py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-[10px] text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:border-black/30 dark:hover:border-white/30 transition-colors">
                Aplicar layout no próximo slide →
              </button>
            </Section>

            {/* TIPOGRAFIA GLOBAL */}
            <Section title="Tipografia">
              <div className="flex flex-col gap-1">
                {FONT_PAIRS.map((fp) => (
                  <button key={fp.value} onClick={() => updateGlobalSettings({ fontPair: fp.value })}
                    className={cn('w-full px-2.5 py-1.5 rounded-lg text-[10px] text-left transition-colors border',
                      fontPair === fp.value ? 'bg-white text-black border-white font-semibold' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    {fp.label}
                  </button>
                ))}
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
                  {(['topLeft', 'topRight', 'bottomLeft'] as const).map((key) => (
                    <div key={key} className="flex items-center gap-2">
                      <div onClick={() => updateCornersConfig({ [key]: { ...corners[key], visible: !corners[key].visible } } as never)}
                        className={cn('w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer shrink-0', corners[key].visible ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white' : 'border-black/30 dark:border-white/30')}>
                        {corners[key].visible && <span className="text-black text-[8px] font-bold">✓</span>}
                      </div>
                      <input className={cn(inputCls, 'flex-1 text-[10px]')} value={corners[key].text}
                        onChange={(e) => updateCornersConfig({ [key]: { ...corners[key], text: e.target.value } } as never)} placeholder={key} />
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <div onClick={() => updateCornersConfig({ bottomRight: { ...corners.bottomRight, visible: !corners.bottomRight.visible } })}
                      className={cn('w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer shrink-0', corners.bottomRight.visible ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white' : 'border-black/30 dark:border-white/30')}>
                      {corners.bottomRight.visible && <span className="text-black text-[8px] font-bold">✓</span>}
                    </div>
                    <input className={cn(inputCls, 'flex-1 text-[10px]')} value={corners.bottomRight.text}
                      onChange={(e) => updateCornersConfig({ bottomRight: { ...corners.bottomRight, text: e.target.value } })} />
                    <div className="flex gap-0.5">
                      {CORNER_ICONS.map((ic) => (
                        <button key={ic.value} onClick={() => updateCornersConfig({ bottomRight: { ...corners.bottomRight, icon: ic.value } })}
                          className={cn('w-6 h-6 rounded text-[10px] transition-colors', corners.bottomRight.icon === ic.value ? 'bg-gray-900 dark:bg-white text-white dark:text-black' : 'bg-black/5 dark:bg-white/5 text-gray-900/40 dark:text-white/40 hover:bg-black/10 dark:hover:bg-white/10')}>
                          {ic.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Slider label="Tamanho fonte" value={corners.fontSize} min={8} max={20} onChange={(v) => updateCornersConfig({ fontSize: v })} unit="px" />
                  <Slider label="Distância bordas" value={corners.borderDistance} min={0} max={150} onChange={(v) => updateCornersConfig({ borderDistance: v })} unit="px" />
                  <Slider label="Opacidade" value={corners.opacity} min={0} max={100} onChange={(v) => updateCornersConfig({ opacity: v })} unit="%" />
                  <Slider label="Arredondamento" value={corners.borderRadius} min={0} max={20} onChange={(v) => updateCornersConfig({ borderRadius: v })} unit="px" />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div onClick={() => updateCornersConfig({ glass: !corners.glass })} className={cn('w-8 h-4 rounded-full relative transition-colors', corners.glass ? 'bg-blue-500' : 'bg-black/10 dark:bg-white/10')}>
                      <div className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all', corners.glass ? 'left-[18px]' : 'left-0.5')} />
                    </div>
                    <span className="text-[10px] text-gray-900/50 dark:text-white/50">Efeito glass</span>
                  </label>
                </>
              )}
            </Section>

            {/* BADGE DE PERFIL */}
            <Section title="Badge de Perfil">
              <label className="flex items-center gap-2 cursor-pointer">
                <div onClick={() => updateGlobalSettings({ profileBadge: { ...profileBadge, show: !profileBadge.show } })} className={cn('w-8 h-4 rounded-full relative transition-colors', profileBadge.show ? 'bg-blue-500' : 'bg-black/10 dark:bg-white/10')}>
                  <div className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all', profileBadge.show ? 'left-[18px]' : 'left-0.5')} />
                </div>
                <span className="text-[10px] text-gray-900/50 dark:text-white/50">Exibir badge</span>
              </label>
              {profileBadge.show && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden cursor-pointer border border-black/10 dark:border-white/10 shrink-0" onClick={() => profilePhotoRef.current?.click()}>
                      {profileBadge.photo ? <img src={profileBadge.photo} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-900/20 dark:text-white/20 text-[8px]">foto</div>}
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <input className={inputCls} placeholder="Nome" value={profileBadge.name} onChange={(e) => updateGlobalSettings({ profileBadge: { ...profileBadge, name: e.target.value } })} />
                      <input className={inputCls} placeholder="@handle" value={profileBadge.handle} onChange={(e) => updateGlobalSettings({ profileBadge: { ...profileBadge, handle: e.target.value } })} />
                    </div>
                  </div>
                  <Slider label="Tamanho" value={profileBadge.size} min={30} max={80} onChange={(v) => updateGlobalSettings({ profileBadge: { ...profileBadge, size: v } })} unit="px" />
                  <div className="flex gap-1">
                    {(['solid', 'minimal', 'glass'] as BadgeStyle[]).map((s) => (
                      <button key={s} onClick={() => updateGlobalSettings({ profileBadge: { ...profileBadge, style: s } })}
                        className={cn('flex-1 py-1 rounded text-[9px] capitalize transition-colors', profileBadge.style === s ? 'bg-gray-900 dark:bg-white text-white dark:text-black' : 'bg-black/5 dark:bg-white/5 text-gray-900/40 dark:text-white/40 hover:bg-black/10 dark:hover:bg-white/10')}>
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </Section>

            {/* CTA */}
            <Section title="Botão CTA">
              <label className="flex items-center gap-2 cursor-pointer">
                <div onClick={() => updateActiveSlide({ ctaButton: { ...slide.ctaButton, show: !slide.ctaButton.show } })} className={cn('w-8 h-4 rounded-full relative transition-colors', slide.ctaButton.show ? 'bg-blue-500' : 'bg-black/10 dark:bg-white/10')}>
                  <div className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all', slide.ctaButton.show ? 'left-[18px]' : 'left-0.5')} />
                </div>
                <span className="text-[10px] text-gray-900/50 dark:text-white/50">Exibir CTA</span>
              </label>
              {slide.ctaButton.show && (
                <>
                  <input className={inputCls} placeholder="Texto do botão" value={slide.ctaButton.text}
                    onChange={(e) => updateActiveSlide({ ctaButton: { ...slide.ctaButton, text: e.target.value } })} />
                  <Slider label="Tamanho fonte" value={slide.ctaButton.fontSize} min={10} max={28}
                    onChange={(v) => updateActiveSlide({ ctaButton: { ...slide.ctaButton, fontSize: v } })} unit="px" />
                  <Slider label="Arredondamento" value={slide.ctaButton.borderRadius} min={0} max={30}
                    onChange={(v) => updateActiveSlide({ ctaButton: { ...slide.ctaButton, borderRadius: v } })} unit="px" />
                  <div className="flex gap-1">
                    {(['solid', 'outline', 'glass'] as CtaStyle[]).map((s) => (
                      <button key={s} onClick={() => updateActiveSlide({ ctaButton: { ...slide.ctaButton, style: s } })}
                        className={cn('flex-1 py-1 rounded text-[9px] capitalize transition-colors', slide.ctaButton.style === s ? 'bg-gray-900 dark:bg-white text-white dark:text-black' : 'bg-black/5 dark:bg-white/5 text-gray-900/40 dark:text-white/40 hover:bg-black/10 dark:hover:bg-white/10')}>
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </Section>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-black/[0.06] dark:border-white/[0.06] p-3 flex flex-col gap-2">
        <button
          onClick={onDownloadSlide}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black text-xs font-bold hover:bg-gray-900/90 dark:hover:bg-white/90 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Baixar Slide {activeSlideIndex + 1}
        </button>
        <div className="flex gap-2">
          <button onClick={onRefreshSlide} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-[10px] text-gray-900/50 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:border-black/30 dark:hover:border-white/30 transition-colors">
            <RefreshCw className="w-3 h-3" /> Atualizar
          </button>
          <button onClick={onDownloadAll} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-[10px] text-gray-900/50 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:border-black/30 dark:hover:border-white/30 transition-colors">
            <Archive className="w-3 h-3" /> ZIP ({slides.length})
          </button>
        </div>
      </div>
    </div>
  );
}
