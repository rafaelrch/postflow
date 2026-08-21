import { describe, expect, it, vi } from 'vitest';
import {
  DESCRIPTION_MAX,
  ROADMAP_STATUSES,
  ROADMAP_STATUS_LABELS,
  TITLE_MAX,
  TITLE_MIN,
  isRoadmapApproval,
  isRoadmapStatus,
  loadRoadmapBoard,
  validateSuggestion,
  type RoadmapQuery,
  type RoadmapReadClient,
} from '../lib/roadmap';

/**
 * Chain aguardável no formato do builder do supabase-js: `.eq()`/`.order()`
 * devolvem o próprio builder e o `await` no fim dispara. Um objeto só serve
 * para as três consultas do quadro.
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

describe('roadmap — as 4 colunas são fixas', () => {
  it('tem exatamente as 4 colunas do quadro, na ordem', () => {
    expect([...ROADMAP_STATUSES]).toEqual(['backlog', 'faremos', 'cozinhando', 'pronto']);
  });

  it('cada coluna tem rótulo de interface', () => {
    expect(ROADMAP_STATUS_LABELS.cozinhando).toBe('Estamos cozinhando');
    for (const status of ROADMAP_STATUSES) {
      expect(ROADMAP_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it('reconhece status e aprovação válidos e recusa o resto', () => {
    expect(isRoadmapStatus('pronto')).toBe(true);
    expect(isRoadmapStatus('em_analise')).toBe(false);
    expect(isRoadmapStatus(3)).toBe(false);
    expect(isRoadmapApproval('rejected')).toBe(true);
    expect(isRoadmapApproval('aprovado')).toBe(false);
  });
});

describe('roadmap — validação da sugestão', () => {
  const validos = { title: 'Exportar em PDF', description: 'Queria baixar o carrossel como PDF.' };

  it('aceita título e descrição válidos, já aparados', () => {
    const r = validateSuggestion({ title: '  Exportar em PDF  ', description: `  ${validos.description}  ` });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe('Exportar em PDF');
      expect(r.value.description).toBe(validos.description);
    }
  });

  it('recusa título curto com mensagem que diz o mínimo', () => {
    const r = validateSuggestion({ ...validos, title: 'oi' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fields.title).toContain(String(TITLE_MIN));
      expect(r.fields.description).toBeUndefined();
    }
  });

  it('recusa título longo e diz quanto tem', () => {
    const title = 'a'.repeat(TITLE_MAX + 1);
    const r = validateSuggestion({ ...validos, title });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fields.title).toContain(String(TITLE_MAX + 1));
  });

  /**
   * A DESCRIÇÃO É OPCIONAL (decisão do Rafael, 21/08). Não há mínimo: só o
   * teto, que é o que protege o CHECK do banco. Este teste é o oposto do que
   * havia aqui antes — que exigia 10 caracteres.
   */
  it('aceita descrição vazia, ausente e só com espaços', () => {
    expect(validateSuggestion({ title: validos.title, description: '' }).ok).toBe(true);
    expect(validateSuggestion({ title: validos.title }).ok).toBe(true);
    expect(validateSuggestion({ title: validos.title, description: '   ' }).ok).toBe(true);

    const r = validateSuggestion({ title: validos.title, description: '   ' });
    if (r.ok) expect(r.value.description).toBe('');
  });

  it('aceita descrição curtíssima: "ok" não é erro', () => {
    expect(validateSuggestion({ ...validos, description: 'ok' }).ok).toBe(true);
  });

  it('recusa descrição longa e diz o teto', () => {
    const longa = validateSuggestion({ ...validos, description: 'a'.repeat(DESCRIPTION_MAX + 1) });
    expect(longa.ok).toBe(false);
    if (!longa.ok) expect(longa.fields.description).toContain(String(DESCRIPTION_MAX));
  });

  /** O título continua obrigatório — o opcional é só a descrição. */
  it('recusa título ausente com mensagem própria, sem reclamar da descrição', () => {
    const r = validateSuggestion({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fields.title).toBe('Escreva um título.');
      expect(r.fields.description).toBeUndefined();
    }
  });

  it('recusa HTML nos dois campos', () => {
    const t = validateSuggestion({ ...validos, title: 'Quero <script>alert(1)</script>' });
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.fields.title).toContain('HTML');

    const d = validateSuggestion({ ...validos, description: 'Texto com <img src=x onerror=1> dentro.' });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.fields.description).toContain('HTML');
  });

  /**
   * O ponto do `HTML_LIKE`: rejeitar marcação sem rejeitar matemática. Uma
   * sugestão legítima sobre limites usa "<" e não pode levar 400.
   */
  it('deixa passar maior/menor que não é tag', () => {
    const r = validateSuggestion({
      title: 'Avisar quando o texto < 10 caracteres',
      description: 'Se o título tiver a > b caracteres, mostrar aviso no editor.',
    });
    expect(r.ok).toBe(true);
  });

  it('não confia em tipo: número e null são entrada inválida, não crash', () => {
    expect(validateSuggestion({ title: 42, description: null }).ok).toBe(false);
    expect(validateSuggestion(null).ok).toBe(false);
    expect(validateSuggestion(undefined).ok).toBe(false);
  });
});

describe('roadmap — leitura do quadro', () => {
  const cards = [
    { id: 'c1', title: 'A', description: 'aa', status: 'backlog', position: 0, created_at: '2026-08-01' },
    { id: 'c2', title: 'B', description: 'bb', status: 'pronto', position: 0, created_at: '2026-08-02' },
  ];

  function client(opts: {
    cards?: Record<string, unknown>[];
    counts?: Record<string, unknown>[];
    mine?: Record<string, unknown>[];
    cardsError?: unknown;
    countsError?: unknown;
  }) {
    const cardsQ = chain({ data: opts.cards ?? cards, error: opts.cardsError });
    const countsQ = chain({ data: opts.counts ?? [], error: opts.countsError });
    const mineQ = chain({ data: opts.mine ?? [] });
    const selectCalls: { table: string; columns: string }[] = [];
    let votesSelects = 0;

    const c: RoadmapReadClient = {
      from(table: string) {
        return {
          select(columns: string) {
            selectCalls.push({ table, columns });
            if (table === 'roadmap_cards') return cardsQ;
            votesSelects += 1;
            return votesSelects === 1 ? countsQ : mineQ;
          },
        };
      },
    };
    return { c, cardsQ, countsQ, mineQ, selectCalls };
  }

  it('devolve SEMPRE as 4 colunas, mesmo vazias', async () => {
    const { c } = client({ cards: [] });
    const board = await loadRoadmapBoard(c, null);
    expect(board.map((col) => col.status)).toEqual(['backlog', 'faremos', 'cozinhando', 'pronto']);
    expect(board.every((col) => col.cards.length === 0)).toBe(true);
  });

  it('agrupa cada card na sua coluna', async () => {
    const { c } = client({});
    const board = await loadRoadmapBoard(c, null);
    expect(board[0].cards.map((x) => x.id)).toEqual(['c1']);
    expect(board[3].cards.map((x) => x.id)).toEqual(['c2']);
    expect(board[1].cards).toEqual([]);
  });

  /** Só o que o admin aprovou entra no quadro — é o filtro que segura a fila. */
  it('lê SÓ os aprovados: filtra approval = approved na consulta', async () => {
    const { c, cardsQ } = client({});
    await loadRoadmapBoard(c, null);
    expect(cardsQ.calls).toContainEqual({ method: 'eq', args: ['approval', 'approved'] });
  });

  it('conta os votos por card sem carregar quem votou', async () => {
    const { c, selectCalls } = client({
      counts: [{ card_id: 'c1' }, { card_id: 'c1' }, { card_id: 'c2' }],
    });
    const board = await loadRoadmapBoard(c, null);
    expect(board[0].cards[0].voteCount).toBe(2);
    expect(board[3].cards[0].voteCount).toBe(1);

    // A consulta de contagem pede SÓ card_id. Se um dia alguém acrescentar
    // user_id aqui "para facilitar", a lista de votantes passa pelo servidor.
    const contagem = selectCalls.find((s) => s.table === 'roadmap_votes');
    expect(contagem?.columns).toBe('card_id');
    expect(contagem?.columns).not.toContain('user_id');
  });

  it('nenhum card devolvido expõe autoria ou votante', async () => {
    const { c } = client({ counts: [{ card_id: 'c1' }] });
    const board = await loadRoadmapBoard(c, 'u1');
    const card = board[0].cards[0] as Record<string, unknown>;
    expect(Object.keys(card).sort()).toEqual(
      ['createdAt', 'description', 'hasVoted', 'id', 'position', 'status', 'title', 'voteCount'],
    );
    expect(card.authorId).toBeUndefined();
  });

  it('marca hasVoted só nos cards em que o usuário atual votou', async () => {
    const { c } = client({ counts: [{ card_id: 'c1' }, { card_id: 'c2' }], mine: [{ card_id: 'c2' }] });
    const board = await loadRoadmapBoard(c, 'u1');
    expect(board[0].cards[0].hasVoted).toBe(false);
    expect(board[3].cards[0].hasVoted).toBe(true);
  });

  it('visitante sem sessão: hasVoted false e nenhuma consulta de voto próprio', async () => {
    const { c, selectCalls } = client({ counts: [{ card_id: 'c1' }] });
    const board = await loadRoadmapBoard(c, null);
    expect(board[0].cards[0].hasVoted).toBe(false);
    expect(selectCalls.filter((s) => s.table === 'roadmap_votes')).toHaveLength(1);
  });

  it('descarta linha com status fora das 4 colunas em vez de inventar coluna', async () => {
    const { c } = client({
      cards: [{ id: 'x', title: 'T', description: '', status: 'arquivado', position: 0, created_at: '' }],
    });
    const board = await loadRoadmapBoard(c, null);
    expect(board.every((col) => col.cards.length === 0)).toBe(true);
  });

  it('falha de leitura vira erro, não quadro vazio silencioso', async () => {
    const { c } = client({ cardsError: { message: 'boom' } });
    await expect(loadRoadmapBoard(c, null)).rejects.toThrow('roadmap_cards_read_failed');

    const votos = client({ countsError: { message: 'boom' } });
    await expect(loadRoadmapBoard(votos.c, null)).rejects.toThrow('roadmap_votes_count_failed');
  });
});
