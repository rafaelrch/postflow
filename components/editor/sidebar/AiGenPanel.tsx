'use client';

import { useRef, useState } from 'react';
import { Sparkles, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import type { GenerateOptions } from '@/hooks/useGenerateCarouselImages';
import { uploadImageFile } from '@/lib/upload-image';
import { cn } from '@/lib/utils';
import ImageThumb from './ImageThumb';
import { helpCls, inputCls, labelCls } from './tokens';

/**
 * Geração de imagem por IA: referência opcional, prompt livre, conteúdo do
 * slide em leitura e o botão.
 *
 * ⚠️ O prompt e a referência são estado LOCAL. Quem usa precisa passar
 * `key={...activeSlideIndex}` para o painel remontar ao trocar de slide —
 * senão o prompt escrito para o slide 1 continua na tela no slide 2 e o
 * usuário gera a imagem errada achando que escreveu de novo.
 *
 * O disparo em LOTE mora aqui dentro. Antes era um botão solto fora do painel:
 * existia só em dois dos quatro ramos de imagem e, por ficar de fora, ignorava
 * o prompt e a referência que o usuário acabara de escrever. Depois virou um
 * segundo botão aqui dentro, e agora é uma ESCOLHA — "este slide" ou "todos os
 * slides" — com um botão só. Dois botões de disparo lado a lado faziam o
 * usuário ler duas vezes para decidir; o seletor pergunta uma coisa de cada
 * vez. A direção escrita no painel vale igual nos dois escopos.
 */
/** Corta o texto numa linha curta, com reticências, para a lista do lote. */
function resume(text: string, max = 42): string {
  const limpo = text.replace(/\s+/g, ' ').trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1).trimEnd()}…` : limpo;
}

export default function AiGenPanel({
  buttonLabel,
  generating,
  slideTitle,
  slideDescription,
  onGenerate,
  onGenerateAll,
  batchContents,
}: {
  buttonLabel: string;
  generating: boolean;
  slideTitle: string;
  slideDescription: string;
  onGenerate: (opts: GenerateOptions) => void;
  /** Ausente = este painel não gera em lote (a capa do Editorial gera só a capa). */
  onGenerateAll?: (opts: GenerateOptions) => void;
  /**
   * Os slides que o lote vai atingir, JÁ RESOLVIDOS por `batchTargets`.
   *
   * O painel só desenha: quem entra no lote é pergunta do hook, e recalcular
   * aqui abriria a terceira verdade sobre isso. A contagem do rótulo sai desta
   * mesma lista.
   */
  batchContents?: { index: number; text: string }[];
}) {
  const [open, setOpen] = useState(false);
  // Sem `onGenerateAll` não há escolha a fazer: o escopo é sempre este slide.
  const [scope, setScope] = useState<'one' | 'all'>('one');
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

  // Uma linha por slide do lote: "3. Título do slide". O campo tem que dizer o
  // que a geração faz de verdade — cada imagem usa o texto do PRÓPRIO slide.
  // Corta com reticências: a linha é uma pista de QUAL slide é, não o texto
  // inteiro dele, e uma textarea não sabe cortar linha por linha sozinha.
  const batchContent = (batchContents ?? [])
    .map(({ index, text }) => `${index + 1}. ${resume(text)}`)
    .join('\n');

  const batchAvailable = !!onGenerateAll;
  const generatingAll = batchAvailable && scope === 'all';
  const allCount = batchContents?.length ?? 0;
  // "restantes", não "seguintes": o lote INCLUI o slide atual, e "seguintes"
  // leria como "os que vêm depois deste" — outro número. E o último slide do
  // deck cai em N = 1, onde "1 slides" ficaria feio.
  const batchLabel =
    allCount === 1 ? 'Gerar no slide restante' : `Gerar nos ${allCount} slides restantes`;

  /** A direção escrita no painel — a MESMA nos dois escopos. */
  const currentOptions = (): GenerateOptions => ({
    userPrompt: prompt.trim() || undefined,
    referenceImageUrl: refUrl || undefined,
  });

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

          <span className={labelCls}>
            {generatingAll ? 'Conteúdo de cada slide' : 'Conteúdo do slide'}
          </span>
          <textarea
            readOnly
            // `wrap="off"` no lote para uma linha ser um slide: com quebra
            // automática um título longo viraria duas e a contagem visual
            // deixaria de bater com a lista.
            wrap={generatingAll ? 'off' : undefined}
            value={generatingAll ? batchContent : slideContent}
            className={cn(inputCls, 'resize-none opacity-60 cursor-default overflow-auto')}
            style={{ minHeight: 48, maxHeight: 48 }}
          />
          {generatingAll && (
            <span className={helpCls}>
              Cada imagem usa o texto do próprio slide. O prompt e a referência acima valem
              para todos.
            </span>
          )}

          {batchAvailable && (
            <div>
              <span className={cn(labelCls, 'block mb-1.5')}>Gerar para</span>
              <div className="grid grid-cols-2 gap-1">
                {([['one', 'Este slide'], ['all', 'Deste em diante']] as const).map(([id, rotulo]) => (
                  <button
                    key={id}
                    onClick={() => setScope(id)}
                    aria-pressed={scope === id}
                    className={cn(
                      'h-7 rounded text-[10px] transition-colors border',
                      scope === id
                        ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)] shadow-sm'
                        : 'bg-[var(--paper)] text-[var(--ink-muted)] border-[var(--line)] hover:border-[var(--ink)]'
                    )}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() =>
              generatingAll ? onGenerateAll!(currentOptions()) : onGenerate(currentOptions())
            }
            disabled={generating || uploading}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[var(--ink)] text-[var(--paper)] text-[11px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {generating ? 'Gerando…' : generatingAll ? batchLabel : 'Gerar'}
          </button>
        </div>
      )}
    </div>
  );
}
