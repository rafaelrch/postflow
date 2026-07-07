'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, Check, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEditorStore } from '@/hooks/useEditorStore';
import { createClient } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface ScheduleModalProps {
  onClose: () => void;
  onSaveFirst?: () => Promise<void>;
}

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function defaultStart() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export default function ScheduleModal({ onClose, onSaveFirst }: ScheduleModalProps) {
  const { carouselId, carouselTitle } = useEditorStore();
  const initial = useMemo(() => defaultStart(), []);
  const [selectedDay, setSelectedDay] = useState<Date>(() => startOfDay(initial));
  const [hour, setHour] = useState<number>(initial.getHours());
  const [minute, setMinute] = useState<number>(initial.getMinutes());
  const [viewMonth, setViewMonth] = useState<Date>(
    () => new Date(initial.getFullYear(), initial.getMonth(), 1),
  );
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const today = startOfDay(new Date());

  const scheduledAt = useMemo(() => {
    const d = new Date(selectedDay);
    d.setHours(hour, minute, 0, 0);
    return d;
  }, [selectedDay, hour, minute]);

  const isPast = scheduledAt.getTime() < Date.now();

  // Células do mês: nulls preenchem o offset do primeiro dia (semana começa no domingo)
  const days = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth]);

  const monthLabel = viewMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const canGoPrev = viewMonth.getTime() > new Date(today.getFullYear(), today.getMonth(), 1).getTime();

  const prettyWhen = scheduledAt.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  const submit = async () => {
    if (isPast) {
      toast.error('Escolha uma data e horário no futuro');
      return;
    }
    setSaving(true);
    try {
      if (!carouselId && onSaveFirst) await onSaveFirst();
      const currentId = useEditorStore.getState().carouselId;
      if (!currentId) {
        toast.error('Salve o carrossel antes de agendar');
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.from('scheduled_posts').insert({
        scheduled_at: scheduledAt.toISOString(),
        kind: 'carousel',
        title: carouselTitle || 'Carrossel sem título',
        note,
        status: 'planned',
        carousel_id: currentId,
      });

      if (error) {
        toast.error('Erro ao agendar');
        return;
      }
      toast.success('Agendado na agenda!');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const timeSelectCls =
    'appearance-none text-center px-2.5 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm font-medium text-gray-900 dark:text-white focus:outline-none focus:border-black/30 dark:focus:border-white/30 cursor-pointer transition-colors';

  const content = (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-[var(--surface)] border border-black/10 dark:border-white/10 rounded-2xl w-full max-w-md flex flex-col max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/8 dark:border-white/8">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-900/60 dark:text-white/60" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Agendar carrossel</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.14em] text-gray-900/50 dark:text-white/50 font-semibold mb-2">
              Título
            </label>
            <div className="px-3 py-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm text-gray-900 dark:text-white truncate">
              {carouselTitle || 'Carrossel sem título'}
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.14em] text-gray-900/50 dark:text-white/50 font-semibold mb-2">
              Quando publicar
            </label>

            {/* Calendário */}
            <div className="rounded-xl border border-black/10 dark:border-white/10 p-3.5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-900 dark:text-white capitalize pl-1">
                  {monthLabel}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                    disabled={!canGoPrev}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-900/50 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-25 disabled:pointer-events-none"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-900/50 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map((w, i) => (
                  <span
                    key={i}
                    className="h-7 flex items-center justify-center text-[10px] font-semibold uppercase text-gray-900/30 dark:text-white/30"
                  >
                    {w}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-y-0.5">
                {days.map((d, i) => {
                  if (!d) return <span key={i} />;
                  const isSelected = d.getTime() === selectedDay.getTime();
                  const isToday = d.getTime() === today.getTime();
                  const disabled = d.getTime() < today.getTime();
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedDay(d)}
                      className={cn(
                        'h-8 w-8 mx-auto rounded-full flex items-center justify-center text-[12px] transition-colors',
                        isSelected
                          ? 'bg-gray-900 dark:bg-white text-white dark:text-black font-semibold'
                          : disabled
                            ? 'text-gray-900/20 dark:text-white/20 cursor-not-allowed'
                            : 'text-gray-900/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white',
                        isToday && !isSelected && 'border border-black/20 dark:border-white/20',
                      )}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>

              {/* Horário */}
              <div className="flex items-center justify-between mt-3.5 pt-3.5 border-t border-black/8 dark:border-white/8">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-900/40 dark:text-white/40 pl-1">
                  Horário
                </span>
                <div className="flex items-center gap-1.5">
                  <select value={hour} onChange={(e) => setHour(+e.target.value)} className={timeSelectCls}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
                    ))}
                  </select>
                  <span className="text-sm font-semibold text-gray-900/40 dark:text-white/40">:</span>
                  <select value={minute} onChange={(e) => setMinute(+e.target.value)} className={timeSelectCls}>
                    {(MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort((a, b) => a - b)).map((m) => (
                      <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <p className={cn(
              'mt-2 text-[11px] capitalize',
              isPast ? 'text-red-400' : 'text-gray-900/50 dark:text-white/50',
            )}>
              {prettyWhen}{isPast ? ' — horário já passou' : ''}
            </p>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.14em] text-gray-900/50 dark:text-white/50 font-semibold mb-2">
              Anotação <span className="lowercase font-normal text-gray-900/40 dark:text-white/40">(opcional)</span>
            </label>
            <textarea
              rows={2}
              className="w-full px-3 py-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-black/30 dark:focus:border-white/30 resize-none"
              placeholder="Legenda pronta, canal, referências…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-black/8 dark:border-white/8">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-900/60 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            type="button"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving || isPast}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-bold hover:bg-gray-900/90 dark:hover:bg-white/90 transition-colors disabled:opacity-40"
            type="button"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Agendar
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}
