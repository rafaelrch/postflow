// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  DASHBOARD_PAGE_SIZE,
  loadDashboardCarousels,
  pageRedirectTarget,
  parsePageParam,
  rangeForPage,
  totalPagesFor,
} from '@/lib/dashboard-data';
import Pagination from '@/components/ui/Pagination';

/**
 * PAGINAÇÃO — recorte no BANCO, nunca fatia no cliente.
 *
 * A regra não é estética: esta rota já custou caro. A query trazia
 * `coverSlide:slides(*)`, gastava 4,2s, o teto estourava e o dashboard
 * aparecia VAZIO. Buscar 10 linhas em vez de todas é o conserto continuando de
 * pé; buscar tudo para mostrar 10 seria voltar ao lugar onde apanhamos.
 */

afterEach(cleanup);

describe('recorte pedido ao banco', () => {
  it('página 2 pede o intervalo 10..19', () => {
    expect(rangeForPage(2)).toEqual({ from: 10, to: 19 });
  });

  it('página 1 pede 0..9 e o tamanho é o combinado com o Rafael', () => {
    expect(DASHBOARD_PAGE_SIZE).toBe(10);
    expect(rangeForPage(1)).toEqual({ from: 0, to: 9 });
  });

  it('o intervalo tem sempre o tamanho de uma página', () => {
    for (const p of [1, 2, 5, 37]) {
      const { from, to } = rangeForPage(p);
      expect(to - from + 1).toBe(DASHBOARD_PAGE_SIZE);
    }
  });
});

describe('?page fora do intervalo', () => {
  it('lixo no URL vira página 1, nunca NaN', () => {
    for (const bruto of ['0', '-3', 'abc', '', undefined, '1.5']) {
      expect(parsePageParam(bruto), String(bruto)).toBe(1);
    }
  });

  it('array no query string usa o primeiro valor', () => {
    expect(parsePageParam(['3', '9'])).toBe(3);
  });

  it('página válida passa intacta', () => {
    expect(parsePageParam('4')).toBe(4);
  });

  /**
   * 🔴 O quarto caso. Pedir um `.range()` além do fim faz o PostgREST responder
   * ERRO — medido no portal: `?page=99` chegava na tela como "não foi possível
   * carregar". Um dos três desfechos vestindo a roupa de outro é exatamente o
   * que a carga desta tela existe para impedir, então a página é corrigida
   * ANTES de consultar.
   */
  it('página além do fim manda para a última que existe', () => {
    expect(pageRedirectTarget(99, 11)).toBe(2);
    expect(pageRedirectTarget(5, 11)).toBe(2);
    expect(pageRedirectTarget(2, 5)).toBe(1);
  });

  it('página que existe não redireciona', () => {
    expect(pageRedirectTarget(1, 11)).toBeNull();
    expect(pageRedirectTarget(2, 11)).toBeNull();
  });

  it('sem carrossel nenhum não redireciona — a página 1 vazia é legítima', () => {
    expect(pageRedirectTarget(1, 0)).toBeNull();
    expect(pageRedirectTarget(3, 0)).toBeNull();
  });

  it('total DESCONHECIDO não redireciona: navegar esconderia a falha', () => {
    expect(pageRedirectTarget(99, null)).toBeNull();
  });

  it('12 carrosséis dão 2 páginas; 10 dão 1; 0 continua sendo 1', () => {
    expect(totalPagesFor(12)).toBe(2);
    expect(totalPagesFor(10)).toBe(1);
    expect(totalPagesFor(11)).toBe(2);
    // Zero item é UMA página — a vazia. Zero páginas não existe na tela.
    expect(totalPagesFor(0)).toBe(1);
  });
});

/**
 * 🔴 A regressão que mais preocupa: a paginação entra no MEIO da carga que
 * separa os três desfechos. Falha não pode voltar a virar "não há nada".
 */
describe('os três desfechos continuam distintos com paginação no meio', () => {
  const query = <T,>(r: { data: T[] | null; error: unknown; count?: number | null }) =>
    Promise.resolve(r);

  it('CARREGOU: devolve a página e o total do banco', async () => {
    const pagina = [{ id: 'a' }, { id: 'b' }];
    const out = await loadDashboardCarousels(query({ data: pagina, error: null, count: 12 }));

    expect(out.error).toBeNull();
    expect(out.carousels).toHaveLength(2);
    // O total é o do BANCO, não o tamanho da página.
    expect(out.total).toBe(12);
  });

  it('NÃO HÁ NADA: lista vazia com count 0 é afirmação sobre os dados', async () => {
    const out = await loadDashboardCarousels(query({ data: [], error: null, count: 0 }));

    expect(out.error).toBeNull();
    expect(out.carousels).toEqual([]);
    expect(out.total).toBe(0);
  });

  it('FALHOU: erro não vira lista vazia — e o total fica DESCONHECIDO', async () => {
    const out = await loadDashboardCarousels(query({ data: null, error: { message: 'boom' }, count: null }));

    expect(out.error).toBe('query');
    // 🔴 `total: 0` aqui seria a mesma mentira que a lista vazia: diria que o
    // usuário não tem carrossel quando só a leitura falhou.
    expect(out.total).toBeNull();
  });

  it('FALHOU por timeout: idem, e o total não é zero', async () => {
    vi.useFakeTimers();
    try {
      const nunca = new Promise<{ data: null; error: unknown }>(() => {});
      const p = loadDashboardCarousels(nunca, { timeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(60);
      const out = await p;

      expect(out.error).toBe('timeout');
      expect(out.total).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sem `count` na query o total cai para o tamanho do que veio', async () => {
    const out = await loadDashboardCarousels(query({ data: [{ id: 'a' }], error: null }));
    expect(out.total).toBe(1);
  });
});

/**
 * O controle passou ao desenho do Gmail: um rótulo de INTERVALO e dois
 * chevrons. Quem informa é o intervalo — "Página X de Y" deixou de existir, e
 * os testes que afirmavam aquele texto passam a afirmar o intervalo. A
 * intenção é a mesma: o usuário tem de saber onde está e conseguir andar.
 */
describe('controle de paginação', () => {
  it('mostra o intervalo no lugar do número da página', () => {
    render(<Pagination page={1} totalPages={2} totalItems={11} pageSize={10} onChange={vi.fn()} />);

    expect(screen.getByText('1-10 de 11')).toBeTruthy();
    expect(screen.queryByText(/Página \d+ de \d+/)).toBeNull();
  });

  it('a última página anuncia só o que existe, não o tamanho cheio', () => {
    render(<Pagination page={2} totalPages={2} totalItems={11} pageSize={10} onChange={vi.fn()} />);
    // 🔴 "11-20 de 11" seria prometer item que não existe.
    expect(screen.getByText('11-11 de 11')).toBeTruthy();
  });

  it('usa separador de milhar do pt-BR quando o número cresce', () => {
    render(<Pagination page={1} totalPages={420} totalItems={20974} pageSize={50} onChange={vi.fn()} />);
    expect(screen.getByText('1-50 de 20.974')).toBeTruthy();
  });

  it('com uma página só o rótulo FICA e as setas somem', () => {
    render(<Pagination page={1} totalPages={1} totalItems={3} pageSize={10} onChange={vi.fn()} />);

    // O intervalo é a única fonte da contagem na lista de notícias; sumir com
    // ele esconderia informação. Quem vira ruído é a navegação que não navega.
    expect(screen.getByText('1-3 de 3')).toBeTruthy();
    expect(screen.queryByLabelText('Página anterior')).toBeNull();
    expect(screen.queryByLabelText('Próxima página')).toBeNull();
  });

  it('lista vazia não inventa intervalo', () => {
    render(<Pagination page={1} totalPages={1} totalItems={0} pageSize={10} onChange={vi.fn()} />);
    expect(screen.getByText('0 de 0')).toBeTruthy();
  });

  it('desabilita "anterior" na primeira e "próxima" na última', () => {
    const { unmount } = render(
      <Pagination page={1} totalPages={3} totalItems={25} pageSize={10} onChange={vi.fn()} />,
    );
    expect((screen.getByLabelText('Página anterior') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Próxima página') as HTMLButtonElement).disabled).toBe(false);
    unmount();

    render(<Pagination page={3} totalPages={3} totalItems={25} pageSize={10} onChange={vi.fn()} />);
    expect((screen.getByLabelText('Página anterior') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText('Próxima página') as HTMLButtonElement).disabled).toBe(true);
  });

  it('desabilitado PARECE desabilitado, não só para de funcionar', () => {
    render(<Pagination page={1} totalPages={3} totalItems={25} pageSize={10} onChange={vi.fn()} />);
    const anterior = screen.getByLabelText('Página anterior');
    // Tinta apagada e cursor de bloqueio — sinal visível, não só `disabled`.
    expect(anterior.className).toContain('disabled:text-[var(--ink-muted)]');
    expect(anterior.className).toContain('disabled:cursor-not-allowed');
  });

  it('navega para a página vizinha, sem passar do fim', () => {
    const onChange = vi.fn();
    render(<Pagination page={2} totalPages={3} totalItems={25} pageSize={10} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('Próxima página'));
    expect(onChange).toHaveBeenLastCalledWith(3);

    fireEvent.click(screen.getByLabelText('Página anterior'));
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('é alcançável por teclado, com rótulo acessível e intervalo anunciável', () => {
    render(
      <Pagination
        page={1} totalPages={2} totalItems={11} pageSize={10}
        onChange={vi.fn()} label="Paginação dos carrosséis"
      />,
    );

    const nav = screen.getByRole('navigation', { name: 'Paginação dos carrosséis' });
    expect(nav).toBeTruthy();
    // Botões nativos: entram na ordem de tabulação sem tabindex manual.
    for (const b of screen.getAllByRole('button')) expect(b.tagName).toBe('BUTTON');
    // O intervalo muda sem trocar de tela — precisa ser anunciado.
    expect(screen.getByText('1-10 de 11').getAttribute('aria-live')).toBe('polite');
  });
});
