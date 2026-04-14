'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit2, Copy, Trash2, Calendar, Layers } from 'lucide-react';
import Button from '@/components/ui/Button';
import CreateWizard from '@/components/editor/CreateWizard';
import { createClient } from '@/lib/supabase';
import toast from 'react-hot-toast';
import {
  Slide, GlobalSettings, ImageType, SlideStyle,
  DEFAULT_GLOBAL_SETTINGS,
} from '@/types';
import MinimalistSlide from '@/components/slides/MinimalistSlide';
import ProfileSlide from '@/components/slides/ProfileSlide';
import type { DashboardCarousel } from './page';

interface DashboardClientProps {
  initialCarousels: DashboardCarousel[];
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function mapDbSlide(sl: Record<string, unknown>): Slide {
  return {
    id: sl.id as string,
    position: sl.position as number,
    title: (sl.title as string) || '',
    description: (sl.description as string) || '',
    highlightWord: (sl.highlight_word as string) || '',
    highlights: (sl.highlights as Slide['highlights']) || [],
    backgroundImageUrl: (sl.background_image_url as string) || '',
    gridImageUrl: (sl.grid_image_url as string) || '',
    imageType: (sl.image_type as ImageType) || 'grid',
    imagePosition: (sl.image_position as Slide['imagePosition']) || { x: 50, y: 50, zoom: 175 },
    shadow: {
      style: ((sl.shadow_style as string) || 'base') as Slide['shadow']['style'],
      opacity: (sl.shadow_opacity as number) ?? 88,
    },
    backgroundColor: (sl.background_color as string) || '#111111',
    textPosition: ((sl.text_position as string) || 'bottom-left') as Slide['textPosition'],
    textOffset: (sl.text_offset as Slide['textOffset']) || undefined,
    textAlignment: ((sl.text_alignment as string) || 'left') as Slide['textAlignment'],
    subtitle: (sl.subtitle as string) || '',
    fontSize: (sl.font_size as Slide['fontSize']) || { title: 70, description: 30 },
    lineHeight: (sl.line_height as number) || 1.2,
    ctaButton: (sl.cta_button as Slide['ctaButton']) || { show: false, text: 'Comenta FLUXO', fontSize: 16, borderRadius: 12, style: 'solid', position: 'bottom-center' },
    titleColor: (sl.title_color as string) || undefined,
    descriptionColor: (sl.description_color as string) || undefined,
    subtitleColor: (sl.subtitle_color as string) || undefined,
    titleFont: (sl.title_font as Slide['titleFont']) || undefined,
    descriptionFont: (sl.description_font as Slide['descriptionFont']) || undefined,
    subtitleFont: (sl.subtitle_font as Slide['subtitleFont']) || undefined,
  };
}

function buildGlobalSettings(carousel: DashboardCarousel): GlobalSettings {
  return {
    theme: (carousel.theme as GlobalSettings['theme']) || 'dark',
    fontPair: (carousel.font_pair as GlobalSettings['fontPair']) || 'SF Pro Display + IvyOra Text',
    accentColor: carousel.accent_color || '#00CFFF',
    corners: (carousel.corners as GlobalSettings['corners']) || DEFAULT_GLOBAL_SETTINGS.corners,
    profileBadge: (carousel.profile_badge as GlobalSettings['profileBadge']) || DEFAULT_GLOBAL_SETTINGS.profileBadge,
  };
}

function SlideThumbnail({ carousel }: { carousel: DashboardCarousel }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    if (containerRef.current) {
      setScale(containerRef.current.offsetWidth / 1080);
    }
  }, []);

  if (!carousel.coverSlide) return null;

  const slide = mapDbSlide(carousel.coverSlide);
  const globalSettings = buildGlobalSettings(carousel);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      {scale > 0 && (
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 1080, height: 1350 }}>
          {(carousel.style as SlideStyle) === 'profile' ? (
            <ProfileSlide
              slide={slide}
              globalSettings={globalSettings}
              profileData={{ photo: globalSettings.profileBadge.photo || '', name: globalSettings.profileBadge.name || '', handle: globalSettings.profileBadge.handle || '' }}
              slideIndex={0}
              totalSlides={carousel.slides?.[0]?.count ?? 1}
            />
          ) : (
            <MinimalistSlide
              slide={slide}
              globalSettings={globalSettings}
              slideIndex={0}
              totalSlides={carousel.slides?.[0]?.count ?? 1}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardClient({ initialCarousels }: DashboardClientProps) {
  const router = useRouter();
  const [carousels, setCarousels] = useState(initialCarousels);
  const [showWizard, setShowWizard] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Deletar este carrossel? Esta ação não pode ser desfeita.')) return;
    setDeleting(id);
    const supabase = createClient();
    const { error } = await supabase.from('carousels').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao deletar');
    } else {
      setCarousels((prev) => prev.filter((c) => c.id !== id));
      toast.success('Carrossel deletado');
    }
    setDeleting(null);
  };

  const handleDuplicate = async (id: string) => {
    const supabase = createClient();
    const { data: carousel } = await supabase
      .from('carousels')
      .select('*, slides(*)')
      .eq('id', id)
      .single();
    if (!carousel) return;

    const { data: newCarousel, error } = await supabase
      .from('carousels')
      .insert({
        title: `${carousel.title} (cópia)`,
        style: carousel.style,
        theme: carousel.theme,
        font_pair: carousel.font_pair,
        accent_color: carousel.accent_color,
        global_settings: carousel.global_settings,
      })
      .select()
      .single();

    if (error || !newCarousel) { toast.error('Erro ao duplicar'); return; }

    if (carousel.slides?.length) {
      await supabase.from('slides').insert(
        carousel.slides.map((sl: Record<string, unknown>) => ({
          ...sl,
          id: undefined,
          carousel_id: newCarousel.id,
        }))
      );
    }

    toast.success('Carrossel duplicado');
    router.refresh();
    setCarousels((prev) => [{ ...newCarousel, slides: carousel.slides, coverSlide: null }, ...prev]);
  };

  const handleEdit = (id: string) => {
    router.push(`/generator?id=${id}`);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--background)]">
      <main className="max-w-6xl mx-auto w-full px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Meus Carrosséis</h1>
            <p className="text-gray-900/40 dark:text-white/40 text-sm mt-1">{carousels.length} carrossel{carousels.length !== 1 ? 'is' : ''}</p>
          </div>
          <Button size="lg" onClick={() => setShowWizard(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Criar novo carrossel
          </Button>
        </div>

        {carousels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center justify-center mb-4">
              <Layers className="w-8 h-8 text-gray-900/20 dark:text-white/20" />
            </div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Nenhum carrossel ainda</h2>
            <p className="text-gray-900/40 dark:text-white/40 text-sm mb-6 max-w-xs">
              Crie seu primeiro carrossel com IA e comece a crescer no Instagram.
            </p>
            <Button onClick={() => setShowWizard(true)}>
              <Plus className="w-4 h-4" />
              Criar primeiro carrossel
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* Create new card */}
            <button
              onClick={() => setShowWizard(true)}
              className="aspect-[4/5] rounded-2xl border-2 border-dashed border-black/10 dark:border-white/10 flex flex-col items-center justify-center gap-3 text-gray-900/30 dark:text-white/30 hover:text-gray-900/60 dark:hover:text-white/60 hover:border-black/20 dark:hover:border-white/20 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl border-2 border-dashed border-current flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus className="w-5 h-5" />
              </div>
              <span className="text-sm font-medium">Novo carrossel</span>
            </button>

            {carousels.map((carousel) => (
              <div
                key={carousel.id}
                className="group relative bg-[var(--surface)] border border-black/8 dark:border-white/8 rounded-2xl overflow-hidden hover:border-black/20 dark:hover:border-white/20 transition-all"
              >
                {/* Thumbnail */}
                <div
                  className="aspect-[4/5] relative cursor-pointer"
                  style={{ background: `linear-gradient(135deg, var(--surface-elevated) 0%, var(--surface) 100%)` }}
                  onClick={() => handleEdit(carousel.id)}
                >
                  {carousel.coverSlide ? (
                    <SlideThumbnail carousel={carousel} />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center p-4">
                        <div
                          className="w-2 h-2 rounded-full mx-auto mb-3"
                          style={{ background: carousel.accent_color || '#00CFFF' }}
                        />
                        <p className="text-gray-900/60 dark:text-white/60 text-xs font-medium line-clamp-3">{carousel.title}</p>
                        <p className="text-gray-900/20 dark:text-white/20 text-xs mt-2 uppercase tracking-wider">{carousel.style}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 border-t border-black/6 dark:border-white/6">
                  <p className="text-gray-900 dark:text-white text-sm font-medium line-clamp-1">{carousel.title}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-gray-900/30 dark:text-white/30 text-xs">
                      <Layers className="w-3 h-3" />
                      {carousel.slides?.[0]?.count ?? 0} slides
                    </span>
                    <span className="flex items-center gap-1 text-gray-900/30 dark:text-white/30 text-xs">
                      <Calendar className="w-3 h-3" />
                      {formatDate(carousel.updated_at)}
                    </span>
                  </div>
                </div>

                {/* Hover actions */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEdit(carousel.id)}
                    className="p-1.5 rounded-lg bg-black/60 backdrop-blur text-white/60 hover:text-white transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDuplicate(carousel.id)}
                    className="p-1.5 rounded-lg bg-black/60 backdrop-blur text-white/60 hover:text-white transition-colors"
                    title="Duplicar"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(carousel.id)}
                    disabled={deleting === carousel.id}
                    className="p-1.5 rounded-lg bg-black/60 backdrop-blur text-white/60 hover:text-red-400 transition-colors"
                    title="Deletar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showWizard && <CreateWizard onClose={() => setShowWizard(false)} />}
    </div>
  );
}
