'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  X, ChevronRight, Sparkles, Image as ImageIcon,
  Upload, Clipboard, Plus, Trash2, FileJson,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { SlideStyle, ImageType, FontPair, TwitterFormat, DEFAULT_GLOBAL_SETTINGS, ProfileData } from '@/types';
import { createClient } from '@/lib/supabase';
import { useEditorStore } from '@/hooks/useEditorStore';
import toast from 'react-hot-toast';

interface CreateWizardProps {
  onClose: () => void;
}

// Slide de copy manual
interface ManualSlide {
  title: string;
  description: string;
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

function makeDefaultManualSlides(count: number): ManualSlide[] {
  return Array.from({ length: count }, (_, i) => ({
    title: i === 0 ? 'Título de abertura' : i === count - 1 ? 'Me segue pra mais!' : `Slide ${i + 1}`,
    description: '',
  }));
}

interface ParsedJSONSlide {
  title: string;
  description: string;
  highlightWord: string;
  backgroundColor: string;
  imageUrl: string;
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

export default function CreateWizard({ onClose }: CreateWizardProps) {
  const router = useRouter();
  const { loadCarousel } = useEditorStore();

  const [step, setStep] = useState(1);
  const [style, setStyle] = useState<SlideStyle>('minimalist');
  const [contentMode, setContentMode] = useState<'ai' | 'manual' | 'json'>('ai');
  const [prompt, setPrompt] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [slideCount, setSlideCount] = useState(6);
  const [imageType, setImageType] = useState<ImageType>('mixed');
  const [twitterFormat, setTwitterFormat] = useState<TwitterFormat>('B');
  const [fontPair, setFontPair] = useState<FontPair>('SF Pro Display + IvyOra Text');
  // Brand palette loaded from profile: [dark, paper/light, accent]
  const DEFAULT_BRAND_PALETTE = ['#0A0A0A', '#FAFAF7', '#00CFFF'];
  const [brandPalette, setBrandPalette] = useState<string[]>(DEFAULT_BRAND_PALETTE);
  const accentColor = brandPalette[2] || '#00CFFF';
  const brandDarkBg = brandPalette[0] || '#0A0A0A';
  const brandLightBg = brandPalette[1] || '#FFFFFF';

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('brand_palette')
        .eq('id', user.id)
        .single();
      if (data?.brand_palette && Array.isArray(data.brand_palette) && data.brand_palette.length >= 3) {
        setBrandPalette(data.brand_palette);
      }
    };
    load();
  }, []);
  const [profileData, setProfileData] = useState<ProfileData>({
    handle: '',
    name: '',
    photoUrl: '',
    followers: '',
  });
  // Manual slides
  const [manualSlides, setManualSlides] = useState<ManualSlide[]>(makeDefaultManualSlides(6));
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

  const updateManualSlide = (i: number, field: 'title' | 'description', value: string) => {
    setManualSlides((prev) => prev.map((sl, idx) => idx === i ? { ...sl, [field]: value } : sl));
  };

  const addManualSlide = () => {
    setManualSlides((prev) => [...prev, { title: `Slide ${prev.length + 1}`, description: '' }]);
  };

  const removeManualSlide = (i: number) => {
    if (manualSlides.length <= 1) return;
    setManualSlides((prev) => prev.filter((_, idx) => idx !== i));
  };

  const totalSteps = style === 'profile' ? 4 : 3;

  const handleNext = () => {
    if (step === 2) {
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
          parseCarouselJSON(jsonInput);
          setJsonError(null);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'JSON inválido';
          setJsonError(msg);
          toast.error(msg);
          return;
        }
      }
    }
    if (step < totalSteps) setStep(step + 1);
    else handleGenerate();
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      let slides: { title: string; description: string; highlightWord: string; backgroundColor: string; imageUrl?: string }[];
      let jsonCarouselTitle: string | undefined;
      let jsonCaption: string | undefined;

      if (contentMode === 'ai') {
        const res = await fetch('/api/generate-carousel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            style,
            slideCount,
            imageType,
            generateImages: false,
            fontPair,
            accentColor,
            profileData: style === 'profile' ? profileData : undefined,
            twitterFormat: style === 'profile' ? twitterFormat : undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Falha na geração com IA');
        }
        const data = await res.json();
        slides = data.slides.map((s: Record<string, unknown>) => ({
          title: String(s.title || ''),
          description: String(s.description || ''),
          highlightWord: String(s.highlightWord || ''),
          backgroundColor: String(s.backgroundColor || '#111111'),
        }));
      } else if (contentMode === 'json') {
        const parsed = parseCarouselJSON(jsonInput);
        slides = parsed.slides;
        jsonCarouselTitle = parsed.carouselTitle;
        jsonCaption = parsed.caption;
      } else {
        slides = manualSlides.map((s) => ({
          title: s.title,
          description: s.description,
          highlightWord: '',
          backgroundColor: '#111111',
        }));
      }

      const globalSettings = {
        ...DEFAULT_GLOBAL_SETTINGS,
        fontPair,
        accentColor,
        theme: 'dark' as const,
        ...(style === 'profile' && profileData.name ? {
          profileBadge: {
            ...DEFAULT_GLOBAL_SETTINGS.profileBadge,
            show: true,
            name: profileData.name,
            handle: profileData.handle,
            photo: profileData.photoUrl || '',
          },
        } : {}),
      };

      const editorSlides = slides.map((sl, i) => {
        // Map AI's hardcoded background to the user's brand palette,
        // preserving the dark/light intent the AI chose for the slide.
        const aiBg = (sl.backgroundColor || '#111111').toUpperCase();
        const aiWantsLight = aiBg === '#FFFFFF';
        const slideBg = aiWantsLight ? brandLightBg : brandDarkBg;
        return ({
        id: `tmp-${i}-${Date.now()}`,
        position: i,
        title: sl.title,
        description: sl.description,
        highlightWord: sl.highlightWord,
        highlights: [],
        backgroundImageUrl: sl.imageUrl || '',
        gridImageUrl: sl.imageUrl || '',
        imageType,
        imagePosition: { x: 50, y: 50, zoom: 175 },
        shadow: { style: 'base', opacity: 88 },
        backgroundColor: slideBg,
        textPosition: (i === 0 ? 'bottom-center' : 'bottom-left') as 'bottom-center' | 'bottom-left',
        textAlignment: (i === 0 ? 'center' : 'left') as 'center' | 'left',
        fontSize: style === 'profile'
          ? { title: 32, description: 26 }
          : { title: i === 0 ? 90 : 70, description: 36 },
        lineHeight: 1.2,
        ctaButton: { show: false, text: 'Comenta FLUXO', fontSize: 16, borderRadius: 12, style: 'solid' as const, position: 'bottom-center' as const },
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
            theme:         'dark',
            font_pair:     fontPair,
            accent_color:  accentColor,
            corners:       globalSettings.corners,
            profile_badge: globalSettings.profileBadge,
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
          return ({
          carousel_id: carousel.id,
          position: i,
          title: sl.title,
          description: sl.description,
          highlight_word: sl.highlightWord,
          background_image_url: sl.imageUrl || null,
          grid_image_url: sl.imageUrl || null,
          image_type: imageType,
          image_position: { x: 50, y: 50, zoom: 175 },
          shadow_style: 'base',
          shadow_opacity: 88,
          text_position: i === 0 ? 'bottom-center' : 'bottom-left',
          text_offset: null,
          text_alignment: i === 0 ? 'center' : 'left',
          subtitle: '',
          font_size: style === 'profile'
            ? { title: 32, description: 26 }
            : { title: i === 0 ? 90 : 70, description: 36 },
          line_height: 1.2,
          cta_button: { show: false, text: 'Comenta FLUXO', fontSize: 16, borderRadius: 12, style: 'solid', position: 'bottom-center' },
          background_color: slideBg,
          });
        });

        const { error: slidesError } = await supabase.from('slides').insert(slidesPayload);
        if (slidesError) {
          throw new Error(slidesError.message || 'Falha ao salvar slides');
        }

        openEditor(carousel.id, carousel.title);
      } catch {
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
    }
  };

  const stepLabel = ['Estilo', 'Conteúdo', 'Visual', ...(style === 'profile' ? ['Perfil'] : [])];

  const content = (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-[var(--surface)] border border-black/10 dark:border-white/10 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/8 dark:border-white/8">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Criar carrossel</h2>
          <button onClick={onClose} className="text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 py-4">
          {stepLabel.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={cn('flex items-center gap-1.5', i + 1 === step ? 'text-gray-900 dark:text-white' : i + 1 < step ? 'text-gray-900/60 dark:text-white/60' : 'text-gray-900/20 dark:text-white/20')}>
                <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold', i + 1 === step ? 'bg-gray-900 dark:bg-white text-white dark:text-black' : i + 1 < step ? 'bg-black/20 dark:bg-white/20 text-gray-900 dark:text-white' : 'bg-black/5 dark:bg-white/5 text-gray-900/30 dark:text-white/30')}>
                  {i + 1 < step ? '✓' : i + 1}
                </div>
                <span className="text-xs font-medium hidden sm:block">{label}</span>
              </div>
              {i < stepLabel.length - 1 && <div className={cn('w-8 h-px', i + 1 < step ? 'bg-black/30 dark:bg-white/30' : 'bg-black/10 dark:bg-white/10')} />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-7 pb-6">

          {/* ── STEP 1: Estilo ── */}
          {step === 1 && (
            <div className="flex gap-4 mt-2">
              {[
                {
                  value: 'minimalist' as SlideStyle,
                  label: 'Minimalista',
                  desc: 'Texto em destaque, overlays cinematográficos, tipografia bold',
                  icon: (
                    <div className="w-full h-44 rounded-lg bg-[#0A0A0A] border border-white/10 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-16 h-2 bg-white rounded mb-3 mx-auto" />
                        <div className="w-10 h-1.5 bg-white/30 rounded mx-auto" />
                      </div>
                    </div>
                  ),
                },
                {
                  value: 'profile' as SlideStyle,
                  label: 'Twitter / X',
                  desc: 'Estética de post no Twitter/X. Limpo, focado em texto e engajamento',
                  icon: (
                    <div className="w-full h-44 rounded-lg bg-white border border-white/10 flex items-start p-4 gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#1DA1F2] shrink-0 flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.259 5.623z"/></svg>
                      </div>
                      <div className="flex-1">
                        <div className="w-20 h-2.5 bg-gray-300 rounded mb-2" />
                        <div className="w-14 h-2 bg-gray-200 rounded" />
                        <div className="w-full h-2 bg-gray-200 rounded mt-3" />
                        <div className="w-3/4 h-2 bg-gray-200 rounded mt-1.5" />
                        <div className="w-5/6 h-2 bg-gray-200 rounded mt-1.5" />
                      </div>
                    </div>
                  ),
                },
                {
                  value: 'editorial' as SlideStyle,
                  label: 'Editorial',
                  desc: 'Layout magazine com imagem e texto combinados, barra de metadados',
                  icon: (
                    <div className="w-full h-44 rounded-lg bg-[#F5F0E8] border border-white/10 flex flex-col overflow-hidden">
                      <div className="h-7 bg-[#1a1a1a] flex items-center px-3 gap-1.5">
                        <div className="w-10 h-1.5 bg-white/40 rounded" />
                        <div className="flex-1" />
                        <div className="w-8 h-1.5 bg-white/40 rounded" />
                      </div>
                      <div className="flex flex-1 gap-2 p-2.5">
                        <div className="w-1/2 bg-[#c8b89a] rounded" />
                        <div className="flex-1 flex flex-col gap-1.5 justify-center">
                          <div className="w-full h-2 bg-[#1a1a1a]/70 rounded" />
                          <div className="w-3/4 h-2 bg-[#1a1a1a]/70 rounded" />
                          <div className="w-full h-1.5 bg-[#1a1a1a]/30 rounded mt-1" />
                          <div className="w-5/6 h-1.5 bg-[#1a1a1a]/30 rounded" />
                        </div>
                      </div>
                    </div>
                  ),
                },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setStyle(opt.value)}
                  className={cn('flex-1 rounded-xl p-5 border-2 transition-all text-left', style === opt.value ? 'border-gray-900 dark:border-white bg-black/5 dark:bg-white/5' : 'border-black/10 dark:border-white/10 hover:border-black/30 dark:hover:border-white/30')}
                >
                  {opt.icon}
                  <p className="text-gray-900 dark:text-white font-bold text-sm mt-4">{opt.label}</p>
                  <p className="text-gray-900/40 dark:text-white/40 text-xs mt-1.5 leading-relaxed">{opt.desc}</p>
                  {style === opt.value && (
                    <div className="mt-2 flex justify-end">
                      <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs">✓</div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* ── STEP 2: Conteúdo ── */}
          {step === 2 && (
            <div className="flex flex-col gap-4 mt-2">
              {/* Toggle IA / Manual / JSON */}
              <div className="flex rounded-xl border border-black/10 dark:border-white/10 overflow-hidden">
                <button
                  onClick={() => setContentMode('ai')}
                  className={cn('flex-1 py-2.5 text-sm font-medium transition-colors', contentMode === 'ai' ? 'bg-gray-900 dark:bg-white text-white dark:text-black' : 'text-gray-900/50 dark:text-white/50 hover:text-gray-900 dark:hover:text-white')}
                >
                  <Sparkles className="w-4 h-4 inline mr-1.5" />
                  Gerar com IA
                </button>
                <button
                  onClick={() => setContentMode('manual')}
                  className={cn('flex-1 py-2.5 text-sm font-medium transition-colors border-l border-black/10 dark:border-white/10', contentMode === 'manual' ? 'bg-gray-900 dark:bg-white text-white dark:text-black' : 'text-gray-900/50 dark:text-white/50 hover:text-gray-900 dark:hover:text-white')}
                >
                  Colar copy manual
                </button>
                <button
                  onClick={() => setContentMode('json')}
                  className={cn('flex-1 py-2.5 text-sm font-medium transition-colors border-l border-black/10 dark:border-white/10', contentMode === 'json' ? 'bg-gray-900 dark:bg-white text-white dark:text-black' : 'text-gray-900/50 dark:text-white/50 hover:text-gray-900 dark:hover:text-white')}
                >
                  <FileJson className="w-4 h-4 inline mr-1.5" />
                  Importar JSON
                </button>
              </div>

              {/* IA */}
              {contentMode === 'ai' && (
                <>
                  {/* Format A/B selector — only for Twitter style */}
                  {style === 'profile' && (
                    <div>
                      <p className="text-xs text-gray-900/40 dark:text-white/40 mb-2 uppercase tracking-wider">Formato</p>
                      <div className="flex gap-3">
                        {([
                          {
                            value: 'A' as TwitterFormat,
                            label: 'Formato A',
                            sub: 'Tweet único',
                            desc: 'Frase impactante. 1 slide.',
                          },
                          {
                            value: 'B' as TwitterFormat,
                            label: 'Formato B',
                            sub: 'Thread completa',
                            desc: 'História de empresa ou fundador. Múltiplos slides.',
                          },
                        ] as { value: TwitterFormat; label: string; sub: string; desc: string }[]).map((fmt) => (
                          <button
                            key={fmt.value}
                            onClick={() => {
                              setTwitterFormat(fmt.value);
                              if (fmt.value === 'A') updateSlideCount(1);
                              else if (slideCount < 2) updateSlideCount(2);
                            }}
                            className={cn(
                              'flex-1 rounded-xl p-3 border-2 text-left transition-all',
                              twitterFormat === fmt.value ? 'border-[#1DA1F2] bg-[#1DA1F2]/8' : 'border-black/10 dark:border-white/10 hover:border-black/30 dark:hover:border-white/30',
                            )}
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors shrink-0', twitterFormat === fmt.value ? 'border-[#1DA1F2]' : 'border-black/30 dark:border-white/30')}>
                                {twitterFormat === fmt.value && <div className="w-2 h-2 rounded-full bg-[#1DA1F2]" />}
                              </div>
                              <span className="text-xs font-bold text-gray-900 dark:text-white">{fmt.label}</span>
                            </div>
                            <p className="text-[11px] text-gray-900/60 dark:text-white/60 font-medium">{fmt.sub}</p>
                            <p className="text-[10px] text-gray-900/30 dark:text-white/30 mt-0.5 leading-relaxed">{fmt.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <textarea
                    className="w-full h-24 px-3 py-2.5 rounded-lg bg-[var(--surface-elevated)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm placeholder-black/30 dark:placeholder-white/30 focus:outline-none focus:border-black/30 dark:focus:border-white/30 resize-none"
                    placeholder={
                      style === 'profile' && twitterFormat === 'A'
                        ? 'Digite o tema ou insight... Ex: disciplina, competição, mentalidade de longo prazo'
                        : style === 'profile'
                        ? 'Digite o tema ou empresa... Ex: A história da Nintendo, Como o Nubank chegou a 100M'
                        : 'Descreva o conteúdo... Ex: 5 hábitos para acordar cedo e ser produtivo'
                    }
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    autoFocus
                  />
                  {/* Nº de slides — hidden for Twitter Format A */}
                  {!(style === 'profile' && twitterFormat === 'A') && (
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-gray-900/40 dark:text-white/40 shrink-0">Slides</label>
                      <input
                        type="range"
                        min={style === 'profile' ? 2 : 3}
                        max={style === 'profile' ? 15 : 10}
                        value={slideCount}
                        onChange={(e) => updateSlideCount(+e.target.value)}
                        className="flex-1"
                      />
                      <span className="text-sm text-gray-900 dark:text-white font-medium w-4 text-center">{slideCount}</span>
                    </div>
                  )}
                  {/* Tipo de imagem */}
                  <div>
                    <p className="text-xs text-gray-900/40 dark:text-white/40 mb-2">Tipo de imagem</p>
                    <div className="flex gap-4">
                      {([{ value: 'background', label: 'Fundo' }, { value: 'grid', label: 'Grade' }, { value: 'mixed', label: 'Intercalar' }] as { value: ImageType; label: string }[]).map((t) => (
                        <label key={t.value} className="flex items-center gap-2 cursor-pointer">
                          <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors', imageType === t.value ? 'border-gray-900 dark:border-white' : 'border-black/30 dark:border-white/30')}>
                            {imageType === t.value && <div className="w-2 h-2 rounded-full bg-gray-900 dark:bg-white" />}
                          </div>
                          <span className="text-xs text-gray-900/60 dark:text-white/60">{t.label}</span>
                          <input type="radio" className="hidden" checked={imageType === t.value} onChange={() => setImageType(t.value)} />
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <ImageIcon className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-300 leading-relaxed">
                      As imagens serão adicionadas por você no editor após a criação.
                    </p>
                  </div>
                </>
              )}

              {/* MANUAL — colar copy slide a slide */}
              {contentMode === 'manual' && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-gray-900/50 dark:text-white/50">Cole o título e a descrição de cada slide. Você pode editar tudo no editor depois.</p>
                  <div className="flex flex-col gap-3 max-h-[340px] overflow-y-auto pr-1">
                    {manualSlides.map((sl, i) => (
                      <div key={i} className="bg-[var(--surface-elevated)] border border-black/10 dark:border-white/10 rounded-xl p-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-gray-900/30 dark:text-white/30 uppercase tracking-wider">
                            {i === 0 ? 'Capa' : i === manualSlides.length - 1 ? 'CTA final' : `Slide ${i + 1}`}
                          </span>
                          {manualSlides.length > 1 && (
                            <button onClick={() => removeManualSlide(i)} className="text-gray-900/20 dark:text-white/20 hover:text-red-400 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <input
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm placeholder-black/20 dark:placeholder-white/20 focus:outline-none focus:border-black/30 dark:focus:border-white/30"
                          placeholder="Título (máx. 8 palavras)"
                          value={sl.title}
                          onChange={(e) => updateManualSlide(i, 'title', e.target.value)}
                        />
                        <textarea
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm placeholder-black/20 dark:placeholder-white/20 focus:outline-none focus:border-black/30 dark:focus:border-white/30 resize-none"
                          placeholder="Descrição (opcional)"
                          rows={2}
                          value={sl.description}
                          onChange={(e) => updateManualSlide(i, 'description', e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addManualSlide}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-black/10 dark:border-white/10 text-gray-900/30 dark:text-white/30 hover:text-gray-900/60 dark:hover:text-white/60 hover:border-black/30 dark:hover:border-white/30 transition-colors text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar slide
                  </button>
                </div>
              )}

              {/* JSON — importar */}
              {contentMode === 'json' && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-gray-900/50 dark:text-white/50">
                    Cole ou importe um array JSON com os slides. Campos aceitos: <code className="text-gray-900/70 dark:text-white/70">title</code>, <code className="text-gray-900/70 dark:text-white/70">description</code>, <code className="text-gray-900/70 dark:text-white/70">imageUrl</code>, <code className="text-gray-900/70 dark:text-white/70">highlightWord</code>, <code className="text-gray-900/70 dark:text-white/70">backgroundColor</code>.
                  </p>

                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          if (!text) { toast.error('Clipboard vazio'); return; }
                          setJsonInput(text);
                          setJsonError(null);
                        } catch {
                          toast.error('Não foi possível acessar o clipboard');
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-black/10 dark:border-white/10 text-gray-900/50 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:border-black/30 dark:hover:border-white/30 text-xs transition-colors"
                    >
                      <Clipboard className="w-3.5 h-3.5" /> Colar do clipboard
                    </button>
                    <button
                      onClick={() => jsonFileRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-black/10 dark:border-white/10 text-gray-900/50 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:border-black/30 dark:hover:border-white/30 text-xs transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" /> Upload .json
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
                    className="w-full h-56 px-3 py-2.5 rounded-lg bg-[var(--surface-elevated)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-xs font-mono placeholder-black/30 dark:placeholder-white/30 focus:outline-none focus:border-black/30 dark:focus:border-white/30 resize-none"
                    placeholder={`[\n  {\n    "title": "Título do slide",\n    "description": "Texto descritivo",\n    "imageUrl": "https://..."\n  }\n]`}
                    value={jsonInput}
                    onChange={(e) => { setJsonInput(e.target.value); setJsonError(null); }}
                    spellCheck={false}
                  />

                  {jsonError && (
                    <p className="text-xs text-red-400">{jsonError}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Visual ── */}
          {step === 3 && (
            <div className="flex flex-col gap-5 mt-2">
              <div>
                <p className="text-xs text-gray-900/40 dark:text-white/40 mb-3 uppercase tracking-wider">Cores da marca</p>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-black/10 dark:border-white/10">
                  <div className="flex gap-1.5 shrink-0">
                    {brandPalette.slice(0, 3).map((c, i) => (
                      <span
                        key={i}
                        className="w-7 h-7 rounded-md border border-black/10 dark:border-white/10"
                        style={{ background: c }}
                        title={['Fundo escuro', 'Fundo claro', 'Destaque'][i] + ': ' + c}
                      />
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-900/50 dark:text-white/50 leading-tight">
                      O carrossel será criado usando estas cores. Edite no <a href="/onboarding" className="underline">onboarding</a> pra alterar.
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-900/40 dark:text-white/40 mb-3 uppercase tracking-wider">Combinação de fontes</p>
                <div className="grid grid-cols-2 gap-2">
                  {FONT_PAIRS.map((fp) => (
                    <button
                      key={fp.label}
                      onClick={() => setFontPair(fp.label)}
                      className={cn('p-3 rounded-xl border-2 text-left transition-all', fontPair === fp.label ? 'border-gray-900 dark:border-white bg-black/5 dark:bg-white/5' : 'border-black/10 dark:border-white/10 hover:border-black/30 dark:hover:border-white/30')}
                      style={{
                        fontFamily: fp.label === 'SF Pro Display + IvyOra Text'
                          ? "'SF Pro Display', -apple-system, 'Helvetica Neue', sans-serif"
                          : undefined,
                      }}
                    >
                      <div className="text-lg font-bold text-gray-900 dark:text-white mb-0.5">{fp.preview}</div>
                      <div className="text-[10px] text-gray-900/50 dark:text-white/50 leading-tight">{fp.sub}</div>
                      {fp.label === 'SF Pro Display + IvyOra Text' && (
                        <div className="text-[9px] text-blue-400/70 mt-0.5">padrão</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ── STEP 4: Perfil (Twitter) ── */}
          {step === 4 && style === 'profile' && (
            <div className="flex flex-col gap-4 mt-2">
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 mb-1">
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#1DA1F2] mt-0.5 shrink-0"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.259 5.623z"/></svg>
                <p className="text-xs text-blue-300 leading-relaxed">
                  Os slides vão imitar a estética do Twitter/X com o seu perfil.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className="w-14 h-14 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center overflow-hidden border-2 border-[#1DA1F2]/40 cursor-pointer shrink-0"
                  onClick={() => profilePhotoRef.current?.click()}
                >
                  {profileData.photoUrl
                    ? <img src={profileData.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                    : <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white/20"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                  }
                </div>
                <button onClick={() => profilePhotoRef.current?.click()} className="px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-gray-900/50 dark:text-white/50 hover:text-gray-900 dark:hover:text-white text-xs transition-colors">
                  Upload foto
                </button>
                <input ref={profilePhotoRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = (ev) => setProfileData(p => ({ ...p, photoUrl: ev.target?.result as string }));
                  r.readAsDataURL(f);
                }} />
              </div>
              <input className="w-full px-3 py-2.5 rounded-lg bg-[var(--surface-elevated)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm placeholder-black/30 dark:placeholder-white/30 focus:outline-none focus:border-black/30 dark:focus:border-white/30" placeholder="Nome de exibição" value={profileData.name} onChange={(e) => setProfileData(p => ({ ...p, name: e.target.value }))} />
              <input className="w-full px-3 py-2.5 rounded-lg bg-[var(--surface-elevated)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm placeholder-black/30 dark:placeholder-white/30 focus:outline-none focus:border-black/30 dark:focus:border-white/30" placeholder="@handle" value={profileData.handle} onChange={(e) => setProfileData(p => ({ ...p, handle: e.target.value }))} />
              <input className="w-full px-3 py-2.5 rounded-lg bg-[var(--surface-elevated)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm placeholder-black/30 dark:placeholder-white/30 focus:outline-none focus:border-black/30 dark:focus:border-white/30" placeholder="Seguidores — ex: 12,5 mil" value={profileData.followers || ''} onChange={(e) => setProfileData(p => ({ ...p, followers: e.target.value }))} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-black/8 dark:border-white/8">
          <button onClick={() => step > 1 ? setStep(step - 1) : onClose()} className="text-sm text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-colors">
            {step > 1 ? '← Voltar' : 'Cancelar'}
          </button>
          <Button onClick={handleNext} loading={loading} className="gap-2">
            {step === totalSteps ? (
              loading ? 'Criando...' : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {contentMode === 'ai' ? 'Gerar com IA' : contentMode === 'json' ? 'Importar e criar' : 'Criar carrossel'}
                </>
              )
            ) : (
              <>
                Continuar
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  if (typeof window === 'undefined') return null;
  return createPortal(content, document.body);
}
