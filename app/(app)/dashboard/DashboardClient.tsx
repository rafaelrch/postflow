'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit2, Copy, Trash2, Calendar, Layers, Search } from 'lucide-react';
import Button from '@/components/ui/Button';
import CreateWizard from '@/components/editor/CreateWizard';
import { createClient } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { SlideStyle } from '@/types';
import { mapDbSlideToSlide, mapDbCarouselToGlobalSettings } from '@/lib/slide-mapper';
import { normalizeHandle } from '@/lib/utils';
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
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return carousels;
    const q = query.toLowerCase();
    return carousels.filter((c) => c.title.toLowerCase().includes(q));
  }, [carousels, query]);

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

  const total = carousels.length;
  const published = carousels.filter((c) => c.status === 'published').length;
  const drafts = total - published;

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ background: 'var(--paper)' }}
    >
      <main className="max-w-[1320px] mx-auto w-full px-8 py-10">
        {/* Hero / header */}
        <header className="mb-10 flex flex-col gap-3">
          <span className="section-kicker flex items-center gap-2">
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
                <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--ink-dim)' }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar…"
                  className="bg-transparent outline-none flex-1 placeholder:text-[var(--ink-muted)]"
                  style={{ color: 'var(--ink)' }}
                />
                <span
                  className="font-mono text-[9.5px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded"
                  style={{ color: 'var(--ink-dim)', border: '1px solid var(--line-strong)' }}
                >
                  ⌘K
                </span>
              </label>

              <Button variant="primary" size="md" onClick={() => setShowWizard(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Novo carrossel
              </Button>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-8 mt-2">
            <Stat label="Total" value={total} />
            <Stat label="Rascunho" value={drafts} />
            <Stat label="Publicados" value={published} accent />
            <span className="hairline soft flex-1" />
          </div>
        </header>

        {total === 0 ? (
          <EmptyState onCreate={() => setShowWizard(true)} />
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="section-kicker">
                {filtered.length} {filtered.length === 1 ? 'item' : 'itens'}
              </p>
              <div className="flex items-center gap-2">
                <span className="chip soft">grid</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {/* Create card — dashed brutalist */}
              <button
                onClick={() => setShowWizard(true)}
                className="
                  aspect-[4/5] rounded-[14px] flex flex-col items-center justify-center gap-3
                  transition-all duration-150 group
                "
                style={{
                  background: 'transparent',
                  border: '1.5px dashed var(--ink)',
                  color: 'var(--ink-dim)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translate(-2px,-2px)';
                  e.currentTarget.style.boxShadow = 'var(--sh-2)';
                  e.currentTarget.style.background = 'var(--paper-2)';
                  e.currentTarget.style.color = 'var(--ink)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = '';
                  e.currentTarget.style.boxShadow = '';
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--ink-dim)';
                }}
              >
                <div
                  className="w-12 h-12 rounded-[10px] grid place-items-center transition-transform group-hover:scale-110"
                  style={{ border: '1.5px solid currentColor' }}
                >
                  <Plus className="w-5 h-5" />
                </div>
                <span className="font-mono text-[11px] uppercase tracking-[0.14em]">Novo carrossel</span>
              </button>

              {filtered.map((carousel) => (
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
                        <Edit2 className="w-3.5 h-3.5" />
                      </IconActionButton>
                      <IconActionButton onClick={() => handleDuplicate(carousel.id)} title="Duplicar">
                        <Copy className="w-3.5 h-3.5" />
                      </IconActionButton>
                      <IconActionButton
                        onClick={() => handleDelete(carousel.id)}
                        disabled={deleting === carousel.id}
                        title="Deletar"
                        danger
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
                        <Layers className="w-3 h-3" />
                        {carousel.slides?.[0]?.count ?? 0} slides
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
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
        <Plus className="w-4 h-4" />
        Criar primeiro carrossel
      </Button>
    </div>
  );
}
