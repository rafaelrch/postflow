'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Calendar01Icon, Copy01Icon, DashboardSquare01Icon, Delete02Icon, Edit02Icon, Layers01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { Plus as AnimatedPlus } from '@/lib/animated-heroicons';
import { useNativeHoverAnimation } from '@/lib/animated-heroicons';
import Button from '@/components/ui/Button';
import CreateWizard from '@/components/editor/CreateWizard';
import { createClient } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { SlideStyle } from '@/types';
import { mapDbSlideToSlide, mapDbCarouselToGlobalSettings } from '@/lib/slide-mapper';
import { normalizeHandle } from '@/lib/utils';
import { duplicateCarouselPayload, duplicateSlidesPayload } from '@/lib/carousel-duplicate';
import MinimalistSlide from '@/components/slides/MinimalistSlide';
import Template01Slide from '@/components/slides/Template01Slide';
import Template02Slide from '@/components/slides/Template02Slide';
import Template03Slide from '@/components/slides/Template03Slide';
import ProfileSlide from '@/components/slides/ProfileSlide';
import Pagination from '@/components/ui/Pagination';
import type { DashboardCarousel } from './page';
import { DASHBOARD_PAGE_SIZE, dashboardHref, type DashboardLoadError } from '@/lib/dashboard-data';

interface DashboardClientProps {
  initialCarousels: DashboardCarousel[];
  /**
   * `null` quando a query respondeu — inclusive respondendo que não há nada.
   * Só com isto a tela consegue separar "você não tem carrossel" de "a carga
   * falhou", que antes eram a mesma lista vazia.
   */
  loadError?: DashboardLoadError | null;
  /** Página atual (1-based), vinda do `?page` do URL. */
  page?: number;
  totalPages?: number;
  /**
   * Total de carrosséis do usuário — o `count` do banco, NÃO o tamanho desta
   * página. `null` quando a carga falhou: aí não se sabe quantos existem.
   */
  totalCarousels?: number | null;
  /**
   * Termo do `?q` — a busca é do BANCO, então quem já buscou é o servidor e
   * esta lista JÁ é o resultado. Vazio significa "não está buscando".
   */
  searchTerm?: string;
}

/** Espera antes de levar o termo ao URL: buscar a cada tecla seria uma ida ao
 *  banco por letra. 350ms é o intervalo em que se para de digitar sem que a
 *  espera apareça como travada. */
const BUSCA_DEBOUNCE_MS = 350;

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
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

  const slide = mapDbSlideToSlide(carousel.coverSlide);
  const globalSettings = mapDbCarouselToGlobalSettings(carousel as unknown as Record<string, unknown>);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      {scale > 0 && (
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 1080, height: 1350 }}>
          {(carousel.style as SlideStyle) === 'profile' ? (
            <ProfileSlide
              slide={slide}
              globalSettings={globalSettings}
              profileData={{ photo: globalSettings.profileBadge.photo || '', name: globalSettings.profileBadge.name || '', handle: normalizeHandle(globalSettings.profileBadge.handle) }}
              slideIndex={0}
              totalSlides={carousel.slides?.[0]?.count ?? 1}
            />
          ) : (carousel.style as SlideStyle) === 'template03' ? (
            <Template03Slide
              slide={slide}
              globalSettings={globalSettings}
              slideIndex={0}
              totalSlides={carousel.slides?.[0]?.count ?? 1}
            />
          ) : (carousel.style as SlideStyle) === 'template02' ? (
            <Template02Slide
              slide={slide}
              globalSettings={globalSettings}
              slideIndex={0}
              totalSlides={carousel.slides?.[0]?.count ?? 1}
            />
          ) : (carousel.style as SlideStyle) === 'template01' ? (
            <Template01Slide
              slide={slide}
              globalSettings={globalSettings}
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

export default function DashboardClient({
  initialCarousels,
  loadError = null,
  page = 1,
  totalPages = 1,
  totalCarousels = null,
  searchTerm = '',
}: DashboardClientProps) {
  const router = useRouter();
  const [carousels, setCarousels] = useState(initialCarousels);

  // A página vem do servidor: ao trocar de `?page` o React reaproveita este
  // componente, e sem isto a lista continuaria mostrando a página anterior.
  useEffect(() => { setCarousels(initialCarousels); }, [initialCarousels]);

  const irParaPagina = (p: number) => {
    router.push(dashboardHref(p, searchTerm));
  };
  const [showWizard, setShowWizard] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const headerCreateAnimation = useNativeHoverAnimation();
  const cardCreateAnimation = useNativeHoverAnimation();

  // O que está digitado. A LISTA já é o resultado da busca do servidor — este
  // estado existe só para o campo não engasgar entre a tecla e a navegação.
  const [query, setQuery] = useState(searchTerm);
  useEffect(() => { setQuery(searchTerm); }, [searchTerm]);

  /**
   * Termo digitado → URL, com folga entre teclas.
   *
   * `replace` e não `push`: cada letra viraria uma entrada no histórico, e o
   * botão "voltar" teria de ser apertado uma vez por caractere.
   *
   * Volta SEMPRE para a página 1 — página 3 de "zebra" não é página 3 de
   * "gato", e manter o número mostraria vazio sobre uma busca que tem resposta.
   */
  useEffect(() => {
    const limpo = query.trim();
    if (limpo === searchTerm) return;
    const t = setTimeout(() => router.replace(dashboardHref(1, limpo)), BUSCA_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, searchTerm, router]);

  const handleDelete = async (id: string) => {
    if (!confirm('Deletar este carrossel? Esta ação não pode ser desfeita.')) return;
    setDeleting(id);
    // Rota dedicada: deleta o carrossel e limpa do Storage as imagens que
    // nenhum outro carrossel/slide/perfil referencia.
    const res = await fetch('/api/delete-carousel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      toast.error('Erro ao deletar');
    } else {
      const restantes = carousels.filter((c) => c.id !== id);
      setCarousels(restantes);
      toast.success('Carrossel deletado');
      // Apagar o último item da página não pode deixar o usuário olhando para
      // uma página vazia: volta uma página se esvaziou, senão recarrega os
      // dados do servidor para puxar o item que subiu da página seguinte.
      if (restantes.length === 0 && page > 1) irParaPagina(page - 1);
      else router.refresh();
    }
    setDeleting(null);
  };

  const handleDuplicate = async (id: string) => {
    if (duplicating) return;
    setDuplicating(id);
    const supabase = createClient();

    try {
      const { data: carousel, error: sourceError } = await supabase
        .from('carousels')
        .select('*, slides(*)')
        .eq('id', id)
        .single();

      if (sourceError || !carousel) {
        toast.error('Não foi possível carregar o carrossel original');
        return;
      }

      const sourceSlides = (carousel.slides ?? []) as Record<string, unknown>[];
      if (sourceSlides.length === 0) {
        toast.error('Este carrossel não possui slides para duplicar');
        return;
      }

      const { data: newCarousel, error } = await supabase
        .from('carousels')
        .insert(duplicateCarouselPayload(carousel))
        .select()
        .single();

      if (error || !newCarousel) {
        toast.error('Erro ao duplicar');
        return;
      }

      const { error: slidesError } = await supabase
        .from('slides')
        .insert(duplicateSlidesPayload(sourceSlides, newCarousel.id));

      if (slidesError) {
        // A cópia só existe se for completa. O cascade elimina qualquer slide
        // parcial e evita um novo card de "0 slides" no dashboard.
        await supabase.from('carousels').delete().eq('id', newCarousel.id);
        toast.error('Não foi possível copiar os slides');
        return;
      }

      const orderedSlides = [...sourceSlides].sort(
        (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)
      );
      const dashboardCopy = {
        ...newCarousel,
        slides: [{ count: sourceSlides.length }],
        coverSlide: orderedSlides.find((slide) => Number(slide.position) === 0) ?? orderedSlides[0],
      } as DashboardCarousel;

      setCarousels((prev) => [dashboardCopy, ...prev]);
      toast.success('Carrossel duplicado');
      router.refresh();
    } catch {
      toast.error('Erro ao duplicar');
    } finally {
      setDuplicating(null);
    }
  };

  const handleEdit = (id: string) => {
    router.push(`/generator?id=${id}`);
  };

  // O "Total" é o do BANCO, não o desta página — com 12 carrosséis a página 1
  // mostra 10 e o contador tem de continuar dizendo 12. Cai para o tamanho da
  // página só quando o total não veio (carga falhada).
  const total = totalCarousels ?? carousels.length;

  // Buscando é o que o SERVIDOR buscou. Usar o que está digitado faria a tela
  // dizer "nenhum resultado" durante os 350ms antes de a busca sequer sair.
  const buscando = searchTerm.length > 0;
  const semResultado = buscando && !loadError && total === 0;

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ background: 'var(--paper)' }}
    >
      <main className="max-w-[1320px] mx-auto w-full px-8 py-10">
        {/* Hero / header */}
        <header className="mb-10 flex flex-col gap-3">
          <span className="section-kicker flex items-center gap-2">
            <HugeiconsIcon icon={DashboardSquare01Icon} size={14} strokeWidth={1.75} aria-hidden />
            <span className="dot-live" aria-hidden />
            Studio · Carrosséis
          </span>

          <div className="flex items-end justify-between gap-6 flex-wrap">
            <h1 className="section-title" style={{ fontSize: 'clamp(38px, 5vw, 64px)' }}>
              Seus carrosséis
              <span className="italic" style={{ color: 'var(--accent)' }}> virais</span>
            </h1>

            <div className="flex items-center gap-3">
              {/* Search */}
              <label
                className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12.5px]"
                style={{
                  background: 'var(--paper-2)',
                  border: '1.5px solid var(--ink)',
                  boxShadow: 'var(--sh-1)',
                  color: 'var(--ink)',
                  minWidth: 240,
                }}
              >
                <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.75} aria-hidden className="shrink-0" style={{ color: 'var(--ink-dim)' }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar…"
                  className="bg-transparent outline-none flex-1 placeholder:text-[var(--ink-muted)]"
                  style={{ color: 'var(--ink)' }}
                />
              </label>

              <Button
                variant="primary"
                size="md"
                onClick={() => setShowWizard(true)}
                onMouseEnter={headerCreateAnimation.onMouseEnter}
                onMouseLeave={headerCreateAnimation.onMouseLeave}
                className="gap-2"
              >
                <AnimatedPlus ref={headerCreateAnimation.iconRef} size={16} aria-hidden />
                Novo carrossel
              </Button>
            </div>
          </div>

          {/* Stats row — contagem de um lado, paginação do OUTRO, na mesma
              linha. O controle saiu de baixo dos cards: encostado à direita
              aqui em cima, ele não compete com o título nem obriga a rolar a
              lista inteira para trocar de página. */}
          <div className="flex items-center gap-8 mt-2">
            {/* Buscando, o número é o de ACHADOS — dizer "Total 2" sobre um
                acervo de 14 seria contar outra coisa com o mesmo rótulo. */}
            <Stat label={buscando ? 'Achados' : 'Total'} value={total} />
            <span className="hairline soft flex-1" />
            {/* O resultado da busca pagina igual à lista: mesmo controle, mesmo
                tamanho de página. Uma busca com 40 respostas não pode despejar
                40 cards de uma vez só porque é busca. */}
            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={total}
              pageSize={DASHBOARD_PAGE_SIZE}
              onChange={irParaPagina}
              label="Paginação dos carrosséis"
            />
          </div>
        </header>

        {/* Falha de carga NUNCA vira "você não tem carrossel": o usuário precisa
            saber que foi erro, e ter como repetir. O `router.refresh()` aqui é
            gesto explícito dele, não revalidação cega. */}
        {loadError && (
          <div
            role="alert"
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[14px] px-5 py-4"
            style={{ border: '1.5px solid var(--ink)', background: 'var(--paper-2)' }}
          >
            <div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
                Não foi possível carregar seus carrosséis
              </p>
              <p className="text-[11.5px]" style={{ color: 'var(--ink-dim)' }}>
                {loadError === 'timeout'
                  ? 'A busca demorou demais. Seus carrosséis continuam salvos.'
                  : 'Houve uma falha ao buscar. Seus carrosséis continuam salvos.'}
              </p>
            </div>
            <Button variant="primary" size="md" onClick={() => router.refresh()}>
              Tentar de novo
            </Button>
          </div>
        )}

        {/* 🔴 Os QUATRO desfechos, cada um com sua tela:
            falhou → o alerta acima (e nada aqui, para não desmentir o alerta);
            buscou e não achou → "nenhum carrossel", que fala do TERMO;
            não tem nada → o convite de criar o primeiro;
            tem → a lista. */}
        {total === 0 ? (
          loadError ? null : semResultado ? (
            <SemResultado termo={searchTerm} onLimpar={() => setQuery('')} />
          ) : (
            <EmptyState onCreate={() => setShowWizard(true)} />
          )
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {/* Create card — dashed brutalist. Some durante a busca: no meio
                  de resultados ele seria o único card que não é resultado. */}
              {!buscando && <button
                onClick={() => setShowWizard(true)}
                onMouseEnter={cardCreateAnimation.onMouseEnter}
                onMouseLeave={cardCreateAnimation.onMouseLeave}
                className="aspect-[4/5] rounded-[14px] flex flex-col items-center justify-center gap-3"
                style={{
                  background: 'transparent',
                  border: '1.5px dashed var(--ink)',
                  color: 'var(--ink-dim)',
                }}
              >
                <div
                  className="w-12 h-12 rounded-[10px] grid place-items-center"
                  style={{ border: '1.5px solid currentColor' }}
                >
                  <AnimatedPlus ref={cardCreateAnimation.iconRef} size={20} aria-hidden />
                </div>
                <span className="font-mono text-[11px] uppercase tracking-[0.14em]">Novo carrossel</span>
              </button>}

              {carousels.map((carousel) => (
                <div
                  key={carousel.id}
                  className="group relative overflow-hidden brand-card interactive"
                  style={{ padding: 0 }}
                  onClick={() => handleEdit(carousel.id)}
                >
                  {/* Thumbnail */}
                  <div
                    className="aspect-[4/5] relative"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--paper-3) 0%, var(--paper-2) 100%)',
                    }}
                  >
                    {carousel.coverSlide ? (
                      <SlideThumbnail carousel={carousel} />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center p-4">
                          <div
                            className="w-2 h-2 rounded-full mx-auto mb-3"
                            style={{ background: carousel.accent_color || 'var(--accent)' }}
                          />
                          <p className="text-[12px] font-medium line-clamp-3" style={{ color: 'var(--ink)' }}>
                            {carousel.title}
                          </p>
                          <p
                            className="font-mono text-[9.5px] uppercase tracking-[0.12em] mt-2"
                            style={{ color: 'var(--ink-dim)' }}
                          >
                            {carousel.style}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Hover actions */}
                    <div
                      className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconActionButton onClick={() => handleEdit(carousel.id)} title="Editar">
                        <HugeiconsIcon icon={Edit02Icon} size={14} strokeWidth={1.75} aria-hidden />
                      </IconActionButton>
                      <IconActionButton
                        onClick={() => handleDuplicate(carousel.id)}
                        disabled={duplicating === carousel.id}
                        title="Duplicar"
                      >
                        <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.75} aria-hidden />
                      </IconActionButton>
                      <IconActionButton
                        onClick={() => handleDelete(carousel.id)}
                        disabled={deleting === carousel.id}
                        title="Deletar"
                        danger
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.75} aria-hidden />
                      </IconActionButton>
                    </div>
                  </div>

                  {/* Info */}
                  <div
                    className="p-3.5 flex flex-col gap-1.5"
                    style={{ borderTop: '1.5px solid var(--ink)' }}
                  >
                    <p
                      className="font-display text-[18px] leading-[1.1] line-clamp-1"
                      style={{ color: 'var(--ink)' }}
                    >
                      {carousel.title}
                    </p>
                    <div
                      className="flex items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.08em]"
                      style={{ color: 'var(--ink-dim)' }}
                    >
                      <span className="flex items-center gap-1">
                        <HugeiconsIcon icon={Layers01Icon} size={12} strokeWidth={1.75} aria-hidden />
                        {carousel.slides?.[0]?.count ?? 0} slides
                      </span>
                      <span className="flex items-center gap-1">
                        <HugeiconsIcon icon={Calendar01Icon} size={12} strokeWidth={1.75} aria-hidden />
                        {formatDate(carousel.updated_at)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </>
        )}
      </main>

      {showWizard && <CreateWizard onClose={() => setShowWizard(false)} />}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="font-display text-[34px] leading-none"
        style={{ color: accent ? 'var(--accent)' : 'var(--ink)' }}
      >
        {String(value).padStart(2, '0')}
      </span>
      <span
        className="font-mono text-[10px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--ink-dim)' }}
      >
        {label}
      </span>
    </div>
  );
}

function IconActionButton({
  children,
  onClick,
  title,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="w-8 h-8 grid place-items-center rounded-[6px] transition-all"
      style={{
        background: 'var(--paper)',
        color: danger ? 'var(--danger)' : 'var(--ink)',
        border: '1.5px solid var(--ink)',
        boxShadow: 'var(--sh-1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translate(-1px,-1px)';
        e.currentTarget.style.boxShadow = 'var(--sh-2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = 'var(--sh-1)';
      }}
    >
      {children}
    </button>
  );
}

/**
 * Busca sem resposta — NÃO é o mesmo que acervo vazio.
 *
 * Quem chegou aqui tem carrosséis; só nenhum com esse título. Oferecer "crie o
 * primeiro" seria afirmar o contrário, e é por isso que esta tela existe
 * separada do `EmptyState`. Também não é falha de carga: falha tem alerta
 * próprio, com "tentar de novo".
 */
function SemResultado({ termo, onLimpar }: { termo: string; onLimpar: () => void }) {
  return (
    <div
      className="rounded-[14px] px-8 py-16 text-center flex flex-col items-center gap-4"
      style={{ border: '1.5px dashed var(--ink)', background: 'var(--paper-2)' }}
    >
      <HugeiconsIcon icon={Search01Icon} size={24} strokeWidth={1.75} aria-hidden style={{ color: 'var(--ink-dim)' }} />
      <p className="font-display text-[26px] leading-tight" style={{ color: 'var(--ink)' }}>
        Nenhum carrossel com “{termo}”
      </p>
      <p className="text-[13px] max-w-sm leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
        A busca varre todos os seus carrosséis, não só os desta página. Confira a
        grafia ou tente outra palavra do título.
      </p>
      <Button variant="secondary" size="md" onClick={onLimpar} className="mt-1">
        Limpar busca
      </Button>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="relative grid-bg rounded-[14px] px-8 py-20 text-center flex flex-col items-center gap-5"
      style={{
        border: '1.5px dashed var(--ink)',
        background: 'var(--paper-2)',
      }}
    >
      <span className="chip">Nada por aqui</span>
      <h2
        className="section-title max-w-xl"
        style={{ fontSize: 'clamp(32px, 4vw, 52px)' }}
      >
        Comece <span style={{ fontStyle: 'italic', color: 'var(--accent)' }}>agora</span>
        <br />
        seu primeiro carrossel
      </h2>
      <p className="text-[13.5px] max-w-sm leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
        Descreva um tema. A IA monta slides coesos em segundos.
        Você revisa, ajusta e publica.
      </p>
      <Button variant="primary" size="lg" onClick={onCreate} className="mt-2">
        <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} aria-hidden />
        Criar primeiro carrossel
      </Button>
    </div>
  );
}
