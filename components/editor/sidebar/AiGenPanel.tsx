'use client';

import { useRef, useState } from 'react';
import { Sparkles, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadImageFile } from '@/lib/upload-image';
import { cn } from '@/lib/utils';
import ImageThumb from './ImageThumb';
import { inputCls, labelCls } from './tokens';

/**
 * Geração de imagem por IA: referência opcional, prompt livre, conteúdo do
 * slide em leitura e o botão.
 *
 * ⚠️ O prompt e a referência são estado LOCAL. Quem usa precisa passar
 * `key={...activeSlideIndex}` para o painel remontar ao trocar de slide —
 * senão o prompt escrito para o slide 1 continua na tela no slide 2 e o
 * usuário gera a imagem errada achando que escreveu de novo.
 */
export default function AiGenPanel({
  buttonLabel,
  generating,
  slideTitle,
  slideDescription,
  onGenerate,
}: {
  buttonLabel: string;
  generating: boolean;
  slideTitle: string;
  slideDescription: string;
  onGenerate: (opts: { userPrompt?: string; referenceImageUrl?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [refUrl, setRefUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    const toastId = toast.loading('Enviando referência…');
    try {
      setRefUrl(await uploadImageFile(file, 'reference-images'));
      toast.success('Referência adicionada', { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha no upload', { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const slideContent = [slideTitle, slideDescription].filter(Boolean).join('\n\n');

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-opacity',
          open
            ? 'border border-[var(--line-strong)] text-[var(--ink-2)]'
            : 'bg-[var(--ink)] text-[var(--paper)] hover:opacity-90'
        )}
      >
        <Sparkles className="w-3.5 h-3.5" />
        {buttonLabel}
      </button>

      {open && (
        <div className="flex flex-col gap-2 p-2.5 rounded-xl border border-[var(--line)] bg-black/[0.02] dark:bg-white/[0.02]">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          <span className={labelCls}>Imagem de referência (opcional)</span>
          {refUrl ? (
            <ImageThumb url={refUrl} onRemove={() => setRefUrl('')} />
          ) : (
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-[var(--line-strong)] rounded-lg p-3 text-center cursor-pointer hover:border-[var(--ink)] transition-all"
            >
              <Upload className="w-3.5 h-3.5 mx-auto mb-1 text-[var(--ink-muted)]" />
              <span className="text-[11px] text-[var(--ink-muted)] font-medium">
                {uploading ? 'Enviando…' : 'Clique para anexar referência'}
              </span>
            </div>
          )}

          <span className={labelCls}>Prompt</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Descreva a imagem que você quer gerar…"
            className={cn(inputCls, 'resize-none')}
            style={{ minHeight: 64 }}
          />

          <span className={labelCls}>Conteúdo do slide</span>
          <textarea
            readOnly
            value={slideContent}
            className={cn(inputCls, 'resize-none opacity-60 cursor-default')}
            style={{ minHeight: 48 }}
          />

          <button
            onClick={() =>
              onGenerate({
                userPrompt: prompt.trim() || undefined,
                referenceImageUrl: refUrl || undefined,
              })
            }
            disabled={generating || uploading}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[var(--ink)] text-[var(--paper)] text-[11px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {generating ? 'Gerando…' : 'Gerar'}
          </button>
        </div>
      )}
    </div>
  );
}
