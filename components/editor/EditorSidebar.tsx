'use client';

import { ReactNode, useRef } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft01Icon,
  UnderlineIcon,
  Upload01Icon,
} from '@hugeicons/core-free-icons';
import NextImage from 'next/image';
import Link from 'next/link';
import { useEditorStore } from '@/hooks/useEditorStore';
import { useGenerateCarouselImages, isEditorialCoverSlide, batchTargets, type ImageTarget } from '@/hooks/useGenerateCarouselImages';
import { useRefineText } from '@/hooks/useRefineText';
import { refinableFields } from '@/lib/refine-fields';
import Slider from './Slider';
import Template01Slots from './Template01Slots';
import Template02Slots from './Template02Slots';
import Template03Slots from './Template03Slots';
import SidebarGroup from './sidebar/SidebarGroup';
import SidebarPanel from './sidebar/SidebarPanel';
import ColorPicker from './sidebar/ColorPicker';
import ElementFontPicker from './sidebar/ElementFontPicker';
import CornersPanel from './sidebar/CornersPanel';
import WordHighlightPicker from './sidebar/WordHighlightPicker';
import AiGenPanel from './sidebar/AiGenPanel';
import RefineTextPanel from './sidebar/RefineTextPanel';
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
import { cn, MIN_IMAGE_ZOOM } from '@/lib/utils';
import {
  ArchiveBoxArrowDownIcon as AnimatedArchiveBoxArrowDown,
  ArrowDownTrayIcon as AnimatedArrowDownTray,
  useNativeHoverAnimation,
} from '@/lib/animated-heroicons';
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
  TEMPLATE_03_DEFAULT_CORNERS,
  template03HeaderSlotsForModel,
  template03AvatarSlot,
  template03HandleSlot,
  template03ModelOf,
  template03SlotColor,
  template03SlotDefaults,
  template03SlotFontName,
  template03TextSlotsForModel,
  template03SlotsForModel,
} from '@/lib/templates/template-03';
import {
  template03ClearAvatar,
  template03ClearImage,
  template03SetAvatar,
  template03SetImage,
  template03SlideImageUrl,
} from '@/lib/templates/template-03/image';
import {
  Template03SlideControl,
  TEMPLATE_03_GRADIENT_DIRECTIONS,
  TEMPLATE_03_GRADIENT_DIRECTION_LABELS,
  TEMPLATE_03_CONTENT_POSITIONS,
  TEMPLATE_03_CONTENT_POSITION_LABELS,
  TEMPLATE_03_CONTENT_ALIGNS,
  TEMPLATE_03_CONTENT_ALIGN_LABELS,
  markTemplate03Override,
  template03ContentPositionFor,
  template03ContentAlignFor,
  template03GradientDirectionFor,
  template03SpecBackground,
} from '@/lib/templates/template-03/overrides';
import {
  Template03ProfileStyle,
  template03ApplyProfileStyle,
  template03ProfileStyleFor,
} from '@/lib/templates/template-03/profile';
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
          on ? 'bg-[var(--accent)]' : 'bg-black/10 dark:bg-white/10'
        )}
      >
        <div
          className={cn(
            'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all',
            on ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </div>
      <span className="text-[12px] text-[var(--ink-dim)]">{label}</span>
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
          ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] shadow-sm'
          : 'border-[var(--line)] bg-[var(--paper)] text-[var(--ink-dim)] hover:border-[var(--ink)] hover:text-[var(--ink)]'
      )}
    >
      <HugeiconsIcon icon={UnderlineIcon} size={12} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

function DropZone({ label, onClick, onFile }: { label: string; onClick: () => void; onFile: (f: File) => void }) {
  return (
    <div
      className="border-2 border-dashed border-[var(--line-strong)] rounded-xl p-4 text-center cursor-pointer hover:border-[var(--ink)] hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-all group"
      onClick={onClick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f?.type.startsWith('image/')) onFile(f);
      }}
    >
      <HugeiconsIcon
        icon={Upload01Icon}
        size={16}
        strokeWidth={1.75}
        aria-hidden
        className="mx-auto mb-1.5 text-[var(--ink-muted)] transition-transform duration-150 motion-reduce:transition-none group-hover:scale-105 group-hover:text-[var(--ink-dim)]"
      />
      <span className="text-[11px] text-[var(--ink-muted)] font-medium">{label}</span>
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
  const t03ImageRef = useRef<HTMLInputElement>(null);
  const t03AvatarRef = useRef<HTMLInputElement>(null);

  const { generateAll, generateOne, generating } = useGenerateCarouselImages();
  const refine = useRefineText();
  const downloadSlideAnimation = useNativeHoverAnimation();
  const downloadAllAnimation = useNativeHoverAnimation();

  if (!slide) return null;

  const isEditorialCover = isEditorialCoverSlide(style, slide, activeSlideIndex);
  /**
   * A imagem de fundo deste slide de fato PINTA alguma coisa?
   *
   * No Editorial só a capa usa fundo de imagem desde a F4 — nos internos a
   * imagem mora no card. Nos demais estilos que têm a aba (o Minimalista) o
   * fundo continua valendo em qualquer slide.
   */
  const bgImageIsLive = style !== 'editorial' || isEditorialCover;
  /**
   * O painel "Fundo do slide" ainda desenha os controles de IMAGEM de fundo?
   *
   * Na capa do Editorial não: lá eles vivem no painel "Imagem", junto da IA.
   * `bgImageIsLive` continua respondendo outra pergunta — se o fundo de imagem
   * é RENDERIZADO neste slide —, e é ela que decide o aviso de dado legado logo
   * abaixo. Duas perguntas, duas flags.
   */
  const bgControlsHere = bgImageIsLive && !isEditorialCover;
  /**
   * O que o painel de IA mostra no modo lote — e de onde sai a contagem do
   * rótulo do botão.
   *
   * Sai de `batchTargets`, a MESMA função que o `generateAll` usa para decidir
   * quem gera. Antes a contagem era refeita aqui (`slides.length` ou um filtro
   * próprio) e podia divergir do lote sem ninguém perceber; a lista de textos
   * seria uma terceira conta da mesma pergunta.
   */
  const batchContentsFor = (target: ImageTarget) =>
    batchTargets(slides, style, target, activeSlideIndex).map(({ slide: s, index }) => ({
      index,
      // O título é o que identifica o slide na lista; a descrição só entra
      // quando não há título, para a linha não ficar vazia.
      text: s.title?.trim() || s.description?.trim() || 'Slide sem texto',
    }));

  // ── TEMPLATE 1 ────────────────────────────────────────────────────────────
  // Tudo do template segue o MODELO do slide, nunca a posição: com modelo
  // repetido ou deck maior que 6, a posição mostraria os campos de outro slide.
  const isT01 = style === 'template01';
  const t01Model = isT01 ? template01ModelOf(slide, activeSlideIndex) : null;
  const t01Media = t01Model != null ? template01SlideMedia(t01Model) : { background: false, content: false };
  const t01ImageSlot = t01Model != null ? template01ImageSlot(t01Model) : undefined;
  const t01ImageUrl = t01Model != null ? template01SlideImageUrl(slide, t01Model) : '';

  // Fundo: sem a MARCA de fundo, o slide segue o spec, então o seletor tem de
  // abrir na cor de fábrica daquele modelo (o 6 em `#0D39E4`) — nunca num padrão
  // do editor. Mexendo no "Fundo do slide" a cor vai para `backgroundColor` e
  // marca `background`; a cor escolhida NUNCA toca o degradê de legibilidade.
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

  // ── TEMPLATE 3 ────────────────────────────────────────────────────────────
  // Mesma regra dos dois anteriores: tudo segue o MODELO do slide, nunca a
  // posição. No FlowLine isso é o ponto todo — o deck é ABERTO e TODO conteúdo
  // compartilha as chaves `s2.*`, em qualquer posição.
  const isT03 = style === 'template03';
  const t03Model = isT03 ? template03ModelOf(slide, activeSlideIndex) : null;
  const t03ImageUrl = t03Model != null ? template03SlideImageUrl(slide, t03Model) : '';
  const t03AvatarUrl = t03Model != null ? slide.templateSlots?.[template03AvatarSlot(t03Model)] ?? '' : '';
  const t03ProfileStyle = t03Model != null ? template03ProfileStyleFor(slide, t03Model) : null;
  const t03TextSlots = t03Model != null ? template03TextSlotsForModel(t03Model) : [];
  // A barra de perfil só tem UM campo de texto (o @); o avatar é slot de imagem
  // e não entra no painel de texto.
  const t03HeaderSlots =
    t03Model != null
      ? template03HeaderSlotsForModel(t03Model).filter((d) => d.kind === 'text')
      : [];
  const t03CornerSlots =
    t03Model != null
      ? template03SlotsForModel(t03Model).filter((d) => d.slot.startsWith('cantos.'))
      : [];
  // Sem a MARCA de fundo o slide segue o spec, então o seletor abre no degradê
  // daquele modelo — nunca num padrão do editor.
  const t03SpecBg = t03Model != null ? template03SpecBackground(t03Model) : undefined;
  const t03BgValue =
    slide.templateOverrides?.background && slide.backgroundColor
      ? slide.backgroundColor
      : t03SpecBg?.swatch ?? '#000000';

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
      const url = (await uploadImageFile(file, bucket)).trim();
      if (!/^https?:\/\//i.test(url)) throw new Error('O upload não retornou uma URL permanente.');
      apply(url);
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

  const handleT03File = (f: File) =>
    upload(f, (url) => t03Model != null && updateActiveSlide(template03SetImage(slide, t03Model, url)));

  const handleT03AvatarFile = (f: File) =>
    upload(f, (url) => {
      slides.forEach((s, i) => {
        const model = template03ModelOf(s, i);
        updateSlide(i, template03SetAvatar(s, model, url));
      });
    }, 'profile-photos');

  const clearT03Avatar = () => {
    slides.forEach((s, i) => {
      const model = template03ModelOf(s, i);
      updateSlide(i, template03ClearAvatar(s, model));
    });
  };

  /** A barra é uma unidade do deck: os dois modelos e todo conteúdo recebem o mesmo ajuste. */
  const setT03ProfileStyle = (patch: Template03ProfileStyle) => {
    // Os sliders podem disparar vários eventos antes do React renderizar de novo.
    // Uma atualização atômica evita estados intermediários no autosave e garante
    // que cada patch preserve os valores anteriores do slot do próprio modelo.
    useEditorStore.setState((state) => ({
      slides: state.slides.map((s, i) => {
        const model = template03ModelOf(s, i);
        return { ...s, ...template03ApplyProfileStyle(s, model, patch) };
      }),
      saveStatus: 'unsaved' as const,
    }));
  };

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
      <input ref={t03ImageRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleT03File(f); e.target.value = ''; }} />
      <input ref={t03AvatarRef} type="file" accept="image/*" className="hidden"
        data-template03-avatar-input
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleT03AvatarFile(f); e.target.value = ''; }} />
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

  /** Escreve a sombra marcando `shadow` no T1 (no T1 o override de overlay só
   *  existe com a marca — ver `template01Overrides`). Não-T1 ignora a marca. */
  const setShadow = (patch: Partial<Slide['shadow']>) =>
    isT01
      ? setT01({ shadow: { ...slide.shadow, ...patch } }, 'shadow')
      : updateActiveSlide({ shadow: { ...slide.shadow, ...patch } });

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

  /* ── Escritas do TEMPLATE 3 ─────────────────────────────────────────────
     Mesma disciplina dos dois anteriores: o handler MARCA o controle em
     `templateOverrides`, e é a marca — nunca o valor — que faz o override
     existir. Deck gerado não tem nenhuma, e por isso nasce idêntico ao spec.
  ────────────────────────────────────────────────────────────────────────── */
  const setT03 = (patch: Partial<Slide>, ...keys: Template03SlideControl[]) =>
    updateActiveSlide({ ...patch, templateOverrides: markTemplate03Override(slide.templateOverrides, ...keys) });

  /** Posição e alinhamento são overrides independentes do slide ativo. */
  const setT03ContentOverride = (
    patch: Partial<Pick<NonNullable<Slide['templateOverrides']>, 'contentPosition' | 'contentAlign'>>
  ) => {
    updateActiveSlide({
      templateOverrides: {
        ...(slide.templateOverrides ?? {}),
        ...patch,
      },
    });
  };

  /** Estilo de UM slot. A chave existir já é o gesto do usuário — sem marca. */
  const setT03Slot = (slot: string, patch: Partial<Template01SlotStyle>) =>
    updateActiveSlide({
      templateSlotStyles: {
        ...(slide.templateSlotStyles ?? {}),
        [slot]: { ...(slide.templateSlotStyles?.[slot] ?? {}), ...patch },
      },
    });

  /**
   * O @ e os cantos valem para o DECK inteiro, como no T1 e no T2.
   *
   * São a assinatura do carrossel, não conteúdo do slide: editar num slide só
   * produzia um deck com assinaturas diferentes por página — que ninguém quer e
   * ninguém percebe enquanto não exporta.
   */
  const setT03DeckText = (slot: string, value: string) =>
    slides.forEach((s, i) => {
      // O @ (handle) é slot POR MODELO (`s{model}.handle`); cada slide leê o seu.
      // Resolver a chave por modelo do slide — igual ao avatar — senão num deck
      // aberto o @ escrito em `s1.handle` não alcança os slides de modelo 2.
      // Cantos são globais (`cantos.left`/`cantos.right`) e mantêm a chave fixa.
      const key = slot.endsWith('.handle') ? template03HandleSlot(template03ModelOf(s, i)) : slot;
      updateSlide(i, { templateSlots: { ...(s.templateSlots ?? {}), [key]: value } });
    });

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

  const t03HeaderSlotNames = t03HeaderSlots.map((d) => d.slot);
  const t03CornerSlotNames = t03CornerSlots.map((d) => d.slot);
  const t03HeaderVisible = t03HeaderSlotNames.every(
    (slot) => slide.templateSlotStyles?.[slot]?.visible !== false
  );
  const t03CornersVisible = t03CornerSlotNames.every(
    (slot) => slide.templateSlotStyles?.[slot]?.visible !== false
  );
  const t03CornerStyle = {
    ...(slide.templateSlotStyles?.[t03CornerSlotNames[0]] ?? {}),
    ...(globalSettings.templateCornerStyle ?? {}),
  };

  /* ── Conteúdo de cada painel ─────────────────────────────────────────── */
  const content: Record<PanelId, ReactNode> = {
    /**
     * Refinar o TEXTO que já existe, nos três escopos. O painel não escreve no
     * store: mostra a sugestão e espera o "Aplicar" (ver RefineTextPanel).
     *
     * 🔴 `key` com o índice do slide: a direção escrita e o escopo são estado
     * LOCAL do painel, e sem remontar ao trocar de slide o texto escrito para o
     * slide 1 continuaria na tela no slide 2. Mesmo cuidado do AiGenPanel.
     */
    refinarTexto: (
      <RefineTextPanel
        key={`refine-${activeSlideIndex}`}
        slideNumber={activeSlideIndex + 1}
        fields={refinableFields(slide, style, activeSlideIndex)}
        loading={refine.loading}
        preview={refine.preview}
        onRefine={(params) => refine.refinar({ ...params, slideIndex: activeSlideIndex })}
        onApply={refine.aplicar}
        onDiscard={refine.descartar}
      />
    ),

    perfil: (
      <>
        <div className="flex items-center gap-2">
          <div
            className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden cursor-pointer border border-[var(--line-strong)] shrink-0"
            onClick={() => profilePhotoRef.current?.click()}
            title="Clique para trocar a foto"
          >
            {profileBadge.photo
              ? <img src={profileBadge.photo} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-[var(--ink-muted)] text-[9px]">foto</div>}
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
                ? 'bg-[var(--ink)] text-[var(--paper)] shadow-sm'
                : 'text-[var(--ink-dim)] hover:text-[var(--ink-2)]'
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
    ) : isT03 ? (
      <>
        <Template03Slots />
        <div className="space-y-2" data-template03-content-controls>
          <div className={labelCls} data-template03-content-position-label>Posição do conteúdo</div>
          <div role="group" aria-label="Posição do conteúdo" className="grid grid-cols-3 gap-1.5" data-template03-content-position-controls>
            {TEMPLATE_03_CONTENT_POSITIONS.map((position) => {
              const selected = t03Model != null && template03ContentPositionFor(slide, t03Model) === position;
              return (
                <button
                  key={position}
                  type="button"
                  aria-label={TEMPLATE_03_CONTENT_POSITION_LABELS[position]}
                  aria-pressed={selected}
                  onClick={() => setT03ContentOverride({ contentPosition: position })}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-[10px] transition-colors',
                    selected
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                      : 'border-[var(--line)] bg-[var(--paper)] text-[var(--ink-muted)] hover:border-[var(--ink)]',
                  )}
                >
                  {TEMPLATE_03_CONTENT_POSITION_LABELS[position]}
                </button>
              );
            })}
          </div>
          <div className={labelCls} data-template03-content-align-label>Alinhamento do conteúdo</div>
          <div role="group" aria-label="Alinhamento do conteúdo" className="grid grid-cols-3 gap-1.5" data-template03-content-align-controls>
            {TEMPLATE_03_CONTENT_ALIGNS.map((position) => {
              const selected = t03Model != null && template03ContentAlignFor(slide, t03Model) === position;
              return (
                <button
                  key={position}
                  type="button"
                  aria-label={TEMPLATE_03_CONTENT_ALIGN_LABELS[position]}
                  aria-pressed={selected}
                  onClick={() => setT03ContentOverride({ contentAlign: position })}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-[10px] transition-colors',
                    selected
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                      : 'border-[var(--line)] bg-[var(--paper)] text-[var(--ink-muted)] hover:border-[var(--ink)]',
                  )}
                >
                  {TEMPLATE_03_CONTENT_ALIGN_LABELS[position]}
                </button>
              );
            })}
          </div>
        </div>
      </>
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
    imagem: isT03 ? (
      <>
        <DropZone
          label={t03ImageUrl ? 'Trocar imagem' : 'Clique ou arraste'}
          onClick={() => t03ImageRef.current?.click()}
          onFile={handleT03File}
        />
        <AiGenPanel
          // A key precisa do índice: prompt e referência são estado local, e
          // sem remontar ao trocar de slide o texto do slide 1 gera o slide 2.
          key={`t03-img-${activeSlideIndex}`}
          buttonLabel="Gerar imagem com IA"
          generating={generating}
          slideTitle={slide.title}
          slideDescription={slide.description || ''}
          // Todo modelo do FlowLine tem a MESMA imagem: a de fundo full-bleed.
          onGenerate={(opts) => generateOne(activeSlideIndex, 'background', opts)}
          onGenerateAll={(opts) => generateAll('background', activeSlideIndex, opts)}
          batchContents={batchContentsFor('background')}
        />
        {t03ImageUrl && (
          <>
            <ImageThumb
              url={t03ImageUrl}
              onRemove={() => t03Model != null && updateActiveSlide(template03ClearImage(slide, t03Model))}
            />
            <Slider label="Opacidade" value={slide.backgroundImageOpacity ?? 100} min={0} max={100} unit="%"
              onChange={(v) => setT03({ backgroundImageOpacity: v }, 'backgroundImageOpacity')} />
            <Slider label="Posição X" value={slide.imagePosition.x} min={0} max={100} unit="%"
              onChange={(v) => setT03({ imagePosition: { ...slide.imagePosition, x: v } }, 'backgroundImagePosition')} />
            <Slider label="Posição Y" value={slide.imagePosition.y} min={0} max={100} unit="%"
              onChange={(v) => setT03({ imagePosition: { ...slide.imagePosition, y: v } }, 'backgroundImagePosition')} />
            <Slider label="Zoom" value={Math.max(MIN_IMAGE_ZOOM, slide.imagePosition.zoom)} min={MIN_IMAGE_ZOOM} max={300} unit="%"
              onChange={(v) => setT03({ imagePosition: { ...slide.imagePosition, zoom: v } }, 'backgroundImagePosition')} />
          </>
        )}
      </>
    ) : isT02 ? (
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
          // Nos templates o `target` não decide nada: quem escolhe o destino da
          // imagem é o modelo do slide (ver `imagePatch`).
          onGenerateAll={(opts) => generateAll('background', activeSlideIndex, opts)}
          batchContents={batchContentsFor('background')}
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
                <Slider label="Zoom" value={Math.max(MIN_IMAGE_ZOOM, slide.imagePosition.zoom)} min={MIN_IMAGE_ZOOM} max={300} unit="%"
                  onChange={(v) => setT02({ imagePosition: { ...slide.imagePosition, zoom: v } }, 'backgroundImagePosition')} />
              </>
            ) : (
              <>
                <Slider label="Posição X" value={slide.contentImagePosition?.x ?? 50} min={0} max={100} unit="%"
                  onChange={(v) => setT02({ contentImagePosition: withContentImagePosition({ x: v }) }, 'contentImagePosition')} />
                <Slider label="Posição Y" value={slide.contentImagePosition?.y ?? 50} min={0} max={100} unit="%"
                  onChange={(v) => setT02({ contentImagePosition: withContentImagePosition({ y: v }) }, 'contentImagePosition')} />
                <Slider label="Zoom" value={Math.max(MIN_IMAGE_ZOOM, slide.contentImagePosition?.zoom ?? 100)} min={MIN_IMAGE_ZOOM} max={300} unit="%"
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
          onGenerateAll={(opts) => generateAll('background', activeSlideIndex, opts)}
          batchContents={batchContentsFor('background')}
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
                <Slider label="Zoom" value={Math.max(MIN_IMAGE_ZOOM, slide.imagePosition.zoom)} min={MIN_IMAGE_ZOOM} max={300} unit="%"
                  onChange={(v) => setT01({ imagePosition: { ...slide.imagePosition, zoom: v } }, 'backgroundImagePosition')} />
              </>
            ) : (
              <>
                <Slider label="Posição X" value={slide.contentImagePosition?.x ?? 50} min={0} max={100} unit="%"
                  onChange={(v) => setT01({ contentImagePosition: withContentImagePosition({ x: v }) }, 'contentImagePosition')} />
                <Slider label="Posição Y" value={slide.contentImagePosition?.y ?? 50} min={0} max={100} unit="%"
                  onChange={(v) => setT01({ contentImagePosition: withContentImagePosition({ y: v }) }, 'contentImagePosition')} />
                <Slider label="Zoom" value={Math.max(MIN_IMAGE_ZOOM, slide.contentImagePosition?.zoom ?? 100)} min={MIN_IMAGE_ZOOM} max={300} unit="%"
                  onChange={(v) => setT01({ contentImagePosition: withContentImagePosition({ zoom: v }) }, 'contentImagePosition')} />
              </>
            )}
          </>
        )}
      </>
    ) : isEditorialCover ? (
      /* CAPA DO EDITORIAL: a imagem dela vai no FUNDO do slide (não há shape de
         conteúdo na capa). Este painel antes não existia e a geração por IA da
         capa morava dentro de "Fundo do slide" — escondida. Os controles são os
         mesmos do fundo: upload, IA e posição/zoom. */
      <>
        <DropZone label="Clique ou arraste uma imagem de fundo" onClick={() => bgImageRef.current?.click()} onFile={handleBackgroundFile} />
        <AiGenPanel
          key={`cover-bg-${activeSlideIndex}`}
          buttonLabel="Gerar imagem com IA"
          generating={generating}
          slideTitle={slide.title}
          slideDescription={slide.description || ''}
          // SEM lote aqui, de propósito: no Editorial só a CAPA usa imagem de
          // fundo (`bgImageIsLive`). Um `generateAll('background')` gravaria
          // fundo nos internos, onde a imagem vai no card — imagem invisível,
          // crédito queimado. É a mesma regra que a capa já tinha antes.
          onGenerate={(opts) => generateOne(activeSlideIndex, 'background', opts)}
        />
        {(slide.backgroundImageUrl || slide.gridImageUrl) && (
          <>
            <ImageThumb url={slide.backgroundImageUrl || slide.gridImageUrl || ''}
              onRemove={() => updateActiveSlide({ backgroundImageUrl: '', gridImageUrl: '' })} />
            {/* A opacidade veio junto do resto: ela era o único controle de
                imagem que tinha ficado em "Fundo do slide" na mudança. */}
            <Slider label="Opacidade" value={slide.backgroundImageOpacity ?? 100} min={0} max={100} unit="%"
              onChange={(v) => updateActiveSlide({ backgroundImageOpacity: v })} />
            <Slider label="Posição X" value={slide.imagePosition.x} min={0} max={100} unit="%"
              onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, x: v } })} />
            <Slider label="Posição Y" value={slide.imagePosition.y} min={0} max={100} unit="%"
              onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, y: v } })} />
            <Slider label="Zoom" value={Math.max(MIN_IMAGE_ZOOM, slide.imagePosition.zoom)} min={MIN_IMAGE_ZOOM} max={300} unit="%"
              onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, zoom: v } })} />
          </>
        )}
      </>
    ) : style === 'profile' ? (
      // O `target: 'background'` fica: ele é quem manda a imagem ser GRAVADA em
      // `backgroundImageUrl`/`gridImageUrl`, que é o par que o ProfileSlide lê.
      // O que ele NÃO decide é o formato pedido à OpenAI — o destino na tela é
      // a caixa de mídia do post, deitada, e quem diz isso é o `shape` de
      // `imageDestination` (`inset-landscape`).
      //
      // Posição X, Posição Y e Zoom existem aqui para a foto que o usuário
      // envia na mão, que quase nunca chega no enquadramento certo. Eles valem
      // porque a mídia do Perfil é uma caixa fixa: a camada entra em `contain`,
      // então no zoom 100 a imagem está INTEIRA e o que X e Y podem fazer é
      // deslocá-la dentro da sobra da caixa — nada é cortado. É subindo o zoom
      // que ela transborda e os dois eixos passam a escolher o enquadramento de
      // verdade. Piso do zoom continua `MIN_IMAGE_ZOOM`: abaixo de 100 a camada
      // deixaria de cobrir a caixa (ver `getImageLayerStyle`).
      <>
        <DropZone label="Arraste ou clique para adicionar" onClick={() => bgImageRef.current?.click()} onFile={handleBackgroundFile} />
        <AiGenPanel
          key={`profile-bg-${activeSlideIndex}`}
          buttonLabel="Gerar imagem com IA"
          generating={generating}
          slideTitle={slide.title}
          slideDescription={slide.description || ''}
          onGenerate={(opts) => generateOne(activeSlideIndex, 'background', opts)}
          onGenerateAll={(opts) => generateAll('background', activeSlideIndex, opts)}
          batchContents={batchContentsFor('background')}
        />
        {(slide.backgroundImageUrl || slide.gridImageUrl) && (
          <>
            <ImageThumb url={slide.backgroundImageUrl || slide.gridImageUrl || ''}
              onRemove={() => updateActiveSlide({ backgroundImageUrl: '', gridImageUrl: '' })} />
            <Slider label="Posição X" value={slide.imagePosition.x} min={0} max={100} unit="%"
              onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, x: v } })} />
            <Slider label="Posição Y" value={slide.imagePosition.y} min={0} max={100} unit="%"
              onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, y: v } })} />
            <Slider label="Zoom" value={Math.max(MIN_IMAGE_ZOOM, slide.imagePosition.zoom)} min={MIN_IMAGE_ZOOM} max={300} unit="%"
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
          onGenerateAll={(opts) => generateAll('content', activeSlideIndex, opts)}
          batchContents={batchContentsFor('content')}
        />
        {slide.contentImageUrl && (
          <ImageThumb url={slide.contentImageUrl} onRemove={() => updateActiveSlide({ contentImageUrl: '' })} />
        )}
        <Slider label="Posição X" value={slide.contentImagePosition?.x ?? 50} min={0} max={100} unit="%"
          onChange={(v) => updateActiveSlide({ contentImagePosition: withContentImagePosition({ x: v }) })} />
        <Slider label="Posição Y" value={slide.contentImagePosition?.y ?? 50} min={0} max={100} unit="%"
          onChange={(v) => updateActiveSlide({ contentImagePosition: withContentImagePosition({ y: v }) })} />
        <Slider label="Zoom" value={Math.max(MIN_IMAGE_ZOOM, slide.contentImagePosition?.zoom ?? 100)} min={MIN_IMAGE_ZOOM} max={300} unit="%"
          onChange={(v) => updateActiveSlide({ contentImagePosition: withContentImagePosition({ zoom: v }) })} />
      </>
    ),

    /* Um controle por BLOCO de texto. Antes era por papel (título/descrição) e
       uma mexida pegava blocos diferentes de uma vez — no slide 5, as duas
       colunas juntas. Entrelinha e alinhamento ficam fora da repetição de
       propósito: são um controle só para o slide. */
    estiloDoTexto: isT03 ? (
      <>
        {t03TextSlots.map((d) => {
          const st = slide.templateSlotStyles?.[d.slot] ?? {};
          const base = t03Model != null ? template03SlotDefaults(d.slot, t03Model) : undefined;
          // O seletor abre mostrando o que ESTÁ na tela: a cor do spec daquele
          // bloco NAQUELE modelo — o corpo é cinza na capa e branco no passo.
          const specColor = t03Model != null ? template03SlotColor(d.slot, t03Model) : '#FFFFFF';
          return (
            <div key={d.slot} className="space-y-2 pt-3 border-t border-[var(--line)] first:border-t-0 first:pt-0">
              <span className={labelCls}>{d.label}</span>
              <Slider label="Tamanho" value={Math.round(st.fontSize ?? base?.fontSizePx ?? 40)}
                min={10} max={160} unit="px" onChange={(v) => setT03Slot(d.slot, { fontSize: v })} />
              <div className="flex items-center gap-2 flex-wrap">
                <ColorPicker label="Cor" value={st.color || specColor} onChange={(v) => setT03Slot(d.slot, { color: v })} />
                <UnderlineToggle on={!!st.underline} onToggle={() => setT03Slot(d.slot, { underline: !st.underline })} />
              </div>
              <div>
                <span className={cn(labelCls, 'block mb-1')}>Fonte</span>
                <ElementFontPicker
                  value={st.font}
                  defaultFontName={
                    (t03Model != null ? template03SlotFontName(d.slot, t03Model) : undefined) ??
                    'Inter Display Regular'
                  }
                  onChange={(v) => setT03Slot(d.slot, { font: v })}
                />
              </div>
              <Slider label="Espaçamento de letras" value={st.letterSpacing ?? base?.letterSpacingEm ?? 0}
                min={-0.1} max={0.3} step={0.01} unit="em"
                onChange={(v) => setT03Slot(d.slot, { letterSpacing: v })} />
            </div>
          );
        })}
      </>
    ) : isT02 ? (
      <>
        {t02TextSlots.map((d) => {
          const st = slide.templateSlotStyles?.[d.slot] ?? {};
          const base = template02SlotDefaults(d.slot);
          // O seletor abre mostrando o que ESTÁ na tela: o número do spec
          // daquele bloco, nunca um padrão do editor.
          const specColor = t02Model != null ? template02SlotColor(d.slot, t02Model) : '#000000';
          // O seletor de cor do marcador vale para a capa E para os internos —
          // foi justamente o argumento do Rafael ao pedir o destaque nos
          // internos, e é a saída dele caso o lime sobre o creme não agrade.
          const isHighlight = d.slot === 'cover.highlight' || d.slot === 'content.highlight';
          return (
            <div key={d.slot} className="space-y-2 pt-3 border-t border-[var(--line)] first:border-t-0 first:pt-0">
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
                  {/* Mesma faixa e mesmo campo do slider "Margem" da aba
                      Cantos: empurra o bloco para dentro. */}
                  <Slider label="Margem" value={st.margin ?? 0} min={0} max={150} unit="px"
                    onChange={(v) => setT02Slot(d.slot, { margin: v })} />
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
            <div key={d.slot} className="space-y-2 pt-3 border-t border-[var(--line)] first:border-t-0 first:pt-0">
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
              {/* Mesma faixa e mesmo campo do slider "Margem" da aba Cantos:
                  empurra o bloco para dentro a partir da borda do spec. */}
              <Slider label="Margem" value={st.margin ?? 0} min={0} max={150} unit="px"
                onChange={(v) => setT01Slot(d.slot, { margin: v })} />
            </div>
          );
        })}

        <div className="pt-3 border-t border-[var(--line)] space-y-2">
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
                      ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)] shadow-sm'
                      : 'bg-[var(--paper)] text-[var(--ink-muted)] border-[var(--line)] hover:border-[var(--ink)]')}>
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

    /* PERFIL — negrito parcial e cor por palavra. É o mesmo picker do Editorial
       e do Minimalista; o que faltava era o estilo `profile` oferecê-lo e o
       `ProfileSlide` ler `slide.highlights` (ver `lib/text-highlights.tsx`).
       A fonte padrão é a do template, que é fixa. */
    destaquesDoTexto: (
      <>
        <WordHighlightPicker
          label="Destaques no título"
          text={slide.title}
          highlights={(slide.highlights || []).filter((h) => slide.title.toLowerCase().includes(h.text.toLowerCase()))}
          onChange={(titleHls) => {
            const other = (slide.highlights || []).filter((h) => !slide.title.toLowerCase().includes(h.text.toLowerCase()));
            updateActiveSlide({ highlights: [...other, ...titleHls] });
          }}
          accentColor={accentColor}
          defaultFontName={defaultTitleFontName}
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
            defaultFontName={defaultBodyFontName}
          />
        )}
      </>
    ),

    layoutDoSlide: (
      <>
        {/* SEQUÊNCIA do slide — onde a imagem entra em relação aos dois blocos
            de texto. Os três valores já existiam em `ContentLayout` e o
            `EditorialSlide` já desenhava cada um; faltava poder escolher.
            A capa fica de fora: ela não é uma sequência, é a capa. */}
        {!isEditorialCover && (
          <div>
            <span className={cn(labelCls, 'block mb-1.5')}>Posição da imagem</span>
            <div className="grid grid-cols-3 gap-1">
              {([
                ['image-text-text', 'Imagem em cima', '▣ ≡ ≡'],
                ['text-image-text', 'Imagem no meio', '≡ ▣ ≡'],
                ['text-text-image', 'Imagem embaixo', '≡ ≡ ▣'],
              ] as const).map(([value, label, glyph]) => {
                const active = (slide.contentLayout ?? 'text-image-text') === value;
                return (
                  <button
                    key={value}
                    aria-label={label}
                    aria-pressed={active}
                    title={label}
                    onClick={() => updateActiveSlide({ contentLayout: value })}
                    className={cn('h-7 rounded text-[10px] transition-colors border',
                      active
                        ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)] shadow-sm'
                        : 'bg-[var(--paper)] text-[var(--ink-muted)] border-[var(--line)] hover:border-[var(--ink)]')}
                  >
                    {glyph}
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
                    ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)] shadow-sm'
                    : 'bg-[var(--paper)] text-[var(--ink-muted)] border-[var(--line)] hover:border-[var(--ink)]')}>
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
                    ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)] shadow-sm'
                    : 'bg-[var(--paper)] text-[var(--ink-muted)] border-[var(--line)] hover:border-[var(--ink)]')}>
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

    sombraOverlay: isT03 ? (
        <div className="space-y-2" data-template03-gradient-controls>
          <div className={labelCls}>Direção do degradê</div>
          <div role="group" aria-label="Direção do degradê" className="grid grid-cols-2 gap-1.5">
            {TEMPLATE_03_GRADIENT_DIRECTIONS.map((direction) => {
              const selected = t03Model != null && template03GradientDirectionFor(slide, t03Model) === direction;
              return (
                <button
                  key={direction}
                  type="button"
                  aria-label={TEMPLATE_03_GRADIENT_DIRECTION_LABELS[direction]}
                  aria-pressed={selected}
                  onClick={() => updateActiveSlide({
                    templateOverrides: {
                      ...(slide.templateOverrides ?? {}),
                      overlayGradientDirection: direction,
                    },
                  })}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-[10px] transition-colors',
                    selected
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                      : 'border-[var(--line)] bg-[var(--paper)] text-[var(--ink-muted)] hover:border-[var(--ink)]',
                  )}
                >
                  {TEMPLATE_03_GRADIENT_DIRECTION_LABELS[direction]}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] leading-snug text-[var(--ink-muted)]">
            A direção indica o percurso das paradas do degradê, da primeira à última.
          </p>
        </div>
    ) : isT01 ? (
      <>
        {/* No T1 o degradê de legibilidade é FIXO: sempre presente e sempre preto,
           para o texto ficar legível sobre qualquer cor de fundo. O usuário só
           ajusta opacidade/tamanho/distância — a COR e o liga/desliga ficam
           travados (ver `template01Overrides`). */}
        <Slider label="Opacidade" value={slide.shadow.opacity} min={0} max={100} unit="%"
          onChange={(v) => setShadow({ opacity: v })} />
        <Slider label="Tamanho" value={slide.shadow.size ?? 85} min={10} max={100} unit="%"
          onChange={(v) => setShadow({ size: v })} />
        <Slider label="Distância" value={slide.shadow.distance ?? 55} min={10} max={100} unit="%"
          onChange={(v) => setShadow({ distance: v })} />
        {/* A cor do degradê de legibilidade é fixa (preta) no T1 — mostramos só
           um swatch estático, sem picker, para deixar claro que não dá para mudar. */}
        <div className="flex items-center gap-2 text-[11px] text-[var(--ink-muted)]">
          <span>Cor</span>
          <span className="inline-block h-4 w-4 rounded-full border border-[var(--line)]" style={{ background: '#000000' }} />
          <span className="italic">preto fixo (legibilidade)</span>
        </div>
      </>
    ) : (
      <>
        <Toggle
          on={slide.shadow.style !== 'none'}
          onToggle={() => setShadow({ style: slide.shadow.style === 'none' ? 'base' : 'none' })}
          label="Exibir sombra"
        />
        {slide.shadow.style !== 'none' && (
          <>
            <Slider label="Opacidade" value={slide.shadow.opacity} min={0} max={100} unit="%"
              onChange={(v) => setShadow({ opacity: v })} />
            <Slider label="Tamanho" value={slide.shadow.size ?? 85} min={10} max={100} unit="%"
              onChange={(v) => setShadow({ size: v })} />
            <Slider label="Distância" value={slide.shadow.distance ?? 55} min={10} max={100} unit="%"
              onChange={(v) => setShadow({ distance: v })} />
            <ColorPicker label="Cor" value={slide.shadow.color || '#000000'}
              onChange={(v) => setShadow({ color: v })} />
          </>
        )}
      </>
    ),

    /* No template é SÓ A COR. Upload e IA ficam de fora de propósito: a imagem
       do template tem painel próprio ("Imagem"), e repeti-la aqui recriaria a
       duplicata que essa refatoração acabou de eliminar. */
    fundoDoSlide: isT03 ? (
      <>
        {/* Os dois modelos do FlowLine têm DEGRADÊ, não cor chapada: escolher
            uma cor aqui substitui o degradê inteiro, como nos modelos 1 e 2 do
            Template 1. O seletor abre na primeira parada do degradê do spec. */}
        <ColorPicker
          label="Cor"
          value={t03BgValue}
          onChange={(v) => setT03({ backgroundColor: v }, 'background')}
        />
      </>
    ) : isT02 ? (
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
        {/* No T1 a cor escolhida vai para o FUNDO chapado (backgroundColor), igual
           aos outros templates. O degradê preto de legibilidade é fixo e mora no
           overlay de sombra (ver overrides.ts) — nunca é afetado por aqui. */}
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
        {/* No EDITORIAL a imagem de fundo só existe na CAPA: nos internos ela
            vai no card (F4), e o upload aqui virou controle órfão — aceitava
            arquivo que não entrava em slide nenhum. O Minimalista continua
            usando fundo de imagem em qualquer slide, então mantém tudo.

            E na capa do Editorial o upload também não fica aqui: ele mora no
            painel "Imagem", junto da geração por IA. Ter os dois em painéis
            diferentes gravando no MESMO campo é o bug que o comentário do bloco
            `imagem:` conta — um vencia o outro no render sem avisar ninguém. */}
        {bgControlsHere && (
          <DropZone label="Clique ou arraste uma imagem de fundo" onClick={() => bgImageRef.current?.click()} onFile={handleBackgroundFile} />
        )}
        {/* Carrossel editorial antigo pode ter fundo gravado num slide interno.
            O dado NÃO é apagado sozinho — mas sem nenhum controle viraria lixo
            invisível e sem como limpar, então sobra o botão de remover. */}
        {!bgImageIsLive && (slide.backgroundImageUrl || slide.gridImageUrl) && (
          <div className="space-y-2 rounded-xl border border-[var(--line)] p-2">
            <p className="text-[10px] leading-snug text-[var(--ink-muted)]">
              Este slide tem uma imagem de fundo salva que não é mais usada — no
              Editorial a imagem entra no card.
            </p>
            <ImageThumb url={slide.backgroundImageUrl || slide.gridImageUrl || ''}
              onRemove={() => updateActiveSlide({ backgroundImageUrl: '', gridImageUrl: '' })} />
            <button
              onClick={() => updateActiveSlide({ backgroundImageUrl: '', gridImageUrl: '' })}
              className="w-full py-1.5 rounded-lg border border-[var(--line)] text-[10px] font-medium text-[var(--ink-dim)] hover:text-[var(--ink)] hover:border-[var(--ink)] transition-all"
            >
              Remover imagem de fundo
            </button>
          </div>
        )}
        {bgControlsHere && (slide.backgroundImageUrl || slide.gridImageUrl) && (
          <>
            <ImageThumb url={slide.backgroundImageUrl || slide.gridImageUrl || ''}
              onRemove={() => updateActiveSlide({ backgroundImageUrl: '', gridImageUrl: '' })} />
            <Slider label="Opacidade" value={slide.backgroundImageOpacity ?? 100} min={0} max={100} unit="%"
              onChange={(v) => updateActiveSlide({ backgroundImageOpacity: v })} />
            <Slider label="Posição X" value={slide.imagePosition.x} min={0} max={100} unit="%"
              onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, x: v } })} />
            <Slider label="Posição Y" value={slide.imagePosition.y} min={0} max={100} unit="%"
              onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, y: v } })} />
            <Slider label="Zoom" value={Math.max(MIN_IMAGE_ZOOM, slide.imagePosition.zoom)} min={MIN_IMAGE_ZOOM} max={300} unit="%"
              onChange={(v) => updateActiveSlide({ imagePosition: { ...slide.imagePosition, zoom: v } })} />
          </>
        )}
      </>
    ),

    /* Aba CANTOS — o MESMO componente nos três templates que a têm. Cada um só
       traduz o seu modelo de persistência (config global de cantos no legado,
       slots do spec no T1/T2) para as props do painel. */
    cantos: isT03 ? (
      /* A assinatura no TOPO do slide: marca à esquerda, arroba à direita.
         Mesma regra do T1 — o texto é do deck, cor e visibilidade são do
         slide, e tipografia/margem/opacidade são globais. */
      <CornersPanel
        show={t03CornersVisible}
        onToggleShow={() => setHeaderStyles(t03CornerSlotNames, { visible: !t03CornersVisible })}
        rows={t03CornerSlots.map((d) => ({
          key: d.slot,
          label: d.label,
          value: slide.templateSlots?.[d.slot] ?? TEMPLATE_03_DEFAULT_CORNERS[d.slot] ?? d.defaultValue,
          onChange: (v) => setT03DeckText(d.slot, v),
          visible: slide.templateSlotStyles?.[d.slot]?.visible !== false,
          onToggleVisible: () =>
            setHeaderStyles([d.slot], {
              visible: slide.templateSlotStyles?.[d.slot]?.visible === false,
            }),
          maxChars: d.maxCharsPerLine,
        }))}
        fontSize={Math.round(
          t03CornerStyle.fontSize ??
            (t03Model != null ? template03SlotDefaults(t03CornerSlotNames[0], t03Model)?.fontSizePx : undefined) ??
            17
        )}
        onFontSize={(v) => setTemplateCornerStyle({ fontSize: v })}
        margin={t03CornerStyle.margin ?? 0}
        onMargin={(v) => setTemplateCornerStyle({ margin: v })}
        opacity={t03CornerStyle.opacity ?? 100}
        onOpacity={(v) => setTemplateCornerStyle({ opacity: v })}
        color={
          t03CornerStyle.color ||
          (t03Model != null ? template03SlotColor(t03CornerSlotNames[0], t03Model) : '#FFFFFF')
        }
        onColor={(v) => setHeaderStyles(t03CornerSlotNames, { color: v })}
        font={t03CornerStyle.font}
        defaultFontName={
          (t03Model != null ? template03SlotFontName(t03CornerSlotNames[0], t03Model) : undefined) ??
          'Inter Display Medium'
        }
        onFont={(v) => setTemplateCornerStyle({ font: v })}
        fontSizeMax={32}
        labelCls={labelCls}
        numericCls={numericCls}
        inputCls={inputCls}
        Toggle={Toggle}
        Slider={Slider}
      />
    ) : isT01 ? (
      <CornersPanel
        show={t01HeaderVisible}
        onToggleShow={() => setHeaderStyles(t01CornerSlotNames, { visible: !t01HeaderVisible })}
        rows={t01CornerSlots.map((d) => ({
          key: d.slot,
          label: d.label,
          value: slide.templateSlots?.[d.slot] ?? TEMPLATE_01_DEFAULT_CORNERS[d.slot],
          onChange: (v) => setT01CornerText(d.slot, v),
          visible: slide.templateSlotStyles?.[d.slot]?.visible !== false,
          onToggleVisible: () =>
            setHeaderStyles([d.slot], {
              visible: slide.templateSlotStyles?.[d.slot]?.visible === false,
            }),
        }))}
        fontSize={Math.round(
          t01HeaderStyle.fontSize ??
            template01SlotDefaults(t01CornerSlotNames[0])?.fontSizePx ??
            17
        )}
        onFontSize={(v) => setTemplateCornerStyle({ fontSize: v })}
        margin={t01HeaderStyle.margin ?? 0}
        onMargin={(v) => setTemplateCornerStyle({ margin: v })}
        opacity={t01HeaderStyle.opacity ?? 100}
        onOpacity={(v) => setTemplateCornerStyle({ opacity: v })}
        color={
          t01HeaderStyle.color ||
          (t01Model != null ? template01SlotColor(t01CornerSlotNames[0], t01Model) : '#FFFFFF')
        }
        onColor={(v) => setHeaderStyles(t01CornerSlotNames, { color: v })}
        font={t01HeaderStyle.font}
        defaultFontName={template01SlotFontName(t01CornerSlotNames[0]) ?? 'Inter Display Medium'}
        onFont={(v) => setTemplateCornerStyle({ font: v })}
        labelCls={labelCls}
        numericCls={numericCls}
        inputCls={inputCls}
        Toggle={Toggle}
        Slider={Slider}
      />
    ) : (
      <CornersPanel
        show={!!corners.show}
        onToggleShow={() => updateCornersConfig({ show: !corners.show })}
        rows={(['topLeft', 'topRight'] as const).map((key) => ({
          key,
          label: key === 'topLeft' ? 'Canto esquerdo' : 'Canto direito',
          value: corners[key].text,
          onChange: (v) => updateCornersConfig({ [key]: { ...corners[key], text: v } } as never),
          visible: corners[key].visible,
          onToggleVisible: () =>
            updateCornersConfig({ [key]: { ...corners[key], visible: !corners[key].visible } } as never),
        }))}
        fontSize={corners.fontSize}
        onFontSize={(v) => updateCornersConfig({ fontSize: v })}
        // "Distância bordas" e "Margem" sempre foram a mesma coisa: a distância
        // do canto à borda do slide. O rótulo passa a ser um só.
        margin={corners.borderDistance}
        onMargin={(v) => updateCornersConfig({ borderDistance: v })}
        opacity={corners.opacity}
        onOpacity={(v) => updateCornersConfig({ opacity: v })}
        color={corners.color || DEFAULT_CORNERS.color || '#FFFFFF'}
        onColor={(v) => updateCornersConfig({ color: v })}
        font={corners.elementFont}
        defaultFontName={defaultBodyFontName}
        onFont={(v) => updateCornersConfig({ elementFont: v })}
        fontSizeMax={32}
        labelCls={labelCls}
        numericCls={numericCls}
        inputCls={inputCls}
        Toggle={Toggle}
        Slider={Slider}
      />
    ),

    /* TEXTO vale para o deck inteiro (ver `setDeckSlotText`); cor e visibilidade
       são deste slide; tipografia, margem e opacidade são globais. */
    cabecalho: isT03 ? (
      /* A BARRA DE PERFIL do FlowLine usa a geometria fixa do spec. O painel só
         edita o @, visibilidade e a foto; tipografia, cor, tamanho e espaçamento
         não são escolhas do usuário neste template. */
      <>
        <Toggle
          on={t03HeaderVisible}
          onToggle={() => setHeaderStyles(t03HeaderSlotNames, { visible: !t03HeaderVisible })}
          label="Exibir barra de perfil"
        />
        {t03HeaderVisible && (
          <>
            {t03HeaderSlots.map((d) => {
              const value = slide.templateSlots?.[d.slot] ?? d.defaultValue;
              const visible = slide.templateSlotStyles?.[d.slot]?.visible !== false;
              return (
                <div key={d.slot} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={labelCls}>{d.label}</span>
                    {d.maxCharsPerLine != null && (
                      <span className={numericCls}>{value.length}/{d.maxCharsPerLine} car.</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={visible}
                      aria-label={`Exibir ${d.label}`}
                      onClick={() => setHeaderStyles([d.slot], { visible: !visible })}
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2',
                        visible ? 'border-[var(--ink)] bg-[var(--ink)]' : 'border-[var(--line-strong)]',
                      )}
                    >
                      {visible && <span className="text-[9px] font-bold text-[var(--paper)]">✓</span>}
                    </button>
                    <input
                      className={cn(inputCls, 'flex-1')}
                      value={value}
                      disabled={!visible}
                      maxLength={d.maxCharsPerLine}
                      onChange={(e) => setT03DeckText(d.slot, e.target.value)}
                    />
                  </div>
                </div>
              );
            })}
            <DropZone
              label={t03AvatarUrl ? 'Trocar foto de perfil' : 'Carregar foto de perfil'}
              onClick={() => t03AvatarRef.current?.click()}
              onFile={handleT03AvatarFile}
            />
            {t03AvatarUrl && <ImageThumb url={t03AvatarUrl} onRemove={clearT03Avatar} />}
            {t03ProfileStyle && (
              <div className="space-y-3 pt-2" data-template03-profile-controls>
                <Slider
                  label="Escala da barra de perfil"
                  value={t03ProfileStyle.profileScale}
                  min={80}
                  max={140}
                  unit="%"
                  onChange={(v) => setT03ProfileStyle({ profileScale: v })}
                />
                <Slider
                  label="Zoom da foto"
                  value={t03ProfileStyle.avatarZoom}
                  min={100}
                  max={250}
                  unit="%"
                  onChange={(v) => setT03ProfileStyle({ avatarZoom: v })}
                />
                <Slider
                  label="Posição horizontal da foto"
                  value={t03ProfileStyle.avatarPositionX}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => setT03ProfileStyle({ avatarPositionX: v })}
                />
                <Slider
                  label="Posição vertical da foto"
                  value={t03ProfileStyle.avatarPositionY}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => setT03ProfileStyle({ avatarPositionY: v })}
                />
              </div>
            )}
          </>
        )}
      </>
    ) : (
      <CornersPanel
        show={t02HeaderVisible}
        onToggleShow={() => setHeaderStyles(t02HeaderSlotNames, { visible: !t02HeaderVisible })}
        rows={t02HeaderSlots.map((d) => ({
          key: d.slot,
          label: d.label,
          value: slide.templateSlots?.[d.slot] ?? TEMPLATE_02_DEFAULT_HEADER[d.slot],
          onChange: (v) => setT02HeaderText(d.slot, v),
          visible: slide.templateSlotStyles?.[d.slot]?.visible !== false,
          onToggleVisible: () =>
            setHeaderStyles([d.slot], {
              visible: slide.templateSlotStyles?.[d.slot]?.visible === false,
            }),
          maxChars: d.maxChars,
        }))}
        fontSize={Math.round(
          t02HeaderStyle.fontSize ??
            template02SlotDefaults(t02HeaderSlotNames[0])?.fontSizePx ??
            17
        )}
        onFontSize={(v) => setTemplateCornerStyle({ fontSize: v })}
        margin={t02HeaderStyle.margin ?? 0}
        onMargin={(v) => setTemplateCornerStyle({ margin: v })}
        opacity={t02HeaderStyle.opacity ?? 100}
        onOpacity={(v) => setTemplateCornerStyle({ opacity: v })}
        color={
          t02HeaderStyle.color ||
          (t02Model != null ? template02SlotColor('header.category', t02Model) : '#767682')
        }
        onColor={(v) => setHeaderStyles(t02HeaderSlotNames, { color: v })}
        font={t02HeaderStyle.font}
        defaultFontName={template02SlotFontName(t02HeaderSlotNames[0]) ?? 'Inter Display Medium'}
        onFont={(v) => setTemplateCornerStyle({ font: v })}
        labelCls={labelCls}
        numericCls={numericCls}
        inputCls={inputCls}
        Toggle={Toggle}
        Slider={Slider}
      />
    ),

    restaurarTemplate: (
      <>
        <button
          onClick={() => updateActiveSlide({ templateOverrides: undefined, templateSlotStyles: undefined })}
          className="w-full py-2 rounded-xl bg-[var(--ink)] text-[var(--paper)] text-[11px] font-semibold hover:opacity-90 transition-opacity"
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
      // 🔴 O escopo global NÃO tem mais rótulo: o "ESTILO GLOBAL" saiu da lista
      // a pedido do Rafael, e o grupo passa a ser só mais linhas na sequência.
      //
      // Só ELE some. O "CONTEÚDO — SLIDE 01" é do mesmo componente e continua —
      // e não é só a linha do topo: no Profile ele é o cabeçalho do SEGUNDO
      // grupo, no corpo da lista. Tirar "cabeçalho do corpo" em bloco mataria
      // o rótulo do Profile junto.
      : {};
  };

  // Nenhum painel nasce aberto: a barra abre fechada, como no desenho, em TODOS
  // os templates. Abrir/fechar no clique continua igual, e o estado segue local
  // ao painel — não havia persistência entre sessões e continua não havendo.
  const OPEN_BY_DEFAULT: PanelId[] = [];

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
        defaultOpen={OPEN_BY_DEFAULT.includes(id)}
        badge={id === 'restaurarTemplate' && templateSlideChanges > 0 ? `${templateSlideChanges}` : undefined}
        disabled={disabled}
        disabledReason="Este slide ainda segue o template — não há estilo para restaurar."
      >
        {content[id]}
      </SidebarPanel>
    );
  };

  // A pílula de voltar divide a linha com o cabeçalho do PRIMEIRO grupo: no
  // desenho as duas coisas compartilham a baseline, pílula à esquerda e o
  // rótulo alinhado à direita na borda interna do painel.
  // A pílula do desenho (108,6 × 18,9, texto 10,5px) é pequena demais para
  // clicar e para ler. Cresceu para ~30 de altura e 12px de corpo.
  //
  // 🔴 Medido antes de escolher: o rótulo do escopo ocupa 130 dos 259 úteis,
  // sobrando 123 para a pílula. "Voltar para Dashboard" a 12px pede 153 — não
  // cabe ao lado sem truncar, que é o aperto que já nos mordeu. Com o rótulo
  // curto são 98, e a linha fecha em 234 dos 259. Por isso o texto visível é
  // "Dashboard" e a frase inteira vive no title/aria-label.
  const backPill = (
    <Link
      href="/dashboard"
      title="Voltar para Dashboard"
      aria-label="Voltar para Dashboard"
      // Raio das linhas do acordeão (11), não mais pílula — o tamanho novo fica.
      className="shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-[11px] bg-[var(--studio-pill)] pl-2 pr-3 py-2 text-[12px] leading-none text-[var(--studio-pill-ink)] hover:bg-[var(--studio-line)] hover:text-[var(--ink)] transition-colors"
    >
      <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} aria-hidden />
      Dashboard
    </Link>
  );

  return (
    // Painel FLUTUANTE, não coluna colada na borda: 285 de largura, margem 15 à
    // esquerda e 18 em cima/embaixo, raio 16. É um card sobre a página.
    <aside className="w-[285px] shrink-0 ml-[15px] my-[18px] rounded-[16px] bg-[var(--studio-panel)] flex flex-col overflow-hidden">
      {fileInputs}

      <Link href="/dashboard" className="block shrink-0 pl-[23px] pt-[26px]" aria-label="Creatools">
        <NextImage
          src="/LOGO_SEMFUNDO.png"
          alt="Creatools"
          width={468}
          height={132}
          priority
          className="w-[234px] h-[66px] object-contain object-left dark:invert"
        />
      </Link>

      <div className="shrink-0 mx-[13px] mt-[37px] h-px bg-[var(--studio-divider)]" />

      {/* `studio-scroll` reserva a canaleta da barra SEMPRE, para a largura da
          linha não mudar entre rolando e não rolando (ver globals.css).
          A máscara desbota os últimos 20px: sem ela o último card era cortado
          ao meio pelo rodapé, sem nenhum sinal de que havia mais coisa. */}
      <div className="studio-scroll flex-1 overflow-y-auto [mask-image:linear-gradient(to_bottom,#000_calc(100%-20px),transparent_100%)]">
        {groups.map((g, i) => (
          <SidebarGroup key={g.scope} {...headerFor(g)} leading={i === 0 ? backPill : undefined}>
            {g.ids.map(renderPanel)}
          </SidebarGroup>
        ))}
      </div>

      {/* Respiro inferior de 42 do desenho; os dois botões separados por 5. */}
      <div className="shrink-0 px-[13px] pt-4 pb-[42px] flex flex-col gap-[5px]">
        <button
          onClick={onDownloadSlide}
          onMouseEnter={downloadSlideAnimation.onMouseEnter}
          onMouseLeave={downloadSlideAnimation.onMouseLeave}
          className="h-[46px] w-full rounded-[10px] bg-[var(--studio-panel)] border border-[var(--studio-line)] text-[14px] text-[var(--ink)] flex items-center justify-center gap-3 hover:border-[var(--studio-line-strong)] transition-colors"
        >
          <AnimatedArrowDownTray ref={downloadSlideAnimation.iconRef} size={18} aria-hidden />
          Baixar Slide {activeSlideIndex + 1}
        </button>
        {/* Ação principal. Borda e sombra CASADAS na cor do TEMA, não da tinta:
            as duas saem de `--paper`, então no claro ficam brancas e no escuro
            acompanham o tema — um token só, sem duas regras para dessincronizar.
            Preto sobre preto (as duas em `--ink`) chapava o botão. O
            preenchimento continua sendo a tinta. */}
        <button
          onClick={onDownloadAll}
          onMouseEnter={downloadAllAnimation.onMouseEnter}
          onMouseLeave={downloadAllAnimation.onMouseLeave}
          className="h-[46px] w-full rounded-[10px] bg-[var(--ink)] text-[var(--paper)] text-[14px] flex items-center justify-center gap-3 border border-[var(--paper)] shadow-[var(--sh-studio-paper)] hover:-translate-y-px active:translate-y-0 active:shadow-[var(--sh-press)] transition-all"
        >
          <AnimatedArchiveBoxArrowDown ref={downloadAllAnimation.iconRef} size={18} aria-hidden />
          Exportar todos os slides
        </button>
      </div>
    </aside>
  );
}
