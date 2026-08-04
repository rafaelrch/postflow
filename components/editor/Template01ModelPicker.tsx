'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { GlobalSettings, Slide } from '@/types';
import {
  TEMPLATE_01_HEIGHT,
  TEMPLATE_01_MODELS,
  TEMPLATE_01_WIDTH,
  template01NewSlideSlots,
} from '@/lib/templates/template-01';
import Template01Slide from '@/components/slides/Template01Slide';

/**
 * Popup de escolha do MODELO ao adicionar um slide no TEMPLATE 1.
 *
 * Antes o "Adicionar" criava um slide genérico, e como o desenho saía da
 * POSIÇÃO, todo slide além do sexto caía no clamp e nascia com o modelo 6
 * inteiro — seta, cantos e a copy de fábrica do Figma junto. Agora o usuário
 * escolhe, e a escolha vira `templateModel`.
 *
 * O preview é o PRÓPRIO `Template01Slide` em miniatura, não uma imagem
 * estática: é a única forma de o que se vê aqui nunca divergir do que o editor
 * desenha depois. Ele é renderizado com o mesmo conteúdo lorem que o slide vai
 * nascer tendo, então a miniatura é literalmente o resultado.
 */

const PREVIEW_W = 168;
const PREVIEW_SCALE = PREVIEW_W / TEMPLATE_01_WIDTH;

/** Nomes de interface. A identidade continua sendo o número do modelo. */
const MODEL_LABELS: Record<number, string> = {
  1: 'Capa',
  2: 'Texto sobre foto',
  3: 'Foto com remate',
  4: 'Foto e corpo',
  5: 'Duas faixas',
  6: 'Fecho',
};

interface Template01ModelPickerProps {
  globalSettings: GlobalSettings;
  /** Cantos do deck (marca e @): o slide novo herda, nunca inventa. */
  inheritedCorners?: Record<string, string>;
  baseSlide: Slide;
  onPick: (patch: Partial<Slide>) => void;
  onClose: () => void;
}

export default function Template01ModelPicker({
  globalSettings,
  inheritedCorners,
  baseSlide,
  onPick,
  onClose,
}: Template01ModelPickerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Escolha o modelo do slide
            </h2>
            <p className="mt-0.5 text-[11px] text-gray-900/45 dark:text-white/40">
              Os 6 modelos do Template 1. Pode repetir o mesmo quantas vezes quiser — o slide
              nasce com texto de exemplo para você substituir.
            </p>
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
          {TEMPLATE_01_MODELS.map((model) => {
            const templateSlots = template01NewSlideSlots(model, inheritedCorners);
            // O preview roda o componente real. `slideIndex` é irrelevante aqui:
            // com `templateModel` presente, o modelo manda.
            const previewSlide: Slide = { ...baseSlide, templateSlots, templateModel: model };
            return (
              <button
                key={model}
                onClick={() => onPick({ templateSlots, templateModel: model })}
                className="group flex flex-col items-center gap-2 rounded-xl p-2 ring-1 ring-black/10 dark:ring-white/10 hover:ring-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              >
                <div
                  data-testid={`t01-model-preview-${model}`}
                  className="overflow-hidden rounded-md ring-1 ring-black/5 dark:ring-white/5"
                  style={{ width: PREVIEW_W, height: Math.round(TEMPLATE_01_HEIGHT * PREVIEW_SCALE) }}
                >
                  <div
                    style={{
                      width: TEMPLATE_01_WIDTH,
                      height: TEMPLATE_01_HEIGHT,
                      transform: `scale(${PREVIEW_SCALE})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    <Template01Slide
                      slide={previewSlide}
                      globalSettings={globalSettings}
                      slideIndex={model - 1}
                      totalSlides={TEMPLATE_01_MODELS.length}
                    />
                  </div>
                </div>
                <span className="text-[10px] font-medium text-gray-900/60 dark:text-white/55 group-hover:text-gray-900 dark:group-hover:text-white">
                  {model}. {MODEL_LABELS[model] ?? `Modelo ${model}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
