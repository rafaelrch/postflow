// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';

/**
 * ROTAÇÃO DAS ABAS DE RECURSOS (landing).
 *
 * O Rafael reportou "o tab não fica mudando sozinho, eu preciso clicar" numa
 * máquina onde a seção estava congelada, enquanto aqui girava normalmente. A
 * causa era `prefers-reduced-motion: reduce` ligado no sistema: a rotação
 * inteira estava atrás desse guard, então quem pede menos animação perdia o
 * recurso em vez de perder só a animação.
 *
 * Trocar de aba é troca de CONTEÚDO, não movimento. O que "reduce" tem que
 * desligar é o fade/deslocamento — e é isso que este arquivo trava, porque é o
 * único estado que não dá para conferir no navegador do portal (depende de uma
 * preferência de sistema).
 */

/** matchMedia do jsdom: só a media query de movimento importa aqui. */
function stubMatchMedia(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({
      matches: /prefers-reduced-motion/.test(query) ? reduce : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
}

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt?: string; src: string }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ''} src={typeof src === 'string' ? src : ''} />,
}));

vi.mock('@/components/ui/shooting-stars-grid', () => ({
  ShootingStarsGrid: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/billing/LeadCaptureModal', () => ({
  default: () => null,
}));

/** Índice da aba marcada como ativa, lido pelo mesmo aria-pressed da UI. */
function abaAtiva(): number {
  const tabs = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'));
  return tabs.findIndex((b) => b.getAttribute('aria-pressed') === 'true');
}

async function renderLanding() {
  const { default: Landing } = await import('@/app/(marketing)/page');
  render(<Landing />);
}

/** Avança o relógio um ciclo de rotação (FEATURE_ROTATE_MS = 4500ms). */
async function passaUmCiclo() {
  await act(async () => {
    vi.advanceTimersByTime(4600);
  });
}

/**
 * O jsdom não tem IntersectionObserver e o FadeUp da landing usa useInView.
 * Este dublê entrega "está visível" na hora: sem ele nada da página monta, e o
 * que se quer medir aqui é a rotação, não a entrada por scroll.
 */
class IntersectionObserverStub {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.cb(
      [{ isIntersecting: true, target, intersectionRatio: 1 } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('abas de recursos — rotação automática', () => {
  it('gira sozinha mesmo com prefers-reduced-motion: reduce', async () => {
    stubMatchMedia(true);
    await renderLanding();

    const inicial = abaAtiva();
    await passaUmCiclo();

    expect(
      abaAtiva(),
      'com "reduzir movimento" ligado a seção ficava presa numa aba só',
    ).not.toBe(inicial);
  });

  it('gira sozinha sem prefers-reduced-motion', async () => {
    stubMatchMedia(false);
    await renderLanding();

    const inicial = abaAtiva();
    await passaUmCiclo();

    expect(abaAtiva()).not.toBe(inicial);
  });

  it('dá a volta no fim da lista em vez de parar na última', async () => {
    stubMatchMedia(false);
    await renderLanding();

    const total = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed')).length;
    const inicial = abaAtiva();
    // Uma volta completa: se em algum ponto ela parasse, não voltaria ao início.
    for (let i = 0; i < total; i++) await passaUmCiclo();

    expect(abaAtiva()).toBe(inicial);
  });

  it('o clique do usuário trava a rotação na aba escolhida', async () => {
    stubMatchMedia(false);
    await renderLanding();

    const tabs = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'));
    await act(async () => {
      fireEvent.click(tabs[0]);
    });
    expect(abaAtiva()).toBe(0);

    await passaUmCiclo();
    await passaUmCiclo();

    expect(abaAtiva(), 'quem escolheu uma aba para ler não pode ser tirado dela').toBe(0);
  });
});
