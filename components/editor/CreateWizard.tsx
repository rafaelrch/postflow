'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import NextImage from 'next/image';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Delete02Icon,
  Globe02Icon,
  RectangleVerticalIcon,
  SmartphoneIcon,
  SparklesIcon,
  SquareIcon,
  Tick01Icon,
  Upload01Icon,
} from '@hugeicons/core-free-icons';
import Button from '@/components/ui/Button';
import { cn, normalizeHandle } from '@/lib/utils';
import { uploadImageFile } from '@/lib/upload-image';
import {
  SlideStyle,
  SlideFormat,
  FontPair,
  TwitterFormat,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_IMAGE_POSITION,
  DEFAULT_SLIDE,
  ProfileData,
  TextPosition,
} from '@/types';
import { ATELIER_ENABLED } from '@/lib/feature-flags';
import { FORMAT_LIST, getFormat } from '@/lib/formats';
import { freeFormSlideFields } from '@/lib/generated-slide-fields';
import SlidePreview from '@/components/editor/SlidePreview';
import type { Slide, GlobalSettings } from '@/types';
import { createClient } from '@/lib/supabase';
import { trackProductEvent } from '@/lib/product-events';
import { useEditorStore } from '@/hooks/useEditorStore';
import {
  TEMPLATE_01_DEFAULT_CORNERS,
  template01SlotsFromContent,
  template01SlotsForSlide,
  template01ModelOf,
  TEMPLATE_01_SLIDE_COUNT,
} from '@/lib/templates/template-01';
import {
  TEMPLATE_02_DEFAULT_MODELS,
  TEMPLATE_02_DEFAULT_HEADER,
  template02ModelAt,
  template02SlotsFromContent,
  template02TextSlotsForModel,
} from '@/lib/templates/template-02';
import {
  TEMPLATE_03_DEFAULT_CORNERS,
  template03ModelAt,
  template03SlotsFromContent,
  template03TextSlotsForModel,
} from '@/lib/templates/template-03';
import { useCreditsStore, handleInsufficientCredits } from '@/hooks/useCreditsStore';
import toast from 'react-hot-toast';

interface CreateWizardProps {
  onClose: () => void;
}

/**
 * Slide de copy manual. As chaves são os campos do template escolhido:
 * `title`/`description`/`highlightWord` nos estilos livres e nomes de slot
 * (`s1.headline`, `content.title`) nos templates de spec.
 */
type ManualSlide = Record<string, string>;

/** Um campo de texto do passo de conteúdo, derivado do template selecionado. */
interface TemplateFieldDef {
  key: string;
  label: string;
  multiline?: boolean;
  placeholder?: string;
  /** Limite vindo do spec, mostrado como dica. */
  hint?: string;
}

/** Idioma em que a IA escreve. Ausente/pt-BR = comportamento de sempre. */
type ContentLanguage = 'pt-BR' | 'en-US' | 'es-ES';

const CONTENT_LANGUAGES: { value: ContentLanguage; label: string }[] = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en-US', label: 'Inglês (EUA)' },
  { value: 'es-ES', label: 'Espanhol' },
];

const CONTENT_MODES: { value: 'ai' | 'manual' | 'json'; label: string }[] = [
  { value: 'ai', label: 'Criar com IA' },
  { value: 'manual', label: 'Manualmente' },
  { value: 'json', label: 'Importar JSON' },
];

/** Grade de pills do número de slides. */
const SLIDE_COUNT_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1);

function limitHint(maxLines?: number, maxCharsPerLine?: number, maxChars?: number): string | undefined {
  if (maxLines && maxCharsPerLine) {
    return `${maxLines} ${maxLines === 1 ? 'linha' : 'linhas'} · ~${maxCharsPerLine} car./linha`;
  }
  if (maxCharsPerLine) return `~${maxCharsPerLine} caracteres`;
  if (maxChars) return `~${maxChars} caracteres`;
  return undefined;
}

/**
 * Campos de texto de um slide, por template.
 *
 * Os templates de spec não têm "título e descrição": têm SLOTS, com nome,
 * rótulo e limite próprios. Derivar daqui é o que faz o passo de conteúdo
 * pedir a coisa certa em vez de um par genérico que o template ignora.
 */
function templateFieldsForSlide(style: SlideStyle, index: number): TemplateFieldDef[] {
  if (style === 'template01') {
    return template01SlotsForSlide(index + 1)
      .filter((s) => s.kind === 'text' && !s.slot.startsWith('cantos.'))
      .map((s) => ({
        key: s.slot,
        label: s.label || s.role || s.slot,
        multiline: (s.maxLines ?? 1) > 1,
        placeholder: s.defaultValue.replace(/\n/g, ' ').slice(0, 60),
        hint: limitHint(s.maxLines, s.maxCharsPerLine),
      }));
  }

  if (style === 'template02') {
    return template02TextSlotsForModel(template02ModelAt(index)).map((s) => ({
      key: s.slot,
      label: s.label,
      multiline: s.multiline,
      placeholder: s.defaultValue.replace(/\n/g, ' ').slice(0, 60),
      hint: limitHint(s.maxLines, s.maxCharsPerLine, s.maxChars),
    }));
  }

  if (style === 'template03') {
    // Deck ABERTO: a posição 0 é a capa e todas as outras são conteúdo. Os campos
    // saem do MODELO, então o slide 9 pede os mesmos slots `s2.*` do slide 2.
    return template03TextSlotsForModel(template03ModelAt(index)).map((s) => ({
      key: s.slot,
      label: s.label,
      multiline: (s.maxLines ?? 1) > 1,
      placeholder: s.defaultValue.replace(/\n/g, ' ').slice(0, 60),
      hint: limitHint(s.maxLines, s.maxCharsPerLine),
    }));
  }

  if (style === 'profile') {
    return [
      { key: 'title', label: 'Texto do post', multiline: true, placeholder: 'A frase que segura o leitor' },
      { key: 'description', label: 'Complemento', multiline: true, placeholder: 'Opcional' },
    ];
  }

  // Editorial: o highlightWord sai na cor de acento no slide.
  return [
    { key: 'title', label: index === 0 ? 'Título da capa' : 'Título', placeholder: 'Máx. 7 palavras' },
    { key: 'description', label: 'Descrição', multiline: true, placeholder: 'Máx. 2 frases' },
    { key: 'highlightWord', label: 'Palavra em destaque', placeholder: 'Opcional' },
  ];
}

/** Templates cujo conteúdo entra por slot, não por título/descrição. */
function isSpecTemplate(style: SlideStyle): boolean {
  return style === 'template01' || style === 'template02' || style === 'template03';
}

/**
 * Slots de um slide manual/JSON, com TODO slot de texto preenchido — vazio
 * quando o usuário não escreveu. É a mesma regra dura de
 * `template0XSlotsFromContent`: um deck criado aqui não pode exibir a copy
 * ilustrativa do Figma.
 */
function slotsFromFields(style: SlideStyle, index: number, values: Record<string, string>) {
  const slots: Record<string, string> = {};
  for (const f of templateFieldsForSlide(style, index)) {
    slots[f.key] = (values[f.key] ?? '').trim();
  }
  return slots;
}

/** Exemplo de JSON do template selecionado — vira o placeholder do textarea. */
function templateJsonExample(style: SlideStyle): string {
  if (isSpecTemplate(style)) {
    const slides = [0, 1].map((i) =>
      Object.fromEntries(
        templateFieldsForSlide(style, i).map((f) => [f.key, f.placeholder || '...']),
      ),
    );
    return JSON.stringify({ slides }, null, 2);
  }

  const slide: Record<string, string> = { title: 'Título do slide', description: 'Texto descritivo' };
  if (style !== 'profile') slide.highlightWord = 'destaque';
  slide.imageUrl = 'https://...';
  return JSON.stringify({ slides: [slide] }, null, 2);
}

const FONT_PAIRS: { label: FontPair; preview: string; sub: string }[] = [
  { label: 'SF Pro Display + IvyOra Text', preview: 'Aa', sub: 'SF Display · IvyOra' },
  { label: 'Space Grotesk + Inter', preview: 'Aa', sub: 'Space Grotesk · Inter' },
  { label: 'Playfair Display + Lato', preview: 'Aa', sub: 'Playfair · Lato' },
  { label: 'Oswald + Roboto', preview: 'Aa', sub: 'Oswald · Roboto' },
  { label: 'Montserrat + Open Sans', preview: 'Aa', sub: 'Montserrat · Open Sans' },
  { label: 'Bebas Neue + Inter', preview: 'Aa', sub: 'Bebas · Inter' },
  { label: 'Syne + DM Sans', preview: 'Aa', sub: 'Syne · DM Sans' },
];

/**
 * Templates cuja forma vem inteira do spec do Figma. Neles não há nada de
 * identidade visual para escolher antes de gerar, então o wizard TERMINA no
 * conteúdo: 3 passos em vez de 4.
 */
const SKIP_VISUAL_STEP: SlideStyle[] = ['template01', 'template02', 'template03'];

function stepCountFor(style: SlideStyle): number {
  return SKIP_VISUAL_STEP.includes(style) ? 3 : 4;
}

const STEP_TITLES = ['Formato do post', 'Template', 'Conteúdo', 'Identidade visual'];

/** Ícone e descrição de cada formato. As dimensões saem de lib/formats.ts. */
const FORMAT_META: Record<SlideFormat, {
  name: string;
  desc: string;
  icon: IconSvgElement;
}> = {
  '4:5':  { name: 'Carrossel', desc: 'Ideal para conteúdo educativo e listas',   icon: RectangleVerticalIcon },
  '1:1':  { name: 'Quadrado',  desc: 'Ótimo para quotes e imagens simples',      icon: SquareIcon },
  '9:16': { name: 'Stories',   desc: 'Perfeito para stories e reels verticais',  icon: SmartphoneIcon },
};

/**
 * Catálogo dos templates do wizard, na ordem do grid 2×2.
 *
 * O estilo `minimalist` continua existindo no editor e em carrosséis antigos —
 * ele só não é oferecido aqui, por decisão de produto.
 *
 * Esta lista é o catálogo COMPLETO e não encolhe quando um template é
 * desativado: quem decide o que aparece é `TEMPLATES`, logo abaixo.
 */
const ALL_TEMPLATES: {
  value: SlideStyle;
  label: string;
  /** Uma linha, dentro do card. */
  short: string;
  /** Faixa de detalhe abaixo do grid, só do selecionado. */
  detail: string;
}[] = [
  {
    value: 'profile',
    label: 'Profile',
    short: 'Post social, focado em texto',
    detail: 'Estética de post no Twitter/X, com o seu perfil.',
  },
  {
    value: 'editorial',
    label: 'Atelier',
    short: 'Revista para creators',
    detail: 'Revista: metadados no topo, imagem e texto. Fontes e cores são suas.',
  },
  {
    value: 'template01',
    label: 'Manifesto',
    short: 'Deck fechado de 6 slides',
    detail: `Forma fixa do Figma, ${TEMPLATE_01_SLIDE_COUNT} slides. Você troca só texto e imagens.`,
  },
  {
    value: 'template02',
    label: 'Radar',
    short: 'Deck aberto: quantos slides você quiser',
    detail: 'Forma fixa do Figma, deck aberto: os 3 modelos se alternam.',
  },
  {
    value: 'template03',
    label: 'FlowLine',
    short: 'Deck aberto: capa e conteúdo independente',
    detail:
      'Forma fixa do Figma, deck aberto: capa e slides de conteúdo independentes.',
  },
];

/**
 * Os templates realmente OFERECIDOS na criação.
 *
 * O Atelier (`editorial`) está desligado por `ATELIER_ENABLED`
 * (lib/feature-flags.ts): a entrada dele continua no catálogo acima, só não
 * chega ao grid. Carrossel Atelier já salvo não é afetado — isto aqui é a
 * oferta de criar um novo, nada mais. Com 4 cards o grid `grid-cols-2` fecha
 * um 2×2 exato, que é a forma para a qual ele foi desenhado.
 */
const TEMPLATES = ALL_TEMPLATES.filter(
  (tpl) => tpl.value !== 'editorial' || ATELIER_ENABLED,
);

/** Templates cuja forma vem do spec — o step de ID visual respeita isso. */
const FIXED_VISUAL_STYLES: SlideStyle[] = ['profile', 'template01', 'template02', 'template03'];

/**
 * Campos de estilo de um slide nos estilos de forma LIVRE (profile/editorial).
 *
 * Fonte única: o `handleGenerate` monta o carrossel com isto e a miniatura do
 * passo 2 desenha com isto. É o que faz a capa do card ser fiel POR
 * CONSTRUÇÃO — se a geração mudar, a miniatura muda junto e não desatualiza.
 * Os templates de spec não passam por aqui: neles a forma é do Figma.
 */

// ─── Miniatura de template ──────────────────────────────────────
// A capa é renderizada pelo SlidePreview de verdade — o mesmo componente do
// editor — com os mesmos campos que a geração produz para o slide 0. Nada de
// mock de divs nem de valores inventados.

const THUMB_HEIGHT = 132;

/** Perfil de exemplo da miniatura do Profile. */
const THUMB_PROFILE = { name: 'Ana Ribeiro', handle: '@anaribeiro' };

/**
 * Capa de exemplo de cada template. Nos templates de spec vai SEM
 * `templateSlots`: assim o slide cai no conteúdo original do Figma, que é
 * literalmente a capa daquele template.
 */
function previewSlide(style: SlideStyle): Slide {
  if (style === 'template01' || style === 'template02' || style === 'template03') {
    return { ...DEFAULT_SLIDE, id: `thumb-${style}`, position: 0, templateModel: 1 };
  }
  return {
    ...DEFAULT_SLIDE,
    id: `thumb-${style}`,
    position: 0,
    title: style === 'profile'
      ? 'A disciplina vence o talento quando o talento não se disciplina.'
      : 'O hábito que muda tudo',
    description: style === 'profile'
      ? ''
      : 'O que ninguém te conta sobre começar cedo.',
    highlightWord: '',
    backgroundImageUrl: '',
    gridImageUrl: '',
    backgroundColor: '#0A0A0A',
    ...freeFormSlideFields(style, 0),
  };
}

/**
 * Preview pronto de cada template, em `public/templates/`, agora nos TRÊS
 * formatos: cada par (estilo × formato) tem o seu arquivo, renderizado naquela
 * forma. Antes só existia o 4:5 e 1:1/9:16 caíam na miniatura viva por FALTA
 * DE FORMATO; esse motivo de queda acabou.
 *
 * O nome do arquivo casa com o VALOR de `SlideStyle`, não com o nome de
 * produto do card ("Manifesto" é `template01`), e termina no formato: quem for
 * procurar o asset parte do código, não do rótulo. Mapa EXPLÍCITO nos dois
 * eixos, e não caminho montado por concatenação — string montada esconde o
 * preview trocado entre dois templates (ou entre dois formatos do mesmo
 * template), que é o erro que ninguém percebe olhando o diff.
 *
 * `Record<SlideStyle, Record<SlideFormat, …>>` de propósito, e a exaustividade
 * vale nos DOIS eixos: quando a TASK 3 acrescentar um estilo — ou quando
 * chegar um formato novo — o TypeScript quebra AQUI e obriga alguém a decidir
 * se aquele par tem preview, em vez de o card sair silenciosamente sem imagem.
 * `minimalist` é `null` nos três porque nem é oferecido no wizard.
 */
const TEMPLATE_PREVIEW: Record<SlideStyle, Record<SlideFormat, string | null>> = {
  minimalist: {
    '4:5': null,
    '1:1': null,
    '9:16': null,
  },
  profile: {
    '4:5': '/templates/preview-profile-4x5.webp',
    '1:1': '/templates/preview-profile-1x1.webp',
    '9:16': '/templates/preview-profile-9x16.webp',
  },
  editorial: {
    '4:5': '/templates/preview-editorial-4x5.webp',
    '1:1': '/templates/preview-editorial-1x1.webp',
    '9:16': '/templates/preview-editorial-9x16.webp',
  },
  /**
   * TEMPLATE 3 (FlowLine) — só o 4:5 tem arquivo.
   *
   * O `.webp` foi derivado de `reference/slide1.png` do material (540x675,
   * 12 KB). Os outros dois formatos ficam `null` de propósito: caem na
   * MINIATURA VIVA, que é o comportamento previsto para o par sem arquivo — e é
   * melhor que apontar para um caminho inexistente, que daria 404 calado.
   */
  template03: {
    '4:5': '/templates/preview-template03-4x5.webp',
    '1:1': null,
    '9:16': null,
  },
  template01: {
    '4:5': '/templates/preview-template01-4x5.webp',
    '1:1': '/templates/preview-template01-1x1.webp',
    '9:16': '/templates/preview-template01-9x16.webp',
  },
  template02: {
    '4:5': '/templates/preview-template02-4x5.webp',
    '1:1': '/templates/preview-template02-1x1.webp',
    '9:16': '/templates/preview-template02-9x16.webp',
  },
};

/**
 * Dimensão INTRÍNSECA dos previews, POR FORMATO.
 *
 * Declarada para o browser reservar o espaço antes de a imagem chegar — sem
 * isso o card salta quando ela carrega, e o grid inteiro se mexe embaixo do
 * ponteiro de quem já ia clicar. Por isso é por formato e não uma só: uma
 * dimensão de 4:5 declarada num asset 1:1 reservaria a caixa errada e traria
 * o salto de volta justamente nos formatos novos.
 *
 * Todos têm 675px de ALTURA de propósito: o card fixa a altura
 * (`THUMB_HEIGHT`) e varia a largura, então altura constante = mesma densidade
 * de pixel nos três formatos.
 */
const PREVIEW_SIZE: Record<SlideFormat, { width: number; height: number }> = {
  '4:5': { width: 540, height: 675 },
  '1:1': { width: 675, height: 675 },
  '9:16': { width: 380, height: 675 },
};

/** O preview pronto deste template NESTE formato, ou `null` se não existe. */
function previewSrc(style: SlideStyle, format: SlideFormat): string | null {
  return TEMPLATE_PREVIEW[style][format];
}

/** Há preview estático para este template NESTE formato? */
function temPreview(style: SlideStyle, format: SlideFormat): boolean {
  return previewSrc(style, format) !== null;
}

/**
 * A miniatura do card: preview pronto quando existe, miniatura VIVA quando
 * não existe ou quando a imagem falha ao carregar.
 *
 * O caminho vivo não virou lixo com a chegada dos assets — ele é o degrau de
 * baixo. O preview estático ganha acabamento e perde a garantia de estar
 * atualizado; o `SlidePreview` é fiel por construção. Quando o preview não
 * pode aparecer, o usuário continua vendo o template certo, nunca um card
 * quebrado nem um buraco no grid.
 *
 * Com os três formatos cobertos, sobram só DOIS motivos de queda — asset
 * ausente no mapa (`null`) e imagem que FALHA ao carregar. Nenhum dos dois se
 * reabre: é a decisão D1.
 *
 * Exportado só para o teste: o motivo "asset ausente" é hoje inalcançável pelo
 * wizard (o único estilo sem preview, `minimalist`, não tem card), e sem isto
 * essa queda ficaria sem prova — coberta por leitura de código, não por teste.
 */
export function TemplateThumb({ style, format }: { style: SlideStyle; format: SlideFormat }) {
  const src = previewSrc(style, format);
  const podeUsarImagem = temPreview(style, format);

  /**
   * `carregando` → esqueleto no lugar da imagem; `falhou` → miniatura viva.
   * Começa em `carregando` só quando há imagem a esperar: sem isso o card sem
   * asset piscaria um esqueleto que nunca vira nada.
   */
  const [estado, setEstado] = useState<'carregando' | 'pronta' | 'falhou'>(
    podeUsarImagem ? 'carregando' : 'falhou',
  );

  if (!podeUsarImagem || !src || estado === 'falhou') {
    return <TemplateThumbAoVivo style={style} format={format} />;
  }

  const fmt = getFormat(format);
  const largura = Math.round(THUMB_HEIGHT * (fmt.width / fmt.height));
  const tamanho = PREVIEW_SIZE[format];

  return (
    <span
      className="relative block overflow-hidden rounded-[6px]"
      style={{
        border: '1.5px solid var(--ink)',
        lineHeight: 0,
        width: largura,
        height: THUMB_HEIGHT,
      }}
      aria-hidden
    >
      {/* Esqueleto: ocupa a caixa enquanto a imagem não chega. Fica ATRÁS da
          imagem, então some sozinho quando ela pinta por cima. */}
      {estado === 'carregando' && (
        <span
          className="absolute inset-0 animate-pulse"
          style={{ background: 'var(--paper-2)' }}
          data-testid={`template-preview-loading-${style}`}
        />
      )}
      <NextImage
        src={src}
        /*
         * DECORATIVA, de propósito. O card já diz "Manifesto" e a linha de
         * apoio em texto, dentro do mesmo botão; um alt descritivo faria o
         * leitor de tela anunciar o template duas vezes seguidas. O nome
         * continua sendo lido — pelo texto, que é onde ele deve estar.
         */
        alt=""
        width={tamanho.width}
        height={tamanho.height}
        /* Só baixa ao entrar na tela: o grid abre com 4 cards e o passo 2 nem
           sempre é visitado. */
        loading="lazy"
        decoding="async"
        /* A caixa tem ~106px de largura; sem `sizes` o Next serviria uma
           variante bem maior do que a tela precisa. */
        sizes={`${largura}px`}
        onLoad={() => setEstado('pronta')}
        onError={() => setEstado('falhou')}
        className="block h-full w-full object-cover"
        data-testid={`template-preview-${style}`}
      />
    </span>
  );
}

/** A miniatura viva de sempre: o SlidePreview real, fiel por construção. */
function TemplateThumbAoVivo({ style, format }: { style: SlideStyle; format: SlideFormat }) {
  const fmt = getFormat(format);
  const settings: GlobalSettings = {
    ...DEFAULT_GLOBAL_SETTINGS,
    format,
    theme: 'dark',
    profileBadge: {
      ...DEFAULT_GLOBAL_SETTINGS.profileBadge,
      show: true,
      name: THUMB_PROFILE.name,
      handle: THUMB_PROFILE.handle,
    },
  };
  return (
    <span
      className="block overflow-hidden rounded-[6px]"
      style={{ border: '1.5px solid var(--ink)', lineHeight: 0 }}
      aria-hidden
      data-testid={`template-thumb-vivo-${style}`}
    >
      <SlidePreview
        slide={previewSlide(style)}
        globalSettings={settings}
        style={style}
        slideIndex={0}
        totalSlides={6}
        scale={THUMB_HEIGHT / fmt.height}
      />
    </span>
  );
}

/**
 * Barra de progresso do wizard. O preenchimento e a bolinha animam por
 * transição de CSS (.cw-progress-*), que o prefers-reduced-motion desliga.
 */
function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = (step / total) * 100;
  return (
    <div className="flex items-center gap-3 px-6 pb-4">
      {/* Trilho e bolinha são só preenchimento — sem contorno. */}
      <div
        className="relative flex-1 rounded-full"
        style={{ height: 6, background: 'var(--paper-3)' }}
      >
        <div
          className="cw-progress-fill absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: 'var(--ink)' }}
        />
        <span
          className="cw-progress-knob absolute top-1/2 rounded-full"
          style={{
            left: `${pct}%`,
            width: 12,
            height: 12,
            transform: 'translate(-50%, -50%)',
            background: 'var(--accent)',
          }}
        />
      </div>
      <span
        className="font-mono text-[11px] font-semibold tabular-nums shrink-0"
        style={{ color: 'var(--ink-dim)' }}
        data-testid="wizard-progress"
      >
        {/*
          O total muda de 4 para 3 ao escolher um template de forma fixa. A
          largura da barra já anima por transição; o número, sendo texto,
          trocaria a seco — a `key` refaz o nó e o faz entrar com fade.
        */}
        {step} / <span key={total} className="cw-total-swap">{total}</span>
      </span>
    </div>
  );
}

/** Cartão de opção do wizard — visual e gesto vêm de `.cw-option`. */
function OptionCard({
  selected,
  onClick,
  disabled,
  className,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn('cw-option relative w-full text-left', className)}
    >
      {children}
      {selected && (
        <span
          className="absolute top-2 right-2 grid place-items-center rounded-full"
          style={{ width: 18, height: 18, background: 'var(--ink)', color: 'var(--paper)' }}
        >
          <HugeiconsIcon icon={Tick01Icon} className="w-3 h-3" strokeWidth={3} aria-hidden />
        </span>
      )}
    </button>
  );
}

/** Slides manuais nascem vazios: o exemplo vive no placeholder de cada campo. */
function makeDefaultManualSlides(count: number): ManualSlide[] {
  return Array.from({ length: count }, () => ({}));
}

interface ParsedJSONSlide {
  title: string;
  description: string;
  highlightWord: string;
  backgroundColor: string;
  imageUrl: string;
  /** Só nos templates de spec: o conteúdo entra por slot. */
  slots?: Record<string, string>;
}

interface ParsedCarouselJSON {
  slides: ParsedJSONSlide[];
  carouselTitle?: string;
  caption?: string;
}

function normalizeSlide(raw: unknown, i: number): ParsedJSONSlide {
  const item = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string): string => (typeof item[k] === 'string' ? (item[k] as string).trim() : '');

  const imageUrlRaw = item.imageUrl ?? item.image_url ?? item.imagem_url ?? item.image;
  const imageUrl = typeof imageUrlRaw === 'string' ? imageUrlRaw : '';

  const title =
    str('titulo') ||
    str('title') ||
    str('titulo_card') ||
    str('pergunta') ||
    str('frase_destaque') ||
    str('data_destaque') ||
    str('ano_destaque') ||
    str('texto_linha_1') ||
    `Slide ${i + 1}`;

  const parts: string[] = [];
  const push = (v: string) => { if (v && v !== title && !parts.includes(v)) parts.push(v); };

  push(str('subtitulo'));
  push(str('texto'));
  push(str('texto_linha_1'));
  push(str('texto_linha_2'));
  push(str('texto_linha_3'));
  push(str('frase_destaque'));
  push(str('citacao'));
  push(str('detalhe'));
  push(str('cta'));
  push(str('description'));
  push(str('descricao'));
  push(str('legenda'));
  push(str('text'));

  if (Array.isArray(item.numeros)) {
    const linhas = (item.numeros as unknown[])
      .map((n) => {
        const nn = (n ?? {}) as Record<string, unknown>;
        const v = String(nn.valor ?? '').trim();
        const d = String(nn.descricao ?? '').trim();
        return v && d ? `${v} — ${d}` : v || d;
      })
      .filter(Boolean);
    if (linhas.length) parts.push(linhas.join('\n'));
  }

  const backgroundColor =
    str('fundo') ||
    str('backgroundColor') ||
    str('background_color') ||
    '#111111';

  const highlightWord =
    str('palavra_destaque') ||
    str('highlightWord') ||
    str('highlight_word') ||
    str('highlight') ||
    '';

  return {
    title,
    description: parts.join('\n\n'),
    highlightWord,
    backgroundColor,
    imageUrl,
  };
}

function parseCarouselJSON(raw: string): ParsedCarouselJSON {
  let s = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  s = s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (!s) throw new Error('JSON vazio');
  const parsed = JSON.parse(s);

  const top = (Array.isArray(parsed) ? {} : parsed ?? {}) as Record<string, unknown>;
  const arr: unknown = Array.isArray(parsed)
    ? parsed
    : Array.isArray(top.slides)
      ? (top.slides as unknown[])
      : null;
  if (!Array.isArray(arr)) throw new Error('JSON deve ser um array de slides ou um objeto com "slides"');
  if (arr.length === 0) throw new Error('Nenhum slide encontrado no JSON');

  const slides = arr.map((item, i) => normalizeSlide(item, i));
  const carouselTitle =
    (typeof top.carrossel === 'string' ? (top.carrossel as string).trim() : '') ||
    (typeof top.title === 'string' ? (top.title as string).trim() : '') ||
    undefined;
  const caption =
    (typeof top.legenda_post === 'string' ? (top.legenda_post as string) : '') ||
    (typeof top.caption === 'string' ? (top.caption as string) : '') ||
    undefined;

  return { slides, carouselTitle, caption };
}

/**
 * JSON dos templates de spec: cada slide é um objeto de slot → texto, com os
 * nomes que o próprio spec define. Recusa slide sem nenhum slot conhecido — sem
 * isso o deck sairia com a copy de fábrica e o usuário não entenderia por quê.
 */
function parseSpecTemplateJSON(arr: unknown[], style: SlideStyle): ParsedJSONSlide[] {
  return arr.map((raw, i) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const campos = templateFieldsForSlide(style, i);
    const conhecidos = new Set(campos.map((f) => f.key));

    const valores: Record<string, string> = {};
    const desconhecidos: string[] = [];
    for (const [k, v] of Object.entries(item)) {
      if (conhecidos.has(k)) {
        if (typeof v === 'string') valores[k] = v;
      } else if (k !== 'imageUrl' && k !== 'image_url' && k !== 'image') {
        desconhecidos.push(k);
      }
    }

    if (Object.keys(valores).length === 0) {
      const nome = TEMPLATES.find((t) => t.value === style)?.label ?? style;
      throw new Error(
        `Slide ${i + 1}: nenhum campo do ${nome} reconhecido` +
        `${desconhecidos.length ? ` (recebido: ${desconhecidos.slice(0, 3).join(', ')})` : ''}. ` +
        `Esperado: ${campos.map((f) => f.key).join(', ')}.`
      );
    }

    const imagem = item.imageUrl ?? item.image_url ?? item.image;
    const primeiro = campos.find((f) => valores[f.key])?.key;

    return {
      title: primeiro ? valores[primeiro] : '',
      description: '',
      highlightWord: '',
      backgroundColor: '#111111',
      imageUrl: typeof imagem === 'string' ? imagem : '',
      slots: slotsFromFields(style, i, valores),
    };
  });
}

/**
 * Parser do passo de conteúdo. Os templates de spec têm estrutura própria; os
 * demais caem no parser genérico de sempre, sem mudança de comportamento.
 */
function parseCarouselJSONForStyle(raw: string, style: SlideStyle): ParsedCarouselJSON {
  if (!isSpecTemplate(style)) return parseCarouselJSON(raw);

  let s = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  s = s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (!s) throw new Error('JSON vazio');
  const parsed = JSON.parse(s);

  const top = (Array.isArray(parsed) ? {} : parsed ?? {}) as Record<string, unknown>;
  const arr: unknown = Array.isArray(parsed) ? parsed : Array.isArray(top.slides) ? top.slides : null;
  if (!Array.isArray(arr)) throw new Error('JSON deve ser um array de slides ou um objeto com "slides"');
  if (arr.length === 0) throw new Error('Nenhum slide encontrado no JSON');

  return {
    slides: parseSpecTemplateJSON(arr, style),
    carouselTitle: typeof top.title === 'string' ? top.title.trim() || undefined : undefined,
    caption: typeof top.caption === 'string' ? top.caption : undefined,
  };
}

export default function CreateWizard({ onClose }: CreateWizardProps) {
  const router = useRouter();
  const { loadCarousel } = useEditorStore();

  const [step, setStep] = useState(1);
  // Direção da última navegação — só alimenta a animação de troca de etapa.
  const [stepDir, setStepDir] = useState<'fwd' | 'back'>('fwd');
  // Formato do canvas. Mesmo tipo do editor (lib/formats.ts): vai para
  // globalSettings.format e é persistido em carousels.global_settings.
  const [format, setFormat] = useState<SlideFormat>('4:5');
  const [style, setStyle] = useState<SlideStyle>('profile');
  const [contentMode, setContentMode] = useState<'ai' | 'manual' | 'json'>('ai');
  const [prompt, setPrompt] = useState('');
  const [webSearch, setWebSearch] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [slideCount, setSlideCount] = useState(5);
  const [language, setLanguage] = useState<ContentLanguage>('pt-BR');
  const [twitterFormat, setTwitterFormat] = useState<TwitterFormat>('B');
  const [fontPair, setFontPair] = useState<FontPair>('SF Pro Display + IvyOra Text');
  // Brand palette loaded from profile: [dark, paper/light, accent]
  const DEFAULT_BRAND_PALETTE = ['#0A0A0A', '#FAFAF7', '#00CFFF'];
  const [brandPalette, setBrandPalette] = useState<string[]>(DEFAULT_BRAND_PALETTE);
  /** True só quando o onboarding trouxe uma paleta de verdade. */
  const [hasBrandIdentity, setHasBrandIdentity] = useState(false);

  // Passo 4 — identidade visual do post
  const [visualMode, setVisualMode] = useState<'brand' | 'manual'>('brand');
  const [customBg, setCustomBg] = useState('#0A0A0A');
  const [customAccent, setCustomAccent] = useState('#00CFFF');
  // O Profile não tem cor de fundo livre: o cartão é claro ou escuro.
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Sem paleta do onboarding não há identidade a usar: cai no manual sozinho.
  const usingBrand = hasBrandIdentity && visualMode === 'brand';
  const accentColor = usingBrand ? (brandPalette[2] || '#00CFFF') : customAccent;
  const brandDarkBg = usingBrand ? (brandPalette[0] || '#0A0A0A') : customBg;
  const brandLightBg = brandPalette[1] || '#FFFFFF';

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('brand_palette, photo_url, brand_name, name, twitter_handle')
        .eq('id', user.id)
        .single();
      if (data?.brand_palette && Array.isArray(data.brand_palette) && data.brand_palette.length >= 3) {
        setBrandPalette(data.brand_palette);
        setHasBrandIdentity(true);
        setCustomBg(data.brand_palette[0] || '#0A0A0A');
        setCustomAccent(data.brand_palette[2] || '#00CFFF');
      }
      // Pré-preenche o perfil do card Twitter/X com os dados do onboarding.
      if (data) {
        setProfileData((p) => ({
          handle: p.handle || data.twitter_handle || '',
          name: p.name || data.brand_name || data.name || '',
          photoUrl: p.photoUrl || data.photo_url || '',
        }));
      }
    };
    load();
  }, []);
  const [profileData, setProfileData] = useState<ProfileData>({
    handle: '',
    name: '',
    photoUrl: '',
  });
  // Manual slides
  const [manualSlides, setManualSlides] = useState<ManualSlide[]>(makeDefaultManualSlides(5));
  const [manualIndex, setManualIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const profilePhotoRef = useRef<HTMLInputElement>(null);
  const jsonFileRef = useRef<HTMLInputElement>(null);

  // Sync manual slides count with slideCount slider
  const updateSlideCount = (n: number) => {
    setSlideCount(n);
    setManualSlides((prev) => {
      if (n > prev.length) {
        return [...prev, ...makeDefaultManualSlides(n - prev.length)];
      }
      return prev.slice(0, n);
    });
  };

  const updateManualSlide = (i: number, field: string, value: string) => {
    setManualSlides((prev) => prev.map((sl, idx) => idx === i ? { ...sl, [field]: value } : sl));
  };

  const addManualSlide = () => {
    setManualSlides((prev) => [...prev, {}]);
    setManualIndex(manualSlides.length);
  };

  const removeManualSlide = (i: number) => {
    if (manualSlides.length <= 1) return;
    setManualSlides((prev) => prev.filter((_, idx) => idx !== i));
  };

  // O TEMPLATE 1 tem uma dramaturgia de 6 slides (capa → contexto → problema →
  // virada → dois eixos → fechamento). Não é redimensionável: o slider some e a
  // contagem é sempre a do spec.
  const isFixedDeck = style === 'template01';
  const effectiveSlideCount = isFixedDeck ? TEMPLATE_01_SLIDE_COUNT : slideCount;

  // O TEMPLATE 2 tem forma fixa mas deck ABERTO: 3 modelos que se alternam, sem
  // dramaturgia fechada. O padrão é 5 (a `sequenciaPadrao` do spec) e o usuário
  // muda no slider como em qualquer outro estilo.
  const isT02 = style === 'template02';
  const isT03 = style === 'template03';

  // Depende do template: o T1 e o T2 não têm passo de identidade visual.
  const totalSteps = stepCountFor(style);
  const manualFields = templateFieldsForSlide(style, manualIndex);

  // Trocar para um template sem passo visual enquanto se está nele deixaria o
  // wizard num passo que não existe mais. Só pode acontecer indo para trás.
  useEffect(() => {
    setStep((s) => Math.min(s, stepCountFor(style)));
  }, [style]);

  // O TEMPLATE 1 é deck fechado: a lista manual tem de ter exatamente os 6
  // slides do spec, então trocar de template no passo 2 reajusta o passo 3.
  useEffect(() => {
    if (style !== 'template01') return;
    setManualSlides((prev) =>
      prev.length === TEMPLATE_01_SLIDE_COUNT
        ? prev
        : Array.from({ length: TEMPLATE_01_SLIDE_COUNT }, (_, i) => prev[i] ?? {})
    );
    setManualIndex((i) => Math.min(i, TEMPLATE_01_SLIDE_COUNT - 1));
  }, [style]);

  const goTo = (next: number) => {
    setStepDir(next > step ? 'fwd' : 'back');
    setStep(next);
  };

  /**
   * Habilita o botão primário. Só o step de conteúdo barra: a IA precisa de
   * prompt e o JSON precisa de texto (a validação de forma roda no clique,
   * pra não parsear o JSON a cada tecla).
   */
  const canAdvance = (() => {
    if (step !== 3) return true;
    if (contentMode === 'ai') return prompt.trim().length > 0;
    if (contentMode === 'json') return jsonInput.trim().length > 0;
    return true;
  })();

  const handleNext = () => {
    if (step === 3) {
      if (contentMode === 'ai' && !prompt.trim()) {
        toast.error('Digite um prompt para a IA');
        return;
      }
      if (contentMode === 'json' && !jsonInput.trim()) {
        toast.error('Cole um JSON ou faça upload de um arquivo');
        return;
      }
      if (contentMode === 'json') {
        try {
          parseCarouselJSONForStyle(jsonInput, style);
          setJsonError(null);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'JSON inválido';
          setJsonError(msg);
          toast.error(msg);
          return;
        }
      }
    }
    if (step < totalSteps) goTo(step + 1);
    else handleGenerate();
  };

  const handleGenerate = async () => {
    setLoading(true);
    // Twitter/X tem fonte única — ignora qualquer fontPair escolhido antes de
    // trocar o estilo para 'profile'.
    const effectiveFontPair: FontPair = style === 'profile' ? 'SF Pro Display + IvyOra Text' : fontPair;
    const effectiveProfile: ProfileData = { ...profileData, handle: normalizeHandle(profileData.handle) };
    try {
      let slides: {
        title: string;
        description: string;
        highlightWord: string;
        backgroundColor: string;
        imageUrl?: string;
        /** TEMPLATE 1: slots secundários que a IA escreveu (chapéu, remate…). */
        extras?: Record<string, string>;
        /** Manual/JSON nos templates de spec: o conteúdo já vem por slot. */
        slots?: Record<string, string>;
      }[];
      let jsonCarouselTitle: string | undefined;
      let jsonCaption: string | undefined;

      if (contentMode === 'ai') {
        const res = await fetch('/api/generate-carousel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            style,
            slideCount: effectiveSlideCount,
            imageType: 'background',
            generateImages: false,
            webSearch,
            language,
            fontPair: effectiveFontPair,
            accentColor,
            profileData: style === 'profile' ? effectiveProfile : undefined,
            twitterFormat: style === 'profile' ? twitterFormat : undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (handleInsufficientCredits(err)) return; // popup global avisa a recarga
          throw new Error(err.error || 'Falha na geração com IA');
        }
        const data = await res.json();
        slides = data.slides.map((s: Record<string, unknown>) => ({
          title: String(s.title || ''),
          description: String(s.description || ''),
          highlightWord: String(s.highlightWord || ''),
          backgroundColor: String(s.backgroundColor || '#111111'),
          extras:
            s.extras && typeof s.extras === 'object'
              ? Object.fromEntries(
                  Object.entries(s.extras as Record<string, unknown>).map(([k, v]) => [
                    k,
                    String(v ?? ''),
                  ])
                )
              : undefined,
        }));
      } else if (contentMode === 'json') {
        const parsed = parseCarouselJSONForStyle(jsonInput, style);
        slides = parsed.slides;
        jsonCarouselTitle = parsed.carouselTitle;
        jsonCaption = parsed.caption;
      } else {
        // Manual: os campos são os do template escolhido. Nos templates de
        // spec as chaves já são slots; nos demais, title/description/highlight.
        slides = manualSlides.map((s, i) => {
          if (isSpecTemplate(style)) {
            const slots = slotsFromFields(style, i, s);
            return {
              title: Object.values(slots).find(Boolean) ?? '',
              description: '',
              highlightWord: '',
              backgroundColor: '#111111',
              slots,
            };
          }
          return {
            title: s.title ?? '',
            description: s.description ?? '',
            highlightWord: s.highlightWord ?? '',
            backgroundColor: '#111111',
          };
        });
      }

      // O deck do TEMPLATE 1 é fechado em 6: conteúdo a mais é cortado, a menos
      // é completado com slides vazios que caem no texto padrão do spec.
      if (isFixedDeck) {
        slides = Array.from({ length: TEMPLATE_01_SLIDE_COUNT }, (_, i) =>
          slides[i] ?? { title: '', description: '', highlightWord: '', backgroundColor: '#111111' }
        );
      }

      const globalSettings = {
        ...DEFAULT_GLOBAL_SETTINGS,
        fontPair: effectiveFontPair,
        accentColor,
        // Formato escolhido no step 1. É a mesma chave que o editor lê
        // (mapDbCarouselToGlobalSettings) e que o FormatDropdown altera depois.
        format,
        theme,
        ...(style === 'profile' && profileData.name ? {
          profileBadge: {
            ...DEFAULT_GLOBAL_SETTINGS.profileBadge,
            show: true,
            name: effectiveProfile.name,
            handle: effectiveProfile.handle,
            photo: effectiveProfile.photoUrl || '',
          },
        } : {}),
      };

      const editorSlides = slides.map((sl, i) => {
        // Map AI's hardcoded background to the user's brand palette,
        // preserving the dark/light intent the AI chose for the slide.
        const aiBg = (sl.backgroundColor || '#111111').toUpperCase();
        const aiWantsLight = aiBg === '#FFFFFF';
        const slideBg = aiWantsLight ? brandLightBg : brandDarkBg;

        // TEMPLATE 1: a GERAÇÃO NÃO ESCREVE ESTILO. A forma inteira — fundo,
        // degradê, tamanho de fonte, entrelinha — é do spec, e o carrossel
        // recém-gerado tem de sair idêntico a ele qualquer que seja a paleta do
        // onboarding. Os campos de estilo do `Slide` ficam nos valores padrão e
        // `templateOverrides` nasce ausente: só a barra lateral cria override.
        if (style === 'template01') {
          return {
            id: `tmp-${i}-${Date.now()}`,
            // Deck gerado: 6 slides, um por modelo, na ordem do spec. Gravar o
            // modelo em vez de deixá-lo sair da posição é o que mantém o desenho
            // certo se o usuário reordenar ou inserir um slide depois.
            //
            // O valor sai da MESMA regra do render (TEMPLATE_01_MODELS + clamp),
            // não de um `i + 1` cru: este número agora vai para o banco, e a
            // coluna tem `check (template_model between 1 and 6)` — um valor
            // fora da faixa derrubaria o INSERT dos slides inteiro.
            templateModel: template01ModelOf(null, i),
            templateSlots: {
              // Manual/JSON já entregam os slots prontos (e zerados onde o
              // usuário não escreveu); a IA entrega título/descrição soltos.
              ...(sl.slots ?? template01SlotsFromContent(i, {
                title: sl.title,
                description: sl.description,
                imageUrl: sl.imageUrl,
                extras: sl.extras,
              })),
              ...TEMPLATE_01_DEFAULT_CORNERS,
            },
            position: i,
            title: sl.title,
            description: sl.description,
            highlightWord: sl.highlightWord,
            highlights: [],
            backgroundImageUrl: '',
            gridImageUrl: '',
            imageType: 'background' as const,
            imagePosition: { ...DEFAULT_IMAGE_POSITION },
            contentImagePosition: { ...DEFAULT_IMAGE_POSITION },
            shadow: { ...DEFAULT_SLIDE.shadow },
            backgroundColor: DEFAULT_SLIDE.backgroundColor,
            textPosition: DEFAULT_SLIDE.textPosition,
            textAlignment: DEFAULT_SLIDE.textAlignment,
            fontSize: { ...DEFAULT_SLIDE.fontSize },
            lineHeight: DEFAULT_SLIDE.lineHeight,
            ctaButton: { ...DEFAULT_SLIDE.ctaButton },
          };
        }

        // TEMPLATE 2: mesma disciplina do TEMPLATE 1 — a GERAÇÃO NÃO ESCREVE
        // ESTILO. Os campos de estilo saem nos valores de `DEFAULT_SLIDE` e
        // `templateOverrides` nasce AUSENTE, senão a paleta do onboarding viraria
        // "escolha do usuário" e pintaria por cima do creme do template.
        if (isT02) {
          const model = template02ModelAt(i);
          return {
            id: `tmp-${i}-${Date.now()}`,
            // Modelo GRAVADO, nunca inferido da posição: reordenar ou inserir um
            // slide no meio continua desenhando certo.
            templateModel: model,
            templateSlots: {
              // Ver o comentário do T1: manual/JSON já vêm por slot.
              ...(sl.slots ?? template02SlotsFromContent(model, {
                title: sl.title,
                description: sl.description,
                imageUrl: sl.imageUrl,
                extras: sl.extras,
              })),
              ...TEMPLATE_02_DEFAULT_HEADER,
            },
            position: i,
            title: sl.title,
            description: sl.description,
            highlightWord: sl.highlightWord,
            highlights: [],
            backgroundImageUrl: '',
            gridImageUrl: '',
            imageType: 'background' as const,
            imagePosition: { ...DEFAULT_IMAGE_POSITION },
            contentImagePosition: { ...DEFAULT_IMAGE_POSITION },
            shadow: { ...DEFAULT_SLIDE.shadow },
            backgroundColor: DEFAULT_SLIDE.backgroundColor,
            textPosition: DEFAULT_SLIDE.textPosition,
            textAlignment: DEFAULT_SLIDE.textAlignment,
            fontSize: { ...DEFAULT_SLIDE.fontSize },
            lineHeight: DEFAULT_SLIDE.lineHeight,
            ctaButton: { ...DEFAULT_SLIDE.ctaButton },
          };
        }

        // TEMPLATE 3 (FlowLine): mesma disciplina dos dois anteriores — a
        // GERAÇÃO NÃO ESCREVE ESTILO. Os campos de estilo saem nos valores de
        // `DEFAULT_SLIDE` e `templateOverrides` nasce AUSENTE, senão a paleta do
        // onboarding viraria "escolha do usuário" e pintaria chapado por cima
        // do degradê do Figma (armadilha #3).
        if (isT03) {
          // Deck ABERTO: posição 0 é capa, todas as outras são conteúdo. Todo conteúdo
          // grava as chaves `s2.*`, em qualquer posição — é a normalização por
          // MODELO, e é o que faz o slide 9 existir sem `s9.*` no spec.
          const model = template03ModelAt(i);
          return {
            id: `tmp-${i}-${Date.now()}`,
            // Modelo GRAVADO, nunca inferido da posição: reordenar ou inserir um
            // slide no meio continua desenhando certo.
            templateModel: model,
            templateSlots: {
              // Ver o comentário do T1: manual/JSON já vêm por slot, e já
              // zerados onde o usuário não escreveu.
              ...(sl.slots ?? template03SlotsFromContent(model, {
                title: sl.title,
                description: sl.description,
                imageUrl: sl.imageUrl,
              })),
              ...TEMPLATE_03_DEFAULT_CORNERS,
              // 🔴 O @ da barra de perfil PRECISA ser escrito aqui.
              //
              // `template03SlotsFromContent` só preenche os slots de CONTEÚDO do
              // slide; o handle é de escopo `header` e ficaria com a chave
              // AUSENTE — e chave ausente mostra o texto de fábrica do Figma
              // ("@userinstagram"), que é copy ilustrativa e não pode sobrar num
              // deck gerado (armadilha #8).
              //
              // Pré-preenchido com o @ do onboarding quando existir, como manda
              // o §1.8 do plano. Sem perfil, o mesmo marcador dos cantos — nunca
              // o texto do Figma.
              [`s${model}.handle`]:
                effectiveProfile.handle || TEMPLATE_03_DEFAULT_CORNERS['cantos.right'],
            },
            position: i,
            title: sl.title,
            description: sl.description,
            highlightWord: sl.highlightWord,
            highlights: [],
            backgroundImageUrl: '',
            gridImageUrl: '',
            imageType: 'background' as const,
            imagePosition: { ...DEFAULT_IMAGE_POSITION },
            contentImagePosition: { ...DEFAULT_IMAGE_POSITION },
            shadow: { ...DEFAULT_SLIDE.shadow },
            backgroundColor: DEFAULT_SLIDE.backgroundColor,
            textPosition: DEFAULT_SLIDE.textPosition,
            textAlignment: DEFAULT_SLIDE.textAlignment,
            fontSize: { ...DEFAULT_SLIDE.fontSize },
            lineHeight: DEFAULT_SLIDE.lineHeight,
            ctaButton: { ...DEFAULT_SLIDE.ctaButton },
          };
        }

        return ({
        id: `tmp-${i}-${Date.now()}`,
        position: i,
        title: sl.title,
        description: sl.description,
        highlightWord: sl.highlightWord,
        highlights: [],
        backgroundImageUrl: sl.imageUrl || '',
        gridImageUrl: sl.imageUrl || '',
        backgroundColor: slideBg,
        // Mesmos campos que a miniatura do passo 2 desenha.
        ...freeFormSlideFields(style, i),
        });
      });

      const openEditor = (carouselId: string | null, carouselTitle: string) => {
        loadCarousel({
          id: carouselId,
          title: carouselTitle,
          style,
          slides: editorSlides as never,
          globalSettings: globalSettings as never,
          ...(jsonCaption ? { caption: jsonCaption } : {}),
        });

        onClose();
        router.push(carouselId ? `/generator?id=${carouselId}` : '/generator');
      };

      const supabase = createClient();
      const defaultTitle = jsonCarouselTitle || slides[0]?.title || 'Novo Carrossel';

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Sessão não encontrada. Recarregue a página.');

        const { data: carousel, error: carouselError } = await supabase
          .from('carousels')
          .insert({
            user_id:       user.id,
            title:         defaultTitle,
            style,
            theme,
            font_pair:     effectiveFontPair,
            accent_color:  accentColor,
            corners:       globalSettings.corners,
            profile_badge: globalSettings.profileBadge,
            // O formato só sobrevive ao reload por aqui: mapDbCarouselToGlobalSettings
            // lê `global_settings.format` e cai em '4:5' quando a chave falta.
            global_settings: { format: globalSettings.format },
            ...(jsonCaption ? { caption: jsonCaption } : {}),
          })
          .select()
          .single();

        if (carouselError || !carousel) {
          throw new Error(carouselError?.message || 'Falha ao salvar carrossel');
        }

        const slidesPayload = slides.map((sl, i) => {
          const aiBg = (sl.backgroundColor || '#111111').toUpperCase();
          const slideBg = aiBg === '#FFFFFF' ? brandLightBg : brandDarkBg;

          // Espelha o `editorSlides` acima: no TEMPLATE 1 o banco recebe os
          // padrões, nunca a paleta da marca. Ver o comentário de lá.
          if (style === 'template01') {
            const editor = editorSlides[i] as Record<string, unknown>;
            return {
              carousel_id: carousel.id,
              position: i,
              title: sl.title,
              description: sl.description,
              highlight_word: sl.highlightWord,
              background_image_url: '',
              grid_image_url: '',
              image_type: 'background',
              image_position: DEFAULT_IMAGE_POSITION,
              content_image_position: DEFAULT_IMAGE_POSITION,
              shadow_style: DEFAULT_SLIDE.shadow.style,
              shadow_opacity: DEFAULT_SLIDE.shadow.opacity,
              text_position: DEFAULT_SLIDE.textPosition,
              text_offset: null,
              text_alignment: DEFAULT_SLIDE.textAlignment,
              subtitle: '',
              font_size: DEFAULT_SLIDE.fontSize,
              line_height: DEFAULT_SLIDE.lineHeight,
              title_description_gap: null,
              cta_button: DEFAULT_SLIDE.ctaButton,
              background_color: DEFAULT_SLIDE.backgroundColor,
              template_slots: editor.templateSlots,
              // Sem esta linha o deck reabria derivando o modelo da POSIÇÃO
              // pelo fallback de compatibilidade de `template01ModelOf`, e
              // reordenar um slide trocava o desenho dele.
              template_model: editor.templateModel,
            };
          }

          // Espelha o `editorSlides` acima. Aqui o `template_model` VAI para o
          // banco: no T2 o deck é aberto e o modelo não pode voltar a sair da
          // posição quando o carrossel for reaberto.
          if (isT02) {
            const editor = editorSlides[i] as Record<string, unknown>;
            return {
              carousel_id: carousel.id,
              position: i,
              title: sl.title,
              description: sl.description,
              highlight_word: sl.highlightWord,
              background_image_url: '',
              grid_image_url: '',
              image_type: 'background',
              image_position: DEFAULT_IMAGE_POSITION,
              content_image_position: DEFAULT_IMAGE_POSITION,
              shadow_style: DEFAULT_SLIDE.shadow.style,
              shadow_opacity: DEFAULT_SLIDE.shadow.opacity,
              text_position: DEFAULT_SLIDE.textPosition,
              text_offset: null,
              text_alignment: DEFAULT_SLIDE.textAlignment,
              subtitle: '',
              font_size: DEFAULT_SLIDE.fontSize,
              line_height: DEFAULT_SLIDE.lineHeight,
              title_description_gap: null,
              cta_button: DEFAULT_SLIDE.ctaButton,
              background_color: DEFAULT_SLIDE.backgroundColor,
              template_slots: editor.templateSlots,
              template_model: editor.templateModel,
            };
          }

          // Espelha o `editorSlides` acima.
          //
          // 🔴 `template_model` VAI para o banco. O TEMPLATE 1 não grava esta
          // linha, e é por isso que um deck dele reabre derivando o modelo da
          // POSIÇÃO — reordenar um slide troca o desenho. É bug conhecido, é
          // outra task (a 10) e depende do Rafael; aqui o que importa é NÃO
          // repetir o defeito num template que está nascendo.
          if (isT03) {
            const editor = editorSlides[i] as Record<string, unknown>;
            return {
              carousel_id: carousel.id,
              position: i,
              title: sl.title,
              description: sl.description,
              highlight_word: sl.highlightWord,
              background_image_url: '',
              grid_image_url: '',
              image_type: 'background',
              image_position: DEFAULT_IMAGE_POSITION,
              content_image_position: DEFAULT_IMAGE_POSITION,
              shadow_style: DEFAULT_SLIDE.shadow.style,
              shadow_opacity: DEFAULT_SLIDE.shadow.opacity,
              text_position: DEFAULT_SLIDE.textPosition,
              text_offset: null,
              text_alignment: DEFAULT_SLIDE.textAlignment,
              subtitle: '',
              font_size: DEFAULT_SLIDE.fontSize,
              line_height: DEFAULT_SLIDE.lineHeight,
              title_description_gap: null,
              cta_button: DEFAULT_SLIDE.ctaButton,
              background_color: DEFAULT_SLIDE.backgroundColor,
              template_slots: editor.templateSlots,
              template_model: editor.templateModel,
            };
          }

          // A linha do banco sai da MESMA função que monta o slide em memória.
          // Antes as duas listas eram escritas à mão, uma ao lado da outra, e
          // divergir era só questão de tempo: a variação de layout do Editorial
          // teria ficado só na tela e sumido no primeiro reload, porque este
          // payload nunca gravou `content_layout`.
          const gerado = freeFormSlideFields(style, i);
          return ({
          carousel_id: carousel.id,
          position: i,
          title: sl.title,
          description: sl.description,
          highlight_word: sl.highlightWord,
          background_image_url: sl.imageUrl || '',
          grid_image_url: sl.imageUrl || '',
          image_type: gerado.imageType,
          image_position: gerado.imagePosition,
          shadow_style: gerado.shadow.style,
          shadow_opacity: gerado.shadow.opacity,
          content_layout: gerado.contentLayout ?? null,
          text_position: gerado.textPosition,
          text_offset: null,
          text_alignment: gerado.textAlignment,
          subtitle: '',
          font_size: gerado.fontSize,
          line_height: gerado.lineHeight,
          title_description_gap: gerado.titleDescriptionGap ?? null,
          cta_button: gerado.ctaButton,
          background_color: slideBg,
          });
        });

        const { error: slidesError } = await supabase.from('slides').insert(slidesPayload);
        if (slidesError) {
          // Não deixa um carrossel órfão (sem slides) para trás no banco.
          await supabase.from('carousels').delete().eq('id', carousel.id);
          throw new Error(slidesError.message || 'Falha ao salvar slides');
        }

        const sourceEvent = contentMode === 'ai'
          ? 'carousel_generated_with_ai'
          : contentMode === 'json' ? 'carousel_imported_json' : 'carousel_created_manually';
        trackProductEvent('carousel_created', { source: contentMode, style, slide_count: slides.length });
        // A rota de geração já registra o sucesso de IA. Manual/JSON nascem
        // inteiramente no navegador e precisam do evento específico aqui.
        if (contentMode !== 'ai') trackProductEvent(sourceEvent, { style, slide_count: slides.length });

        openEditor(carousel.id, carousel.title);
      } catch (persistErr) {
        console.error('[create-wizard] falha ao persistir, abrindo editor local:', persistErr);
        openEditor(null, defaultTitle);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar carrossel';
      if (msg.toLowerCase().includes('banco') || msg.toLowerCase().includes('setup') || msg.toLowerCase().includes('tabela') || msg.toLowerCase().includes('pgrst')) {
        toast.error('Banco não configurado. Abrindo setup...', { duration: 5000 });
        window.open('/setup', '_blank');
      } else {
        toast.error(msg, { duration: 5000 });
      }
    } finally {
      setLoading(false);
      if (contentMode === 'ai') useCreditsStore.getState().refresh();
    }
  };

  const content = (
    <div
      className="cw-overlay fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
    >
      {/*
        O shell mantém a geometria estável; somente o conteúdo interno rola.
      */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cw-title"
        className={cn(
          'cw-modal cw-box flex h-[min(560px,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-[18px]',
          // O grid 2×2 de templates é o único passo que precisa de largura.
          step === 2 ? 'h-[min(720px,calc(100dvh-2rem))] max-w-[600px]' : 'max-w-[440px]',
        )}
        style={{
          background: 'var(--paper)',
          border: '1.5px solid var(--ink)',
          boxShadow: 'var(--sh-2)',
        }}
      >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

        {/* Header */}
        <div className="flex shrink-0 items-center gap-3.5 px-6 pt-6 pb-4">
          <span
            className="grid place-items-center rounded-[12px] shrink-0"
            style={{ width: 40, height: 40, background: 'var(--ink)', color: 'var(--paper)' }}
            aria-hidden
          >
            <HugeiconsIcon icon={SparklesIcon} className="w-5 h-5" aria-hidden />
          </span>
          <h2 id="cw-title" className="font-display min-w-0 flex-1 text-[24px] leading-tight" style={{ color: 'var(--ink)' }}>
            {STEP_TITLES[step - 1]}
          </h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="cw-close grid place-items-center w-8 h-8 rounded-full shrink-0"
            style={{ color: 'var(--ink-dim)' }}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="w-4 h-4" aria-hidden />
          </button>
        </div>

        <ProgressBar step={step} total={totalSteps} />

        {/* O conteúdo rola dentro do popup; o overlay permanece contido na viewport. */}
        <div
          key={step}
          className={cn('min-h-0 flex-1 overflow-y-auto px-6 pb-5', stepDir === 'fwd' ? 'cw-step-fwd' : 'cw-step-back')}
        >

          {/* ── STEP 1: Formato do post ── */}
          {step === 1 && (
            <div className="flex flex-col gap-2.5">
              {FORMAT_LIST.map((f) => {
                const meta = FORMAT_META[f.id];
                const Icon = meta.icon;
                const selected = format === f.id;
                return (
                  <OptionCard
                    key={f.id}
                    selected={selected}
                    onClick={() => setFormat(f.id)}
                    className="flex items-center gap-3.5 px-4 py-3"
                  >
                    {/* Mini-retângulo na proporção real do formato. */}
                    <span className="grid w-12 shrink-0 place-items-center">
                      <span
                        className="block rounded-[4px]"
                        style={{
                          width: Math.round(42 * f.aspectRatio),
                          height: 42,
                          background: selected ? 'var(--ink)' : 'var(--paper-3)',
                          border: '1.5px solid var(--ink)',
                          transition: 'background 160ms var(--ease)',
                        }}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
                          {meta.name}
                        </span>
                        <span className="font-mono text-[10px]" style={{ color: 'var(--ink-dim)' }}>
                          {f.id} · {f.width} × {f.height}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: 'var(--ink-dim)' }}>
                        {meta.desc}
                      </span>
                    </span>
                    <HugeiconsIcon icon={Icon} className="w-4 h-4 shrink-0" style={{ color: 'var(--ink-muted)' }} aria-hidden />
                  </OptionCard>
                );
              })}
              <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'var(--ink-muted)' }}>
                Dá pra trocar o formato depois, no editor.
              </p>
            </div>
          )}

          {/* ── STEP 2: Template ── */}
          {step === 2 && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                {TEMPLATES.map((tpl) => (
                  <OptionCard
                    key={tpl.value}
                    selected={style === tpl.value}
                    onClick={() => {
                      setStyle(tpl.value);
                      // O deck padrão do TEMPLATE 2 é a `sequenciaPadrao` do
                      // spec (5 slides). Continua ajustável no passo seguinte.
                      if (tpl.value === 'template02') updateSlideCount(TEMPLATE_02_DEFAULT_MODELS.length);
                    }}
                    className="flex flex-col items-center gap-2 px-3 pt-3 pb-2.5"
                  >
                    <TemplateThumb style={tpl.value} format={format} />
                    <span className="w-full text-center">
                      <span className="block text-[13px] font-semibold leading-tight" style={{ color: 'var(--ink)' }}>
                        {tpl.label}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug" style={{ color: 'var(--ink-dim)' }}>
                        {tpl.short}
                      </span>
                    </span>
                  </OptionCard>
                ))}
              </div>
              <p
                className="rounded-[10px] px-3.5 py-2.5 text-[11px] leading-relaxed"
                style={{
                  color: 'var(--ink-dim)',
                  background: 'var(--paper-2)',
                  border: '1.5px solid var(--line-strong)',
                }}
              >
                {TEMPLATES.find((t) => t.value === style)?.detail}
              </p>
            </div>
          )}

          {/* ── STEP 3: Conteúdo ── */}
          {step === 3 && (
            <div className="flex flex-col gap-3">
              {/* Como criar */}
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-dim)' }}>
                  Como criar
                </span>
                <select
                  className="brand-select"
                  value={contentMode}
                  onChange={(e) => setContentMode(e.target.value as 'ai' | 'manual' | 'json')}
                >
                  {CONTENT_MODES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>

              {/* ─ Criar com IA ─ */}
              {contentMode === 'ai' && (
                <>
                  {/* Formato A/B — só o Profile tem essa bifurcação */}
                  {style === 'profile' && (
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { value: 'A' as TwitterFormat, label: 'Post único', sub: '1 slide, frase impactante' },
                        { value: 'B' as TwitterFormat, label: 'Thread', sub: 'História em vários slides' },
                      ]).map((fmt) => (
                        <OptionCard
                          key={fmt.value}
                          selected={twitterFormat === fmt.value}
                          onClick={() => {
                            setTwitterFormat(fmt.value);
                            if (fmt.value === 'A') updateSlideCount(1);
                            else if (slideCount < 2) updateSlideCount(5);
                          }}
                          className="px-3 py-2"
                        >
                          <span className="block text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>{fmt.label}</span>
                          <span className="mt-0.5 block text-[10px] leading-snug" style={{ color: 'var(--ink-dim)' }}>{fmt.sub}</span>
                        </OptionCard>
                      ))}
                    </div>
                  )}

                  <textarea
                    className="brand-textarea"
                    style={{ minHeight: 76 }}
                    placeholder="Sobre o que é o conteúdo?"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    autoFocus
                  />

                  {/* Busca de notícias recentes — o mesmo toggle de sempre */}
                  <button
                    type="button"
                    onClick={() => setWebSearch((v) => !v)}
                    title="A IA busca fatos e notícias atuais antes de escrever"
                    aria-pressed={webSearch}
                    className="chip cw-chip self-start"
                    style={webSearch
                      ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' }
                      : undefined}
                  >
                    <HugeiconsIcon icon={Globe02Icon} className="w-3.5 h-3.5 shrink-0" aria-hidden />
                    Web search
                  </button>

                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-dim)' }}>
                      Idioma
                    </span>
                    <select
                      className="brand-select"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as ContentLanguage)}
                    >
                      {CONTENT_LANGUAGES.map((l) => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>
                  </label>

                  {/* Nº de slides. O TEMPLATE 1 é deck fechado; o post único é 1. */}
                  {isFixedDeck ? (
                    <p className="text-[11px]" style={{ color: 'var(--ink-dim)' }}>
                      Deck fixo de {TEMPLATE_01_SLIDE_COUNT} slides.
                    </p>
                  ) : style === 'profile' && twitterFormat === 'A' ? null : (
                    <div>
                      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-dim)' }}>
                        Slides · <span style={{ color: 'var(--ink)' }}>{slideCount}</span>
                      </span>
                      <div className="grid grid-cols-10 gap-1" role="group" aria-label="Número de slides">
                        {SLIDE_COUNT_OPTIONS.map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => updateSlideCount(n)}
                            aria-pressed={slideCount === n}
                            className="cw-pill rounded-[6px] text-[10px] font-semibold"
                            style={{
                              height: 24,
                              border: '1.5px solid ' + (slideCount === n ? 'var(--ink)' : 'var(--line-strong)'),
                              background: slideCount === n ? 'var(--ink)' : 'var(--paper)',
                              color: slideCount === n ? 'var(--paper)' : 'var(--ink-dim)',
                            }}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ─ Manualmente ─ (um slide por vez: o modal não rola) */}
              {contentMode === 'manual' && (
                <>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setManualIndex((i) => Math.max(0, i - 1))}
                      disabled={manualIndex === 0}
                      aria-label="Slide anterior"
                      className="brand-btn outline icon sm"
                    >
                      <HugeiconsIcon icon={ArrowLeft01Icon} className="w-3.5 h-3.5" aria-hidden />
                    </button>
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-dim)' }} data-testid="manual-pager">
                      Slide {manualIndex + 1} de {manualSlides.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setManualIndex((i) => Math.min(manualSlides.length - 1, i + 1))}
                      disabled={manualIndex >= manualSlides.length - 1}
                      aria-label="Próximo slide"
                      className="brand-btn outline icon sm"
                    >
                      <HugeiconsIcon icon={ArrowRight01Icon} className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    {manualFields.map((f) => (
                      <label key={f.key} className="block">
                        <span className="mb-1 flex items-baseline justify-between gap-2">
                          <span className="text-[11px] font-semibold" style={{ color: 'var(--ink)' }}>{f.label}</span>
                          {f.hint && <span className="font-mono text-[9px]" style={{ color: 'var(--ink-muted)' }}>{f.hint}</span>}
                        </span>
                        {f.multiline ? (
                          <textarea
                            className="brand-textarea"
                            style={{ minHeight: 52, fontSize: 12, padding: '7px 10px' }}
                            placeholder={f.placeholder}
                            value={manualSlides[manualIndex]?.[f.key] ?? ''}
                            onChange={(e) => updateManualSlide(manualIndex, f.key, e.target.value)}
                          />
                        ) : (
                          <input
                            className="brand-input"
                            style={{ fontSize: 12, padding: '7px 10px' }}
                            placeholder={f.placeholder}
                            value={manualSlides[manualIndex]?.[f.key] ?? ''}
                            onChange={(e) => updateManualSlide(manualIndex, f.key, e.target.value)}
                          />
                        )}
                      </label>
                    ))}
                  </div>

                  {/* Deck fechado: o paginador já mostra "de 6", sem precisar de nota. */}
                  {!isFixedDeck && (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={addManualSlide} className="brand-btn outline sm flex-1">
                        <HugeiconsIcon icon={Add01Icon} className="w-3.5 h-3.5" aria-hidden /> Adicionar slide
                      </button>
                      {manualSlides.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeManualSlide(manualIndex)}
                          aria-label="Remover este slide"
                          className="brand-btn outline icon sm"
                        >
                          <HugeiconsIcon icon={Delete02Icon} className="w-3.5 h-3.5" aria-hidden />
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ─ Importar JSON ─ */}
              {contentMode === 'json' && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px]" style={{ color: 'var(--ink-dim)' }}>
                      Estrutura do{' '}
                      <strong style={{ color: 'var(--ink)' }}>
                        {TEMPLATES.find((t) => t.value === style)?.label}
                      </strong>
                    </span>
                    <button onClick={() => jsonFileRef.current?.click()} className="brand-btn outline sm">
                      <HugeiconsIcon icon={Upload01Icon} className="w-3.5 h-3.5" aria-hidden /> Upload .json
                    </button>
                    <input
                      ref={jsonFileRef}
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setJsonInput(String(ev.target?.result || ''));
                          setJsonError(null);
                        };
                        reader.readAsText(f);
                      }}
                    />
                  </div>

                  <textarea
                    className="brand-textarea font-mono"
                    style={{ minHeight: 168, fontSize: 10.5, lineHeight: 1.55 }}
                    placeholder={templateJsonExample(style)}
                    value={jsonInput}
                    onChange={(e) => { setJsonInput(e.target.value); setJsonError(null); }}
                    spellCheck={false}
                  />

                  {jsonError && (
                    <p className="text-[11px] leading-snug" role="alert" style={{ color: 'var(--danger)' }}>
                      {jsonError}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── STEP 4: Identidade visual ──
              Só existe nos estilos de forma livre. O TEMPLATE 1 e o TEMPLATE 2
              não chegam aqui: `stepCountFor` encerra o wizard no conteúdo. */}
          {step === 4 && style === 'profile' && (
            <div className="flex flex-col gap-3">
              {/* O Profile não usa a paleta do onboarding: o cartão é claro ou
                  escuro, como na própria rede (ProfileSlide lê globalSettings.theme). */}
              <div>
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-dim)' }}>
                  Tema
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: 'dark' as const, label: 'Escuro' },
                    { value: 'light' as const, label: 'Claro' },
                  ]).map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTheme(t.value)}
                      aria-pressed={theme === t.value}
                      className="cw-pill rounded-[6px] py-2 text-[12px] font-semibold"
                      style={{
                        border: '1.5px solid ' + (theme === t.value ? 'var(--ink)' : 'var(--line-strong)'),
                        background: theme === t.value ? 'var(--ink)' : 'var(--paper)',
                        color: theme === t.value ? 'var(--paper)' : 'var(--ink-dim)',
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => profilePhotoRef.current?.click()}
                    aria-label="Upload foto"
                    className="cw-pill grid shrink-0 place-items-center overflow-hidden rounded-full"
                    style={{ width: 38, height: 38, border: '1.5px solid var(--ink)', background: 'var(--paper-3)' }}
                  >
                    {profileData.photoUrl
                      ? <img src={profileData.photoUrl} alt="" className="h-full w-full object-cover" />
                      : <span className="text-[9px]" style={{ color: 'var(--ink-muted)' }}>foto</span>}
                  </button>
                  <input
                    className="brand-input"
                    style={{ fontSize: 12, padding: '7px 10px' }}
                    placeholder="Nome de exibição"
                    value={profileData.name}
                    onChange={(e) => setProfileData((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <input
                  className="brand-input"
                  style={{ fontSize: 12, padding: '7px 10px' }}
                  placeholder="@handle"
                  value={profileData.handle}
                  onChange={(e) => setProfileData((p) => ({ ...p, handle: e.target.value }))}
                />
                <input ref={profilePhotoRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const toastId = toast.loading('Enviando foto…');
                  try {
                    const url = await uploadImageFile(f, 'profile-photos');
                    setProfileData((p) => ({ ...p, photoUrl: url }));
                    toast.success('Foto adicionada', { id: toastId });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Falha no upload', { id: toastId });
                  }
                }} />
              </div>
            </div>
          )}

          {step === 4 && style !== 'profile' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <OptionCard
                  selected={usingBrand}
                  onClick={() => setVisualMode('brand')}
                  disabled={!hasBrandIdentity}
                  className="flex items-center gap-3 px-3.5 py-2.5"
                >
                  <span className="flex shrink-0 gap-1">
                    {brandPalette.slice(0, 3).map((c, i) => (
                      <span
                        key={i}
                        className="block rounded-[4px]"
                        style={{ width: 22, height: 22, background: c, border: '1.5px solid var(--ink)' }}
                      />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
                      Minha identidade visual
                    </span>
                    {!hasBrandIdentity && (
                      <span className="mt-0.5 block text-[10px] leading-snug" style={{ color: 'var(--ink-dim)' }}>
                        Você ainda não preencheu a marca no onboarding
                      </span>
                    )}
                  </span>
                </OptionCard>

                <OptionCard
                  selected={!usingBrand}
                  onClick={() => setVisualMode('manual')}
                  className="px-3.5 py-2.5"
                >
                  <span className="block text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
                    Definir manualmente
                  </span>
                </OptionCard>
              </div>

              {!usingBrand && (
                <div
                  className="flex flex-col gap-3 rounded-[10px] p-3.5"
                  style={{ background: 'var(--paper-2)', border: '1.5px solid var(--line-strong)' }}
                >
                  <label className="flex items-center gap-3">
                    <input
                      type="color"
                      aria-label="Cor de fundo"
                      value={customBg}
                      onChange={(e) => setCustomBg(e.target.value)}
                      className="cw-pill shrink-0 rounded-[6px]"
                      style={{ width: 40, height: 30, border: '1.5px solid var(--ink)', background: 'transparent' }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold" style={{ color: 'var(--ink)' }}>Fundo</span>
                      <span className="block font-mono text-[9px] uppercase" style={{ color: 'var(--ink-muted)' }}>{customBg}</span>
                    </span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input
                      type="color"
                      aria-label="Cor de destaque"
                      value={customAccent}
                      onChange={(e) => setCustomAccent(e.target.value)}
                      className="cw-pill shrink-0 rounded-[6px]"
                      style={{ width: 40, height: 30, border: '1.5px solid var(--ink)', background: 'transparent' }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold" style={{ color: 'var(--ink)' }}>Destaque</span>
                      <span className="block font-mono text-[9px] uppercase" style={{ color: 'var(--ink-muted)' }}>{customAccent}</span>
                    </span>
                  </label>

                  <div>
                    <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-dim)' }}>
                      Tipografia
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {FONT_PAIRS.map((fp) => (
                        <button
                          key={fp.label}
                          type="button"
                          onClick={() => setFontPair(fp.label)}
                          aria-pressed={fontPair === fp.label}
                          className="cw-pill rounded-[6px] px-2 py-1.5 text-left"
                          style={{
                            border: '1.5px solid ' + (fontPair === fp.label ? 'var(--ink)' : 'var(--line-strong)'),
                            background: fontPair === fp.label ? 'var(--paper-3)' : 'var(--paper)',
                          }}
                        >
                          <span className="block text-[9.5px] leading-tight" style={{ color: 'var(--ink)' }}>{fp.sub}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-3 px-6 pb-6">
          {step > 1 && (
            <button onClick={() => goTo(step - 1)} className="brand-btn outline pill sm">
              <HugeiconsIcon icon={ArrowLeft01Icon} className="w-3.5 h-3.5" aria-hidden />
              Voltar
            </button>
          )}
          <Button
            onClick={handleNext}
            loading={loading}
            disabled={!canAdvance}
            pill
            className="ml-auto gap-2"
          >
            {step === totalSteps ? (
              loading ? 'Criando...' : (
                <>
                  <HugeiconsIcon icon={SparklesIcon} className="w-4 h-4" aria-hidden />
                  Gerar
                </>
              )
            ) : (
              <>
                Continuar
                <HugeiconsIcon icon={ArrowRight01Icon} className="w-4 h-4" aria-hidden />
              </>
            )}
          </Button>
        </div>
      </div>
      </div>
    </div>
  );

  if (typeof window === 'undefined') return null;
  return createPortal(content, document.body);
}
