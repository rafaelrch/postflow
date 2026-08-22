// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render as rtlRender, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import Template01Slide from '@/components/slides/Template01Slide';
import {
  TEMPLATE_01_MODELS,
  TEMPLATE_01_SLIDE_COUNT,
  template01SlotsForSlide,
} from '@/lib/templates/template-01';
import { mapDbSlideToSlide } from '@/lib/slide-mapper';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide } from '@/types';

/**
 * TEMPLATE 1 × WIZARD — o modelo tem de ir para o BANCO.
 *
 * O wizard escrevia duas listas à mão, lado a lado: `editorSlides` (que vai
 * para a tela, com `templateModel`) e `slidesPayload` (que vai para o banco,
 * SEM `template_model`). O deck do Manifesto saía certo na tela e, ao ser
 * fechado e reaberto, voltava a tirar o desenho da POSIÇÃO pelo fallback de
 * compatibilidade — reordenar um slide trocava o desenho dele, sem erro nem
 * aviso. O T2 já gravava a coluna; o T1, não.
 *
 * 🔴 A COLUNA TEM CHECK NO BANCO: `template_model between 1 and 6`. O valor
 * gravado tem de sair da MESMA regra do render (TEMPLATE_01_MODELS), nunca de
 * um `i + 1` cru — um valor fora da faixa derruba o INSERT dos slides inteiro
 * e o usuário perde o carrossel.
 */

const { inserts, loadCarousel, mockGetUser } = vi.hoisted(() => ({
  inserts: [] as { table: string; payload: unknown }[],
  loadCarousel: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({
  default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn() }));
vi.mock('@/hooks/useEditorStore', () => ({ useEditorStore: () => ({ loadCarousel }) }));
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser, getSession: async () => ({ data: { session: null } }) },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
      insert: (payload: unknown) => {
        inserts.push({ table, payload });
        return {
          select: () => ({
            single: async () => ({ data: { id: 'carousel-1', title: 'Novo Carrossel' }, error: null }),
          }),
        };
      },
      delete: () => ({ eq: async () => ({}) }),
    }),
  }),
}));

import CreateWizard from '@/components/editor/CreateWizard';

beforeEach(() => {
  inserts.length = 0;
  loadCarousel.mockClear();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function primario() {
  return screen.queryByText('Continuar') ?? screen.getByText('Gerar');
}

/** Gera um deck do Manifesto pelo modo manual (sem crédito, sem rede). */
async function geraDeckDoManifesto() {
  rtlRender(<CreateWizard onClose={vi.fn()} />);
  fireEvent.click(primario());               // 1 formato → 2 template
  fireEvent.click(screen.getByText('Manifesto'));
  fireEvent.click(primario());               // 2 template → 3 conteúdo
  fireEvent.change(screen.getByDisplayValue('Criar com IA'), { target: { value: 'manual' } });
  fireEvent.click(screen.getByText('Gerar'));
  await waitFor(() => expect(loadCarousel).toHaveBeenCalled());

  const linhas = (inserts.find((i) => i.table === 'slides')?.payload ?? []) as Record<string, unknown>[];
  const tela = (loadCarousel.mock.calls[0][0] as { slides: Record<string, unknown>[] }).slides;
  return { linhas, tela };
}

describe('TEMPLATE 1 no wizard — o modelo vai para o banco', () => {
  it('🔴 a linha do banco leva `template_model`, casando com a tela na mesma posição', async () => {
    const { linhas, tela } = await geraDeckDoManifesto();

    expect(linhas).toHaveLength(TEMPLATE_01_SLIDE_COUNT);
    expect(tela).toHaveLength(TEMPLATE_01_SLIDE_COUNT);
    linhas.forEach((linha, i) => {
      expect(linha.template_model, `slide ${i} sem template_model no banco`)
        .toBe(tela[i].templateModel);
    });
  });

  it('🔴 nenhum valor fora de 1..6 chega ao payload — o CHECK do banco não perdoa', async () => {
    const { linhas, tela } = await geraDeckDoManifesto();

    for (const linha of linhas) {
      expect(TEMPLATE_01_MODELS).toContain(linha.template_model);
    }
    // A tela usa a mesma regra: as duas listas dizem a mesma coisa.
    for (const slide of tela) {
      expect(TEMPLATE_01_MODELS).toContain(slide.templateModel);
    }
  });

  it('o deck nasce com um modelo por slide, na ordem do spec', async () => {
    const { linhas } = await geraDeckDoManifesto();
    expect(linhas.map((l) => l.template_model)).toEqual(TEMPLATE_01_MODELS);
  });
});

// ─── Reabrir ────────────────────────────────────────────────────

function desenha(slide: Partial<Slide>, position: number, total = TEMPLATE_01_SLIDE_COUNT) {
  const full = {
    ...DEFAULT_SLIDE,
    id: `s${position}`,
    position,
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
    ...slide,
  } as Slide;
  return renderToStaticMarkup(
    <Template01Slide
      slide={full}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      slideIndex={position}
      totalSlides={total}
    />
  );
}

/** Os slots de texto exclusivos do modelo — a assinatura do desenho. */
function slotsDoModelo(model: number): string[] {
  return template01SlotsForSlide(model)
    .filter((d) => d.kind === 'text' && !d.slot.startsWith('cantos.'))
    .map((d) => d.slot);
}

/** Reabre uma linha do banco como o editor faz, e desenha. */
function reabre(row: Record<string, unknown>, position: number, total: number) {
  return desenha(mapDbSlideToSlide({ id: `s${position}`, position, ...row }), position, total);
}

describe('TEMPLATE 1 — reabrir o deck salvo', () => {
  it('deck com os modelos FORA DA ORDEM reabre com o desenho de cada modelo', () => {
    const salvo = [3, 1, 5];
    salvo.forEach((model, position) => {
      const html = reabre({ template_model: model }, position, salvo.length);
      for (const slot of slotsDoModelo(model)) expect(html).toContain(`data-slot="${slot}"`);
      for (const outro of TEMPLATE_01_MODELS) {
        if (outro === model) continue;
        for (const slot of slotsDoModelo(outro)) {
          if (slotsDoModelo(model).includes(slot)) continue;
          expect(html).not.toContain(`data-slot="${slot}"`);
        }
      }
    });
  });

  it('reordenar um slide NÃO troca o desenho dele', () => {
    // O mesmo slide (modelo 5) salvo na posição 2 e depois arrastado para a 0.
    const antes = reabre({ template_model: 5 }, 2, 3);
    const depois = reabre({ template_model: 5 }, 0, 3);
    expect(depois).toBe(antes);
  });

  it('🔴 deck ANTIGO, sem `template_model`, reabre pela POSIÇÃO — byte a byte igual', () => {
    // A compatibilidade documentada em template-01/index.ts não se reabre: um
    // carrossel salvo antes da coluna existir tem de continuar idêntico.
    for (let i = 0; i < TEMPLATE_01_SLIDE_COUNT; i++) {
      const antigo = reabre({}, i, TEMPLATE_01_SLIDE_COUNT);
      const novo = reabre({ template_model: TEMPLATE_01_MODELS[i] }, i, TEMPLATE_01_SLIDE_COUNT);
      expect(antigo, `slide ${i} mudou de desenho ao reabrir`).toBe(novo);
    }
  });
});
