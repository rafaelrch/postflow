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
import { loadCarouselById } from '@/lib/carousel-load';
import toast from 'react-hot-toast';
import GeneratorLoading from '@/components/editor/GeneratorLoading';

/**
 * `carousels.updated_at` vira instante. Data ilegível volta `null` — a barra de
 * status prefere mostrar "Salvo" sem hora a mostrar "Invalid Date".
 */
function parseSavedAt(raw?: string | null): number | null {
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

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
  // Separa "não existe" de "não deu para carregar agora". Só o segundo oferece
  // tentar de novo — repetir um carrossel que de fato não existe não ajuda.
  const [loadFailureIsTransient, setLoadFailureIsTransient] = useState(false);
  // Muda para refazer a carga sob comando do usuário. Não há retry automático:
  // o pedido é explícito, e um laço cego esconderia a falha em vez de mostrá-la.
  const [reloadNonce, setReloadNonce] = useState(0);

  // Derivado do id da URL: se o usuário trocar de carrossel sem desmontar a
  // rota, o loading entra já no primeiro render — não há um frame do deck velho.
  const loadState = !carouselIdParam || loadedCarouselId === carouselIdParam
    ? 'ready'
    : failedCarouselId === carouselIdParam
      ? 'error'
      : 'loading';

  // O primeiro save cria o carrossel e troca a URL para `?id=`. Marcar o id
  // como já carregado NO MESMO PASSO fecha a corrida na origem: sem isto o
  // `carouselIdParam` novo apontaria para um deck que esta página nunca leu,
  // e o efeito abaixo iria ao banco justamente antes de os slides existirem.
  const { saveNow } = useAutoSave(setLoadedCarouselId);
  const { registerSlideRef, downloadSlide, downloadAll } = useExport();

  // ── Load carousel from URL param ──────────────────────────────────────────
  useEffect(() => {
    if (!carouselIdParam) return;
    // Este deck JÁ está em memória — foi criado aqui ou lido aqui. Reler o
    // banco não traria nada e traria risco: entre o INSERT do carrossel e o
    // dos slides a leitura volta vazia (a tela de "não possui slides salvos"),
    // e mesmo depois ela sobrescreveria o que o usuário digitou desde o save.
    if (loadedCarouselId === carouselIdParam) return;

    let cancelled = false;
    setFailedCarouselId(null);
    setLoadError('');
    setLoadFailureIsTransient(false);

    const load = async () => {
      const supabase = createClient();
      // 🔴 `maybeSingle`, não `single`: com `single` a ausência de linha vira
      // erro (PGRST116) e fica indistinguível de uma falha de verdade.
      const outcome = await loadCarouselById<Record<string, unknown>>(
        supabase
          .from('carousels')
          .select('*, slides(*)')
          .eq('id', carouselIdParam)
          .maybeSingle(),
        { onError: (kind, detail) => console.error(`[generator] carga ${kind}:`, detail) },
      );

      if (cancelled) return;

      if (outcome.kind === 'unavailable') {
        // O carrossel provavelmente está lá — quem falhou foi a leitura.
        setLoadError('Não conseguimos carregar este carrossel agora. Ele não foi perdido.');
        setLoadFailureIsTransient(true);
        setFailedCarouselId(carouselIdParam);
        toast.error('Falha ao carregar. Tente de novo.');
        return;
      }

      if (outcome.kind === 'absent') {
        setLoadError('Carrossel não encontrado.');
        setLoadFailureIsTransient(false);
        setFailedCarouselId(carouselIdParam);
        toast.error('Carrossel não encontrado');
        return;
      }

      const carousel = outcome.carousel as {
        id: string; title: string; style: string; slides?: Record<string, unknown>[];
        caption?: string; hashtags?: string[]; updated_at?: string;
      };

      const sortedSlides: Slide[] = [...(carousel.slides || [])]
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          (a.position as number) - (b.position as number)
        )
        .map((sl: Record<string, unknown>) => mapDbSlideToSlide(sl));

      if (sortedSlides.length === 0) {
        // Desfecho próprio, e já existia: o carrossel EXISTE e respondeu — só
        // não tem slide. Repetir a leitura não muda isso, então não é transiente.
        setLoadError('Este carrossel não possui slides salvos.');
        setLoadFailureIsTransient(false);
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
        // O horário do último save vem do banco, então a barra de status já
        // abre com "Salvo às HH:MM" em vez de um "Salvo" sem hora.
        lastSavedAt:    parseSavedAt(carousel.updated_at),
      });
      setLoadedCarouselId(carouselIdParam);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [carouselIdParam, loadedCarouselId, loadCarousel, reloadNonce]);

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
        <div className="brand-card max-w-md w-full p-8 text-center" data-testid="generator-load-error">
          <h1 className="font-display text-2xl" style={{ color: 'var(--ink)' }}>
            {loadFailureIsTransient ? 'Não foi possível carregar agora' : 'Não foi possível abrir'}
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-dim)' }}>{loadError}</p>
          <div className="mt-6 flex items-center justify-center gap-2">
            {/* Só na falha transiente. Tentar de novo um carrossel que de fato
                não existe é oferecer uma porta que não abre — e o retry é do
                usuário, nunca automático: laço cego esconderia a falha. */}
            {loadFailureIsTransient && (
              <button
                onClick={() => setReloadNonce((n) => n + 1)}
                className="inline-flex rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ background: 'var(--ink)', color: 'var(--paper)' }}
              >
                Tentar de novo
              </button>
            )}
            <Link
              href="/dashboard"
              className="inline-flex rounded-lg px-4 py-2 text-sm font-semibold"
              style={
                loadFailureIsTransient
                  ? { border: '1.5px solid var(--line-strong)', color: 'var(--ink)' }
                  : { background: 'var(--ink)', color: 'var(--paper)' }
              }
            >
              Voltar aos carrosséis
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* A faixa de slides ocupa a largura INTEIRA e passa por baixo da barra;
          a barra flutua por cima, opaca. Sem isso o card era cortado na borda
          da coluna de conteúdo e sobrava um vão de fundo entre a barra e o
          corte — o que aparecia assim que a faixa rolava. */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Coluna opaca da barra: cobre 0..300 para o card sumir POR BAIXO dela
            em vez de reaparecer na margem de 15 à esquerda do painel. */}
        <div className="absolute inset-y-0 left-0 z-20 w-[300px] flex bg-[var(--background)]">
          <EditorSidebar
            onOpenWizard={() => setShowWizard(true)}
            onDownloadSlide={() => downloadSlide()}
            onDownloadAll={downloadAll}
          />
        </div>

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
