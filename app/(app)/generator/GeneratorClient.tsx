'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
import GeneratorLoading from '@/components/editor/GeneratorLoading';

export default function GeneratorClient() {
  const searchParams = useSearchParams();
  const carouselIdParam = searchParams.get('id');

  const {
    slides, activeSlideIndex, saveStatus,
    setActiveSlideIndex, loadCarousel,
  } = useEditorStore();

  const [showWizard, setShowWizard] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [loadedCarouselId, setLoadedCarouselId] = useState<string | null>(null);
  const [failedCarouselId, setFailedCarouselId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');

  // Derivado do id da URL: se o usuário trocar de carrossel sem desmontar a
  // rota, o loading entra já no primeiro render — não há um frame do deck velho.
  const loadState = !carouselIdParam || loadedCarouselId === carouselIdParam
    ? 'ready'
    : failedCarouselId === carouselIdParam
      ? 'error'
      : 'loading';

  const { saveNow } = useAutoSave();
  const { registerSlideRef, downloadSlide, downloadAll } = useExport();

  // ── Load carousel from URL param ──────────────────────────────────────────
  useEffect(() => {
    if (!carouselIdParam) return;

    let cancelled = false;
    setFailedCarouselId(null);
    setLoadError('');

    const load = async () => {
      const supabase = createClient();
      const { data: carousel, error } = await supabase
        .from('carousels')
        .select('*, slides(*)')
        .eq('id', carouselIdParam)
        .single();

      if (cancelled) return;
      if (error || !carousel) {
        setLoadError('Carrossel não encontrado.');
        setFailedCarouselId(carouselIdParam);
        toast.error('Carrossel não encontrado');
        return;
      }

      const sortedSlides: Slide[] = [...(carousel.slides || [])]
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          (a.position as number) - (b.position as number)
        )
        .map((sl: Record<string, unknown>) => mapDbSlideToSlide(sl));

      if (sortedSlides.length === 0) {
        setLoadError('Este carrossel não possui slides salvos.');
        setFailedCarouselId(carouselIdParam);
        toast.error('Este carrossel não possui slides');
        return;
      }

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
      setLoadedCarouselId(carouselIdParam);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [carouselIdParam, loadCarousel]);

  // ── Auto-save: 2,5s após a última edição, salva sozinho ──────────────────
  useEffect(() => {
    if (loadState !== 'ready') return;
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
  }, [loadState, saveNow]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    if (loadState !== 'ready') return;
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
  }, [activeSlideIndex, loadState, saveNow, slides.length, setActiveSlideIndex]);

  // ── Manual save ───────────────────────────────────────────────────────────
  const handleManualSave = async () => {
    await saveNow();
    toast.success('Carrossel salvo!');
  };

  if (loadState === 'loading') return <GeneratorLoading />;

  if (loadState === 'error') {
    return (
      <div className="h-full flex items-center justify-center p-8" style={{ background: 'var(--paper)' }}>
        <div className="brand-card max-w-md w-full p-8 text-center">
          <h1 className="font-display text-2xl" style={{ color: 'var(--ink)' }}>
            Não foi possível abrir
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-dim)' }}>{loadError}</p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--ink)', color: 'var(--paper)' }}
          >
            Voltar aos carrosséis
          </Link>
        </div>
      </div>
    );
  }

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
