// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import GenerationToast from '@/components/editor/GenerationToast';

/**
 * TOAST DE PROGRESSO DA GERAÇÃO — pedido do Rafael.
 *
 * O toast de carregamento era texto puro ("Gerando 3/5 imagens…"). Agora é um
 * card com barra. O que este teste trava: a barra NUNCA inventa porcentagem.
 * Na geração de um slide só não existe progresso real, então ela fica
 * indeterminada e o número some — mostrar "0%" ali seria mentir sobre quanto
 * falta.
 */

afterEach(cleanup);

/**
 * A copy é o que distingue os dois modos na tela: o lote diz "de N", o slide
 * único não. Estes títulos são montados no hook — aqui travamos o formato que
 * ele precisa produzir, para o "de N" não voltar a aparecer nos dois.
 */
describe('copy dos dois modos', () => {
  const lote = (done: number, total: number) =>
    `Slide ${Math.min(done + 1, total)} de ${total} — gerando imagem`;
  const unico = (index: number) => `Slide ${index + 1} — gerando imagem`;

  it('o lote conta o slide que está sendo gerado, e diz "de N"', () => {
    expect(lote(0, 5)).toBe('Slide 1 de 5 — gerando imagem');
    expect(lote(2, 5)).toBe('Slide 3 de 5 — gerando imagem');
  });

  it('o último do lote não passa do total', () => {
    // Sem o limite, o "done" final nomearia um slide que não existe.
    expect(lote(5, 5)).toBe('Slide 5 de 5 — gerando imagem');
  });

  it('o slide único NÃO diz "de N"', () => {
    expect(unico(0)).toBe('Slide 1 — gerando imagem');
    expect(unico(0)).not.toMatch(/ de \d/);
  });
});

const barra = (c: HTMLElement) => c.querySelector('[data-progress-fill]') as HTMLElement;

describe('GenerationToast', () => {
  it('com `percent`: mostra a porcentagem e a largura da barra', () => {
    const { container } = render(<GenerationToast title="Slide 2 de 5 — gerando imagem" percent={40} />);
    expect(screen.getByText('Slide 2 de 5 — gerando imagem')).toBeTruthy();
    expect(screen.getByText('40%')).toBeTruthy();
    expect(barra(container).style.width).toBe('40%');
  });

  it('sem `percent`: barra indeterminada e NENHUMA porcentagem na tela', () => {
    const { container } = render(<GenerationToast title="Slide 1 — gerando imagem" />);
    expect(screen.queryByText(/%$/)).toBeNull();
    expect(barra(container).dataset.indeterminate).toBe('true');
  });

  it('o subtítulo padrão explica que as imagens chegam aos poucos', () => {
    render(<GenerationToast title="x" percent={0} />);
    expect(screen.getByText('As imagens aparecem no carrossel assim que ficam prontas')).toBeTruthy();
  });

  it('o aviso de rate limit entra como `hint`, sem trocar título nem barra', () => {
    const { container } = render(
      <GenerationToast title="Slide 3 de 5 — gerando imagem" percent={40} hint="Limite da OpenAI atingido — aguardando 12s…" />
    );
    expect(screen.getByText('Limite da OpenAI atingido — aguardando 12s…')).toBeTruthy();
    expect(screen.getByText('Slide 3 de 5 — gerando imagem')).toBeTruthy();
    expect(barra(container).style.width).toBe('40%');
  });
});
