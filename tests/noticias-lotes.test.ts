import { describe, it, expect, vi } from 'vitest';
import {
  NEWS_PAGE_SIZE,
  agruparChaves,
  apagarLoteDeNoticias,
  chaveDoLote,
  idsDoLote,
  mensagemDeConfirmacao,
  paginarLotes,
  type ChaveDeLote,
  type LoteApagavel,
} from '@/lib/news-batches';

/**
 * LOTES DE NOTÍCIAS — agrupamento, paginação e o apagar.
 *
 * A linha do banco é um CARD; a unidade da lista é o LOTE. Tudo que dá errado
 * aqui dá errado por confundir os dois: paginar linhas corta lote no meio, e
 * apagar UMA linha deixa lote pela metade.
 */

const chave = (id: string, batch_id: string | null, created_at = '2026-01-01T00:00:00Z'): ChaveDeLote =>
  ({ id, batch_id, created_at });

describe('agrupamento por lote', () => {
  it('junta as linhas do mesmo batch_id preservando a ordem de chegada', () => {
    const { ordem, idsPorLote } = agruparChaves([
      chave('r1', 'B'), chave('r2', 'B'), chave('r3', 'A'), chave('r4', 'B'),
    ]);

    expect(ordem).toEqual(['B', 'A']);
    // 🔴 r4 é do lote B mesmo tendo chegado depois de A: quem agrupa é o
    // batch_id, não a vizinhança na lista.
    expect(idsPorLote.get('B')).toEqual(['r1', 'r2', 'r4']);
    expect(idsPorLote.get('A')).toEqual(['r3']);
  });

  it('linha SEM batch_id vira um lote só dela — e não se mistura com outra', () => {
    const { ordem, idsPorLote } = agruparChaves([chave('r1', null), chave('r2', null)]);

    expect(ordem).toEqual(['single_r1', 'single_r2']);
    expect(idsPorLote.get('single_r1')).toEqual(['r1']);
    expect(idsPorLote.get('single_r2')).toEqual(['r2']);
  });

  it('lotes de tamanhos diferentes mantêm cada um a sua contagem', () => {
    const { idsPorLote } = agruparChaves([
      chave('a1', 'A'), chave('a2', 'A'), chave('a3', 'A'),
      chave('b1', 'B'),
      chave('c1', 'C'), chave('c2', 'C'),
    ]);

    expect(idsPorLote.get('A')).toHaveLength(3);
    expect(idsPorLote.get('B')).toHaveLength(1);
    expect(idsPorLote.get('C')).toHaveLength(2);
  });

  it('a chave do lote é o batch_id, ou "single_<id>" quando não há', () => {
    expect(chaveDoLote('B', 'r1')).toBe('B');
    expect(chaveDoLote(null, 'r1')).toBe('single_r1');
    expect(chaveDoLote('', 'r1')).toBe('single_r1');
  });
});

describe('paginação por LOTE, não por linha', () => {
  const chaves = (n: number) => Array.from({ length: n }, (_, i) => `L${i + 1}`);

  it('a página 2 começa no 11º LOTE — nunca no meio de um lote', () => {
    const r = paginarLotes(chaves(23), 2, NEWS_PAGE_SIZE);
    expect(r.paginas).toBe(3);
    expect(r.pagina).toBe(2);
    expect(r.chavesDaPagina).toEqual(['L11', 'L12', 'L13', 'L14', 'L15', 'L16', 'L17', 'L18', 'L19', 'L20']);
  });

  it('a última página traz só o que sobrou', () => {
    expect(paginarLotes(chaves(23), 3, NEWS_PAGE_SIZE).chavesDaPagina).toEqual(['L21', 'L22', 'L23']);
  });

  it('página além do fim volta para a última que existe', () => {
    // Apagar o último lote da última página cai exatamente aqui.
    expect(paginarLotes(chaves(11), 9, NEWS_PAGE_SIZE).pagina).toBe(2);
    expect(paginarLotes(chaves(10), 2, NEWS_PAGE_SIZE).pagina).toBe(1);
  });

  it('lixo de página vira 1, e lista vazia continua sendo UMA página', () => {
    expect(paginarLotes([], 1, NEWS_PAGE_SIZE)).toMatchObject({ pagina: 1, paginas: 1, chavesDaPagina: [] });
    expect(paginarLotes(chaves(5), 0, NEWS_PAGE_SIZE).pagina).toBe(1);
    expect(paginarLotes(chaves(5), -7, NEWS_PAGE_SIZE).pagina).toBe(1);
  });

  it('com tamanho 1 cada página é UM lote — é assim que se confere no portal', () => {
    const r = paginarLotes(['A', 'B', 'C'], 2, 1);
    expect(r.paginas).toBe(3);
    expect(r.chavesDaPagina).toEqual(['B']);
  });
});

/* ── Apagar um lote ───────────────────────────────────────────────────────── */

const lote = (ids: (string | undefined)[], createdAt = '2026-02-03T12:00:00Z'): LoteApagavel => ({
  batchId: 'B',
  createdAt,
  items: ids.map((dbId) => ({ dbId })),
});

const bancoQueApaga = (erro: unknown = null) => {
  const apagados: string[][] = [];
  return {
    apagados,
    from: () => ({
      delete: () => ({
        in: (_coluna: string, ids: string[]) => {
          apagados.push(ids);
          return Promise.resolve({ error: erro });
        },
      }),
    }),
  };
};

describe('apagar um lote inteiro', () => {
  it('🔴 NÃO apaga no primeiro clique: sem confirmação, nada sai do banco', async () => {
    const db = bancoQueApaga();
    const confirmar = vi.fn(() => false);

    const r = await apagarLoteDeNoticias({ lote: lote(['a', 'b']), supabase: db, confirmar });

    expect(r).toEqual({ desfecho: 'cancelado' });
    expect(db.apagados).toEqual([]);
  });

  it('🔴 apaga TODAS as linhas do lote, não só a primeira', async () => {
    const db = bancoQueApaga();
    const r = await apagarLoteDeNoticias({
      lote: lote(['a', 'b', 'c']), supabase: db, confirmar: () => true,
    });

    // Meia dúzia de linhas de fora deixaria um lote corrompido pela metade.
    expect(db.apagados).toEqual([['a', 'b', 'c']]);
    expect(r).toEqual({ desfecho: 'apagado', apagadas: 3 });
  });

  it('lote "single_" (linha solta, sem batch_id) apaga a sua única linha', async () => {
    const db = bancoQueApaga();
    const solto: LoteApagavel = { batchId: null, createdAt: '2026-02-03T12:00:00Z', items: [{ dbId: 'x' }] };

    const r = await apagarLoteDeNoticias({ lote: solto, supabase: db, confirmar: () => true });

    expect(db.apagados).toEqual([['x']]);
    expect(r).toEqual({ desfecho: 'apagado', apagadas: 1 });
  });

  it('🔴 falha do banco é FALHA — não se confunde com "apagou"', async () => {
    const db = bancoQueApaga({ message: 'permission denied' });
    const r = await apagarLoteDeNoticias({ lote: lote(['a']), supabase: db, confirmar: () => true });

    expect(r).toMatchObject({ desfecho: 'falhou' });
  });

  it('exceção da rede também sai como falha, não como silêncio', async () => {
    const db = { from: () => ({ delete: () => ({ in: () => { throw new Error('offline'); } }) }) };
    const r = await apagarLoteDeNoticias({ lote: lote(['a']), supabase: db, confirmar: () => true });

    expect(r).toMatchObject({ desfecho: 'falhou' });
  });

  it('lote sem id no banco não vira DELETE sem alvo', async () => {
    const db = bancoQueApaga();
    // Sem `.in()` com ids, um delete solto apagaria o que o RLS deixasse.
    const r = await apagarLoteDeNoticias({
      lote: lote([undefined, undefined]), supabase: db, confirmar: () => true,
    });

    expect(r).toEqual({ desfecho: 'sem-ids' });
    expect(db.apagados).toEqual([]);
  });

  it('linhas sem id não impedem apagar as que têm', () => {
    expect(idsDoLote(lote(['a', undefined, 'c']))).toEqual(['a', 'c']);
  });
});

describe('a confirmação diz o que vai ser apagado', () => {
  it('nomeia a DATA do lote e QUANTOS cards', () => {
    const msg = mensagemDeConfirmacao(lote(['a', 'b', 'c']), () => '03 de fevereiro de 2026');

    expect(msg).toContain('03 de fevereiro de 2026');
    expect(msg).toContain('3 cards');
    // Irreversível tem de estar escrito, não subentendido.
    expect(msg.toLowerCase()).toContain('não pode ser desfeita');
  });

  it('um card só não vira "1 cards"', () => {
    expect(mensagemDeConfirmacao(lote(['a']), () => 'hoje')).toContain('1 card ');
  });
});
