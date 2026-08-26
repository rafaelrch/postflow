// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide, SlideStyle } from '@/types';
import {
  TEMPLATE_03_MODEL_COVER,
  TEMPLATE_03_MODEL_STEP,
  TEMPLATE_03_MODELS,
} from '@/lib/templates/template-03';

/**
 * OS QUATRO DESPACHOS DE RENDER — o buraco que o `tsc` NÃO tapa.
 *
 * Os quatro lugares que desenham um slide escolhem o componente por ternário
 * encadeado, não por `Record<SlideStyle, …>`. Esquecer um NÃO quebra a
 * compilação: o slide cai no `else` final e sai renderizado como
 * `MinimalistSlide`.
 *
 * O pior caso é o `HiddenSlides` — é a árvore oculta que a EXPORTAÇÃO captura.
 * Esquecer ali dá editor certo e PNG errado, e ninguém descobre até abrir o
 * arquivo exportado.
 *
 * Estes testes são a única rede. Molde: `template-02-canvas.test.tsx` e
 * `dashboard-renderiza.test.tsx`.
 */

vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn(async () => 'https://x/y.png') }));
vi.mock('react-hot-toast', () => ({
  default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

afterEach(cleanup);

/** Um slide FlowLine com texto que só existe neste template. */
function slideT03(model = TEMPLATE_03_MODEL_COVER, position = 0): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: 's0',
    position,
    templateModel: model,
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
    templateSlots: { [`s${model}.title`]: 'MARCA DO FLOWLINE' },
  } as Slide;
}

/**
 * A assinatura do desenho do T3 no markup: a classe da raiz e a caixa dos dots.
 * O `MinimalistSlide` não tem nenhuma das duas.
 */
function ehTemplate03(html: string): boolean {
  return html.includes('t03-slide') && html.includes('data-dots-total');
}

describe('TEMPLATE 3 — os quatro despachos de render', () => {
  it('1/4 · SlidePreview desenha o Template03Slide, não o MinimalistSlide', async () => {
    const { default: SlidePreview } = await import('@/components/editor/SlidePreview');
    const { container } = render(
      <SlidePreview
        slide={slideT03()}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        style={'template03' as SlideStyle}
        slideIndex={0}
        totalSlides={4}
      />
    );
    expect(ehTemplate03(container.innerHTML)).toBe(true);
    expect(container.innerHTML).toContain('MARCA DO FLOWLINE');
  });

  /**
   * 🔴 O despacho da EXPORTAÇÃO. Se este cair no fallback, o editor mostra o
   * FlowLine e o PNG sai minimalista.
   */
  it('2/4 · HiddenSlides desenha o Template03Slide — o despacho da exportação', async () => {
    const { default: HiddenSlides } = await import('@/components/editor/HiddenSlides');
    const { useEditorStore } = await import('@/hooks/useEditorStore');
    // O HiddenSlides lê do STORE, não de props: é a árvore que a exportação
    // captura, e ela acompanha o editor.
    useEditorStore.setState({
      slides: [slideT03(), slideT03(TEMPLATE_03_MODEL_STEP, 1)],
      activeSlideIndex: 0,
      style: 'template03',
      globalSettings: DEFAULT_GLOBAL_SETTINGS,
    });
    const { container } = render(<HiddenSlides registerRef={() => {}} />);
    expect(ehTemplate03(container.innerHTML)).toBe(true);
    // Os DOIS slides, não só o primeiro: a exportação captura o deck inteiro.
    expect(container.querySelectorAll('.t03-slide')).toHaveLength(2);
  });

  it('3/4 · o preview do dashboard desenha o Template03Slide', async () => {
    const { default: DashboardClient } = await import('@/app/(app)/dashboard/DashboardClient');
    void DashboardClient;
    // O componente do dashboard é uma página com dependências de dados; o que
    // este teste trava é o BRAÇO do ternário, lido do arquivo. Sem ele o
    // carrossel FlowLine aparece como minimalista na lista.
    const fonte = readFileSync('app/(app)/dashboard/DashboardClient.tsx', 'utf8');
    expect(fonte).toContain("=== 'template03'");
    expect(fonte).toContain('<Template03Slide');
    expect(fonte).toContain("import Template03Slide from '@/components/slides/Template03Slide'");
  });

  it('4/4 · o rótulo de produto da faixa diz FlowLine', async () => {
    const fonte = readFileSync('components/editor/SlideCanvas.tsx', 'utf8');
    expect(fonte).toMatch(/template03:\s*'FlowLine'/);
  });

  /**
   * A rede contra o esquecimento: NENHUM dos quatro arquivos pode ficar sem o
   * braço. Ler a fonte é feio, mas é o que pega o ternário que o `tsc` não
   * protege — e é mais barato que montar quatro páginas inteiras.
   */
  it('os quatro arquivos citam template03 — nenhum ficou para trás', () => {
    const arquivos = [
      'components/editor/SlidePreview.tsx',
      'components/editor/HiddenSlides.tsx',
      'app/(app)/dashboard/DashboardClient.tsx',
      'components/editor/SlideCanvas.tsx',
    ];
    for (const f of arquivos) {
      expect(readFileSync(f, 'utf8'), f).toContain('template03');
    }
  });
});

describe('TEMPLATE 3 — o popup de modelo', () => {
  it('usa o picker genérico, sem wrapper próprio', () => {
    const fonte = readFileSync('components/editor/SlideCanvas.tsx', 'utf8');
    // Caminho barato do T2: `TemplateModelPicker` inline, nada de
    // `Template03ModelPicker.tsx`.
    expect(fonte).toContain('isTemplate03');
    expect(fonte).toContain('testIdPrefix="t03-model"');
    expect(() => readFileSync('components/editor/Template03ModelPicker.tsx', 'utf8')).toThrow();
  });

  it('o FlowLine entra em isSpecTemplate — adicionar abre o popup', () => {
    const fonte = readFileSync('components/editor/SlideCanvas.tsx', 'utf8');
    expect(fonte).toMatch(/isSpecTemplate\s*=\s*isTemplate01\s*\|\|\s*isTemplate02\s*\|\|\s*isTemplate03/);
  });

  it('oferece os dois modelos, com o conteúdo como sugerido', () => {
    const fonte = readFileSync('components/editor/SlideCanvas.tsx', 'utf8');
    expect(fonte).toContain('models={TEMPLATE_03_MODELS}');
    expect(fonte).toContain('suggested={t03SuggestedModel}');
    expect(TEMPLATE_03_MODELS).toEqual([TEMPLATE_03_MODEL_COVER, TEMPLATE_03_MODEL_STEP]);
  });

  /**
   * "O popup dos outros templates continua o de sempre" — molde
   * `template-02-canvas.test.tsx:140`.
   */
  it('os popups do T1 e do T2 continuam intactos', () => {
    const fonte = readFileSync('components/editor/SlideCanvas.tsx', 'utf8');
    expect(fonte).toContain('<Template01ModelPicker');
    expect(fonte).toContain('testIdPrefix="t02-model"');
  });
});
