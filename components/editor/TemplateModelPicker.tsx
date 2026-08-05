'use client';

import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { GlobalSettings, Slide } from '@/types';

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
 * 🔸 Esta é a versão genérica, escrita para o Template 2 e desenhada para servir
 * os dois. O `Template01ModelPicker` continua existindo separado porque migrá-lo
 * agora mexeria no Template 1, que está fechado — a troca é de poucas linhas e é
 * decisão do Orquestrador, não desta fatia.
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
  globalSettings: GlobalSettings;
  baseSlide: Slide;
  /** Slots com que o slide daquele modelo nasce (lorem + herdados do deck). */
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
  globalSettings,
  baseSlide,
  slotsForModel,
  renderPreview,
  onPick,
  onClose,
  testIdPrefix,
}: TemplateModelPickerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
            return (
              <button
                key={model}
                onClick={() => onPick({ templateSlots, templateModel: model })}
                className={
                  'group relative flex flex-col items-center gap-2 rounded-xl p-2 ring-1 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
                  (isSuggested
                    ? 'ring-blue-500 ring-2'
                    : 'ring-black/10 dark:ring-white/10 hover:ring-blue-500')
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
      </div>
    </div>
  );
}
