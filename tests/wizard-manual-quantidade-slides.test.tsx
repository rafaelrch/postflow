// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

/**
 * QUANTIDADE DE SLIDES NO MODO MANUAL — pedido do Rafael (02/09/2026).
 *
 * "quando ele muda para criar manualmente ele não tem opção de selecionar
 * quantos slides quer."
 *
 * O seletor existia só dentro do ramo `contentMode === 'ai'`. No manual sobrava
 * o pager e o "Adicionar slide", um a um.
 *
 * O QUE A MEDIÇÃO MOSTROU antes de escrever o fix, e que mudou o desenho:
 *
 *  1. Crescer JÁ era seguro: `updateSlideCount` acrescentava slides vazios no
 *     fim, sem tocar no que estava escrito.
 *  2. Encolher NÃO era. Era `prev.slice(0, n)`: o texto dos slides cortados
 *     sumia calado e sem desfazer. Passando o seletor para o manual, isso
 *     deixaria de ser um caminho torto (ir ao modo IA e voltar) e viraria um
 *     clique. Por isso o corte agora só come slides VAZIOS.
 *  3. O `manualIndex` não era corrigido ao encolher: dava para ficar em
 *     "Slide 5 de 2", com os campos vazios e — pior — as edições caindo num
 *     índice que não existe mais, descartadas em silêncio por `updateManualSlide`.
 *
 * O seletor do manual lê `manualSlides.length`, não `slideCount`: é aquela
 * lista que vira o carrossel na geração manual.
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

/** O `select` de "Como criar" — o único que oferece o modo manual. */
function seletorDeModo(): HTMLSelectElement {
  const el = Array.from(document.querySelectorAll('select')).find((s) =>
    s.querySelector('option[value="manual"]'),
  );
  expect(el, 'o seletor de modo não está na tela').toBeTruthy();
  return el as HTMLSelectElement;
}

/** Abre o wizard no passo de conteúdo, no template pedido, já no modo manual. */
function abreNoManual(template: string) {
  render(<CreateWizard onClose={vi.fn()} />);
  fireEvent.click(screen.getByText('Carrossel'));
  fireEvent.click(screen.getByText('Continuar'));
  fireEvent.click(screen.getByText(template));
  fireEvent.click(screen.getByText('Continuar'));
  fireEvent.change(seletorDeModo(), { target: { value: 'manual' } });
}

const grade = () => screen.queryByRole('group', { name: 'Número de slides' });
const pager = () => screen.getByTestId('manual-pager').textContent;

/** Escolhe N na grade de quantidade. */
function escolhe(n: number) {
  const g = grade();
  expect(g, 'a grade de quantidade não está na tela').toBeTruthy();
  fireEvent.click(within(g!).getByText(String(n)));
}

/** O primeiro campo de texto do slide aberto. */
function campo(): HTMLTextAreaElement {
  const el = document.querySelector('textarea') as HTMLTextAreaElement;
  expect(el, 'o slide aberto não tem campo de texto').toBeTruthy();
  return el;
}

function escreve(texto: string) {
  fireEvent.change(campo(), { target: { value: texto } });
}

/** Navega o pager até o slide pedido (1-based). */
function vaiParaSlide(n: number) {
  while (!new RegExp(`Slide ${n} de`).test(pager() ?? '')) {
    const atual = Number((pager() ?? '').match(/Slide (\d+)/)?.[1] ?? 1);
    fireEvent.click(screen.getByLabelText(atual < n ? 'Próximo slide' : 'Slide anterior'));
  }
}

afterEach(cleanup);

describe('o seletor de quantidade aparece no modo manual', () => {
  it.each(['Radar', 'FlowLine', 'Profile'])('%s tem a grade no manual', (template) => {
    abreNoManual(template);
    expect(grade(), 'a grade não apareceu no modo manual').toBeTruthy();
  });

  it('escolher N deixa a lista manual com exatamente N slides', () => {
    abreNoManual('Radar');

    escolhe(8);
    expect(pager()).toBe('Slide 1 de 8');

    escolhe(3);
    expect(pager()).toBe('Slide 1 de 3');
  });

  it('a grade marca o tamanho real do deck manual', () => {
    abreNoManual('Radar');
    escolhe(7);

    const marcada = grade()!.querySelector('[aria-pressed="true"]');
    expect(marcada?.textContent).toBe('7');
  });

  it('“Adicionar slide” e a grade contam a mesma história', () => {
    // A grade lê `manualSlides.length`, então o botão que já existia não pode
    // deixá-la marcando outro número.
    abreNoManual('Radar');
    escolhe(3);
    fireEvent.click(screen.getByText('Adicionar slide'));

    expect(pager()).toBe('Slide 4 de 4');
    expect(grade()!.querySelector('[aria-pressed="true"]')?.textContent).toBe('4');
  });
});

describe('aumentar nunca perde o que já foi digitado', () => {
  it('o texto dos slides existentes sobrevive ao crescimento', () => {
    abreNoManual('Radar');

    escreve('TEXTO DO SLIDE 1');
    vaiParaSlide(2);
    escreve('TEXTO DO SLIDE 2');

    escolhe(12);

    vaiParaSlide(1);
    expect(campo().value).toBe('TEXTO DO SLIDE 1');
    vaiParaSlide(2);
    expect(campo().value).toBe('TEXTO DO SLIDE 2');
    // Os novos entram vazios, no fim.
    vaiParaSlide(12);
    expect(campo().value).toBe('');
  });
});

describe('reduzir NUNCA apaga texto — só come slides vazios', () => {
  it('o corte para no último slide preenchido', () => {
    abreNoManual('Radar');
    // 5 slides no padrão; escreve no 3º e deixa 4 e 5 vazios.
    vaiParaSlide(3);
    escreve('NÃO PODE SUMIR');

    escolhe(1);

    // Parou em 3: os vazios do fim saíram, o escrito ficou.
    expect(pager()).toBe('Slide 3 de 3');
    expect(campo().value).toBe('NÃO PODE SUMIR');
  });

  it('todos vazios: reduzir chega exatamente onde foi pedido', () => {
    abreNoManual('Radar');

    escolhe(2);

    expect(pager()).toBe('Slide 1 de 2');
  });

  it('ida e volta não ressuscita nem perde texto', () => {
    abreNoManual('Radar');
    vaiParaSlide(2);
    escreve('SOBREVIVENTE');

    escolhe(2);
    escolhe(9);
    vaiParaSlide(2);

    expect(campo().value).toBe('SOBREVIVENTE');
  });

  it('a tela diz por que a grade parou antes do número clicado', () => {
    abreNoManual('Radar');
    expect(screen.getByText(/Slides já preenchidos não são removidos por aqui/)).toBeTruthy();
  });
});

describe('o pager nunca aponta para um slide que não existe', () => {
  it('reduzir com o pager no fim traz o pager junto', () => {
    // Era o "Slide 5 de 2": índice fora de faixa, campos vazios e edições
    // caindo num índice inexistente.
    abreNoManual('Radar');
    vaiParaSlide(5);
    expect(pager()).toBe('Slide 5 de 5');

    escolhe(2);

    expect(pager()).toBe('Slide 2 de 2');
  });

  it('remover o último slide também traz o pager junto', () => {
    abreNoManual('Radar');
    vaiParaSlide(5);

    fireEvent.click(screen.getByLabelText('Remover este slide'));

    expect(pager()).toBe('Slide 4 de 4');
  });
});

describe('as exceções continuam valendo', () => {
  it('o Manifesto não ganha grade no manual — o deck dele é fechado', () => {
    abreNoManual('Manifesto');

    expect(grade()).toBeNull();
    expect(screen.getAllByText(/Deck fixo de 6 slides/).length).toBeGreaterThan(0);
    expect(pager()).toBe('Slide 1 de 6');
  });

  it('o post único do Profile continua sem grade no manual', () => {
    // A bifurcação Post único / Thread mora DENTRO do ramo de IA: para chegar
    // ao formato 'A' no manual, escolhe-se lá e troca-se de modo depois. Este
    // teste percorre esse caminho de propósito — sem ele, a exceção do post
    // único ficaria sem cobertura no modo que a tarefa acabou de abrir.
    render(<CreateWizard onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Carrossel'));
    fireEvent.click(screen.getByText('Continuar'));
    fireEvent.click(screen.getByText('Profile'));
    fireEvent.click(screen.getByText('Continuar'));

    fireEvent.click(screen.getByText('Post único'));
    // Sanidade: no modo de IA o post único também não tem grade.
    expect(grade()).toBeNull();

    fireEvent.change(seletorDeModo(), { target: { value: 'manual' } });
    expect(grade(), 'o post único ganhou grade no manual').toBeNull();

    // E a Thread, que é multi-slide, continua com grade nos dois modos.
    fireEvent.change(seletorDeModo(), { target: { value: 'ai' } });
    fireEvent.click(screen.getByText('Thread'));
    expect(grade()).toBeTruthy();
    fireEvent.change(seletorDeModo(), { target: { value: 'manual' } });
    expect(grade()).toBeTruthy();
  });
});
