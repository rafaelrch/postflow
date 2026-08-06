'use client';

import { ReactNode, useRef } from 'react';
import { Download, Archive, Upload, Image, Underline, Sparkles, RotateCcw } from 'lucide-react';
import { useEditorStore } from '@/hooks/useEditorStore';
import { useGenerateCarouselImages, isEditorialCoverSlide } from '@/hooks/useGenerateCarouselImages';
import Slider from './Slider';
import Template01Slots from './Template01Slots';
import Template02Slots from './Template02Slots';
import SidebarGroup from './sidebar/SidebarGroup';
import SidebarPanel from './sidebar/SidebarPanel';
import ColorPicker from './sidebar/ColorPicker';
import ElementFontPicker from './sidebar/ElementFontPicker';
import WordHighlightPicker from './sidebar/WordHighlightPicker';
import AiGenPanel from './sidebar/AiGenPanel';
import ImageThumb from './sidebar/ImageThumb';
import { inputCls, labelCls, numericCls } from './sidebar/tokens';
import {
  PANEL_REGISTRY,
  PanelContext,
  PanelId,
  PanelScope,
  panelLabel,
  visiblePanels,
} from './sidebar/panels';
import { cn } from '@/lib/utils';
import { uploadImageFile } from '@/lib/upload-image';
import toast from 'react-hot-toast';
import {
  DEFAULT_CORNERS,
  DEFAULT_IMAGE_POSITION,
  Slide,
  Template01SlideControl,
  Template01SlotStyle,
  TextPosition,
} from '@/types';
import {
  TEMPLATE_01_DEFAULT_CORNERS,
  template01ImageSlot,
  template01SlideImageUrl,
  template01ModelOf,
  template01SlideMedia,
  template01SpecBackground,
  template01SlotDefaults,
  template01SlotFontName,
  template01SlotColor,
  template01SlotsForSlide,
} from '@/lib/templates/template-01';
import { template01ClearImage, template01SetImage } from '@/lib/templates/template-01/image';
import { markTemplate01Override } from '@/lib/templates/template-01/overrides';
import {
  TEMPLATE_02_DEFAULT_HEADER,
  template02HeaderSlotsForModel,
  template02ImageSlot,
  template02ModelOf,
  template02SlotColor,
  template02SlotDefaults,
  template02SlotFontName,
  template02TextSlotsForModel,
  template02Background,
  TEMPLATE_02_HIGHLIGHT_COLOR,
} from '@/lib/templates/template-02';
import { template02ClearImage, template02SetImage, template02SlideImageUrl } from '@/lib/templates/template-02/image';
import {
  Template02SlideControl,
  markTemplate02Override,
  template02SlideChanges,
} from '@/lib/templates/template-02/overrides';

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

/** Toggle reaproveitado pelos painéis — era copiado em quatro lugares. */
function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex items-center gap-2 cursor-pointer select-none"
    >
      <div
        className={cn(
          'w-8 h-4 rounded-full relative transition-colors shrink-0',
          on ? 'bg-blue-500' : 'bg-black/10 dark:bg-white/10'
        )}
      >
        <div
          className={cn(
            'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all',
            on ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </div>
      <span className="text-[12px] text-gray-900/55 dark:text-white/50">{label}</span>
    </button>
  );
}

/** Botão quadrado de sublinhado — idem. */
function UnderlineToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title="Sublinhado"
      className={cn(
        'w-7 h-7 rounded border flex items-center justify-center transition-colors shrink-0',
        on
          ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-black shadow-sm'
          : 'border-black/[0.07] dark:border-white/[0.07] bg-[var(--surface-elevated)] text-gray-900/40 dark:text-white/35 hover:border-black/20 dark:hover:border-white/20 hover:text-gray-900 dark:hover:text-white'
      )}
    >
      <Underline className="w-3 h-3" />
    </button>
  );
}

function DropZone({ label, onClick, onFile }: { label: string; onClick: () => void; onFile: (f: File) => void }) {
  return (
    <div
      className="border-2 border-dashed border-black/[0.1] dark:border-white/[0.1] rounded-xl p-4 text-center cursor-pointer hover:border-black/20 dark:hover:border-white/20 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-all group"
      onClick={onClick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f?.type.startsWith('image/')) onFile(f);
      }}
    >
      <Upload className="w-4 h-4 mx-auto mb-1.5 text-gray-900/25 dark:text-white/25 group-hover:text-gray-900/40 dark:group-hover:text-white/40 transition-colors" />
      <span className="text-[11px] text-gray-900/35 dark:text-white/35 font-medium">{label}</span>
    </div>
  );
}

export default function EditorSidebar({ onDownloadSlide, onDownloadAll }: EditorSidebarProps) {
  const {
    slides, activeSlideIndex, style, globalSettings,
    updateActiveSlide, updateSlide, updateGlobalSettings, updateCornersConfig,
  } = useEditorStore();

  const slide = slides[activeSlideIndex];
  const { corners, profileBadge, accentColor, theme } = globalSettings;
  const [pairTitleFontName = 'SF Pro Display', pairBodyFontName = 'IvyOra Text'] =
    globalSettings.fontPair.split(' + ');
  // O template de perfil desenha em SF Pro independentemente do par global.
  const defaultTitleFontName = style === 'profile' ? 'SF Pro Display' : pairTitleFontName;
  const defaultBodyFontName = style === 'profile' ? 'SF Pro Display' : pairBodyFontName;

  const bgImageRef = useRef<HTMLInputElement>(null);
  const contentImageRef = useRef<HTMLInputElement>(null);
  const profilePhotoRef = useRef<HTMLInputElement>(null);
  const t01ImageRef = useRef<HTMLInputElement>(null);
  const t02ImageRef = useRef<HTMLInputElement>(null);

  const { generateAll, generateOne, generating, progress } = useGenerateCarouselImages();

  if (!slide) return null;

  const isEditorialCover = isEditorialCoverSlide(style, slide, activeSlideIndex);
  const contentSlidesCount = slides.filter((s, i) => !isEditorialCoverSlide(style, s, i)).length;

  // ── TEMPLATE 1 ────────────────────────────────────────────────────────────
  // Tudo do template segue o MODELO do slide, nunca a posição: com modelo
  // repetido ou deck maior que 6, a posição mostraria os campos de outro slide.
  const isT01 = style === 'template01';
  const t01Model = isT01 ? template01ModelOf(slide, activeSlideIndex) : null;
  const t01Media = t01Model != null ? template01SlideMedia(t01Model) : { background: false, content: false };
  const t01ImageSlot = t01Model != null ? template01ImageSlot(t01Model) : undefined;
  const t01ImageUrl = t01Model != null ? template01SlideImageUrl(slide, t01Model) : '';

  // Fundo: sem a MARCA o slide segue o spec, então o seletor tem de abrir na cor
  // de fábrica daquele modelo (o 6 em `#0D39E4`) — nunca num padrão do editor,
  // que mostraria uma cor que não é a que está na tela.
  const t01SpecBg = t01Model != null ? template01SpecBackground(t01Model) : undefined;
  const t01BgValue =
    slide.templateOverrides?.background && slide.backgroundColor
      ? slide.backgroundColor
      : t01SpecBg?.swatch ?? '#111111';

  // ── TEMPLATE 2 ────────────────────────────────────────────────────────────
  // Mesma regra do T1: tudo segue o MODELO do slide, nunca a posição. Aqui isso
  // pesa ainda mais — o deck do T2 não tem tamanho fixo.
  const isT02 = style === 'template02';
  const t02Model = isT02 ? template02ModelOf(slide, activeSlideIndex) : null;
  const t02ImageUrl = t02Model != null ? template02SlideImageUrl(slide, t02Model) : '';
  // A capa tem imagem de FUNDO full-bleed; os internos, o bloco de 380x1089.
  const t02IsCover = t02Model === 1;
  const t02TextSlots = t02Model != null ? template02TextSlotsForModel(t02Model) : [];
  const t02HeaderSlots = t02Model != null ? template02HeaderSlotsForModel(t02Model) : [];

  const ctx: PanelContext = {
    style,
    slide,
    activeSlideIndex,
    globalSettings,
    template01Model: t01Model,
    template02Model: t02Model,
    isEditorialCover,
  };

  /* ── Uploads ─────────────────────────────────────────────────────────── */
  const upload = async (file: File, apply: (url: string) => void, bucket = 'slide-images') => {
    const toastId = toast.loading('Enviando imagem…');
    try {
      apply(await uploadImageFile(file, bucket));
      toast.success('Imagem adicionada', { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha no upload', { id: toastId });
    }
  };

  // Fundo do slide: mantém os dois campos em sincronia porque cada template lê
  // um deles (editorial prefere gridImageUrl, minimalist decide por imageType).
  const handleBackgroundFile = (f: File) =>
    upload(f, (url) =>
      updateActiveSlide({
        backgroundImageUrl: url,
        gridImageUrl: url,
        imagePosition: { ...DEFAULT_IMAGE_POSITION },
      })
    );
  const handleContentFile = (f: File) =>
    upload(f, (url) =>
      updateActiveSlide({
        contentImageUrl: url,
        contentImagePosition: { ...DEFAULT_IMAGE_POSITION },
      })
    );
  const handleT01File = (f: File) =>
    upload(f, (url) => t01Model != null && updateActiveSlide(template01SetImage(slide, t01Model, url)));
  // Upload, IA e remoção escrevem no MESMO lugar (o slot) — ver
  // `lib/templates/template-02/image.ts`.
  const handleT02File = (f: File) =>
    upload(f, (url) => t02Model != null && updateActiveSlide(template02SetImage(slide, t02Model, url)));

  const fileInputs = (
    <>
      <input ref={bgImageRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => e.target.files?.[0] && handleBackgroundFile(e.target.files[0])} />
      <input ref={contentImageRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => e.target.files?.[0] && handleContentFile(e.target.files[0])} />
      <input ref={t01ImageRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleT01File(f); e.target.value = ''; }} />
      <input ref={t02ImageRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleT02File(f); e.target.value = ''; }} />
      <input ref={profilePhotoRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => e.target.files?.[0] && upload(
          e.target.files[0],
          (url) => updateGlobalSettings({ profileBadge: { ...profileBadge, photo: url } }),
          'profile-photos'
        )} />
    </>
  );

  /* ── Escritas do TEMPLATE 1 ──────────────────────────────────────────────
     Cada handler MARCA o controle em `templateOverrides`. É a marca — nunca o
     valor — que faz o override existir: o carrossel gerado não tem nenhuma, e
     por isso nasce idêntico ao spec.
  ─────────────────────────────────────────────────────────────────────────── */
  const setT01 = (patch: Partial<Slide>, ...keys: Template01SlideControl[]) =>
    updateActiveSlide({ ...patch, templateOverrides: markTemplate01Override(slide.templateOverrides, ...keys) });

  /** Estilo de UM slot. A chave existir já é o gesto do usuário — sem marca. */
  const setT01Slot = (slot: string, patch: Partial<Template01SlotStyle>) =>
    updateActiveSlide({
      templateSlotStyles: {
        ...(slide.templateSlotStyles ?? {}),
        [slot]: { ...(slide.templateSlotStyles?.[slot] ?? {}), ...patch },
      },
    });

  /**
   * Texto de canto/cabeçalho — grava em TODOS os slides do deck.
   *
   * O canto é a assinatura do carrossel (marca e @), não conteúdo do slide: ele
   * aparece igual nos seis, e editar num slide só produzia um deck com
   * assinaturas diferentes por página — que ninguém quer e ninguém percebe
   * enquanto não exporta.
   *
   * Pedido do Rafael, com estas palavras: "o texto do canto tem que ser editado
   * em todos os slides".
   *
   * 🔸 Só o TEXTO é do deck. Cor e visibilidade continuam por slide de
   * propósito: o mesmo canto precisa de cor diferente sobre um slide claro e um
   * escuro, e há slide em que ele atrapalha a composição.
   */
  const setDeckSlotText = (slot: string, value: string) =>
    slides.forEach((s, i) =>
      updateSlide(i, { templateSlots: { ...(s.templateSlots ?? {}), [slot]: value } })
    );

  const setT01CornerText = (slot: string, value: string) => setDeckSlotText(slot, value);

  /* ── Escritas do TEMPLATE 2 ─────────────────────────────────────────────
     Mesma disciplina do T1: o handler MARCA o controle em `templateOverrides`,
     e é a marca — nunca o valor — que faz o override existir. Deck gerado não
     tem nenhuma, e por isso nasce idêntico ao spec.
  ────────────────────────────────────────────────────────────────────────── */
  const setT02 = (patch: Partial<Slide>, ...keys: Template02SlideControl[]) =>
    updateActiveSlide({ ...patch, templateOverrides: markTemplate02Override(slide.templateOverrides, ...keys) });

  /** Estilo de UM slot. A chave existir já é o gesto do usuário — sem marca. */
  const setT02Slot = (slot: string, patch: Partial<Template01SlotStyle>) =>
    updateActiveSlide({
      templateSlotStyles: {
        ...(slide.templateSlotStyles ?? {}),
        [slot]: { ...(slide.templateSlotStyles?.[slot] ?? {}), ...patch },
      },
    });

  /** Mesma regra do T1: a categoria e o @ valem para o deck inteiro. */
  const setT02HeaderText = (slot: string, value: string) => setDeckSlotText(slot, value);

  const setHeaderStyles = (slots: string[], patch: Partial<Template01SlotStyle>) => {
    const next = { ...(slide.templateSlotStyles ?? {}) };
    for (const slot of slots) next[slot] = { ...(next[slot] ?? {}), ...patch };
    updateActiveSlide({ templateSlotStyles: next });
  };

  const setTemplateCornerStyle = (
    patch: Partial<NonNullable<typeof globalSettings.templateCornerStyle>>
  ) =>
    updateGlobalSettings({
      templateCornerStyle: { ...(globalSettings.templateCornerStyle ?? {}), ...patch },
    });

  const withContentImagePosition = (patch: Partial<typeof DEFAULT_IMAGE_POSITION>) => ({
    ...DEFAULT_IMAGE_POSITION,
    ...(slide.contentImagePosition ?? {}),
    ...patch,
  });

  const t01TextSlots = t01Model != null
    ? template01SlotsForSlide(t01Model).filter((d) => d.kind === 'text' && !d.slot.startsWith('cantos.'))
    : [];
  const t01CornerSlots = t01Model != null
    ? template01SlotsForSlide(t01Model).filter((d) => d.slot.startsWith('cantos.'))
    : [];

  // Vale para os DOIS templates: os campos são os mesmos (`templateOverrides` +
  // `templateSlotStyles`), então o botão "Restaurar" conta igual nos dois.
  const templateSlideChanges = template02SlideChanges(slide);
  const t01CornerSlotNames = t01CornerSlots.map((d) => d.slot);
  const t02HeaderSlotNames = t02HeaderSlots.map((d) => d.slot);
  const t01HasVisibility = t01CornerSlotNames.some(
    (slot) => slide.templateSlotStyles?.[slot]?.visible != null
  );
  const t01HeaderVisible = t01HasVisibility
    ? t01CornerSlotNames.every((slot) => slide.templateSlotStyles?.[slot]?.visible !== false)
    : corners.show !== false;
  const t02HeaderVisible = t02HeaderSlotNames.every(
    (slot) => slide.templateSlotStyles?.[slot]?.visible !== false
  );
  const t01HeaderStyle = {
    ...(slide.templateSlotStyles?.[t01CornerSlotNames[0]] ?? {}),
    ...(globalSettings.templateCornerStyle ?? {}),
  };
  const t02HeaderStyle = {
    ...(slide.templateSlotStyles?.[t02HeaderSlotNames[0]] ?? {}),
    ...(globalSettings.templateCornerStyle ?? {}),
  };

  /* ── Conteúdo de cada painel ─────────────────────────────────────────── */
  const content: Record<PanelId, ReactNode> = {
    perfil: (
      <>
        <div className="flex items-center gap-2">
          <div
            className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden cursor-pointer border border-black/10 dark:border-white/10 shrink-0"
            onClick={() => profilePhotoRef.current?.click()}
            title="Clique para trocar a foto"
          >
            {profileBadge.photo
              ? <img src={profileBadge.photo} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-gray-900/20 dark:text-white/20 text-[9px]">foto</div>}
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <input className={inputCls} placeholder="Nome" value={profileBadge.name}
              onChange={(e) => updateGlobalSettings({ profileBadge: { ...profileBadge, name: e.target.value } })} />
            <input className={inputCls} placeholder="@handle" value={profileBadge.handle}
              onChange={(e) => updateGlobalSettings({ profileBadge: { ...profileBadge, handle: e.target.value } })} />
          </div>
        </div>
        <Slider label="Tamanho nome/handle" value={profileBadge.headerFontSize ?? 26} min={14} max={60} unit="px"
          onChange={(v) => updateGlobalSettings({ profileBadge: { ...profileBadge, headerFontSize: v } })} />
      </>
    ),

    tema: (
      <div className="flex rounded-lg overflow-hidden bg-black/[0.05] dark:bg-white/[0.05] p-0.5 gap-0.5">
        {(['dark', 'light'] as const).map((t) => (
          <button
            key={t}
            onClick={() => updateGlobalSettings({ theme: t })}
            className={cn(
              'flex-1 px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all',
              theme === t
                ? 'bg-gray-900 dark:bg-white text-white dark:text-black shadow-sm'
                : 'text-gray-900/40 dark:text-white/40 hover:text-gray-900/70 dark:hover:text-white/70'
            )}
          >
            {t === 'dark' ? 'Escuro' : 'Claro'}
          </button>
        ))}
      </div>
    ),

    conteudoSlide: isT01 ? (
      <Template01Slots />
    ) : isT02 ? (
      <Template02Slots />
    ) : (
      // profile: título + corpo, sem os controles de forma dos outros estilos.
      <>
        <div>
          <span className={labelCls}>Conteúdo</span>
          <input className={cn(inputCls, 'mt-1')} value={slide.title}
            onChange={(e) => updateActiveSlide({ title: e.target.value })}
            placeholder="Título / primeiro parágrafo" />
        </div>
        <textarea
          className={cn(inputCls, 'resize-none overflow-hidden')}
          style={{ minHeight: 80 }}
          value={slide.description || ''}
          onChange={(e) => {
            updateActiveSlide({ description: e.target.value });
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          placeholder="Continua o raciocínio..."
        />
        <Slider label="Tamanho do texto" value={slide.fontSize.title} min={16} max={80} unit="px"
          onChange={(v) => updateActiveSlide({ fontSize: { ...slide.fontSize, title: v } })} />
        <Slider label="Espaçamento de linhas" value={slide.lineHeight} min={1.0} max={2.5} step={0.1}
          onChange={(v) => updateActiveSlide({ lineHeight: v })} />
        <Slider label="Espaço título → descrição" value={slide.titleDescriptionGap ?? 16} min={0} max={80} unit="px"
          onChange={(v) => updateActiveSlide({ titleDescriptionGap: v })} />
      </>
    ),

    /* Um painel de imagem por slide, com upload, IA e ajustes juntos. Antes o
       upload e a geração viviam em painéis diferentes, gravando em campos
       diferentes, e um vencia o outro no render sem avisar ninguém. */
    imagem: isT02 ? (
      <>
        <DropZone
          label={t02ImageUrl ? 'Trocar imagem' : 'Clique ou arraste'}
          onClick={() => t02ImageRef.current?.click()}
          onFile={handleT02File}
        />
        <AiGenPanel
          // A key precisa do índice: prompt e referência são estado local, e
          // sem remontar ao trocar de slide o texto do slide 1 gera o slide 2.
          key={`t02-img-${activeSlideIndex}`}
          buttonLabel="Gerar imagem com IA"
          generating={generating}
          slideTitle={slide.title}
          slideDescription={slide.description || ''}
          onGenerate={(opts) => generateOne(activeSlideIndex, t02IsCover ? 'background' : 'content', opts)}
        />
        {t02ImageUrl && (
          <>
            <ImageThumb
              url={t02ImageUrl}
              onRemove={() => t02Model != null && updateActiveSlide(template02ClearImage(slide, t02Model))}
            />
            <Slider label="Opacidade" value={slide.backgroundImageOpacity ?? 100} min={0} max={100} unit="%"
              onChange={(v) => setT02({ backgroundImageOpacity: v }, 'backgroundImageOpacity')} />
            {t02IsCover ? (
              <>
                <Slider label="Posição X" value={slide.imagePosition.x} min={0} max={100} unit="%"
                  onChange={(v) => setT02({ imagePosition: { ...slide.imagePosition, x: v } }, 'backgroundImagePosition')} />
                <Slider label="Posição Y" value={slide.imagePosition.y} min={0} max={100} unit="%"
                  onChange={(v) => setT02({ imagePosition: { ...slide.imagePosition, y: v } }, 'backgroundImagePosition')} />
                <Slider label="Zoom" value={slide.imagePosition.zoom} min={50} max={300} unit="%"
                  onChange={(v) => setT02({ imagePosition: { ...slide.imagePosition, zoom: v } }, 'backgroundImagePosition')} />
              </>
            ) : (
              <>
                <Slider label="Posição X" value={slide.contentImagePosition?.x ?? 50} min={0} max={100} unit="%"
                  onChange={(v) => setT02({ contentImagePosition: withContentImagePosition({ x: v }) }, 'contentImagePosition')} />
                <Slider label="Posição Y" value={slide.contentImagePosition?.y ?? 50} min={0} max={100} unit="%"
                  onChange={(v) => setT02({ contentImagePosition: withContentImagePosition({ y: v }) }, 'contentImagePosition')} />
                <Slider label="Zoom" value={slide.contentImagePosition?.zoom ?? 100} min={50} max={300} unit="%"
                  onChange={(v) => setT02({ contentImagePosition: withContentImagePosition({ zoom: v }) }, 'contentImagePosition')} />
              </>
            )}
          </>
        )}
      </>
    ) : isT01 ? (
      <>
        <DropZone
          label={t01ImageUrl ? 'Trocar imagem' : 'Clique ou arraste'}
          onClick={() => t01ImageRef.current?.click()}
          onFile={handleT01File}
        />
        <AiGenPanel
          // A key precisa do índice: prompt e referência são estado local, e
          // sem remontar ao trocar de slide o texto do slide 1 gera o slide 2.
          key={`t01-img-${activeSlideIndex}`}
          buttonLabel="Gerar imagem com IA"
          generating={generating}
          slideTitle={slide.title}
          slideDescription={slide.description || ''}
          onGenerate={(opts) =>
            generateOne(activeSlideIndex, t01Media.background ? 'background' : 'content', opts)
          }
        />
        {t01ImageUrl && (
          <>
            <ImageThumb
              url={t01ImageUrl}
              onRemove={() => t01Model != null && updateActiveSlide(template01ClearImage(slide, t01Model))}
            />
            <Slider label="Opacidade" value={slide.backgroundImageOpacity ?? 100} min={0} max={100} unit="%"
              onChange={(v) => setT01({ backgroundImageOpacity: v }, 'backgroundImageOpacity')} />
            {t01Media.background ? (
              <>
                <Slider label="Posição X" value={slide.imagePosition.x} min={0} max={100} unit="%"
                  onChange={(v) => setT01({ imagePosition: { ...slide.imagePosition, x: v } }, 'backgroundImagePosition')} />
                <Slider label="Posição Y" value={slide.imagePosition.y} min={0} max={100} unit="%"
                  onChange={(v) => setT01({ imagePosition: { ...slide.imagePosition, y: v } }, 'backgroundImagePosition')} />
                <Slider label="Zoom" value={slide.imagePosition.zoom} min={50} max={300} unit="%"
                  onChange={(v) => setT01({ imagePosition: { ...slide.imagePosition, zoom: v } }, 'backgroundImagePosition')} />
              </>
            ) : (
              <>
                <Slider label="Posição X" value={slide.contentImagePosition?.x ?? 50} min={0} max={100} unit="%"
                  onChange={(v) => setT01({ contentImagePosition: withContentImagePosition({ x: v }) }, 'contentImagePosition')} />
                <Slider label="Posição Y" value={slide.contentImagePosition?.y ?? 50} min={0} max={100} unit="%"
                  onChange={(v) => setT01({ contentImagePosition: withContentImagePosition({ y: v }) }, 'contentImagePosition')} />
                <Slider label="Zoom" value={slide.contentImagePosition?.zoom ?? 100} min={50} max={300} unit="%"
                  onChange={(v) => setT01({ contentImagePosition: withContentImagePosition({ zoom: v }) }, 'contentImagePosition')} />
              </>
            )}
          </>
        )}
      </>
    ) : style === 'profile' ? (
      <>
        <DropZone label="Arraste ou clique para adicionar" onClick={() => bgImageRef.current?.click()} onFile={handleBackgroundFile} />
        <AiGenPanel
          key={`profile-bg-${activeSlideIndex}`}
          buttonLabel="Gerar imagem com IA"
          generating={generating}
          slideTitle={slide.title}
          slideDescription={slide.description || ''}
          onGenerate={(opts) => generateOne(activeSlideIndex, 'background', opts)}
        />
        <button onClick={() => generateAll()} disabled={generating}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-black/[0.07] dark:border-white/[0.07] text-[11px] font-medium text-gray-900/50 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:border-black/20 dark:hover:border-white/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
          <Sparkles className="w-3.5 h-3.5" />
          {generating && progress.total > 1
            ? `Gerando ${progress.done}/${progress.total}…`
            : `Gerar para todos os ${slides.length} slides`}
        </button>
        {(slide.backgroundImageUrl || slide.gridImageUrl) && (
          <>
            <ImageThumb url={slide.backgroundImageUrl || slide.gridImageUrl || ''}
              onRemove={() => updateActiveSlide({ backgroundImageUrl: '', gridImageUrl: '' })} />
            <Slider label="Posição X" value={slide.imagePosition.x} min={0} max={100} unit="%"
              onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, x: v } })} />
            <Slider label="Posição Y" value={slide.imagePosition.y} min={0} max={100} unit="%"
              onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, y: v } })} />
            <Slider label="Zoom" value={slide.imagePosition.zoom} min={50} max={300} unit="%"
              onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, zoom: v } })} />
          </>
        )}
      </>
    ) : (
      <>
        <DropZone label="Clique ou arraste" onClick={() => contentImageRef.current?.click()} onFile={handleContentFile} />
        <AiGenPanel
          key={`content-${activeSlideIndex}`}
          buttonLabel="Gerar imagem com IA"
          generating={generating}
          slideTitle={slide.title}
          slideDescription={slide.description || ''}
          onGenerate={(opts) => generateOne(activeSlideIndex, 'content', opts)}
        />
        <button onClick={() => generateAll('content')} disabled={generating}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-black/[0.07] dark:border-white/[0.07] text-[11px] font-medium text-gray-900/50 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:border-black/20 dark:hover:border-white/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
          <Sparkles className="w-3.5 h-3.5" />
          {generating && progress.total > 1
            ? `Gerando ${progress.done}/${progress.total}…`
            : `Gerar para os ${contentSlidesCount} slides`}
        </button>
        {slide.contentImageUrl && (
          <ImageThumb url={slide.contentImageUrl} onRemove={() => updateActiveSlide({ contentImageUrl: '' })} />
        )}
        <Slider label="Posição X" value={slide.contentImagePosition?.x ?? 50} min={0} max={100} unit="%"
          onChange={(v) => updateActiveSlide({ contentImagePosition: withContentImagePosition({ x: v }) })} />
        <Slider label="Posição Y" value={slide.contentImagePosition?.y ?? 50} min={0} max={100} unit="%"
          onChange={(v) => updateActiveSlide({ contentImagePosition: withContentImagePosition({ y: v }) })} />
        <Slider label="Zoom" value={slide.contentImagePosition?.zoom ?? 100} min={50} max={300} unit="%"
          onChange={(v) => updateActiveSlide({ contentImagePosition: withContentImagePosition({ zoom: v }) })} />
      </>
    ),

    /* Um controle por BLOCO de texto. Antes era por papel (título/descrição) e
       uma mexida pegava blocos diferentes de uma vez — no slide 5, as duas
       colunas juntas. Entrelinha e alinhamento ficam fora da repetição de
       propósito: são um controle só para o slide. */
    estiloDoTexto: isT02 ? (
      <>
        {t02TextSlots.map((d) => {
          const st = slide.templateSlotStyles?.[d.slot] ?? {};
          const base = template02SlotDefaults(d.slot);
          // O seletor abre mostrando o que ESTÁ na tela: o número do spec
          // daquele bloco, nunca um padrão do editor.
          const specColor = t02Model != null ? template02SlotColor(d.slot, t02Model) : '#000000';
          const isHighlight = d.slot === 'cover.highlight';
          return (
            <div key={d.slot} className="space-y-2 pt-3 border-t border-black/[0.05] dark:border-white/[0.05] first:border-t-0 first:pt-0">
              <span className={labelCls}>{d.label}</span>
              {isHighlight ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <ColorPicker
                      label="Cor do marcador"
                      value={st.background || TEMPLATE_02_HIGHLIGHT_COLOR}
                      onChange={(v) => setT02Slot(d.slot, { background: v })}
                    />
                  </div>
                  <div>
                    <span className={cn(labelCls, 'block mb-1')}>Fonte</span>
                    <ElementFontPicker
                      value={st.font}
                      defaultFontName={template02SlotFontName(d.slot) ?? 'Inter Bold'}
                      onChange={(v) => setT02Slot(d.slot, { font: v })}
                    />
                  </div>
                </>
              ) : (
                <>
                  <Slider label="Tamanho" value={Math.round(st.fontSize ?? base?.fontSizePx ?? 40)}
                    min={10} max={160} unit="px" onChange={(v) => setT02Slot(d.slot, { fontSize: v })} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <ColorPicker label="Cor" value={st.color || specColor} onChange={(v) => setT02Slot(d.slot, { color: v })} />
                    <UnderlineToggle on={!!st.underline} onToggle={() => setT02Slot(d.slot, { underline: !st.underline })} />
                  </div>
                  <div>
                    <span className={cn(labelCls, 'block mb-1')}>Fonte</span>
                    <ElementFontPicker
                      value={st.font}
                      defaultFontName={template02SlotFontName(d.slot) ?? 'Inter Display Regular'}
                      onChange={(v) => setT02Slot(d.slot, { font: v })}
                    />
                  </div>
                  <Slider label="Espaçamento de letras" value={st.letterSpacing ?? base?.letterSpacingEm ?? 0}
                    min={-0.1} max={0.3} step={0.01} unit="em"
                    onChange={(v) => setT02Slot(d.slot, { letterSpacing: v })} />
                </>
              )}
            </div>
          );
        })}
      </>
    ) : (
      <>
        {t01TextSlots.map((d) => {
          const st = slide.templateSlotStyles?.[d.slot] ?? {};
          const base = template01SlotDefaults(d.slot);
          return (
            <div key={d.slot} className="space-y-2 pt-3 border-t border-black/[0.05] dark:border-white/[0.05] first:border-t-0 first:pt-0">
              <span className={labelCls}>{d.label}</span>
              <Slider label="Tamanho" value={Math.round(st.fontSize ?? base?.fontSizePx ?? 40)}
                min={10} max={160} unit="px" onChange={(v) => setT01Slot(d.slot, { fontSize: v })} />
              <div className="flex items-center gap-2 flex-wrap">
                <ColorPicker label="Cor" value={st.color || '#FFFFFF'} onChange={(v) => setT01Slot(d.slot, { color: v })} />
                <UnderlineToggle on={!!st.underline} onToggle={() => setT01Slot(d.slot, { underline: !st.underline })} />
              </div>
              <div>
                <span className={cn(labelCls, 'block mb-1')}>Fonte</span>
                <ElementFontPicker
                  value={st.font}
                  defaultFontName={template01SlotFontName(d.slot) ?? 'Inter Regular'}
                  onChange={(v) => setT01Slot(d.slot, { font: v })}
                />
              </div>
              <Slider label="Espaçamento de letras" value={st.letterSpacing ?? base?.letterSpacingEm ?? 0}
                min={-0.1} max={0.3} step={0.01} unit="em"
                onChange={(v) => setT01Slot(d.slot, { letterSpacing: v })} />
            </div>
          );
        })}

        <div className="pt-3 border-t border-black/[0.05] dark:border-white/[0.05] space-y-2">
          <Slider label="Espaçamento entre linhas" value={slide.lineHeight} min={1.0} max={2.5} step={0.1}
            onChange={(v) => setT01({ lineHeight: v }, 'lineHeight')} />
          {/* No template os blocos são ancorados pelo spec (a capa centraliza, o
              slide 5 tem duas colunas), então a grade de 9 posições dos outros
              estilos destruiria a composição. O que resta é o alinhamento. */}
          <div>
            <span className={cn(labelCls, 'block mb-1.5')}>Alinhamento</span>
            <div className="grid grid-cols-3 gap-1">
              {(['left', 'center', 'right'] as const).map((align) => (
                <button key={align} onClick={() => setT01({ textAlignment: align }, 'textAlignment')}
                  className={cn('h-7 rounded text-[10px] transition-colors border',
                    slide.templateOverrides?.textAlignment && slide.textAlignment === align
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white shadow-sm'
                      : 'bg-[var(--surface-elevated)] text-gray-900/35 dark:text-white/30 border-black/[0.07] dark:border-white/[0.07] hover:border-black/20 dark:hover:border-white/20')}>
                  {align === 'left' ? '⬅ esq' : align === 'center' ? '↔ centro' : '➡ dir'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </>
    ),

    textoDoSlide: (
      <>
        <div>
          <span className={labelCls}>Título</span>
          <textarea className={cn(inputCls, 'mt-1 resize-none')} rows={3} value={slide.title}
            onChange={(e) => updateActiveSlide({ title: e.target.value })} placeholder="Título do slide" />
        </div>
        <Slider label="Tamanho título" value={slide.fontSize.title} min={16} max={160} unit="px"
          onChange={(v) => updateActiveSlide({ fontSize: { ...slide.fontSize, title: v } })} />
        <div className="flex items-center gap-2 flex-wrap">
          <ColorPicker label="Cor" value={slide.titleColor || '#FFFFFF'} onChange={(v) => updateActiveSlide({ titleColor: v })} />
          <UnderlineToggle on={!!slide.titleUnderline} onToggle={() => updateActiveSlide({ titleUnderline: !slide.titleUnderline })} />
        </div>
        <div>
          <span className={cn(labelCls, 'block mb-1')}>Fonte título</span>
          <ElementFontPicker
            value={slide.titleFont}
            defaultFontName={defaultTitleFontName}
            onChange={(v) => updateActiveSlide({ titleFont: v })}
          />
        </div>

        <div className="pt-1">
          <span className={labelCls}>Descrição</span>
          <textarea className={cn(inputCls, 'mt-1 resize-none h-16')} value={slide.description || ''}
            onChange={(e) => updateActiveSlide({ description: e.target.value })} placeholder="Descrição do slide" />
        </div>
        <Slider label="Tamanho descrição" value={slide.fontSize.description} min={10} max={80} unit="px"
          onChange={(v) => updateActiveSlide({ fontSize: { ...slide.fontSize, description: v } })} />
        <div className="flex items-center gap-2 flex-wrap">
          <ColorPicker label="Cor" value={slide.descriptionColor || 'rgba(255,255,255,0.7)'}
            onChange={(v) => updateActiveSlide({ descriptionColor: v })} />
          <UnderlineToggle on={!!slide.descriptionUnderline}
            onToggle={() => updateActiveSlide({ descriptionUnderline: !slide.descriptionUnderline })} />
        </div>
        <div>
          <span className={cn(labelCls, 'block mb-1')}>Fonte descrição</span>
          <ElementFontPicker
            value={slide.descriptionFont}
            defaultFontName={defaultBodyFontName}
            onChange={(v) => updateActiveSlide({ descriptionFont: v })}
          />
        </div>

        <Slider label="Espaço título → descrição" value={slide.titleDescriptionGap ?? 16} min={0} max={80} unit="px"
          onChange={(v) => updateActiveSlide({ titleDescriptionGap: v })} />
        <Slider label="Espaçamento de letras (título)" value={slide.titleLetterSpacing ?? -0.02}
          min={-0.1} max={0.3} step={0.01} unit="em"
          onChange={(v) => updateActiveSlide({ titleLetterSpacing: v })} />
        <Slider label="Espaçamento entre linhas" value={slide.lineHeight} min={1.0} max={2.5} step={0.1}
          onChange={(v) => updateActiveSlide({ lineHeight: v })} />

        <WordHighlightPicker
          label="Destaques no título"
          text={slide.title}
          highlights={(slide.highlights || []).filter((h) => slide.title.toLowerCase().includes(h.text.toLowerCase()))}
          onChange={(titleHls) => {
            const other = (slide.highlights || []).filter((h) => !slide.title.toLowerCase().includes(h.text.toLowerCase()));
            updateActiveSlide({ highlights: [...other, ...titleHls] });
          }}
          accentColor={accentColor}
          defaultFontName={slide.titleFont ?? defaultTitleFontName}
        />
        {slide.description && (
          <WordHighlightPicker
            label="Destaques na descrição"
            text={slide.description}
            highlights={(slide.highlights || []).filter((h) => (slide.description || '').toLowerCase().includes(h.text.toLowerCase()))}
            onChange={(descHls) => {
              const other = (slide.highlights || []).filter((h) => !(slide.description || '').toLowerCase().includes(h.text.toLowerCase()));
              updateActiveSlide({ highlights: [...other, ...descHls] });
            }}
            accentColor={accentColor}
            defaultFontName={slide.descriptionFont ?? defaultBodyFontName}
          />
        )}
      </>
    ),

    layoutDoSlide: (
      <>
        <div>
          <span className={cn(labelCls, 'block mb-1.5')}>Posição do texto</span>
          <div className="grid grid-cols-3 gap-1">
            {TEXT_POSITIONS.map((pos) => (
              <button key={pos} title={pos}
                onClick={() => {
                  const autoAlign = pos.endsWith('center') || pos === 'center' ? 'center'
                    : pos.endsWith('right') ? 'right' : 'left';
                  updateActiveSlide({ textPosition: pos, textOffset: undefined, textAlignment: autoAlign });
                }}
                className={cn('h-7 rounded text-[10px] transition-colors border',
                  slide.textPosition === pos
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white shadow-sm'
                    : 'bg-[var(--surface-elevated)] text-gray-900/35 dark:text-white/30 border-black/[0.07] dark:border-white/[0.07] hover:border-black/20 dark:hover:border-white/20')}>
                {pos === 'top-left' ? '↖' : pos === 'top-center' ? '↑' : pos === 'top-right' ? '↗'
                  : pos === 'middle-left' ? '←' : pos === 'center' ? '·' : pos === 'middle-right' ? '→'
                  : pos === 'bottom-left' ? '↙' : pos === 'bottom-center' ? '↓' : '↘'}
              </button>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button key={align} onClick={() => updateActiveSlide({ textAlignment: align })}
                className={cn('h-7 rounded text-[10px] transition-colors border',
                  slide.textAlignment === align
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white shadow-sm'
                    : 'bg-[var(--surface-elevated)] text-gray-900/35 dark:text-white/30 border-black/[0.07] dark:border-white/[0.07] hover:border-black/20 dark:hover:border-white/20')}>
                {align === 'left' ? '⬅ esq' : align === 'center' ? '↔ centro' : '➡ dir'}
              </button>
            ))}
          </div>
        </div>
        <Slider label="Mover título ↕" value={slide.editorialTitleOffsetY ?? 0} min={-500} max={500} unit="px"
          onChange={(v) => updateActiveSlide({ editorialTitleOffsetY: v })} />
        <Slider label="Mover descrição ↕" value={slide.editorialDescOffsetY ?? 0} min={-500} max={500} unit="px"
          onChange={(v) => updateActiveSlide({ editorialDescOffsetY: v })} />
      </>
    ),

    sombraOverlay: (
      <>
        <Toggle
          on={slide.shadow.style !== 'none'}
          onToggle={() => updateActiveSlide({ shadow: { ...slide.shadow, style: slide.shadow.style === 'none' ? 'base' : 'none' } })}
          label="Exibir sombra"
        />
        {slide.shadow.style !== 'none' && (
          <>
            <Slider label="Opacidade" value={slide.shadow.opacity} min={0} max={100} unit="%"
              onChange={(v) => updateActiveSlide({ shadow: { ...slide.shadow, opacity: v } })} />
            <Slider label="Tamanho" value={slide.shadow.size ?? 85} min={10} max={100} unit="%"
              onChange={(v) => updateActiveSlide({ shadow: { ...slide.shadow, size: v } })} />
            <Slider label="Distância" value={slide.shadow.distance ?? 55} min={10} max={100} unit="%"
              onChange={(v) => updateActiveSlide({ shadow: { ...slide.shadow, distance: v } })} />
            <ColorPicker label="Cor" value={slide.shadow.color || '#000000'}
              onChange={(v) => updateActiveSlide({ shadow: { ...slide.shadow, color: v } })} />
          </>
        )}
      </>
    ),

    /* No template é SÓ A COR. Upload e IA ficam de fora de propósito: a imagem
       do template tem painel próprio ("Imagem"), e repeti-la aqui recriaria a
       duplicata que essa refatoração acabou de eliminar. */
    fundoDoSlide: isT02 ? (
      <>
        <ColorPicker
          label="Cor"
          value={
            slide.templateOverrides?.background && slide.backgroundColor
              ? slide.backgroundColor
              : t02Model != null ? template02Background(t02Model) : '#EEE5D9'
          }
          onChange={(v) => setT02({ backgroundColor: v }, 'background')}
        />
      </>
    ) : isT01 ? (
      <>
        <ColorPicker
          label="Cor"
          value={t01BgValue}
          onChange={(v) => setT01({ backgroundColor: v }, 'background')}
        />
      </>
    ) : (
      <>
        <ColorPicker label="Cor" value={slide.backgroundColor || '#111111'}
          onChange={(v) => updateActiveSlide({ backgroundColor: v })} />
        <DropZone label="Clique ou arraste uma imagem de fundo" onClick={() => bgImageRef.current?.click()} onFile={handleBackgroundFile} />
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
            <ImageThumb url={slide.backgroundImageUrl || slide.gridImageUrl || ''}
              onRemove={() => updateActiveSlide({ backgroundImageUrl: '', gridImageUrl: '' })} />
            <Slider label="Opacidade" value={slide.backgroundImageOpacity ?? 100} min={0} max={100} unit="%"
              onChange={(v) => updateActiveSlide({ backgroundImageOpacity: v })} />
            <Slider label="Posição X" value={slide.imagePosition.x} min={0} max={100} unit="%"
              onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, x: v } })} />
            <Slider label="Posição Y" value={slide.imagePosition.y} min={0} max={100} unit="%"
              onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, y: v } })} />
            <Slider label="Zoom" value={slide.imagePosition.zoom} min={50} max={300} unit="%"
              onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, zoom: v } })} />
          </>
        )}
      </>
    ),

    /* No T1, os cantos são o cabeçalho do slide selecionado. Nos estilos
       antigos este mesmo painel preserva o comportamento global legado. */
    cantos: isT01 ? (
      <>
        <Toggle
          on={t01HeaderVisible}
          onToggle={() => setHeaderStyles(t01CornerSlotNames, { visible: !t01HeaderVisible })}
          label="Exibir cantos"
        />

        {t01HeaderVisible && (
          <>
            {t01CornerSlots.map((d) => (
              <div key={d.slot} className="space-y-1">
                <span className={labelCls}>{d.label}</span>
                <input
                  className={inputCls}
                  value={slide.templateSlots?.[d.slot] ?? TEMPLATE_01_DEFAULT_CORNERS[d.slot]}
                  onChange={(e) => setT01CornerText(d.slot, e.target.value)}
                />
              </div>
            ))}
            <div className="space-y-3 border-t border-black/[0.05] pt-3 dark:border-white/[0.05]">
              <Slider
                label="Tamanho fonte"
                value={Math.round(
                  t01HeaderStyle.fontSize ??
                    template01SlotDefaults(t01CornerSlotNames[0])?.fontSizePx ??
                    17
                )}
                min={8}
                max={64}
                unit="px"
                onChange={(v) => setTemplateCornerStyle({ fontSize: v })}
              />
              <Slider
                label="Margem"
                value={t01HeaderStyle.margin ?? 0}
                min={0}
                max={150}
                unit="px"
                onChange={(v) => setTemplateCornerStyle({ margin: v })}
              />
              <ColorPicker
                label="Cor"
                value={
                  t01HeaderStyle.color ||
                  (t01Model != null
                    ? template01SlotColor(t01CornerSlotNames[0], t01Model)
                    : '#FFFFFF')
                }
                onChange={(v) => setHeaderStyles(t01CornerSlotNames, { color: v })}
              />
              <div>
                <span className={cn(labelCls, 'block mb-1')}>Fonte</span>
                <ElementFontPicker
                  value={t01HeaderStyle.font}
                  defaultFontName={
                    template01SlotFontName(t01CornerSlotNames[0]) ?? 'Inter Display Medium'
                  }
                  onChange={(v) => setTemplateCornerStyle({ font: v })}
                />
              </div>
            </div>
          </>
        )}
      </>
    ) : (
      <>
        <Toggle
          on={!!corners.show}
          onToggle={() => updateCornersConfig({ show: !corners.show })}
          label="Exibir cantos"
        />
        {corners.show && (
          <>
            {(['topLeft', 'topRight'] as const).map((key) => (
              <div key={key} className="flex items-center gap-2">
                <div
                  onClick={() => updateCornersConfig({ [key]: { ...corners[key], visible: !corners[key].visible } } as never)}
                  className={cn('w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer shrink-0',
                    corners[key].visible ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white' : 'border-black/30 dark:border-white/30')}>
                  {corners[key].visible && <span className="text-black text-[9px] font-bold">✓</span>}
                </div>
                <input className={cn(inputCls, 'flex-1')} value={corners[key].text} placeholder={key}
                  onChange={(e) => updateCornersConfig({ [key]: { ...corners[key], text: e.target.value } } as never)} />
              </div>
            ))}
            <div className="pt-3 border-t border-black/[0.05] dark:border-white/[0.05] space-y-3">
              <Slider label="Tamanho fonte" value={corners.fontSize} min={8} max={32} unit="px"
                onChange={(v) => updateCornersConfig({ fontSize: v })} />
              <Slider label="Distância bordas" value={corners.borderDistance} min={0} max={150} unit="px"
                onChange={(v) => updateCornersConfig({ borderDistance: v })} />
              <Slider label="Opacidade" value={corners.opacity} min={0} max={100} unit="%"
                onChange={(v) => updateCornersConfig({ opacity: v })} />
              <ColorPicker label="Cor" value={corners.color || DEFAULT_CORNERS.color || '#FFFFFF'}
                onChange={(v) => updateCornersConfig({ color: v })} />
              <div>
                <span className={cn(labelCls, 'block mb-1')}>Fonte</span>
                <ElementFontPicker value={corners.elementFont}
                  defaultFontName={defaultBodyFontName}
                  onChange={(v) => updateCornersConfig({ elementFont: v })} />
              </div>
            </div>
          </>
        )}
      </>
    ),

    /* TEXTO vale para o deck inteiro (ver `setDeckSlotText`); cor e visibilidade
       são deste slide; tipografia e margem são globais. */
    cabecalho: (
      <>
        <Toggle
          on={t02HeaderVisible}
          onToggle={() => setHeaderStyles(t02HeaderSlotNames, { visible: !t02HeaderVisible })}
          label="Exibir cantos"
        />
        {t02HeaderVisible && (
          <>
            {t02HeaderSlots.map((d) => {
              const value = slide.templateSlots?.[d.slot] ?? TEMPLATE_02_DEFAULT_HEADER[d.slot];
              const over = d.maxChars != null && value.length > d.maxChars;
              return (
                <div key={d.slot} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={labelCls}>{d.label}</span>
                    {d.maxChars != null && (
                      <span className={cn(numericCls, over && 'text-red-500 font-semibold')}>
                        {value.length}/{d.maxChars} car.
                      </span>
                    )}
                  </div>
                  <input
                    className={cn(inputCls, over && 'border-red-500/60')}
                    value={value}
                    onChange={(e) => setT02HeaderText(d.slot, e.target.value)}
                  />
                </div>
              );
            })}
            <div className="space-y-3 border-t border-black/[0.05] pt-3 dark:border-white/[0.05]">
              <Slider
                label="Tamanho fonte"
                value={Math.round(
                  t02HeaderStyle.fontSize ??
                    template02SlotDefaults(t02HeaderSlotNames[0])?.fontSizePx ??
                    17
                )}
                min={8}
                max={64}
                unit="px"
                onChange={(v) => setTemplateCornerStyle({ fontSize: v })}
              />
              <Slider
                label="Margem"
                value={t02HeaderStyle.margin ?? 0}
                min={0}
                max={150}
                unit="px"
                onChange={(v) => setTemplateCornerStyle({ margin: v })}
              />
              <ColorPicker
                label="Cor"
                value={
                  t02HeaderStyle.color ||
                  (t02Model != null
                    ? template02SlotColor('header.category', t02Model)
                    : '#767682')
                }
                onChange={(v) => setHeaderStyles(t02HeaderSlotNames, { color: v })}
              />
              <div>
                <span className={cn(labelCls, 'block mb-1')}>Fonte</span>
                <ElementFontPicker
                  value={t02HeaderStyle.font}
                  defaultFontName={
                    template02SlotFontName(t02HeaderSlotNames[0]) ?? 'Inter Display Medium'
                  }
                  onChange={(v) => setTemplateCornerStyle({ font: v })}
                />
              </div>
            </div>
          </>
        )}
      </>
    ),

    restaurarTemplate: (
      <>
        <button
          onClick={() => updateActiveSlide({ templateOverrides: undefined, templateSlotStyles: undefined })}
          className="w-full py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-[11px] font-semibold hover:opacity-90 transition-opacity"
        >
          Restaurar
        </button>
      </>
    ),
  };

  /* ── Composição ──────────────────────────────────────────────────────── */
  const groups = visiblePanels(ctx);

  // O rótulo do grupo vem da CONFIG quando ela declara um; senão, o padrão do
  // escopo. Sem isso o grupo global do Template 2 — que é conteúdo, não estilo —
  // apareceria como "ESTILO GLOBAL", e rótulo que mente é exatamente o que a
  // refatoração desta barra veio acabar.
  const headerFor = (g: { scope: PanelScope; label?: string; hint?: string }) => {
    if (g.label) return { label: g.label, hint: g.hint };
    return g.scope === 'slide'
      ? {
          label: 'Conteúdo',
          value: `SLIDE ${String(activeSlideIndex + 1).padStart(2, '0')}`,
        }
      : g.scope === 'global'
        ? { label: 'Estilo global' }
        : {};
  };

  // Painéis que já nascem abertos — o caminho principal de cada estilo.
  const OPEN_BY_DEFAULT: PanelId[] = ['perfil', 'conteudoSlide', 'imagem', 'textoDoSlide'];

  const renderPanel = (id: PanelId) => {
    const def = PANEL_REGISTRY[id];
    const disabled = id === 'restaurarTemplate' && templateSlideChanges === 0;
    return (
      // 🔴 `key` é o id, nunca o índice: o aberto/fechado é estado local do
      // painel e migraria de posição quando a composição mudar.
      <SidebarPanel
        key={id}
        id={id}
        icon={def.icon}
        label={panelLabel(id, ctx)}
        defaultOpen={OPEN_BY_DEFAULT.includes(id) || (id === 'fundoDoSlide' && isEditorialCover)}
        badge={id === 'restaurarTemplate' && templateSlideChanges > 0 ? `${templateSlideChanges}` : undefined}
        disabled={disabled}
        disabledReason="Este slide ainda segue o template — não há estilo para restaurar."
      >
        {content[id]}
      </SidebarPanel>
    );
  };

  return (
    <div className="w-[300px] shrink-0 bg-[var(--surface)] border-r border-black/[0.05] dark:border-white/[0.05] flex flex-col h-full overflow-hidden">
      {fileInputs}

      <div className="flex-1 overflow-y-auto pb-3">
        {groups.map((g) => (
          <SidebarGroup key={g.scope} {...headerFor(g)}>
            {g.ids.map(renderPanel)}
          </SidebarGroup>
        ))}
      </div>

      <div className="border-t border-black/[0.05] dark:border-white/[0.05] px-4 py-4 flex flex-col gap-2.5 bg-[var(--surface)]">
        <button
          onClick={onDownloadSlide}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-[12px] font-bold hover:bg-gray-700 dark:hover:bg-white/90 active:scale-[0.98] transition-all shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          Baixar Slide {activeSlideIndex + 1}
        </button>
        <button
          onClick={onDownloadAll}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-black/[0.07] dark:border-white/[0.07] text-[12px] font-medium text-gray-900/50 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:border-black/20 dark:hover:border-white/20 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-all"
        >
          <Archive className="w-3.5 h-3.5" />
          Baixar todos os slides
        </button>
      </div>
    </div>
  );
}
