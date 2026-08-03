'use client';

import { useRef } from 'react';
import { Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useEditorStore } from '@/hooks/useEditorStore';
import { uploadImageFile } from '@/lib/upload-image';
import { cn } from '@/lib/utils';
import Section from './Section';
import { template01SlotsForSlide, template01Measure } from '@/lib/templates/template-01';

/**
 * Editor de slots do TEMPLATE 1.
 *
 * A forma é imutável — não há controle de fonte, cor ou posição aqui de
 * propósito. O que existe é texto e imagem, mais os limites de linha/caractere
 * do spec: estourar não deixa "apertado", empurra o elemento de baixo e quebra
 * a composição.
 */

const labelCls =
  'text-[9px] font-semibold text-gray-900/40 dark:text-white/35 uppercase tracking-[0.08em]';
const inputCls =
  'w-full px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-black/[0.07] dark:border-white/[0.07] text-gray-900 dark:text-white text-[11px] placeholder-black/20 dark:placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-black/[0.06] dark:focus:ring-white/[0.06] focus:border-black/20 dark:focus:border-white/20 transition-all';

export default function Template01Slots() {
  const { slides, activeSlideIndex, updateActiveSlide, updateSlide, globalSettings, updateCornersConfig } =
    useEditorStore();
  const slide = slides[activeSlideIndex];
  const cornersShow = globalSettings.corners?.show !== false;
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingSlot = useRef<string | null>(null);

  if (!slide) return null;

  const slots = slide.templateSlots ?? {};
  // O spec é 1-indexado; o editor, 0.
  const descriptors = template01SlotsForSlide(activeSlideIndex + 1);

  const setSlot = (slot: string, value: string) => {
    // Os cantos são os mesmos em todos os slides que os exibem — editar em um
    // e ver o outro divergir seria um bug, não uma liberdade.
    if (slot.startsWith('cantos.')) {
      slides.forEach((s, i) =>
        updateSlide(i, { templateSlots: { ...(s.templateSlots ?? {}), [slot]: value } })
      );
      return;
    }
    updateActiveSlide({ templateSlots: { ...slots, [slot]: value } });
  };

  const pickImage = (slot: string) => {
    pendingSlot.current = slot;
    fileRef.current?.click();
  };

  const onFile = async (file: File) => {
    const slot = pendingSlot.current;
    if (!slot) return;
    const toastId = toast.loading('Enviando imagem…');
    try {
      const url = await uploadImageFile(file, 'slide-images');
      setSlot(slot, url);
      toast.success('Imagem adicionada', { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha no upload', { id: toastId });
    }
  };

  const textSlots = descriptors.filter((d) => d.kind === 'text' && !d.slot.startsWith('cantos.'));
  const imageSlots = descriptors.filter((d) => d.kind === 'image');
  const cornerSlots = descriptors.filter((d) => d.slot.startsWith('cantos.'));

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />

      <div className="px-4 py-3 border-b border-black/[0.05] dark:border-white/[0.05]">
        <p className="text-[10px] leading-relaxed text-gray-900/45 dark:text-white/40">
          <span className="font-semibold text-gray-900/70 dark:text-white/70">Template 1</span> — a
          forma é fixa (posição, cor e tipografia vêm do Figma). Você edita texto e imagem. Se não
          couber, encurte o texto.
        </p>
      </div>

      {imageSlots.length > 0 && (
        <Section title="Imagem" defaultOpen>
          {imageSlots.map((d) => {
            const url = slots[d.slot] || '';
            return (
              <div key={d.slot} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className={labelCls}>{d.label}</span>
                  {url && (
                    <button
                      onClick={() => setSlot(d.slot, '')}
                      className="text-gray-900/30 dark:text-white/30 hover:text-red-500 transition-colors"
                      title="Remover imagem"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => pickImage(d.slot)}
                  className="w-full h-20 rounded-xl border border-dashed border-black/10 dark:border-white/10 flex items-center justify-center gap-2 text-[10px] text-gray-900/40 dark:text-white/40 hover:border-black/30 dark:hover:border-white/30 transition-colors overflow-hidden bg-cover bg-center"
                  style={url ? { backgroundImage: `url('${url}')` } : undefined}
                >
                  {!url && (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      Enviar imagem
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </Section>
      )}

      <Section title={`Texto — Slide ${activeSlideIndex + 1}`} defaultOpen>
        {textSlots.map((d) => {
          const value = slots[d.slot] ?? d.defaultValue;
          const m = template01Measure(value, d);
          // Texto de fábrica não é acusado — ver template01Overflows.
          const o = { ...m, over: m.over && value !== d.defaultValue };
          return (
            <div key={d.slot} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className={labelCls}>{d.label}</span>
                <span
                  className={cn(
                    'text-[9px] tabular-nums',
                    o.over ? 'text-red-500 font-semibold' : 'text-gray-900/25 dark:text-white/25'
                  )}
                >
                  {o.charBudget != null
                    ? `${o.chars}/${o.charBudget} car.`
                    : [
                        d.maxLines != null && `${o.lines}/${d.maxLines} linhas`,
                        d.maxCharsPerLine != null && `${o.longestLine}/${d.maxCharsPerLine} car.`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </span>
              </div>
              {/* Campo folgado de propósito: editar aqui é apagar, trocar e
                  acrescentar, e a caixa apertada de antes escondia o que já
                  estava escrito. Nunca menos de 4 linhas, sempre 2 de sobra
                  além do que o texto ocupa, e o usuário ainda pode arrastar. */}
              <textarea
                value={value}
                onChange={(e) => setSlot(d.slot, e.target.value)}
                rows={Math.min(Math.max(o.lines + 2, 4), 12)}
                className={cn(inputCls, 'resize-y leading-relaxed', o.over && 'border-red-500/60')}
              />
              {o.over && (
                <p className="text-[9px] text-red-500">
                  Estourou o limite do slot — o texto vai empurrar o elemento de baixo.
                </p>
              )}
            </div>
          );
        })}
      </Section>

      {cornerSlots.length > 0 && (
        <Section title="Cantos">
          <p className="text-[9px] text-gray-900/30 dark:text-white/30 -mt-1">
            Valem para o deck inteiro.
          </p>
          {/* UM liga/desliga para os DOIS cantos: eles são uma linha só do
              desenho — exibir um sem o outro deixa a composição torta. */}
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => updateCornersConfig({ show: !cornersShow })}
              className={cn(
                'w-8 h-4 rounded-full relative transition-colors',
                cornersShow ? 'bg-blue-500' : 'bg-black/10 dark:bg-white/10'
              )}
            >
              <div
                className={cn(
                  'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all',
                  cornersShow ? 'left-[18px]' : 'left-0.5'
                )}
              />
            </div>
            <span className="text-[10px] text-gray-900/50 dark:text-white/50">Exibir cantos</span>
          </label>
          {cornersShow &&
            cornerSlots.map((d) => (
              <div key={d.slot} className="space-y-1">
                <span className={labelCls}>{d.label}</span>
                <input
                  value={slots[d.slot] ?? d.defaultValue}
                  onChange={(e) => setSlot(d.slot, e.target.value)}
                  className={inputCls}
                />
              </div>
            ))}
        </Section>
      )}
    </>
  );
}
