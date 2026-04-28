'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, Check, Loader2 } from 'lucide-react';
import { useEditorStore } from '@/hooks/useEditorStore';
import { createClient } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface ScheduleModalProps {
  onClose: () => void;
  onSaveFirst?: () => Promise<void>;
}

function defaultWhen() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ScheduleModal({ onClose, onSaveFirst }: ScheduleModalProps) {
  const { carouselId, carouselTitle } = useEditorStore();
  const [whenLocal, setWhenLocal] = useState<string>(() => defaultWhen());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const prettyWhen = useMemo(() => {
    if (!whenLocal) return '';
    const d = new Date(whenLocal);
    return d.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [whenLocal]);

  const submit = async () => {
    if (!whenLocal) {
      toast.error('Escolha uma data e horário');
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
        scheduled_at: new Date(whenLocal).toISOString(),
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

  const content = (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-[var(--surface)] border border-black/10 dark:border-white/10 rounded-2xl w-full max-w-md flex flex-col">
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
            <input
              type="datetime-local"
              className="w-full px-3 py-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-black/30 dark:focus:border-white/30"
              value={whenLocal}
              onChange={(e) => setWhenLocal(e.target.value)}
            />
            {prettyWhen && (
              <p className="mt-2 text-[11px] capitalize text-gray-900/50 dark:text-white/50">
                {prettyWhen}
              </p>
            )}
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.14em] text-gray-900/50 dark:text-white/50 font-semibold mb-2">
              Anotação <span className="lowercase font-normal text-gray-900/40 dark:text-white/40">(opcional)</span>
            </label>
            <textarea
              rows={3}
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
            disabled={saving || !whenLocal}
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
