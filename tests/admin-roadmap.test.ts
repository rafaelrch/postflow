import { describe, expect, it } from 'vitest';
import {
  emptyAdminBoard,
  loadAdminRoadmapBoard,
} from '../lib/admin-roadmap';
import type { RoadmapQuery, RoadmapReadClient } from '../lib/roadmap';

/**
 * Chain aguardável no formato do builder do supabase-js — mesmo molde de
 * `tests/roadmap.test.ts`: `.eq()`/`.order()` devolvem o próprio builder e o
 * `await` no fim dispara.
 */
function chain(result: { data?: Record<string, unknown>[] | null; error?: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const q = {
    calls,
    eq(...args: unknown[]) {
      calls.push({ method: 'eq', args });
      return q;
    },
    order(...args: unknown[]) {
      calls.push({ method: 'order', args });
      return q;
    },
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(res, rej);
    },
  };
  return q as unknown as RoadmapQuery & { calls: typeof calls };
}

const LINHAS = [
  { id: 'a1', title: 'Aprovado no backlog', description: 'x', status: 'backlog', approval: 'approved', position: 0, created_at: '2026-08-01' },
  { id: 'a2', title: 'Aprovado pronto', description: '', status: 'pronto', approval: 'approved', position: 0, created_at: '2026-08-02' },
  { id: 'p1', title: 'Pendente antigo', description: 'y', status: 'backlog', approval: 'pending', position: 0, created_at: '2026-07-30' },
  { id: 'r1', title: 'Spam recusado', description: '', status: 'backlog', approval: 'rejected', position: 0, created_at: '2026-07-31' },
];

function client(opts: {
  cards?: Record<string, unknown>[];
  counts?: Record<string, unknown>[];
  cardsError?: unknown;
  countsError?: unknown;
} = {}) {
  const cardsQ = chain({ data: opts.cards ?? LINHAS, error: opts.cardsError });
  const countsQ = chain({ data: opts.counts ?? [], error: opts.countsError });
  const selectCalls: { table: string; columns: string }[] = [];

  const c: RoadmapReadClient = {
    from(table: string) {
      return {
        select(columns: string) {
          selectCalls.push({ table, columns });
          return table === 'roadmap_cards' ? cardsQ : countsQ;
        },
      };
    },
  };
  return { c, cardsQ, countsQ, selectCalls };
}

describe('admin/roadmap — o quadro inteiro', () => {
  it('devolve sempre as 4 colunas, mesmo sem card nenhum', async () => {
    const { c } = client({ cards: [] });
    const board = await loadAdminRoadmapBoard(c);
    expect(board.colunas.map((col) => col.status)).toEqual(['backlog', 'faremos', 'cozinhando', 'pronto']);
    expect(board.pendentes).toEqual([]);
    expect(board.recusados).toEqual([]);
  });

  /**
   * A diferença inteira em relação à leitura pública: ESTA não filtra por
   * approval. É o que resgata os 'pending' que ninguém mais vê.
   */
  it('NÃO filtra por approval — é o que faz pendente e recusado aparecerem', async () => {
    const { c, cardsQ } = client();
    const board = await loadAdminRoadmapBoard(c);

    expect(cardsQ.calls.some((call) => call.method === 'eq' && call.args[0] === 'approval')).toBe(false);
    expect(board.pendentes.map((x) => x.id)).toEqual(['p1']);
    expect(board.recusados.map((x) => x.id)).toEqual(['r1']);
  });

  it('separa os três grupos: pendente, no quadro e recusado', async () => {
    const { c } = client();
    const board = await loadAdminRoadmapBoard(c);

    expect(board.colunas[0].cards.map((x) => x.id)).toEqual(['a1']);
    expect(board.colunas[3].cards.map((x) => x.id)).toEqual(['a2']);
    // Pendente e recusado NÃO entram nas colunas do quadro público, mesmo tendo
    // status 'backlog': a coluna representa o que o cliente vê.
    expect(board.colunas.flatMap((col) => col.cards).map((x) => x.id)).toEqual(['a1', 'a2']);
  });

  it('cada card carrega o approval, para a tela poder marcar qual é qual', async () => {
    const { c } = client();
    const board = await loadAdminRoadmapBoard(c);
    expect(board.pendentes[0].approval).toBe('pending');
    expect(board.recusados[0].approval).toBe('rejected');
    expect(board.colunas[0].cards[0].approval).toBe('approved');
  });

  it('conta os votos por card', async () => {
    const { c } = client({ counts: [{ card_id: 'a1' }, { card_id: 'a1' }, { card_id: 'p1' }] });
    const board = await loadAdminRoadmapBoard(c);
    expect(board.colunas[0].cards[0].voteCount).toBe(2);
    expect(board.pendentes[0].voteCount).toBe(1);
    expect(board.recusados[0].voteCount).toBe(0);
  });

  // ── o que NÃO pode chegar ao browser ──────────────────────────────────────

  /**
   * service_role BYPASSA RLS: aqui o que protege o dado é o SELECT, não policy
   * nenhuma. Estes dois testes são a trava.
   */
  it('a contagem pede SÓ card_id — quem votou não é nem buscado', async () => {
    const { c, selectCalls } = client({ counts: [{ card_id: 'a1' }] });
    await loadAdminRoadmapBoard(c);

    const votos = selectCalls.find((s) => s.table === 'roadmap_votes');
    expect(votos?.columns).toBe('card_id');
    expect(votos?.columns).not.toContain('user_id');
  });

  it('nenhum card devolvido carrega autoria nem votante, em nenhum dos 3 grupos', async () => {
    const { c, selectCalls } = client({ counts: [{ card_id: 'a1' }] });
    const board = await loadAdminRoadmapBoard(c);

    // Nem sequer é pedido ao banco.
    const cards = selectCalls.find((s) => s.table === 'roadmap_cards');
    expect(cards?.columns).not.toContain('author_id');

    const esperado = ['approval', 'createdAt', 'description', 'id', 'position', 'status', 'title', 'voteCount'];
    for (const card of [...board.pendentes, ...board.colunas.flatMap((c2) => c2.cards), ...board.recusados]) {
      expect(Object.keys(card).sort()).toEqual(esperado);
    }

    // O objeto inteiro que desce para o cliente, serializado: nenhum id de
    // usuário em lugar nenhum, nem "de brinde" dentro de outro campo.
    const serializado = JSON.stringify(board);
    expect(serializado).not.toMatch(/user_id|userId|author/i);
  });

  // ── falhas ────────────────────────────────────────────────────────────────

  it('erro na leitura dos cards VIRA EXCEÇÃO, não quadro vazio', async () => {
    const { c } = client({ cardsError: { message: 'boom' } });
    await expect(loadAdminRoadmapBoard(c)).rejects.toThrow('admin_roadmap_cards_read_failed');
  });

  it('erro na contagem também não devolve quadro pela metade', async () => {
    const { c } = client({ countsError: { message: 'boom' } });
    await expect(loadAdminRoadmapBoard(c)).rejects.toThrow('admin_roadmap_votes_count_failed');
  });

  /** Linha escrita por fora, com status ou approval fora do CHECK, é descartada. */
  it('ignora linha com status ou approval desconhecido', async () => {
    const { c } = client({
      cards: [
        { id: 'x', title: 'T', description: '', status: 'arquivado', approval: 'approved', position: 0, created_at: '' },
        { id: 'y', title: 'T', description: '', status: 'backlog', approval: 'talvez', position: 0, created_at: '' },
        ...LINHAS,
      ],
    });
    const board = await loadAdminRoadmapBoard(c);
    const ids = [...board.pendentes, ...board.colunas.flatMap((col) => col.cards), ...board.recusados].map((x) => x.id);
    expect(ids).not.toContain('x');
    expect(ids).not.toContain('y');
    expect(ids).toHaveLength(4);
  });

  it('emptyAdminBoard traz as 4 colunas e nenhum card', () => {
    const board = emptyAdminBoard();
    expect(board.colunas).toHaveLength(4);
    expect(board.pendentes).toEqual([]);
    expect(board.recusados).toEqual([]);
  });
});
