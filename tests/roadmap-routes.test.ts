import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockFrom, mockAdminFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockAdminFrom: vi.fn(),
}));

// Caminho relativo ao ARQUIVO DE TESTE — resolve para o mesmo módulo que as
// rotas importam como '@/lib/...'. `lib/roadmap`, `lib/rate-limit` e
// `lib/admin-auth` NÃO são mockados de propósito: a validação, o rate limit e a
// decisão de admin rodam de verdade. É o `admin-auth` real que este arquivo
// exercita — ele só enxerga a sessão através do supabase-server mockado abaixo.
vi.mock('../lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mockGetUser }, from: mockFrom }),
}));
vi.mock('../lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({ from: mockAdminFrom }),
}));

import { POST as suggest } from '../app/api/roadmap/suggestions/route';
import { POST as vote } from '../app/api/roadmap/vote/route';
import { PATCH as adminPatch } from '../app/api/roadmap/admin/route';
import { __resetRateLimit } from '../lib/rate-limit';

const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'user@test.com' };
const ADMIN = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'chefe@test.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
};
const CARD = '33333333-3333-4333-8333-333333333333';

/** Builder encadeável e aguardável, no formato do supabase-js. */
function chain(result: Record<string, unknown>) {
  const q: Record<string, unknown> = {};
  for (const m of ['eq', 'select', 'order', 'limit']) q[m] = () => q;
  q.maybeSingle = async () => result;
  q.single = async () => result;
  q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return q;
}

function request(body: unknown, ip = '10.0.0.1') {
  return {
    json: async () => body,
    headers: { get: (h: string) => (h === 'x-forwarded-for' ? ip : null) },
  } as unknown as Parameters<typeof suggest>[0];
}

const VALIDA = { title: 'Exportar em PDF', description: 'Queria baixar o carrossel como PDF.' };

beforeEach(() => {
  __resetRateLimit();
  process.env.ADMIN_EMAILS = 'chefe@test.com';
  mockGetUser.mockResolvedValue({ data: { user: USER } });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------

describe('POST /api/roadmap/suggestions', () => {
  it('sem sessão devolve 401 e não escreve nada', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await suggest(request(VALIDA));
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  /**
   * A sugestão NASCE APROVADA e já aparece no Backlog (decisão do Rafael,
   * 21/08). O que segura o spam não é mais a fila de moderação: é o rate limit
   * desta rota e o 'rejected' do admin, depois.
   */
  it('grava a sugestão como approved, no backlog, com autoria da SESSÃO', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert });

    const res = await suggest(request({ ...VALIDA, authorId: 'forjado', approval: 'approved' }));

    expect(res.status).toBe(201);
    expect(mockFrom).toHaveBeenCalledWith('roadmap_cards');
    expect(insert).toHaveBeenCalledWith({
      title: VALIDA.title,
      description: VALIDA.description,
      author_id: USER.id,
      approval: 'approved',
      status: 'backlog',
      position: 0,
    });
  });

  /**
   * Nascer aprovado abre o BACKLOG, não o quadro. As outras 3 colunas continuam
   * fechadas: um `status: 'pronto'` no corpo é ignorado aqui e recusado pela
   * policy se alguém tentar por fora.
   */
  it('ignora approval, status e autoria mandados pelo cliente', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert });
    await suggest(request({ ...VALIDA, authorId: 'forjado', approval: 'rejected', status: 'pronto' }));
    const payload = insert.mock.calls[0][0];
    expect(payload.author_id).toBe(USER.id);
    expect(payload.approval).toBe('approved');
    expect(payload.status).toBe('backlog');
  });

  /** Descrição é opcional: sem ela a rota grava normalmente, com string vazia. */
  it('aceita sugestão sem descrição', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert });

    const res = await suggest(request({ title: VALIDA.title }));

    expect(res.status).toBe(201);
    expect(insert.mock.calls[0][0].description).toBe('');
  });

  it('título curto: 400 com mensagem útil por campo', async () => {
    const res = await suggest(request({ ...VALIDA, title: 'oi' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fields.title).toMatch(/pelo menos/);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('descrição com HTML: 400 dizendo que não pode HTML', async () => {
    const res = await suggest(request({ ...VALIDA, description: '<script>alert(1)</script> por favor' }));
    expect(res.status).toBe(400);
    expect((await res.json()).fields.description).toContain('HTML');
  });

  it('JSON quebrado: 400, não 500', async () => {
    const bad = {
      json: async () => {
        throw new Error('bad json');
      },
      headers: { get: () => null },
    } as unknown as Parameters<typeof suggest>[0];
    const res = await suggest(bad);
    expect(res.status).toBe(400);
  });

  it('rate limit dispara e devolve Retry-After', async () => {
    mockFrom.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) });
    for (let i = 0; i < 5; i += 1) {
      expect((await suggest(request(VALIDA, '9.9.9.9'))).status).toBe(201);
    }
    const res = await suggest(request(VALIDA, '9.9.9.9'));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('falha do banco não vaza detalhe do Postgres', async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { message: 'relation "roadmap_cards" ...' } }),
    });
    const res = await suggest(request(VALIDA));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('relation');
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/roadmap/vote', () => {
  /** Monta o client para os dois desfechos do toggle. */
  function votesTable(opts: {
    existing?: { id: string } | null;
    insertError?: unknown;
    deleteError?: unknown;
    readError?: unknown;
  }) {
    const insert = vi.fn().mockResolvedValue({ error: opts.insertError ?? null });
    const del = vi.fn().mockReturnValue(chain({ error: opts.deleteError ?? null }));
    mockFrom.mockReturnValue({
      select: () => chain({ data: opts.existing ?? null, error: opts.readError ?? null }),
      insert,
      delete: del,
    });
    return { insert, del };
  }

  it('sem sessão devolve 401 e não escreve nada', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await vote(request({ cardId: CARD }));
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('primeiro voto insere uma linha com o usuário da sessão', async () => {
    const { insert } = votesTable({ existing: null });
    const res = await vote(request({ cardId: CARD }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, voted: true });
    expect(insert).toHaveBeenCalledWith({ card_id: CARD, user_id: USER.id });
  });

  /** Votar de novo DESFAZ — decisão de produto, um clique alterna. */
  it('votar de novo desfaz o voto, sem inserir segunda linha', async () => {
    const { insert, del } = votesTable({ existing: { id: 'v1' } });
    const res = await vote(request({ cardId: CARD }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, voted: false });
    expect(del).toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  /**
   * Corrida entre duas requisições do mesmo usuário: o UNIQUE do banco recusa a
   * segunda com 23505. O voto existe — é o que a pessoa queria. 200, não 500.
   */
  it('violação de UNIQUE vira sucesso idempotente, não erro', async () => {
    votesTable({ existing: null, insertError: { code: '23505' } });
    const res = await vote(request({ cardId: CARD }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, voted: true });
  });

  it('card inexistente (FK) vira 404', async () => {
    votesTable({ existing: null, insertError: { code: '23503' } });
    expect((await vote(request({ cardId: CARD }))).status).toBe(404);
  });

  it('cardId ausente ou não-uuid: 400', async () => {
    expect((await vote(request({}))).status).toBe(400);
    expect((await vote(request({ cardId: 'nao-e-uuid' }))).status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rate limit dispara', async () => {
    votesTable({ existing: null });
    for (let i = 0; i < 30; i += 1) {
      expect((await vote(request({ cardId: CARD }, '8.8.8.8'))).status).toBe(200);
    }
    expect((await vote(request({ cardId: CARD }, '8.8.8.8'))).status).toBe(429);
  });
});

// ---------------------------------------------------------------------------

describe('PATCH /api/roadmap/admin', () => {
  function updatable(row: Record<string, unknown> | null = { id: CARD, status: 'faremos' }) {
    const update = vi.fn().mockReturnValue(chain({ data: row, error: null }));
    mockAdminFrom.mockReturnValue({ update });
    return update;
  }

  it('sem sessão: negado, e o client service_role nem é tocado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await adminPatch(request({ cardId: CARD, status: 'faremos' }));
    expect(res.status).toBe(401);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  /** Usuário comum NÃO muda status de card — nem o próprio. */
  it('usuário comum fora da allowlist: 403 e nenhuma escrita', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { ...USER, email_confirmed_at: '2026-01-01T00:00:00Z' } },
    });
    const res = await adminPatch(request({ cardId: CARD, status: 'pronto' }));
    expect(res.status).toBe(403);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  /** Fail closed: sem ADMIN_EMAILS configurada, ninguém entra. */
  it('allowlist ausente nega até quem seria admin', async () => {
    delete process.env.ADMIN_EMAILS;
    mockGetUser.mockResolvedValue({ data: { user: ADMIN } });
    const res = await adminPatch(request({ cardId: CARD, status: 'pronto' }));
    expect(res.status).toBe(403);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it('e-mail na lista mas não confirmado: negado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { ...ADMIN, email_confirmed_at: null } } });
    expect((await adminPatch(request({ cardId: CARD, status: 'pronto' }))).status).toBe(403);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it('admin move o card de coluna', async () => {
    mockGetUser.mockResolvedValue({ data: { user: ADMIN } });
    const update = updatable();
    const res = await adminPatch(request({ cardId: CARD, status: 'faremos' }));
    expect(res.status).toBe(200);
    expect(mockAdminFrom).toHaveBeenCalledWith('roadmap_cards');
    expect(update).toHaveBeenCalledWith({ status: 'faremos' });
  });

  it('admin aprova e recusa sugestão', async () => {
    mockGetUser.mockResolvedValue({ data: { user: ADMIN } });
    const update = updatable();
    await adminPatch(request({ cardId: CARD, approval: 'approved' }));
    expect(update).toHaveBeenCalledWith({ approval: 'approved' });

    const update2 = updatable();
    await adminPatch(request({ cardId: CARD, approval: 'rejected' }));
    expect(update2).toHaveBeenCalledWith({ approval: 'rejected' });
  });

  it('recusa coluna que não existe', async () => {
    mockGetUser.mockResolvedValue({ data: { user: ADMIN } });
    updatable();
    const res = await adminPatch(request({ cardId: CARD, status: 'em_analise' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('backlog');
  });

  it('recusa aprovação inválida e position negativa', async () => {
    mockGetUser.mockResolvedValue({ data: { user: ADMIN } });
    updatable();
    expect((await adminPatch(request({ cardId: CARD, approval: 'sim' }))).status).toBe(400);
    expect((await adminPatch(request({ cardId: CARD, position: -1 }))).status).toBe(400);
    expect((await adminPatch(request({ cardId: CARD, position: 1.5 }))).status).toBe(400);
  });

  it('pedido sem nenhum campo é 400, não no-op silencioso', async () => {
    mockGetUser.mockResolvedValue({ data: { user: ADMIN } });
    updatable();
    const res = await adminPatch(request({ cardId: CARD }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/ao menos um/);
  });

  it('card inexistente é 404 (ausência), não 500', async () => {
    mockGetUser.mockResolvedValue({ data: { user: ADMIN } });
    updatable(null);
    expect((await adminPatch(request({ cardId: CARD, status: 'pronto' }))).status).toBe(404);
  });
});
