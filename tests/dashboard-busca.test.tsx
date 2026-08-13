// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, act } from '@testing-library/react';
import {
  DASHBOARD_PAGE_SIZE,
  dashboardCarouselsQuery,
  dashboardCountQuery,
  dashboardHref,
  ilikePatternFor,
  loadDashboardCarousels,
  parseSearchParam,
  rangeForPage,
  type DashboardBuilder,
  type DashboardSupabase,
} from '@/lib/dashboard-data';

const push = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace, refresh }) }));
vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn(async () => 'https://x/y.png') }));
vi.mock('react-hot-toast', () => ({ default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import DashboardClient from '@/app/(app)/dashboard/DashboardClient';

/**
 * BUSCA DO DASHBOARD — regressão que chegou a produção.
 *
 * Com a paginação, a busca passou a filtrar `carousels` no cliente, e o cliente
 * só tem os 10 da página aberta. O usuário digitava o título de um carrossel
 * que EXISTE e recebia "nada encontrado", porque o item estava na página 2.
 *
 * O conserto é na causa: a busca consulta o banco. Este arquivo prova isso com
 * um banco de mentira que se comporta como o PostgREST (ilike + range + count)
 * — sem ele, "consultou o banco" seria uma afirmação sem teste.
 */

afterEach(() => {
  cleanup();
  push.mockClear();
  replace.mockClear();
  refresh.mockClear();
});

/* ── Banco de mentira ─────────────────────────────────────────────────────── */

type Linha = { id: string; title: string };

/** 12 carrosséis: o "Zebra" é o 11º, ou seja, mora na PÁGINA 2. */
const ACERVO: Linha[] = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: `c${i + 1}`, title: `Carrossel ${i + 1}` })),
  { id: 'c11', title: 'Zebra do Rafael' },
  { id: 'c12', title: 'Lucro de 50% no mês' },
];

/**
 * Imita o suficiente do PostgREST: `ilike` com coringa e escape, `range`
 * fechado e `count: 'exact'` sobre o total FILTRADO (não sobre o acervo).
 */
function bancoDeMentira(
  linhas: Linha[] = ACERVO,
  falha: unknown = null,
): DashboardSupabase & { chamadas: string[] } {
  const chamadas: string[] = [];

  const criaBuilder = (estado: { filtro: string | null; head: boolean; range: [number, number] | null }) => {
    const builder = {
      eq: () => criaBuilder(estado),
      ilike: (coluna: string, padrao: string) => {
        chamadas.push(`ilike(${coluna}, ${padrao})`);
        return criaBuilder({ ...estado, filtro: padrao });
      },
      order: () => criaBuilder(estado),
      range: (from: number, to: number) => criaBuilder({ ...estado, range: [from, to] }),
      then: (resolve: (v: unknown) => unknown) => {
        if (falha) return Promise.resolve({ data: null, error: falha, count: null }).then(resolve);
        const filtradas = estado.filtro === null ? linhas : linhas.filter((l) => casa(l.title, estado.filtro!));
        const recorte = estado.range
          ? filtradas.slice(estado.range[0], estado.range[1] + 1)
          : filtradas;
        return Promise.resolve({
          data: estado.head ? null : recorte,
          error: null,
          count: filtradas.length,
        }).then(resolve);
      },
    };
    return builder as unknown as DashboardBuilder;
  };

  return {
    chamadas,
    from: (tabela: string) => {
      chamadas.push(`from(${tabela})`);
      return {
        select: (_sel: string, opts?: { count?: 'exact'; head?: boolean }) =>
          criaBuilder({ filtro: null, head: opts?.head === true, range: null }),
      };
    },
  };
}

/** `%`/`_` como coringa, `\` como escape — igual ao LIKE do Postgres. */
function casa(texto: string, padrao: string): boolean {
  let regex = '';
  for (let i = 0; i < padrao.length; i++) {
    const c = padrao[i];
    if (c === '\\') { regex += escapaRegex(padrao[++i] ?? ''); continue; }
    if (c === '%') { regex += '.*'; continue; }
    if (c === '_') { regex += '.'; continue; }
    regex += escapaRegex(c);
  }
  return new RegExp(`^${regex}$`, 'i').test(texto);
}
const escapaRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const esperar = <T,>(q: DashboardBuilder) =>
  q as unknown as PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>;

/* ── O teste que prova o conserto ─────────────────────────────────────────── */

describe('a busca consulta o BANCO, não a página carregada', () => {
  it('🔴 acha um carrossel que está FORA da página atual', async () => {
    const db = bancoDeMentira();
    // O usuário está na página 1; o "Zebra" é o 11º item, na página 2.
    const semBusca = await loadDashboardCarousels<Linha>(
      esperar(dashboardCarouselsQuery(db, { ...rangeForPage(1) })),
    );
    expect(semBusca.carousels.map((c) => c.title)).not.toContain('Zebra do Rafael');

    const comBusca = await loadDashboardCarousels<Linha>(
      esperar(dashboardCarouselsQuery(db, { ...rangeForPage(1), termo: 'zebra' })),
    );

    expect(comBusca.error).toBeNull();
    expect(comBusca.carousels.map((c) => c.title)).toEqual(['Zebra do Rafael']);
    // O total passa a ser o do RESULTADO — é ele que decide quantas páginas há.
    expect(comBusca.total).toBe(1);
  });

  it('busca sem acento de maiúscula: "ZEBRA" acha "Zebra"', async () => {
    const out = await loadDashboardCarousels<Linha>(
      esperar(dashboardCarouselsQuery(bancoDeMentira(), { ...rangeForPage(1), termo: 'ZEBRA' })),
    );
    expect(out.carousels.map((c) => c.title)).toEqual(['Zebra do Rafael']);
  });

  it('sem termo, a query NÃO leva ilike — a lista normal continua a mesma', () => {
    const db = bancoDeMentira();
    dashboardCarouselsQuery(db, { ...rangeForPage(2) });
    expect(db.chamadas.some((c) => c.startsWith('ilike'))).toBe(false);
  });

  it('a contagem também é filtrada: o "de N" fala do resultado, não do acervo', async () => {
    const db = bancoDeMentira();
    const { count } = (await esperar<Linha>(dashboardCountQuery(db, 'carrossel'))) as unknown as {
      count: number;
    };
    expect(count).toBe(10);

    const semTermo = (await esperar<Linha>(dashboardCountQuery(db))) as unknown as { count: number };
    expect(semTermo.count).toBe(12);
  });

  it('busca sem resultado é lista vazia LEGÍTIMA: erro null, total 0', async () => {
    const out = await loadDashboardCarousels<Linha>(
      esperar(dashboardCarouselsQuery(bancoDeMentira(), { ...rangeForPage(1), termo: 'jabuticaba' })),
    );
    expect(out.error).toBeNull();
    expect(out.carousels).toEqual([]);
    expect(out.total).toBe(0);
  });

  /**
   * 🔴 O ponto que o Orquestrador marcou: buscar é um QUARTO caminho e não pode
   * colapsar nos três desfechos. Query que falha durante a busca é FALHA, nunca
   * "não encontrei nada" — foi esse colapso que criou o dashboard vazio.
   */
  it('busca que FALHA não vira "nenhum resultado"', async () => {
    const onError = vi.fn();
    const db = bancoDeMentira(ACERVO, { message: 'permission denied' });
    const out = await loadDashboardCarousels<Linha>(
      esperar(dashboardCarouselsQuery(db, { ...rangeForPage(1), termo: 'zebra' })),
      { onError },
    );

    expect(out.error).toBe('query');
    expect(out.total).toBeNull();
    expect(onError).toHaveBeenCalledWith('query', { message: 'permission denied' });
  });

  it('a busca paginada pede o MESMO recorte de sempre', async () => {
    const muitos = Array.from({ length: 25 }, (_, i) => ({ id: `z${i}`, title: `Zebra ${i}` }));
    const db = bancoDeMentira(muitos);

    const p2 = await loadDashboardCarousels<Linha>(
      esperar(dashboardCarouselsQuery(db, { ...rangeForPage(2), termo: 'zebra' })),
    );
    expect(p2.carousels).toHaveLength(DASHBOARD_PAGE_SIZE);
    expect(p2.carousels[0].title).toBe('Zebra 10');
    expect(p2.total).toBe(25);
  });
});

describe('termo do usuário → padrão do LIKE', () => {
  it('coringas do LIKE digitados pelo usuário são texto, não coringa', async () => {
    expect(ilikePatternFor('50%')).toBe('%50\\%%');
    expect(ilikePatternFor('a_b')).toBe('%a\\_b%');
    expect(ilikePatternFor('c:\\x')).toBe('%c:\\\\x%');

    // Sem escape, "%" sozinho traria o ACERVO INTEIRO (12). Escapado, é texto:
    // acha só quem tem o caractere no título.
    const out = await loadDashboardCarousels<Linha>(
      esperar(dashboardCarouselsQuery(bancoDeMentira(), { ...rangeForPage(1), termo: '%' })),
    );
    expect(out.carousels.map((c) => c.title)).toEqual(['Lucro de 50% no mês']);
  });

  it('"50%" acha o carrossel que tem 50% no título', async () => {
    const out = await loadDashboardCarousels<Linha>(
      esperar(dashboardCarouselsQuery(bancoDeMentira(), { ...rangeForPage(1), termo: '50%' })),
    );
    expect(out.carousels.map((c) => c.title)).toEqual(['Lucro de 50% no mês']);
  });

  it('só espaço em branco é o mesmo que não buscar', () => {
    expect(parseSearchParam('   ')).toBe('');
    expect(parseSearchParam(undefined)).toBe('');
    expect(parseSearchParam(' zebra ')).toBe('zebra');
    expect(parseSearchParam(['zebra', 'outro'])).toBe('zebra');
  });
});

describe('endereço: página e busca viajam juntas', () => {
  it('sem nada é a raiz limpa', () => {
    expect(dashboardHref(1)).toBe('/dashboard');
    expect(dashboardHref(1, '')).toBe('/dashboard');
  });

  it('paginar dentro da busca preserva o termo', () => {
    expect(dashboardHref(3, 'zebra')).toBe('/dashboard?q=zebra&page=3');
  });

  it('busca na primeira página não carrega ?page=1 inútil', () => {
    expect(dashboardHref(1, 'zebra')).toBe('/dashboard?q=zebra');
  });

  it('sem busca continua sendo só a página', () => {
    expect(dashboardHref(2)).toBe('/dashboard?page=2');
  });
});

/* ── A tela ───────────────────────────────────────────────────────────────── */

const carrossel = (id: string, title: string) =>
  ({
    id, title, style: 'minimalist', status: 'draft', accent_color: '#000', theme: 'light',
    font_pair: 'a', corners: null, profile_badge: null, created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z', slides: [{ count: 3 }], coverSlide: null,
  }) as never;

describe('a tela separa os quatro casos', () => {
  it('digitar leva o termo para o URL — é o servidor que busca', () => {
    vi.useFakeTimers();
    try {
      render(<DashboardClient initialCarousels={[carrossel('a', 'Um')]} totalCarousels={12} />);
      fireEvent.change(screen.getByPlaceholderText('Buscar…'), { target: { value: 'zebra' } });
      act(() => { vi.advanceTimersByTime(500); });

      expect(replace).toHaveBeenCalledWith('/dashboard?q=zebra');
    } finally {
      vi.useRealTimers();
    }
  });

  it('trocar o termo volta para a página 1', () => {
    vi.useFakeTimers();
    try {
      render(
        <DashboardClient
          initialCarousels={[]} totalCarousels={0} page={3} totalPages={3} searchTerm="zebra"
        />,
      );
      fireEvent.change(screen.getByPlaceholderText('Buscar…'), { target: { value: 'gato' } });
      act(() => { vi.advanceTimersByTime(500); });

      // 🔴 Página 3 de "zebra" não é página 3 de "gato": ficar na 3 deixaria o
      // usuário olhando resultado nenhum de uma busca que tem resultado.
      expect(replace).toHaveBeenCalledWith('/dashboard?q=gato');
    } finally {
      vi.useRealTimers();
    }
  });

  it('busca SEM RESULTADO diz que não achou — e não oferece "primeiro carrossel"', () => {
    render(
      <DashboardClient initialCarousels={[]} totalCarousels={0} searchTerm="jabuticaba" />,
    );

    expect(screen.getByText(/nenhum carrossel/i)).toBeTruthy();
    expect(screen.getByText(/jabuticaba/)).toBeTruthy();
    // O usuário TEM carrosséis; convidá-lo a criar o primeiro seria mentira.
    expect(screen.queryByText('Criar primeiro carrossel')).toBeNull();
  });

  it('acervo vazio de verdade continua sendo o convite de sempre', () => {
    render(<DashboardClient initialCarousels={[]} totalCarousels={0} />);
    expect(screen.getByText('Criar primeiro carrossel')).toBeTruthy();
    expect(screen.queryByText(/nenhum carrossel/i)).toBeNull();
  });

  it('🔴 busca que FALHOU mostra erro, nunca "nenhum resultado"', () => {
    render(
      <DashboardClient
        initialCarousels={[]} totalCarousels={null} searchTerm="zebra" loadError="query"
      />,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/nenhum carrossel/i)).toBeNull();
    expect(screen.queryByText('Criar primeiro carrossel')).toBeNull();
  });

  it('a paginação continua na tela durante a busca, contando o resultado', () => {
    render(
      <DashboardClient
        initialCarousels={[carrossel('a', 'Zebra 1')]} totalCarousels={14}
        page={1} totalPages={2} searchTerm="zebra"
      />,
    );
    expect(screen.getByText('1-10 de 14')).toBeTruthy();
    expect(screen.getByLabelText('Próxima página')).toBeTruthy();
  });

  it('limpar a busca devolve a lista inteira, na página 1', () => {
    vi.useFakeTimers();
    try {
      render(
        <DashboardClient initialCarousels={[]} totalCarousels={0} page={2} searchTerm="zebra" />,
      );
      fireEvent.change(screen.getByPlaceholderText('Buscar…'), { target: { value: '' } });
      act(() => { vi.advanceTimersByTime(500); });

      expect(replace).toHaveBeenCalledWith('/dashboard');
    } finally {
      vi.useRealTimers();
    }
  });
});
