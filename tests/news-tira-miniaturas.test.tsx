// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import NewsCardStrip, {
  NEWS_CARD_ASPECT,
  NEWS_CARD_H,
  NEWS_CARD_W,
} from '@/components/news/NewsCardStrip';
import { DEFAULT_STYLE, type NewsCardItem } from '@/components/news/NewsCard';

/**
 * TIRA DE MINIATURAS DOS CARDS DE NOTÍCIAS.
 *
 * O Rafael reportou as miniaturas "esticadas na horizontal, achatadas". A causa
 * não era o cálculo do tamanho: os botões tinham `width`/`height` explícitos,
 * mas viviam num `flex flex-col` — e item de flex nasce com `flex-shrink: 1`.
 * Dez miniaturas de 243 px numa coluna de ~600 px eram comprimidas no eixo
 * vertical e esticadas à largura do container, com o `NewsCard` (um
 * `transform: scale`, que não encolhe junto) vazando por dentro.
 *
 * Por isso os dois testes de proporção aqui olham `aspectRatio` E
 * `flexShrink`: um sem o outro deixaria o defeito voltar.
 */

function item(numero: number): NewsCardItem {
  // O estilo é achatado no próprio item (ver `NewsCardItem`), não aninhado.
  return {
    ...DEFAULT_STYLE,
    numero,
    tema: 'Tema',
    titulo_card: `Card ${numero}`,
    imagem_url: '',
    legenda: '',
  };
}

const dez = Array.from({ length: 10 }, (_, i) => item(i + 1));

afterEach(cleanup);

describe('clicar numa miniatura troca o card ativo', () => {
  it('chama onSelect com o índice da miniatura clicada', () => {
    const onSelect = vi.fn();
    render(<NewsCardStrip items={dez} selectedIdx={0} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Card 7' }));
    expect(onSelect).toHaveBeenCalledWith(6);

    fireEvent.click(screen.getByRole('tab', { name: 'Card 1' }));
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it('a miniatura ativa fica marcada, e só ela', () => {
    render(<NewsCardStrip items={dez} selectedIdx={3} onSelect={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Card 4' }).getAttribute('aria-selected')).toBe('true');
  });

  it('a numeração aparece em todas', () => {
    render(<NewsCardStrip items={dez} selectedIdx={0} onSelect={vi.fn()} />);
    for (const n of [1, 5, 10]) {
      expect(within(screen.getByRole('tab', { name: `Card ${n}` })).getByText(String(n))).toBeTruthy();
    }
  });

  it('uma miniatura por card, na ordem', () => {
    render(<NewsCardStrip items={dez} selectedIdx={0} onSelect={vi.fn()} />);
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label')))
      .toEqual(dez.map((i) => `Card ${i.numero}`));
  });
});

describe('a proporção das miniaturas é a real do card', () => {
  it('cada miniatura tem a proporção 1080/1350 travada no CSS', () => {
    render(<NewsCardStrip items={dez} selectedIdx={0} onSelect={vi.fn()} />);
    for (const tab of screen.getAllByRole('tab')) {
      expect((tab as HTMLElement).style.aspectRatio).toBe(NEWS_CARD_ASPECT);
    }
    expect(NEWS_CARD_ASPECT).toBe('1080 / 1350');
  });

  it('o flex não pode amassar a miniatura — era exatamente o defeito', () => {
    render(<NewsCardStrip items={dez} selectedIdx={0} onSelect={vi.fn()} />);
    for (const tab of screen.getAllByRole('tab')) {
      expect((tab as HTMLElement).style.flexShrink).toBe('0');
    }
  });

  it('a largura é a pedida e a altura sai da proporção, não de um número solto', () => {
    render(<NewsCardStrip items={dez} selectedIdx={0} onSelect={vi.fn()} thumbWidth={90} />);
    const tab = screen.getByRole('tab', { name: 'Card 1' }) as HTMLElement;
    expect(tab.style.width).toBe('90px');
    // Altura NÃO é fixada em px: quem a define é o aspectRatio.
    expect(tab.style.height).toBe('');
  });

  it('a miniatura é o próprio NewsCard em escala — fiel por construção', () => {
    render(<NewsCardStrip items={dez} selectedIdx={0} onSelect={vi.fn()} thumbWidth={108} />);
    const tab = screen.getByRole('tab', { name: 'Card 1' }) as HTMLElement;
    const escalado = tab.querySelector<HTMLElement>('[style*="scale"]');
    expect(escalado).toBeTruthy();
    // 108 / 1080 = 0.1
    expect(escalado!.style.transform).toBe('scale(0.1)');

    // A caixa interna acompanha a mesma escala nos dois eixos.
    const caixa = tab.querySelector<HTMLElement>('[style*="position: absolute"]')!;
    expect(caixa.style.width).toBe(`${NEWS_CARD_W * 0.1}px`);
    expect(caixa.style.height).toBe(`${NEWS_CARD_H * 0.1}px`);
  });
});

describe('muitos cards não quebram o layout', () => {
  it('a tira rola na horizontal e não cresce o pai', () => {
    const { container } = render(
      <NewsCardStrip items={Array.from({ length: 40 }, (_, i) => item(i + 1))} selectedIdx={0} onSelect={vi.fn()} />,
    );
    const tira = container.querySelector('[data-testid="news-card-strip"]')!;
    expect(tira.className).toContain('overflow-x-auto');
    expect(tira.className).toContain('min-w-0');
    expect(tira.className).toContain('shrink-0');
    expect(screen.getAllByRole('tab')).toHaveLength(40);
  });

  it('sem cards não renderiza miniatura nenhuma', () => {
    render(<NewsCardStrip items={[]} selectedIdx={0} onSelect={vi.fn()} />);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});
