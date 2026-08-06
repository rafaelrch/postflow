'use client';

import { GlobalSettings, Slide } from '@/types';
import {
  TEMPLATE_01_HEIGHT,
  TEMPLATE_01_MODELS,
  TEMPLATE_01_WIDTH,
  template01NewSlideSlots,
} from '@/lib/templates/template-01';
import Template01Slide from '@/components/slides/Template01Slide';
import TemplateModelPicker from './TemplateModelPicker';

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
  /** Compatibilidade antiga; slides novos usam LOREM IPSUM/@LOREMIPSUM. */
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
  return (
    <TemplateModelPicker
      models={TEMPLATE_01_MODELS}
      labels={MODEL_LABELS}
      title="Escolha o modelo do slide"
      subtitle="Os 6 modelos do Template 1. Pode repetir o mesmo quantas vezes quiser — o slide nasce com texto de exemplo para você substituir."
      canvas={{ width: TEMPLATE_01_WIDTH, height: TEMPLATE_01_HEIGHT }}
      baseSlide={baseSlide}
      slotsForModel={(model) => template01NewSlideSlots(model, inheritedCorners)}
      renderPreview={(slide, model) => (
        <Template01Slide
          slide={slide}
          globalSettings={globalSettings}
          slideIndex={model - 1}
          totalSlides={TEMPLATE_01_MODELS.length}
        />
      )}
      onPick={onPick}
      onClose={onClose}
      testIdPrefix="t01-model"
    />
  );
}
