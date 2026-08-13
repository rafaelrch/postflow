// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { useEditorStore } from '@/hooks/useEditorStore';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide } from '@/types';
import { TEMPLATE_02_DEFAULT_MODELS } from '@/lib/templates/template-02';

/**
 * ADICIONAR SLIDE NO TEMPLATE 2 (fatia S3) — o canvas renderizado de verdade.
 *
 * O que importa provar aqui: "Adicionar" abre o popup de MODELO (e não cria um
 * slide genérico), o modelo que CONTINUA a alternância vem marcado como
 * sugerido, e a escolha grava `templateModel` — que é o que mantém o desenho
 * certo depois de reordenar.
 */

vi.mock('react-hot-toast', () => ({
  default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

import SlideCanvas from '@/components/editor/SlideCanvas';

beforeAll(() => {
  // O canvas mede a área disponível com ResizeObserver, que o jsdom não tem.
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});

function montaDeck(models: number[], style: 'template01' | 'template02' = 'template02') {
  const slides = models.map((model, i) => ({
    ...DEFAULT_SLIDE,
    id: `s${i}`,
    position: i,
    templateModel: model,
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
    templateSlots: { 'header.category': 'ARKE STUDIO', 'header.handle': '@ARKEBRANDING' },
  })) as Slide[];

  useEditorStore.setState({
    slides,
    activeSlideIndex: models.length - 1,
    style,
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
  });

  return render(<SlideCanvas />);
}

/**
 * "Adicionar" existe em dois lugares — o botão da barra de ferramentas e o card
 * ao fim da faixa. Os dois chamam o mesmo handler; o teste usa o primeiro.
 */
function clicaAdicionar() {
  fireEvent.click(screen.getAllByText('Adicionar')[0]);
}

afterEach(cleanup);

describe('TEMPLATE 2 — popup de modelo', () => {
  it('"Adicionar" abre o popup em vez de criar slide genérico', () => {
    montaDeck(TEMPLATE_02_DEFAULT_MODELS);
    const antes = useEditorStore.getState().slides.length;
    clicaAdicionar();
    expect(screen.getByRole('dialog')).toBeTruthy();
    // Nada foi criado ainda: quem cria é a escolha do modelo.
    expect(useEditorStore.getState().slides.length).toBe(antes);
  });

  it('mostra os TRÊS modelos, com preview do componente real', () => {
    montaDeck(TEMPLATE_02_DEFAULT_MODELS);
    clicaAdicionar();
    for (const model of [1, 2, 3]) {
      const preview = screen.getByTestId(`t02-model-preview-${model}`);
      // O preview é o Template02Slide de verdade, não uma imagem estática.
      expect(preview.querySelector('.t02-slide')).toBeTruthy();
      expect(preview.querySelector(`[data-model="${model}"]`)).toBeTruthy();
    }
  });

  it('marca como sugerido o modelo que CONTINUA a alternância', () => {
    // Deck padrão termina no modelo 3 -> o sugerido é o 2.
    montaDeck(TEMPLATE_02_DEFAULT_MODELS);
    clicaAdicionar();
    const sugerido = screen.getByTestId('t02-model-suggested').closest('button')!;
    expect(within(sugerido).getByText('2. Texto à esquerda')).toBeTruthy();
    cleanup();

    // Deck terminando no modelo 2 -> o sugerido é o 3.
    montaDeck([1, 2]);
    clicaAdicionar();
    const outro = screen.getByTestId('t02-model-suggested').closest('button')!;
    expect(within(outro).getByText('3. Texto à direita')).toBeTruthy();
  });

  it('há exatamente UM sugerido', () => {
    montaDeck(TEMPLATE_02_DEFAULT_MODELS);
    clicaAdicionar();
    expect(screen.getAllByTestId('t02-model-suggested')).toHaveLength(1);
  });

  it('clicar no modelo só seleciona; o slide nasce apenas ao confirmar', () => {
    montaDeck(TEMPLATE_02_DEFAULT_MODELS);
    clicaAdicionar();
    const antes = useEditorStore.getState().slides.length;
    fireEvent.click(screen.getByTestId('t02-model-preview-3'));

    expect(useEditorStore.getState().slides).toHaveLength(antes);
    const selecionado = screen.getByTestId('t02-model-preview-3').closest('button')!;
    expect(selecionado.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar card' }));

    const { slides } = useEditorStore.getState();
    expect(slides).toHaveLength(6);
    const novo = slides[5];
    // Sem isto o desenho voltaria a sair da posição.
    expect(novo.templateModel).toBe(3);
    // O cabeçalho nasce editável e independente dos demais slides.
    expect(novo.templateSlots?.['header.category']).toBe('LOREM IPSUM');
    expect(novo.templateSlots?.['header.handle']).toBe('@LOREMIPSUM');
    // Texto de exemplo, nunca a copy do spec.
    expect(JSON.stringify(novo.templateSlots)).not.toContain('Barcelona');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('o rótulo do estilo aparece na barra de status', () => {
    montaDeck(TEMPLATE_02_DEFAULT_MODELS);
    expect(screen.getByText(/Template 2/)).toBeTruthy();
  });
});

describe('TEMPLATE 1 — o popup dele continua o de sempre', () => {
  it('abre o picker do T1, sem selo de sugerido', () => {
    // A generalização não pode ter mexido no comportamento do Template 1.
    montaDeck([1, 2, 3], 'template01');
    clicaAdicionar();
    expect(screen.getByTestId('t01-model-preview-1')).toBeTruthy();
    expect(screen.getByTestId('t01-model-preview-6')).toBeTruthy();
    expect(screen.queryByTestId('t02-model-suggested')).toBeNull();
    expect(screen.queryByTestId('t02-model-preview-1')).toBeNull();
  });

  it('também exige confirmação antes de adicionar o card', () => {
    montaDeck([1, 2, 3], 'template01');
    clicaAdicionar();
    const antes = useEditorStore.getState().slides.length;

    fireEvent.click(screen.getByTestId('t01-model-preview-4'));
    expect(useEditorStore.getState().slides).toHaveLength(antes);

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar card' }));
    const novo = useEditorStore.getState().slides.at(-1)!;
    expect(novo.templateModel).toBe(4);
    expect(novo.templateSlots?.['cantos.left']).toBe('LOREM IPSUM');
    expect(novo.templateSlots?.['cantos.right']).toBe('@LOREMIPSUM');
  });
});
