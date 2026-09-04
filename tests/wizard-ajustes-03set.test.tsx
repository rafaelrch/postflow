// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

/**
 * TRÊS AJUSTES DO RAFAEL NO POPUP DE CRIAR CARROSSEL (03/09/2026).
 *
 * A2 — a faixa de detalhe some do passo de template. *"eu removo essa parte de
 *      baixo onde tem um textinho escrito 'forma fixa do Figma, deck aberto,
 *      três modelos que se alternam'. Eu quero que tenha esse negócio só pra ter
 *      a escolha de templates."* O `short` DENTRO do card fica: ele não pediu
 *      para tirar, e é o que descreve cada template no próprio card.
 *
 * A3 — o popup se adapta ao conteúdo. *"esse pop-up de criar carrossel está
 *      esquisito. É para ele ficar do tamanho exato do conteúdo que tem dentro.
 *      Se o conteúdo é grande, o papel é um pouco maior; se o conteúdo é menor,
 *      o papel é menor."*
 *
 * A4 — no modo manual, a quantidade de slides desce para a mesma posição
 *      relativa que ocupa no modo de IA. *"na parte de criar manualmente o
 *      slide, a quantidade de slide tem que ficar na parte de baixo. Mesma
 *      coisa, do mesmo jeito que está em criar com IA."*
 */

const { loadCarousel, mockGetUser } = vi.hoisted(() => ({
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
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
      insert: () => ({
        select: () => ({ single: async () => ({ data: { id: 'c1' }, error: null }) }),
      }),
      delete: () => ({ eq: async () => ({}) }),
    }),
  }),
}));

import CreateWizard from '@/components/editor/CreateWizard';

const SRC = readFileSync(join(process.cwd(), 'components/editor/CreateWizard.tsx'), 'utf8');

beforeEach(() => { mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function primario() {
  return screen.queryByText('Continuar') ?? screen.getByText('Gerar');
}

/** Abre o wizard e avança até o passo pedido (1 = formato). */
function vaiAte(passo: number) {
  render(<CreateWizard onClose={vi.fn()} />);
  for (let i = 1; i < passo; i++) fireEvent.click(primario());
}

// ── A2 ────────────────────────────────────────────────────────────────────

describe('A2 — o passo de template é só a escolha', () => {
  it('a faixa de detalhe abaixo do grid não existe mais', () => {
    vaiAte(2);
    // As frases da faixa, uma por template do catálogo. Nenhuma pode aparecer.
    for (const frase of [
      /Estética de post no Twitter\/X/i,
      /Revista: metadados no topo/i,
      /Você troca só texto e imagens/i,
      /os 3 modelos se alternam/i,
      /capa e slides de conteúdo independentes/i,
    ]) {
      expect(screen.queryByText(frase), `a faixa ainda mostra ${frase}`).toBeNull();
    }
  });

  it('o `short` dentro do card CONTINUA — ele não pediu para tirar', () => {
    vaiAte(2);
    expect(screen.getByText('Deck aberto: quantos slides você quiser')).toBeTruthy();
    expect(screen.getByText('Post social, focado em texto')).toBeTruthy();
    expect(screen.getByText('Deck fechado de 6 slides')).toBeTruthy();
  });

  it('trocar de template não faz nenhum texto aparecer abaixo do grid', () => {
    // O bug que este caso pega: reintroduzir a faixa só no selecionado.
    vaiAte(2);
    const antes = document.body.textContent ?? '';
    fireEvent.click(screen.getByText('Radar'));
    const depois = document.body.textContent ?? '';
    expect(depois.length).toBe(antes.length);
  });

  it('o campo `detail` saiu do catálogo — ele não tinha outro uso', () => {
    expect(SRC).not.toContain('detail:');
    expect(SRC).not.toContain('?.detail');
  });
});

// ── A3 ────────────────────────────────────────────────────────────────────

describe('A3 — a altura do popup acompanha o conteúdo', () => {
  /**
   * O jsdom não faz layout: medir pixel aqui seria medição falsa. O que dá para
   * afirmar com honestidade é o que a MEDIÇÃO mostrou ser a causa — o shell
   * declarava uma altura FIXA (`h-[min(560px,…)]`, e 720px no passo 2) — e que
   * ela não existe mais, com o teto de tela e a rolagem interna de pé.
   */
  function shell(): HTMLElement {
    return screen.getByRole('dialog');
  }

  it('o shell não declara mais NENHUMA altura fixa', () => {
    vaiAte(1);
    const classes = shell().className;
    expect(classes, 'voltou a fixar a altura').not.toMatch(/(^|\s)h-\[/);
    expect(classes).not.toContain('560px');
    expect(classes).not.toContain('720px');
  });

  it('o passo dos templates também perdeu a altura própria', () => {
    // Ele tinha a SEGUNDA altura fixa, maior, só por causa do grid 2×2.
    vaiAte(2);
    expect(shell().className).not.toMatch(/(^|\s)h-\[/);
    // A largura, essa sim, continua sendo decisão do passo.
    expect(shell().className).toContain('max-w-[600px]');
  });

  it('o teto de tela e a rolagem interna continuam de pé', () => {
    // Sem eles, "acompanhar o conteúdo" viraria estourar a janela em tela baixa.
    vaiAte(1);
    expect(shell().className).toContain('max-h-[calc(100dvh-2rem)]');
    const corpo = shell().querySelector('.overflow-y-auto') as HTMLElement;
    expect(corpo, 'o corpo rolável sumiu').toBeTruthy();
    expect(corpo.className).toContain('min-h-0');
    expect(corpo.className).toContain('flex-1');
  });

  it('a transição de altura sabe interpolar a partir de `auto`', () => {
    // Sem `interpolate-size`, `transition: height` não anima de/para `auto` e a
    // troca de passo passaria a dar um salto seco.
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
    const box = css.slice(css.indexOf('.cw-box {'), css.indexOf('.cw-box {') + 200);
    expect(box).toContain('interpolate-size: allow-keywords');
    expect(box).toContain('transition: height');
  });
});

// ── A4 ────────────────────────────────────────────────────────────────────

describe('A4 — no manual, a quantidade de slides fica embaixo', () => {
  /** Vai ao passo 3 e escolhe o modo de criação. */
  function passo3(modo: 'ai' | 'manual') {
    vaiAte(3);
    fireEvent.change(screen.getByDisplayValue('Criar com IA'), { target: { value: modo } });
    return screen.getByRole('dialog');
  }

  /**
   * O bloco de quantidade e o que vem DEPOIS dele, no passo.
   *
   * MEDIDO, e derrubou a primeira régua que eu tinha escrito: no ramo da IA o
   * `SlideCountPicker` é literalmente o último filho, mas no manual ele vem
   * dentro de um fragmento com a nota *"Slides já preenchidos não são removidos
   * por aqui"* — que é texto DO PRÓPRIO seletor, explicando por que reduzir às
   * vezes não reduz. Exigir "último filho" nos dois ramos reprovaria o layout
   * certo por causa de uma legenda.
   *
   * Então a régua é: depois do bloco de quantidade não pode sobrar nenhum
   * CONTROLE — só a legenda dele.
   */
  function depoisDaQuantidade(dialog: HTMLElement): Element[] {
    const passo = dialog.querySelector('.overflow-y-auto > div') as HTMLElement;
    const filhos = Array.from(passo.children);
    const grupo = within(passo).getByRole('group', { name: 'Número de slides' });
    const indice = filhos.findIndex((f) => f.contains(grupo));
    expect(indice, 'o seletor de quantidade não está no passo').toBeGreaterThan(-1);
    return filhos.slice(indice + 1);
  }

  it('no modo de IA ele é o ÚLTIMO bloco — é a régua', () => {
    expect(depoisDaQuantidade(passo3('ai'))).toHaveLength(0);
  });

  it('no modo MANUAL depois dele só sobra a legenda do próprio seletor', () => {
    const resto = depoisDaQuantidade(passo3('manual'));

    // Nenhum controle: nem campo, nem botão, nem paginador.
    for (const el of resto) {
      expect(el.querySelectorAll('input, textarea, select, button')).toHaveLength(0);
    }
    expect(resto.map((e) => e.textContent).join(' ')).toMatch(/Slides já preenchidos/);
  });

  it('no manual ele fica DEPOIS do paginador e dos campos do slide', () => {
    // O que ele viu na tela: a quantidade abrindo o passo, antes de tudo.
    const passo = passo3('manual').querySelector('.overflow-y-auto > div') as HTMLElement;
    const filhos = Array.from(passo.children);
    const idx = (el: Element | null) => filhos.findIndex((f) => f.contains(el!));

    const quantidade = idx(within(passo).getByRole('group', { name: 'Número de slides' }));
    const pager = idx(screen.getByTestId('manual-pager'));
    const adicionar = idx(screen.getByText('Adicionar slide'));

    expect(quantidade).toBeGreaterThan(pager);
    expect(quantidade).toBeGreaterThan(adicionar);
  });

  it('o seletor do manual continua lendo `manualSlides.length`', () => {
    // A mudança era de POSIÇÃO. Se o valor passasse a sair de `slideCount`, o
    // controle mostraria um número e a grade teria outro.
    const dialog = passo3('manual');
    const grupo = within(dialog).getByRole('group', { name: 'Número de slides' });
    fireEvent.click(within(grupo).getByText('7'));

    expect(screen.getByTestId('manual-pager').textContent).toBe('Slide 1 de 7');
    expect(within(grupo).getByText('7').getAttribute('aria-pressed')).toBe('true');
  });
});
