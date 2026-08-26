// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useEditorStore } from '@/hooks/useEditorStore';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, type Slide } from '@/types';
import { mapDbSlideToSlide, mapSlideToDbRow } from '@/lib/slide-mapper';
import { slideImageUrls } from '@/lib/export-images';
import { TEMPLATE_03_MODEL_COVER, TEMPLATE_03_MODEL_STEP } from '@/lib/templates/template-03';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  carouselPayload: null as Record<string, unknown> | null,
  slidePayload: null as Record<string, unknown>[] | null,
  carouselInsert: vi.fn(),
  carouselUpdate: vi.fn(),
  slidesDelete: vi.fn(),
  slidesInsert: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === 'slides') {
        return {
          delete: () => ({ eq: mocks.slidesDelete }),
          insert: (payload: Record<string, unknown>[]) => {
            mocks.slidePayload = payload;
            return mocks.slidesInsert(payload);
          },
        };
      }
      return {
        insert: (payload: Record<string, unknown>) => {
          mocks.carouselPayload = payload;
          return { select: () => ({ single: mocks.carouselInsert }) };
        },
        update: (payload: Record<string, unknown>) => {
          mocks.carouselPayload = payload;
          return { eq: mocks.carouselUpdate };
        },
      };
    },
  }),
}));

function Harness() {
  const { saveNow } = useAutoSave();
  return <button onClick={() => void saveNow()}>Salvar</button>;
}

function t3Slide(position: number, model: number): Slide {
  const cover = model === TEMPLATE_03_MODEL_COVER;
  return {
    ...DEFAULT_SLIDE,
    id: `t3-${position}`,
    position,
    title: cover ? 'Título antigo' : 'Passo antigo',
    description: cover ? 'Descrição antiga' : 'Corpo antigo',
    templateModel: model,
    templateSlots: cover
      ? {
          's1.title': 'Título antigo',
          's1.body': 'Descrição antiga',
          's1.image': 'https://cdn.test/capa.webp',
          's1.avatar': 'https://cdn.test/avatar.webp',
        }
      : {
          's2.title': 'Passo antigo',
          's2.body': 'Corpo antigo',
          's2.image': 'https://cdn.test/passo.webp',
          's2.avatar': 'https://cdn.test/avatar.webp',
        },
  } as Slide;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.carouselPayload = null;
  mocks.slidePayload = null;
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-t3' } }, error: null });
  mocks.carouselInsert.mockResolvedValue({ data: { id: 'carousel-t3' }, error: null });
  mocks.carouselUpdate.mockResolvedValue({ error: null });
  mocks.slidesDelete.mockResolvedValue({ error: null });
  mocks.slidesInsert.mockResolvedValue({ error: null });
  useEditorStore.setState({
    carouselId: null,
    carouselTitle: 'FlowLine salvo',
    style: 'template03',
    slides: [t3Slide(0, TEMPLATE_03_MODEL_COVER), t3Slide(1, TEMPLATE_03_MODEL_STEP)],
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
    saveStatus: 'unsaved',
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Template 3 — criar, editar, salvar, reabrir e exportar', () => {
  it('preserva style, template_model e template_slots no autosave e no reopen', async () => {
    useEditorStore.getState().updateSlide(1, {
      title: 'Passo editado',
      templateSlots: {
        ...useEditorStore.getState().slides[1].templateSlots,
        's2.title': 'Passo editado',
      },
      templateSlotStyles: {
        's2.avatar': {
          profileScale: 120,
          avatarZoom: 180,
          avatarPositionX: 20,
          avatarPositionY: 75,
        },
      },
    });

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(useEditorStore.getState().saveStatus).toBe('saved'));

    expect(mocks.carouselPayload).toMatchObject({
      style: 'template03',
      title: 'FlowLine salvo',
    });
    expect(mocks.slidePayload).toHaveLength(2);
    expect(mocks.slidePayload).toEqual(expect.arrayContaining([
      expect.objectContaining({
        template_model: TEMPLATE_03_MODEL_COVER,
        template_slots: expect.objectContaining({ 's1.title': 'Título antigo' }),
      }),
      expect.objectContaining({
        template_model: TEMPLATE_03_MODEL_STEP,
        template_slots: expect.objectContaining({
          's2.title': 'Passo editado',
          's2.image': 'https://cdn.test/passo.webp',
        }),
        template_slot_styles: expect.objectContaining({
          's2.avatar': expect.objectContaining({
            profileScale: 120,
            avatarZoom: 180,
            avatarPositionX: 20,
            avatarPositionY: 75,
          }),
        }),
      }),
    ]));

    const dbSlides = mocks.slidePayload!.map((row, i) => ({
      ...row,
      id: `db-t3-${i}`,
    }));
    const reopenedSlides = dbSlides.map((row) => mapDbSlideToSlide(row));
    useEditorStore.getState().loadCarousel({
      id: 'carousel-t3',
      title: 'FlowLine salvo',
      style: mocks.carouselPayload!.style as 'template03',
      slides: reopenedSlides,
      globalSettings: DEFAULT_GLOBAL_SETTINGS,
    });

    expect(useEditorStore.getState().style).toBe('template03');
    expect(useEditorStore.getState().slides.map((s) => s.templateModel)).toEqual([
      TEMPLATE_03_MODEL_COVER,
      TEMPLATE_03_MODEL_STEP,
    ]);
    expect(useEditorStore.getState().slides[1].templateSlots).toMatchObject({
      's2.title': 'Passo editado',
      's2.body': 'Corpo antigo',
    });
    expect(useEditorStore.getState().slides[1].templateSlotStyles).toMatchObject({
      's2.avatar': {
        profileScale: 120,
        avatarZoom: 180,
        avatarPositionX: 20,
        avatarPositionY: 75,
      },
    });

    expect(slideImageUrls(reopenedSlides, 'template03', DEFAULT_GLOBAL_SETTINGS)).toEqual([
      'https://cdn.test/capa.webp',
      'https://cdn.test/avatar.webp',
      'https://cdn.test/passo.webp',
    ]);
  });

  it('o mapper isolado é reversível para o contrato T3', () => {
    const original = t3Slide(1, TEMPLATE_03_MODEL_STEP);
    const row = mapSlideToDbRow(original, 'carousel-t3', 1);
    const reopened = mapDbSlideToSlide({ ...row, id: 'db-t3-1' });

    expect(reopened.templateModel).toBe(TEMPLATE_03_MODEL_STEP);
    expect(reopened.templateSlots).toEqual(original.templateSlots);
    expect(reopened.title).toBe(original.title);
  });
});
