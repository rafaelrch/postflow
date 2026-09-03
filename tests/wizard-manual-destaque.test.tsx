// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import Template02Slide from '@/components/slides/Template02Slide';
import { mapDbSlideToSlide, mapSlideToDbRow } from '@/lib/slide-mapper';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, type Slide } from '@/types';

/**
 * DESTAQUE NA CRIAÇÃO MANUAL — pedido do Rafael (02/09/2026).
 *
 * "todas as palavras do título que o usuário colocou têm que estar expostas a
 * ele para ele selecionar quais palavras quer destacar."
 *
 * O QUE A MEDIÇÃO ACHOU, e que corrige uma hipótese que estava aberta (R9):
 * o wizard manual do Radar JÁ PEDIA "Destaque" e "Chamada" — eles saem de
 * `template02TextSlotsForModel`, que na capa devolve os três slots. Um Radar
 * feito à mão NÃO nasce condenado a ficar sem marcador e sem CTA.
 *
 * O defeito era outro, e mais sutil: "Destaque" era um campo de texto livre. O
 * marcador só pinta quando o termo aparece EXATAMENTE numa linha do título, e
 * ninguém avisava disso — errar o acento, o plural ou a caixa produzia um
 * carrossel sem marcador nenhum, sem mensagem e sem pista. É a mesma armadilha
 * que o addendum descreve para a IA ("se não estiver, o marcador simplesmente
 * não aparece"), só que aqui sobrava para o usuário.
 *
 * Agora o campo são as PASTILHAS do editor, o mesmo componente
 * (HighlightWordChips): o valor sai do próprio título e casa por construção.
 *
 * ESCOPO MEDIDO: só o Radar. É o único estilo com destino já existente e
 * fiado — `templateSlots['cover.highlight']`. Manifesto e FlowLine não têm slot
 * de destaque no spec, e inventar um seria decidir spec sem o Rafael.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({
  default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn() }));

import CreateWizard from '@/components/editor/CreateWizard';

function seletorDeModo(): HTMLSelectElement {
  const el = Array.from(document.querySelectorAll('select')).find((s) =>
    s.querySelector('option[value="manual"]'),
  );
  expect(el, 'o seletor de modo não está na tela').toBeTruthy();
  return el as HTMLSelectElement;
}

/** Abre o wizard no passo de conteúdo, no template pedido, já no modo manual. */
function abreNoManual(template = 'Radar') {
  render(<CreateWizard onClose={vi.fn()} />);
  fireEvent.click(screen.getByText('Carrossel'));
  fireEvent.click(screen.getByText('Continuar'));
  fireEvent.click(screen.getByText(template));
  fireEvent.click(screen.getByText('Continuar'));
  fireEvent.change(seletorDeModo(), { target: { value: 'manual' } });
}

const chips = () => screen.queryByRole('group', { name: 'Palavras em destaque' });

/** O campo de um rótulo do passo manual. */
function campo(rotulo: string): HTMLElement {
  const label = Array.from(document.querySelectorAll('label')).find((l) =>
    l.textContent?.includes(rotulo),
  );
  expect(label, `o campo "${rotulo}" não está na tela`).toBeTruthy();
  const el = label!.querySelector('textarea, input');
  expect(el, `o campo "${rotulo}" não tem entrada de texto`).toBeTruthy();
  return el as HTMLElement;
}

function escreveTitulo(texto: string) {
  fireEvent.change(campo('Título'), { target: { value: texto } });
}

/** As pastilhas visíveis, na ordem. */
function palavras(): string[] {
  const g = chips();
  return g ? Array.from(g.querySelectorAll('button')).map((b) => b.textContent ?? '') : [];
}

function clicaPalavra(palavra: string) {
  fireEvent.click(within(chips()!).getByText(palavra));
}

function marcadas(): string[] {
  const g = chips();
  return g
    ? Array.from(g.querySelectorAll('button[aria-pressed="true"]')).map((b) => b.textContent ?? '')
    : [];
}

afterEach(cleanup);

describe('as palavras do título viram pastilhas no modo manual', () => {
  it('o campo Destaque não é mais um texto livre — são as palavras do título', () => {
    abreNoManual();
    escreveTitulo('CINCO ERROS QUE TRAVAM VOCE');

    expect(chips(), 'as pastilhas não apareceram no wizard manual').toBeTruthy();
    expect(palavras()).toEqual(['CINCO', 'ERROS', 'QUE', 'TRAVAM', 'VOCE']);
  });

  it('as pastilhas acompanham o título enquanto ele é digitado', () => {
    abreNoManual();

    escreveTitulo('PRIMEIRO TITULO');
    expect(palavras()).toEqual(['PRIMEIRO', 'TITULO']);

    escreveTitulo('OUTRO TEXTO COMPLETAMENTE DIFERENTE');
    expect(palavras()).toEqual(['OUTRO', 'TEXTO', 'COMPLETAMENTE', 'DIFERENTE']);
  });

  it('clicar marca e desmarca a palavra', () => {
    abreNoManual();
    escreveTitulo('CINCO ERROS QUE TRAVAM VOCE');

    clicaPalavra('ERROS');
    expect(marcadas()).toEqual(['ERROS']);

    clicaPalavra('TRAVAM');
    expect(marcadas()).toEqual(['ERROS', 'TRAVAM']);

    clicaPalavra('ERROS');
    expect(marcadas()).toEqual(['TRAVAM']);
  });

  it('o título com quebra de linha também expõe todas as palavras', () => {
    // A capa do Radar é escrita com \\n; as pastilhas não podem parar na 1ª linha.
    abreNoManual();
    escreveTitulo('CINCO ERROS\nQUE TRAVAM VOCE');

    expect(palavras()).toEqual(['CINCO', 'ERROS', 'QUE', 'TRAVAM', 'VOCE']);
  });

  it('só a capa tem pastilhas — os slides internos do Radar não têm destaque', () => {
    abreNoManual();
    expect(chips()).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Próximo slide'));
    expect(chips(), 'o slide interno não deveria ter pastilhas').toBeNull();
  });
});

describe('o que foi marcado chega ao slide desenhado', () => {
  /**
   * O caminho real: o valor das pastilhas é o mesmo do slot
   * `cover.highlight`, e é ele que o render usa para pintar o marcador. Aqui o
   * teste monta o slide como o wizard monta (slots) e desenha.
   */
  function capaComDestaque(headline: string, highlight: string): Slide {
    return {
      ...DEFAULT_SLIDE,
      id: 'capa',
      position: 0,
      templateModel: 1,
      templateSlots: { 'cover.headline': headline, 'cover.highlight': highlight },
    } as Slide;
  }

  function marcadoresDe(slide: Slide): string[] {
    const { container, unmount } = render(
      <Template02Slide
        slide={slide}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={5}
      />,
    );
    const achados = Array.from(
      container.querySelectorAll('[data-slot="cover.highlight"]'),
    ).map((el) => el.textContent ?? '');
    unmount();
    return achados;
  }

  it('a palavra escolhida sai marcada no slide', () => {
    expect(marcadoresDe(capaComDestaque('CINCO ERROS QUE TRAVAM VOCE', 'ERROS'))).toEqual([
      'ERROS',
    ]);
  });

  it('sem escolher nada, nada é marcado', () => {
    expect(marcadoresDe(capaComDestaque('CINCO ERROS QUE TRAVAM VOCE', ''))).toEqual([]);
  });

  it('o valor das pastilhas casa com o título por construção', () => {
    // O ganho da mudança: escrevendo à mão dava para digitar "ERRO" e não pintar
    // nada. Clicando, o termo é a palavra do próprio título.
    abreNoManual();
    escreveTitulo('CINCO ERROS QUE TRAVAM VOCE');
    clicaPalavra('ERROS');

    const escolhido = marcadas().join(', ');
    expect(marcadoresDe(capaComDestaque('CINCO ERROS QUE TRAVAM VOCE', escolhido))).toEqual([
      'ERROS',
    ]);
  });
});

describe('ida e volta: salvar e reabrir preserva o destaque', () => {
  it('o slot sobrevive ao mapeamento de banco nos dois sentidos', () => {
    const slide = {
      ...DEFAULT_SLIDE,
      id: 'capa',
      position: 0,
      templateModel: 1,
      templateSlots: { 'cover.headline': 'CINCO ERROS QUE TRAVAM VOCE', 'cover.highlight': 'ERROS' },
    } as Slide;

    const row = mapSlideToDbRow(slide, 'carousel-1', 0);
    const devolta = mapDbSlideToSlide({ ...row, id: 'capa' });

    expect(devolta.templateSlots?.['cover.highlight']).toBe('ERROS');
    expect(devolta.templateSlots?.['cover.headline']).toBe('CINCO ERROS QUE TRAVAM VOCE');
  });

  it('reaberto, o slide continua desenhando o marcador', () => {
    const slide = {
      ...DEFAULT_SLIDE,
      id: 'capa',
      position: 0,
      templateModel: 1,
      templateSlots: { 'cover.headline': 'CINCO ERROS QUE TRAVAM VOCE', 'cover.highlight': 'ERROS' },
    } as Slide;

    const devolta = mapDbSlideToSlide({ ...mapSlideToDbRow(slide, 'carousel-1', 0), id: 'capa' });

    const { container } = render(
      <Template02Slide
        slide={devolta}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={5}
      />,
    );

    expect(
      Array.from(container.querySelectorAll('[data-slot="cover.highlight"]')).map(
        (el) => el.textContent,
      ),
    ).toEqual(['ERROS']);
  });
});
