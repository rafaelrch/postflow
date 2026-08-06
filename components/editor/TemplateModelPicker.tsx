'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Slide } from '@/types';

/**
 * Popup de escolha do MODELO ao adicionar um slide num template de forma fixa.
 *
 * Antes o "Adicionar" criava um slide genérico, e como o desenho saía da
 * POSIÇÃO, todo slide além do último modelo caía no clamp e nascia com a copy de
 * fábrica junto. Agora o usuário escolhe, e a escolha vira `templateModel`.
 *
 * O preview é o PRÓPRIO componente do template em miniatura, não uma imagem
 * estática: é a única forma de o que se vê aqui nunca divergir do que o editor
 * desenha depois. Ele é renderizado com o mesmo conteúdo que o slide vai nascer
 * tendo, então a miniatura é literalmente o resultado.
 *
 * Esta é a versão compartilhada pelos Templates 1 e 2. Clicar numa miniatura só
 * seleciona; a criação acontece no botão "Adicionar card".
 */

const PREVIEW_W = 168;

export interface TemplateModelPickerProps {
  models: number[];
  /** Nome de interface de cada modelo. A identidade continua sendo o número. */
  labels: Record<number, string>;
  /** Modelo que CONTINUA a sequência do deck — ganha o selo "sugerido". */
  suggested?: number;
  title: string;
  subtitle: string;
  canvas: { width: number; height: number };
  baseSlide: Slide;
  /** Slots com que o slide daquele modelo nasce. */
  slotsForModel: (model: number) => Record<string, string>;
  /** Miniatura do modelo: o componente real do template. */
  renderPreview: (slide: Slide, model: number) => ReactNode;
  onPick: (patch: Partial<Slide>) => void;
  onClose: () => void;
  /** Prefixo do `data-testid` das miniaturas. */
  testIdPrefix: string;
}

export default function TemplateModelPicker({
  models,
  labels,
  suggested,
  title,
  subtitle,
  canvas,
  baseSlide,
  slotsForModel,
  renderPreview,
  onPick,
  onClose,
  testIdPrefix,
}: TemplateModelPickerProps) {
  const [selectedModel, setSelectedModel] = useState<number | null>(null);

  const confirmSelection = useCallback(() => {
    if (selectedModel == null) return;
    onPick({
      templateSlots: slotsForModel(selectedModel),
      templateModel: selectedModel,
    });
  }, [onPick, selectedModel, slotsForModel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') confirmSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmSelection, onClose]);

  const scale = PREVIEW_W / canvas.width;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Escolher modelo do slide"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-full overflow-y-auto rounded-2xl bg-[var(--surface)] dark:bg-[#141414] ring-1 ring-black/10 dark:ring-white/10 shadow-2xl"
      >
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
            <p className="mt-0.5 text-[11px] text-gray-900/45 dark:text-white/40">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 rounded-md p-1 text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 px-5 pb-5 sm:grid-cols-3">
          {models.map((model) => {
            const templateSlots = slotsForModel(model);
            // O preview roda o componente real. Com `templateModel` presente, o
            // modelo manda — a posição não interessa aqui.
            const previewSlide: Slide = { ...baseSlide, templateSlots, templateModel: model };
            const isSuggested = model === suggested;
            const isSelected = model === selectedModel;
            return (
              <button
                key={model}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedModel(model)}
                className={
                  'group relative flex flex-col items-center gap-2 rounded-xl p-2 ring-1 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 active:scale-[0.98] ' +
                  (isSelected
                    ? 'ring-blue-500 ring-2 bg-blue-500/[0.06] shadow-lg shadow-blue-500/15'
                    : 'ring-black/10 dark:ring-white/10 hover:ring-blue-500 hover:shadow-md')
                }
              >
                {isSuggested && (
                  <span
                    data-testid={`${testIdPrefix}-suggested`}
                    className="absolute -top-2 right-2 rounded-full bg-blue-500 px-2 py-0.5 text-[9px] font-semibold text-white shadow-sm"
                  >
                    sugerido
                  </span>
                )}
                {isSelected && (
                  <span className="absolute -top-2 left-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white shadow-sm">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <div
                  data-testid={`${testIdPrefix}-preview-${model}`}
                  className="overflow-hidden rounded-md ring-1 ring-black/5 dark:ring-white/5"
                  style={{ width: PREVIEW_W, height: Math.round(canvas.height * scale) }}
                >
                  <div
                    style={{
                      width: canvas.width,
                      height: canvas.height,
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    {renderPreview(previewSlide, model)}
                  </div>
                </div>
                <span className="text-[10px] font-medium text-gray-900/60 dark:text-white/55 group-hover:text-gray-900 dark:group-hover:text-white">
                  {model}. {labels[model] ?? `Modelo ${model}`}
                </span>
              </button>
            );
          })}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-black/[0.07] bg-[var(--surface)] px-5 py-4 dark:border-white/[0.07] dark:bg-[#141414]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-black/10 px-4 py-2 text-xs font-medium text-gray-900/60 transition-colors hover:border-black/20 hover:text-gray-900 dark:border-white/10 dark:text-white/55 dark:hover:border-white/20 dark:hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmSelection}
            disabled={selectedModel == null}
            className="rounded-lg bg-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-blue-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35"
          >
            Adicionar card
          </button>
        </div>
      </div>
    </div>
  );
}
