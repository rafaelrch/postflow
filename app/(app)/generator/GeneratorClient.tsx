'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarPlus, CloudCheck, CloudOff, Loader2, Save, Sparkles } from 'lucide-react';
import EditorSidebar from '@/components/editor/EditorSidebar';
import SlideCanvas from '@/components/editor/SlideCanvas';
import HiddenSlides from '@/components/editor/HiddenSlides';
import CreateWizard from '@/components/editor/CreateWizard';
import CaptionModal from '@/components/editor/CaptionModal';
import ScheduleModal from '@/components/editor/ScheduleModal';
import { useEditorStore } from '@/hooks/useEditorStore';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useExport } from '@/hooks/useExport';
import { createClient } from '@/lib/supabase';
import { Slide, GlobalSettings, SlideStyle, ImageType, DEFAULT_GLOBAL_SETTINGS } from '@/types';
import toast from 'react-hot-toast';

export default function GeneratorClient() {
  const searchParams = useSearchParams();
  const carouselIdParam = searchParams.get('id');

  const {
    slides, activeSlideIndex, saveStatus,
    setActiveSlideIndex, addSlide, removeSlide,
    loadCarousel,
  } = useEditorStore();

  const [showWizard, setShowWizard] = useState(false);
  const [showCaptionModal, setShowCaptionModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  const { saveNow } = useAutoSave();
  const { registerSlideRef, downloadSlide, downloadAll } = useExport();

  // ── Load carousel from URL param ──────────────────────────────────────────
  useEffect(() => {
    if (!carouselIdParam) return;
    const load = async () => {
      const supabase = createClient();
      const { data: carousel } = await supabase
        .from('carousels')
        .select('*, slides(*)')
        .eq('id', carouselIdParam)
        .single();

      if (!carousel) { toast.error('Carrossel não encontrado'); return; }

      const sortedSlides: Slide[] = (carousel.slides || [])
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          (a.position as number) - (b.position as number)
        )
        .map((sl: Record<string, unknown>) => ({
          id: sl.id as string,
          position: sl.position as number,
          title: sl.title as string,
          description: (sl.description as string) || '',
          highlightWord: (sl.highlight_word as string) || '',
          backgroundImageUrl: (sl.background_image_url as string) || '',
          gridImageUrl: (sl.grid_image_url as string) || '',
          imageType: sl.image_type as ImageType,
          imagePosition: (sl.image_position as { x: number; y: number; zoom: number }) || { x: 50, y: 50, zoom: 175 },
          shadow: {
            style: (sl.shadow_style as string) || 'base',
            opacity: (sl.shadow_opacity as number) ?? 88,
          },
          backgroundColor: (sl.background_color as string) || '#111111',
          textPosition: (sl.text_position as string) || 'bottom-left',
          textOffset: (sl.text_offset as { x: number; y: number }) || undefined,
          textAlignment: (sl.text_alignment as 'left' | 'center' | 'right') || 'left',
          subtitle: (sl.subtitle as string) || '',
          fontSize: (sl.font_size as { title: number; description: number }) || { title: 48, description: 18 },
          lineHeight: (sl.line_height as number) || 1.2,
          ctaButton: (sl.cta_button as Record<string, unknown>) || {
            show: false,
            text: 'Comenta FLUXO',
            fontSize: 16,
            borderRadius: 12,
            style: 'solid',
            position: 'bottom-center',
          },
        }));

      const globalSettings: GlobalSettings = {
        theme:        (carousel.theme        as GlobalSettings['theme'])    || 'dark',
        fontPair:     (carousel.font_pair    as GlobalSettings['fontPair']) || 'SF Pro Display + IvyOra Text',
        accentColor:  (carousel.accent_color as string)                     || '#00CFFF',
        corners:      (carousel.corners      as GlobalSettings['corners'])  || DEFAULT_GLOBAL_SETTINGS.corners,
        profileBadge: (carousel.profile_badge as GlobalSettings['profileBadge']) || DEFAULT_GLOBAL_SETTINGS.profileBadge,
      };

      loadCarousel({
        id:             carousel.id,
        title:          carousel.title,
        style:          carousel.style as SlideStyle,
        slides:         sortedSlides,
        globalSettings,
        caption:        (carousel.caption   as string)   || '',
        hashtags:       (carousel.hashtags  as string[]) || [],
      });
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carouselIdParam]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        useEditorStore.getState().undo();
      }
      if (e.key === 'ArrowLeft') setActiveSlideIndex(Math.max(0, activeSlideIndex - 1));
      if (e.key === 'ArrowRight') setActiveSlideIndex(Math.min(slides.length - 1, activeSlideIndex + 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeSlideIndex, slides.length, setActiveSlideIndex]);

  // ── Manual save ───────────────────────────────────────────────────────────
  const handleManualSave = async () => {
    await saveNow();
    toast.success('Carrossel salvo!');
  };

  // ── Save indicator ────────────────────────────────────────────────────────
  const SaveIndicator = () => (
    <div className="flex items-center gap-2">
      {saveStatus === 'saving' && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md">
          <Loader2 className="w-3 h-3 text-gray-900/30 dark:text-white/30 animate-spin" />
          <span className="text-[10px] text-gray-900/30 dark:text-white/30">Salvando...</span>
        </div>
      )}
      {saveStatus === 'saved' && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md">
          <CloudCheck className="w-3 h-3 text-green-500/70" />
          <span className="text-[10px] text-gray-900/30 dark:text-white/30">Salvo</span>
        </div>
      )}
      {saveStatus === 'unsaved' && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md">
          <CloudOff className="w-3 h-3 text-yellow-500/60" />
          <span className="text-[10px] text-yellow-500/60">Não salvo</span>
        </div>
      )}

      {/* Manual save button */}
      <button
        onClick={handleManualSave}
        disabled={saveStatus === 'saving'}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 text-[10px] text-gray-900/60 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-40"
        title="Salvar agora (Ctrl+S)"
      >
        <Save className="w-3 h-3" />
        Salvar
      </button>

      {/* Schedule button */}
      <button
        onClick={() => setShowScheduleModal(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black text-[13px] font-bold hover:bg-gray-900/90 dark:hover:bg-white/90 transition-colors shadow-sm ring-1 ring-black/10 dark:ring-white/10"
        title="Agendar publicação na agenda"
      >
        <CalendarPlus className="w-4 h-4" />
        Agendar
      </button>
    </div>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Editor top bar */}
      <div className="h-10 shrink-0 border-b border-black/[0.06] dark:border-white/[0.06] bg-[var(--background)] flex items-center justify-between px-4 gap-4">
        <button
          onClick={() => setShowCaptionModal(true)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium text-gray-900/50 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Gerar Legenda
        </button>
        <div className="flex-1" />
        <SaveIndicator />
      </div>

      <div className="flex-1 flex overflow-hidden">
        <EditorSidebar
          onOpenWizard={() => setShowWizard(true)}
          onDownloadSlide={() => downloadSlide()}
          onDownloadAll={downloadAll}
          onRefreshSlide={() => {
            const store = useEditorStore.getState();
            store.updateActiveSlide({ lineHeight: store.slides[store.activeSlideIndex].lineHeight });
          }}
        />

        <SlideCanvas />
      </div>

      {/* Hidden slides for html2canvas export */}
      <HiddenSlides registerRef={registerSlideRef} />

      {showWizard && <CreateWizard onClose={() => setShowWizard(false)} />}
      {showCaptionModal && <CaptionModal onClose={() => setShowCaptionModal(false)} />}
      {showScheduleModal && (
        <ScheduleModal
          onClose={() => setShowScheduleModal(false)}
          onSaveFirst={saveNow}
        />
      )}
    </div>
  );
}
