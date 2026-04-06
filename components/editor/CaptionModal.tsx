'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, RefreshCw, Check } from 'lucide-react';
import { useEditorStore } from '@/hooks/useEditorStore';
import toast from 'react-hot-toast';

interface CaptionModalProps {
  onClose: () => void;
}

export default function CaptionModal({ onClose }: CaptionModalProps) {
  const { slides, style, caption, hashtags, setCaption, setHashtags } = useEditorStore();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/generate-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides, style }),
      });
      const data = await res.json();
      setCaption(data.caption || '');
      setHashtags(data.hashtags || []);
    } catch {
      toast.error('Erro ao gerar legenda');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAll = async () => {
    const text = `${caption}\n\n${hashtags.join(' ')}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copiado!');
  };

  const content = (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-[var(--surface)] border border-black/10 dark:border-white/10 rounded-2xl w-full max-w-lg flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/8 dark:border-white/8">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Legenda para Instagram</h2>
          <button onClick={onClose} className="text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {!caption && !loading && (
            <div className="text-center py-6">
              <p className="text-gray-900/40 dark:text-white/40 text-sm mb-4">Gere uma legenda com base no conteúdo dos seus slides.</p>
              <button
                onClick={generate}
                className="px-6 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-bold hover:bg-gray-900/90 dark:hover:bg-white/90 transition-colors"
              >
                Gerar legenda com IA
              </button>
            </div>
          )}

          {loading && (
            <div className="text-center py-6">
              <div className="w-6 h-6 border-2 border-black/20 dark:border-white/20 border-t-gray-900 dark:border-t-white rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-900/40 dark:text-white/40 text-sm">Gerando legenda...</p>
            </div>
          )}

          {caption && !loading && (
            <>
              <div>
                <p className="text-[10px] text-gray-900/40 dark:text-white/40 uppercase tracking-wider mb-2">Legenda</p>
                <textarea
                  className="w-full h-40 px-3 py-2.5 rounded-lg bg-[var(--surface-elevated)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm resize-none focus:outline-none focus:border-black/30 dark:focus:border-white/30"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
              </div>

              {hashtags.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-900/40 dark:text-white/40 uppercase tracking-wider mb-2">Hashtags</p>
                  <p className="text-sm text-blue-500 dark:text-blue-400 leading-relaxed">{hashtags.join(' ')}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCopyAll}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-bold hover:bg-gray-900/90 dark:hover:bg-white/90 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copiado!' : 'Copiar tudo'}
                </button>
                <button
                  onClick={generate}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-black/20 dark:border-white/20 text-gray-900 dark:text-white text-sm hover:border-black/40 dark:hover:border-white/40 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Regenerar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof window === 'undefined') return null;
  return createPortal(content, document.body);
}
