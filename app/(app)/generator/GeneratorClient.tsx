'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import EditorSidebar from '@/components/editor/EditorSidebar';
import SlideCanvas from '@/components/editor/SlideCanvas';
import HiddenSlides from '@/components/editor/HiddenSlides';
import CreateWizard from '@/components/editor/CreateWizard';
import ScheduleModal from '@/components/editor/ScheduleModal';
import { useEditorStore } from '@/hooks/useEditorStore';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useExport } from '@/hooks/useExport';
import { createClient } from '@/lib/supabase';
import { Slide, SlideStyle } from '@/types';
import { mapDbSlideToSlide, mapDbCarouselToGlobalSettings } from '@/lib/slide-mapper';
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
        .map((sl: Record<string, unknown>) => mapDbSlideToSlide(sl));

      const globalSettings = mapDbCarouselToGlobalSettings(carousel);

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

  // ── Auto-save: 2,5s após a última edição, salva sozinho ──────────────────
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useEditorStore.subscribe((state) => {
      if (state.saveStatus !== 'unsaved') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { saveNow(); }, 2500);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        useEditorStore.getState().undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveNow().then(() => toast.success('Carrossel salvo!'));
        return;
      }

      // Setas só trocam de slide fora de campos de texto (senão brigam com o cursor).
      const target = e.target as HTMLElement | null;
      const isTyping = !!target && (
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      );
      if (isTyping) return;

      if (e.key === 'ArrowLeft') setActiveSlideIndex(Math.max(0, activeSlideIndex - 1));
      if (e.key === 'ArrowRight') setActiveSlideIndex(Math.min(slides.length - 1, activeSlideIndex + 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlideIndex, slides.length, setActiveSlideIndex]);

  // ── Manual save ───────────────────────────────────────────────────────────
  const handleManualSave = async () => {
    await saveNow();
    toast.success('Carrossel salvo!');
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        <EditorSidebar
          onOpenWizard={() => setShowWizard(true)}
          onDownloadSlide={() => downloadSlide()}
          onDownloadAll={downloadAll}
        />

        <SlideCanvas
          onSave={handleManualSave}
          onSchedule={() => setShowScheduleModal(true)}
          saveStatus={saveStatus}
        />
      </div>

      {/* Hidden slides for html2canvas export */}
      <HiddenSlides registerRef={registerSlideRef} />

      {showWizard && <CreateWizard onClose={() => setShowWizard(false)} />}
      {showScheduleModal && (
        <ScheduleModal
          onClose={() => setShowScheduleModal(false)}
          onSaveFirst={saveNow}
        />
      )}
    </div>
  );
}
