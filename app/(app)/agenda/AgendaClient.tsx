'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  X,
  Trash2,
  Check,
  Clock,
  LayoutGrid,
  Newspaper,
  StickyNote,
  MoreHorizontal,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { ScheduledPost } from './page';
import CarouselPreview from '@/components/editor/CarouselPreview';

/* ─── Types ───────────────────────────────────────────── */

type Kind = ScheduledPost['kind'];
type Status = ScheduledPost['status'];

const KIND_META: Record<Kind, { label: string; tint: string; textOnTint: string; Icon: React.ComponentType<{ className?: string }> }> = {
  carousel: { label: 'Carrossel', tint: 'var(--ink)',         textOnTint: 'var(--paper)',  Icon: LayoutGrid },
  news:     { label: 'News',      tint: 'var(--paper-3)',     textOnTint: 'var(--ink)',    Icon: Newspaper },
  note:     { label: 'Nota',      tint: 'var(--paper-2)',     textOnTint: 'var(--ink)',    Icon: StickyNote },
};

const STATUS_META: Record<Status, { label: string; dot: string }> = {
  planned:   { label: 'Planejado',  dot: 'var(--ink-dim)'   },
  ready:     { label: 'Pronto',     dot: 'var(--accent)'    },
  published: { label: 'Publicado',  dot: 'var(--success)'   },
  skipped:   { label: 'Descartado', dot: 'var(--ink-muted)' },
};

/* ─── Date helpers (local tz) ─────────────────────────── */

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function toDayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function buildMonthGrid(monthStart: Date) {
  // Start on Monday for a week; pad before and after.
  const first = new Date(monthStart);
  const offset = (first.getDay() + 6) % 7; // Mon=0..Sun=6
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - offset);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}
function formatMonthTitle(d: Date) {
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
function formatTimeShort(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function formatFullDay(d: Date) {
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

/* ─── Client ──────────────────────────────────────────── */

export default function AgendaClient({ initialPosts }: { initialPosts: ScheduledPost[] }) {
  const supabase = createClient();
  const [posts, setPosts] = useState<ScheduledPost[]>(initialPosts);
  const [monthCursor, setMonthCursor] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  const [editor, setEditor] = useState<{ mode: 'create'; day: Date } | { mode: 'edit'; post: ScheduledPost } | null>(null);

  const days = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  const postsByDay = useMemo(() => {
    const map: Record<string, ScheduledPost[]> = {};
    for (const p of posts) {
      const key = toDayKey(new Date(p.scheduled_at));
      (map[key] ||= []).push(p);
    }
    for (const key in map) {
      map[key].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    }
    return map;
  }, [posts]);

  const selectedKey = toDayKey(selectedDay);
  const selectedPosts = postsByDay[selectedKey] ?? [];

  const today = new Date();
  const totalThisMonth = useMemo(() => {
    const from = startOfMonth(monthCursor);
    const to = addMonths(from, 1);
    return posts.filter((p) => {
      const d = new Date(p.scheduled_at);
      return d >= from && d < to;
    }).length;
  }, [posts, monthCursor]);

  const goPrevMonth = () => setMonthCursor((d) => addMonths(d, -1));
  const goNextMonth = () => setMonthCursor((d) => addMonths(d, 1));
  const goToday = () => {
    const n = new Date();
    setMonthCursor(startOfMonth(n));
    setSelectedDay(n);
  };

  const savePost = useCallback(
    async (input: {
      id?: string;
      scheduled_at: string;
      kind: Kind;
      title: string;
      note: string;
      status: Status;
    }) => {
      if (input.id) {
        const { data, error } = await supabase
          .from('scheduled_posts')
          .update({
            scheduled_at: input.scheduled_at,
            kind: input.kind,
            title: input.title,
            note: input.note,
            status: input.status,
          })
          .eq('id', input.id)
          .select()
          .single();
        if (error) {
          toast.error('Erro ao salvar');
          return;
        }
        setPosts((prev) => prev.map((p) => (p.id === input.id ? (data as ScheduledPost) : p)));
        toast.success('Atualizado');
      } else {
        const { data, error } = await supabase
          .from('scheduled_posts')
          .insert({
            scheduled_at: input.scheduled_at,
            kind: input.kind,
            title: input.title,
            note: input.note,
            status: input.status,
          })
          .select()
          .single();
        if (error) {
          toast.error('Erro ao agendar');
          return;
        }
        setPosts((prev) => [...prev, data as ScheduledPost]);
        toast.success('Agendado');
      }
      setEditor(null);
    },
    [supabase]
  );

  const deletePost = useCallback(
    async (id: string) => {
      const ok = confirm('Remover este agendamento?');
      if (!ok) return;
      const { error } = await supabase.from('scheduled_posts').delete().eq('id', id);
      if (error) {
        toast.error('Erro ao remover');
        return;
      }
      setPosts((prev) => prev.filter((p) => p.id !== id));
      setEditor(null);
      toast.success('Removido');
    },
    [supabase]
  );

  // Keyboard: N = new, Esc = close, arrow keys navigate days when no editor
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (editor) {
        if (e.key === 'Escape') setEditor(null);
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setEditor({ mode: 'create', day: selectedDay });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [editor, selectedDay]);

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ background: 'var(--paper)' }}
    >
      <div className="max-w-[1400px] mx-auto px-8 py-10">
        {/* Hero */}
        <header className="mb-8 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <p className="section-kicker flex items-center gap-2">
              <span className="dot-live" />
              Agenda · {totalThisMonth} post{totalThisMonth === 1 ? '' : 's'} este mês
            </p>
            <h1 className="section-title mt-2">
              Sua rotina{' '}
              <span
                className="font-display"
                style={{ fontStyle: 'italic', color: 'var(--accent)' }}
              >
                no controle.
              </span>
            </h1>
            <p className="mt-3 text-[14px] max-w-[520px]" style={{ color: 'var(--ink-dim)' }}>
              Planeje carrosséis e news cards em um único calendário. Clique em qualquer dia para agendar.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button className="brand-btn outline" onClick={goToday}>
              <CalendarIcon className="w-4 h-4" />
              <span>Hoje</span>
            </button>
            <button
              className="brand-btn primary"
              onClick={() => setEditor({ mode: 'create', day: selectedDay })}
            >
              <Plus className="w-4 h-4" />
              <span>Novo agendamento</span>
              <span
                className="font-mono text-[10px] uppercase tracking-[0.14em] ml-1 px-1.5 py-[1px] rounded"
                style={{ background: 'color-mix(in srgb, var(--paper) 25%, transparent)', color: 'inherit' }}
              >
                N
              </span>
            </button>
          </div>
        </header>

        <hr className="hairline mb-8" />

        {/* Main layout: calendar + selected-day panel */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
          {/* Calendar */}
          <section className="brand-card p-5">
            {/* Month header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button className="brand-btn icon outline" onClick={goPrevMonth} aria-label="Mês anterior">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button className="brand-btn icon outline" onClick={goNextMonth} aria-label="Próximo mês">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <h2
                  className="font-display ml-2 capitalize"
                  style={{ fontSize: 24, letterSpacing: '-0.02em', color: 'var(--ink)' }}
                >
                  {formatMonthTitle(monthCursor)}
                </h2>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.14em]" style={{ color: 'var(--ink-dim)' }}>
                <LegendDot color="var(--ink)"     label="Carrossel" />
                <LegendDot color="var(--paper-3)" label="News" border />
                <LegendDot color="var(--paper-2)" label="Nota" border />
              </div>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-2 mb-2">
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((w) => (
                <div
                  key={w}
                  className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-center py-1.5"
                  style={{ color: 'var(--ink-dim)' }}
                >
                  {w}
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-2">
              {days.map((d) => {
                const inMonth = d.getMonth() === monthCursor.getMonth();
                const isToday = isSameDay(d, today);
                const isSelected = isSameDay(d, selectedDay);
                const key = toDayKey(d);
                const dayPosts = postsByDay[key] ?? [];

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(d)}
                    onDoubleClick={() => setEditor({ mode: 'create', day: d })}
                    className={cn(
                      'relative text-left p-2 rounded-[10px] transition-all flex flex-col gap-1 min-h-[96px]',
                      'border-[1.5px]'
                    )}
                    style={{
                      background: isSelected ? 'var(--paper-2)' : 'var(--paper)',
                      borderColor: isSelected ? 'var(--ink)' : 'var(--line)',
                      boxShadow: isSelected ? 'var(--sh-1)' : 'none',
                      opacity: inMonth ? 1 : 0.45,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn('text-[13px] font-semibold', isToday && 'px-1.5 py-0.5 rounded-[6px]')}
                        style={
                          isToday
                            ? { background: 'var(--accent)', color: '#fff' }
                            : { color: 'var(--ink)' }
                        }
                      >
                        {d.getDate()}
                      </span>
                      {dayPosts.length > 0 && (
                        <span
                          className="font-mono text-[9px] uppercase tracking-[0.14em] px-1.5 py-[1px] rounded"
                          style={{ background: 'var(--ink)', color: 'var(--paper)' }}
                        >
                          {dayPosts.length}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 mt-0.5">
                      {dayPosts.slice(0, 2).map((p) => {
                        const meta = KIND_META[p.kind];
                        const Icon = meta.Icon;
                        return (
                          <div
                            key={p.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDay(d);
                              setEditor({ mode: 'edit', post: p });
                            }}
                            className="flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-[3px] rounded-[5px] border-[1px] truncate"
                            style={{
                              background: meta.tint,
                              color: meta.textOnTint,
                              borderColor: p.kind === 'news' || p.kind === 'note' ? 'var(--line-strong)' : meta.tint,
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <Icon className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{p.title || 'Sem título'}</span>
                          </div>
                        );
                      })}
                      {dayPosts.length > 2 && (
                        <span
                          className="text-[10px] font-mono uppercase tracking-[0.12em] px-1"
                          style={{ color: 'var(--ink-dim)' }}
                        >
                          +{dayPosts.length - 2}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Selected day panel */}
          <aside className="brand-card p-5 flex flex-col gap-4 h-fit sticky top-6">
            <div>
              <p className="section-kicker">Dia selecionado</p>
              <h3
                className="font-display capitalize mt-1"
                style={{ fontSize: 24, letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1.05 }}
              >
                {formatFullDay(selectedDay)}
              </h3>
            </div>

            <button
              className="brand-btn outline w-full justify-center"
              onClick={() => setEditor({ mode: 'create', day: selectedDay })}
            >
              <Plus className="w-4 h-4" />
              <span>Agendar neste dia</span>
            </button>

            <hr className="hairline soft" />

            {selectedPosts.length === 0 ? (
              <div
                className="rounded-[10px] border-2 border-dashed p-5 text-center grid-bg"
                style={{ borderColor: 'var(--line-strong)' }}
              >
                <p className="font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: 'var(--ink-dim)' }}>
                  Nada agendado
                </p>
                <p className="mt-2 text-[13px]" style={{ color: 'var(--ink-dim)' }}>
                  Use <kbd className="chip soft">N</kbd> ou clique duas vezes em qualquer dia para agendar.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {selectedPosts.map((p) => {
                  const meta = KIND_META[p.kind];
                  const st = STATUS_META[p.status];
                  const Icon = meta.Icon;
                  return (
                    <li
                      key={p.id}
                      className="brand-card interactive p-3 flex items-center gap-3"
                      onClick={() => setEditor({ mode: 'edit', post: p })}
                    >
                      <span
                        className="brand-mark sm"
                        style={{ background: meta.tint, color: meta.textOnTint }}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--ink)' }}>
                          {p.title || 'Sem título'}
                        </p>
                        <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] mt-0.5 flex items-center gap-2" style={{ color: 'var(--ink-dim)' }}>
                          <Clock className="w-2.5 h-2.5" />
                          {formatTimeShort(p.scheduled_at)}
                          <span className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
                            {st.label}
                          </span>
                        </p>
                      </div>
                      <MoreHorizontal className="w-4 h-4 shrink-0" style={{ color: 'var(--ink-dim)' }} />
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      </div>

      {/* Editor drawer */}
      {editor && (
        <EditorDrawer
          key={editor.mode === 'edit' ? editor.post.id : `new-${toDayKey(editor.day)}`}
          initial={
            editor.mode === 'edit'
              ? {
                  id: editor.post.id,
                  scheduled_at: editor.post.scheduled_at,
                  kind: editor.post.kind,
                  title: editor.post.title,
                  note: editor.post.note,
                  status: editor.post.status,
                  carousel_id: editor.post.carousel_id,
                }
              : {
                  scheduled_at: defaultScheduleFor(editor.day),
                  kind: 'carousel',
                  title: '',
                  note: '',
                  status: 'planned',
                  carousel_id: null,
                }
          }
          onClose={() => setEditor(null)}
          onSave={savePost}
          onDelete={editor.mode === 'edit' ? () => deletePost(editor.post.id) : undefined}
        />
      )}
    </div>
  );
}

/* ─── Editor drawer ───────────────────────────────────── */

function defaultScheduleFor(day: Date) {
  const d = new Date(day);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInputValue(v: string) {
  return new Date(v).toISOString();
}

function EditorDrawer({
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  initial: {
    id?: string;
    scheduled_at: string;
    kind: Kind;
    title: string;
    note: string;
    status: Status;
    carousel_id?: string | null;
  };
  onClose: () => void;
  onSave: (input: {
    id?: string;
    scheduled_at: string;
    kind: Kind;
    title: string;
    note: string;
    status: Status;
  }) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState(initial.title);
  const [note, setNote] = useState(initial.note);
  const kind = initial.kind;
  const [status, setStatus] = useState<Status>(initial.status);
  const [whenLocal, setWhenLocal] = useState<string>(() => toLocalInputValue(initial.scheduled_at));
  const [saving, setSaving] = useState(false);

  const canSave = title.trim().length > 0 && whenLocal.length > 0;

  const submit = async () => {
    if (!canSave) {
      toast.error('Adicione um título e um horário');
      return;
    }
    setSaving(true);
    await onSave({
      id: initial.id,
      scheduled_at: fromLocalInputValue(whenLocal),
      kind,
      title: title.trim(),
      note: note.trim(),
      status,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(10, 10, 10, 0.35)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="relative h-full w-full max-w-[480px] overflow-y-auto fade-in"
        style={{
          background: 'var(--paper)',
          borderLeft: '1.5px solid var(--ink)',
          boxShadow: '-6px 0 0 0 var(--ink)',
        }}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b"
          style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}
        >
          <div>
            <p className="section-kicker">{initial.id ? 'Editar agendamento' : 'Novo agendamento'}</p>
            <h3
              className="font-display mt-1"
              style={{ fontSize: 22, letterSpacing: '-0.02em' }}
            >
              {initial.id ? 'Ajuste os detalhes.' : (
                <>
                  Agende um{' '}
                  <span style={{ fontStyle: 'italic', color: 'var(--accent)' }}>post novo.</span>
                </>
              )}
            </h3>
          </div>
          <button
            className="brand-btn icon outline"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-6 flex flex-col gap-5">
          {/* Carousel preview */}
          {kind === 'carousel' && initial.carousel_id && (
            <div>
              <label className="section-kicker block mb-2">Prévia do carrossel</label>
              <CarouselPreview carouselId={initial.carousel_id} />
            </div>
          )}

          {/* Title */}
          <div>
            <label className="section-kicker block mb-2">Título</label>
            <input
              className="brand-input"
              placeholder="Ex. Thread sobre MVPs em 48h"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Datetime */}
          <div>
            <label className="section-kicker block mb-2">Quando publicar</label>
            <input
              type="datetime-local"
              className="brand-input"
              value={whenLocal}
              onChange={(e) => setWhenLocal(e.target.value)}
            />
          </div>

          {/* Note */}
          <div>
            <label className="section-kicker block mb-2">Anotações</label>
            <textarea
              className="brand-textarea"
              placeholder="Links de referência, pauta, hooks, legenda pronta…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* Status */}
          <div>
            <label className="section-kicker block mb-2">Status</label>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(STATUS_META) as [Status, typeof STATUS_META[Status]][]).map(([s, meta]) => {
                const active = status === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={cn('chip', active && 'filled')}
                    style={
                      !active
                        ? { borderColor: 'var(--line-strong)', color: 'var(--ink)' }
                        : undefined
                    }
                    type="button"
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot }} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="sticky bottom-0 z-10 flex items-center justify-between gap-3 px-6 py-4 border-t"
          style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}
        >
          {onDelete ? (
            <button
              className="brand-btn outline"
              onClick={onDelete}
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
              type="button"
            >
              <Trash2 className="w-4 h-4" />
              <span>Remover</span>
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button className="brand-btn ghost" onClick={onClose} type="button">
              Cancelar
            </button>
            <button
              className="brand-btn primary"
              onClick={submit}
              disabled={!canSave || saving}
              type="button"
            >
              <Check className="w-4 h-4" />
              <span>{initial.id ? 'Salvar' : 'Agendar'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Small bits ──────────────────────────────────────── */

function LegendDot({ color, label, border }: { color: string; label: string; border?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="w-2.5 h-2.5 rounded-[3px]"
        style={{
          background: color,
          border: border ? '1px solid var(--line-strong)' : 'none',
        }}
      />
      <span>{label}</span>
    </span>
  );
}
