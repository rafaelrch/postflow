import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Template03Slide, { TEMPLATE_03_DOTS_OFFSET_Y } from '@/components/slides/Template03Slide';
import {
  imageDestination,
  imagePatch,
  imageShape,
  imageSurface,
} from '@/hooks/useGenerateCarouselImages';
import { refinableFields, slidesPayload } from '@/lib/refine-fields';
import { slideImageUrls } from '@/lib/export-images';
import {
  TEMPLATE_03_MODEL_COVER,
  TEMPLATE_03_MODEL_STEP,
  TEMPLATE_03_BADGE_ASSET,
  template03Addendum,
  template03ModelOf,
  template03SlotsForModel,
  template03TextSlotsForModel,
} from '@/lib/templates/template-03';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, type Slide } from '@/types';
import type { Template03GradientDirection } from '@/types';

const route = readFileSync('app/api/generate-carousel/route.ts', 'utf8');

function slide(position: number, templateModel: number, templateSlots: Record<string, string>): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: `s${position}`,
    position,
    title: `Título ${position}`,
    description: `Descrição ${position}`,
    templateModel,
    templateSlots,
  } as Slide;
}

describe('Template 3 — IA de imagens', () => {
  it('usa background full-bleed e superfície dark em capa e conteúdo', () => {
    const capa = slide(0, TEMPLATE_03_MODEL_COVER, {});
    const passo = slide(1, TEMPLATE_03_MODEL_STEP, {});

    expect(imageDestination(capa, 'template03', 0, 'background')).toEqual({
      kind: 'background',
      model: TEMPLATE_03_MODEL_COVER,
    });
    expect(imageDestination(passo, 'template03', 1, 'content')).toEqual({
      kind: 'background',
      model: TEMPLATE_03_MODEL_STEP,
    });
    expect(imageShape(capa, 'template03', 0, 'background')).toBe('full-bleed');
    expect(imageShape(passo, 'template03', 1, 'content')).toBe('full-bleed');
    expect(imageSurface(capa, 'template03', 0, 'background', 'light')).toBe('dark');
    expect(imageSurface(passo, 'template03', 1, 'background', 'light')).toBe('dark');
  });

  it('grava a imagem somente no slot do modelo e limpa os campos genéricos', () => {
    const capa = slide(0, TEMPLATE_03_MODEL_COVER, {});
    const passo = slide(1, TEMPLATE_03_MODEL_STEP, {});

    expect(imagePatch(capa, 'template03', 0, 'background', 'https://cdn/capa.webp')).toMatchObject({
      templateSlots: { 's1.image': 'https://cdn/capa.webp' },
      backgroundImageUrl: '',
      gridImageUrl: '',
      contentImageUrl: '',
    });
    expect(imagePatch(passo, 'template03', 1, 'background', 'https://cdn/passo.webp')).toMatchObject({
      templateSlots: { 's2.image': 'https://cdn/passo.webp' },
      backgroundImageUrl: '',
      gridImageUrl: '',
      contentImageUrl: '',
    });
  });
});

describe('Template 3 — refino de texto', () => {
  it('lista somente os slots de texto do modelo gravado', () => {
    const slots = {
      's2.title': 'Título da ideia',
      's2.body': 'Corpo do conteúdo',
      's2.image': 'https://cdn/conteudo.webp',
      's2.handle': '@flowline',
      'cantos.left': 'MARCA',
    };
    const fields = refinableFields(slide(8, TEMPLATE_03_MODEL_STEP, slots), 'template03', 8);

    expect(fields.map((field) => field.key)).toEqual(['s2.title', 's2.body']);
    expect(fields.map((field) => field.value)).toEqual(['Título da ideia', 'Corpo do conteúdo']);
  });

  it('preserva templateSlots e posição ao montar o payload de refino', () => {
    const slots = { 's1.title': 'Capa', 's1.body': 'Apoio' };
    expect(slidesPayload([slide(7, TEMPLATE_03_MODEL_COVER, slots)])).toEqual([
      {
        position: 0,
        title: 'Título 7',
        description: 'Descrição 7',
        templateSlots: slots,
      },
    ]);
  });
});

describe('Template 3 — prompt de geração e exportação', () => {
  it('addendum lê os limites dos descritores e fecha o contrato do deck aberto', () => {
    const addendum = template03Addendum();
    const cover = Object.fromEntries(
      template03TextSlotsForModel(TEMPLATE_03_MODEL_COVER).map((d) => [d.slot, d])
    );
    const step = Object.fromEntries(
      template03TextSlotsForModel(TEMPLATE_03_MODEL_STEP).map((d) => [d.slot, d])
    );

    expect(addendum).toContain('deck aberto');
    expect(addendum).toContain('slideCount');
    expect(addendum).toContain('posição 0 é a capa');
    expect(addendum).toContain('posições 1 em diante são slides de conteúdo');
    expect(addendum).toContain('Cada slide de conteúdo deve desenvolver uma ideia independente');
    expect(addendum).toContain('Não imponha sequência');
    expect(addendum).not.toContain('Passo 0X');
    expect(addendum).toContain(`${cover['s1.title'].maxLines} linhas`);
    expect(addendum).toContain(`${cover['s1.title'].maxCharsPerLine} caracteres por linha`);
    expect(addendum).toContain(`${step['s2.title'].maxLines} linhas`);
    expect(addendum).toContain(`${step['s2.title'].maxCharsPerLine} caracteres por linha`);
    expect(addendum).toContain(`${cover['s1.body'].maxCharsPerLine} caracteres por linha`);
    expect(addendum).toContain(`${step['s2.body'].maxCharsPerLine} caracteres por linha`);
    expect(addendum).not.toContain('extras');
  });

  it('a rota consome o addendum do módulo do template', () => {
    expect(route).toContain("import { template03Addendum } from '@/lib/templates/template-03';");
    expect(route).toContain("body.style === 'template03' ? template03Addendum() : ''");
  });

  it('exporta imagens de slots do modelo e ignora genéricos do Template 3', () => {
    const slots = {
      's2.title': 'https://cdn/nao-usar-title.webp',
      's2.body': 'https://cdn/nao-usar-body.webp',
      's2.image': 'https://cdn/passo.webp',
    };
    const slides = [slide(0, TEMPLATE_03_MODEL_STEP, slots)];
    slides[0].backgroundImageUrl = 'https://cdn/nao-usar.webp';
    slides[0].gridImageUrl = 'https://cdn/nao-usar-grid.webp';

    expect(slideImageUrls(slides, 'template03', DEFAULT_GLOBAL_SETTINGS)).toEqual([
      'https://cdn/passo.webp',
    ]);
  });

  it('modelo usado pelo refino segue o templateModel gravado, não a posição', () => {
    expect(template03ModelOf({ templateModel: TEMPLATE_03_MODEL_COVER }, 9)).toBe(
      TEMPLATE_03_MODEL_COVER
    );
    expect(template03SlotsForModel(TEMPLATE_03_MODEL_STEP).map((d) => d.slot)).toContain('s2.title');
  });

  it('preview e export individual/todos usam o mesmo DOM do T3', () => {
    const render = (
      forExport: boolean,
      position: number,
      direction?: Template03GradientDirection
    ) => {
      const model = position === 0 ? TEMPLATE_03_MODEL_COVER : TEMPLATE_03_MODEL_STEP;
      const source = slide(position, model, {
        [model === TEMPLATE_03_MODEL_COVER ? 's1.image' : 's2.image']:
          `https://cdn/slide-${position}.webp`,
        [model === TEMPLATE_03_MODEL_COVER ? 's1.avatar' : 's2.avatar']:
          'https://cdn/avatar.webp',
      });
      source.templateSlotStyles = {
        [model === TEMPLATE_03_MODEL_COVER ? 's1.avatar' : 's2.avatar']: {
          profileScale: 120,
          avatarZoom: 180,
          avatarPositionX: 20,
          avatarPositionY: 75,
        },
      };
      if (direction) source.templateOverrides = { overlayGradientDirection: direction };
      return renderToStaticMarkup(
        React.createElement(Template03Slide, {
          slide: source,
          globalSettings: DEFAULT_GLOBAL_SETTINGS,
          slideIndex: position,
          totalSlides: 4,
          forExport,
        })
      );
    };

    const preview = render(false, 0);
    const individual = render(true, 0);
    const allSlides = [0, 1, 2, 3].map((position) => [
      render(false, position),
      render(true, position),
    ]);
    expect(individual).toBe(preview);
    expect(allSlides.every(([previewHtml, exportHtml]) => previewHtml === exportHtml)).toBe(true);
    expect(individual).toContain('data-profile-group');
    expect(individual).toContain(`src="${TEMPLATE_03_BADGE_ASSET}"`);
    expect(individual).toContain('data-avatar-photo');
    expect(individual).toContain('object-position:20% 75%');
    expect(individual).toContain('transform:scale(1.8)');
    const dotsStyle = (html: string) => html.match(/<svg[^>]*data-dots-total="4"[^>]*style="([^"]*)/)?.[1] ?? '';
    expect(dotsStyle(individual)).toContain(`top:${1184 + TEMPLATE_03_DOTS_OFFSET_Y}px`);
    expect(dotsStyle(individual)).toBe(dotsStyle(preview));

    const directions: Array<[Template03GradientDirection, number]> = [
      // O rótulo descreve o avanço visual da camada escura (a última parada),
      // não o sentido matemático da primeira parada transparente do CSS.
      // A capa mantém 178.58° quando o override coincide com o default do spec.
      ['bottom-to-top', 178.58],
      ['top-to-bottom', 0],
      ['left-to-right', 270],
      ['right-to-left', 90],
    ];
    for (const [direction, angle] of directions) {
      const previewDirection = render(false, 0, direction);
      const exportDirection = render(true, 0, direction);
      expect(exportDirection).toBe(previewDirection);
      expect(previewDirection).toContain(`linear-gradient(${angle}deg`);
    }
  });
});
