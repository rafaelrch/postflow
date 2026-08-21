import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Contrato do SQL, lido como TEXTO — mesmo molde de
 * `tests/template-02-database.test.ts`. Não há banco aqui: o que se prova é que
 * a migration DIZ o que a aplicação assume. É barato e pega a regressão que mais
 * dói (alguém "simplificar" uma policy num refactor).
 */
const sql = readFileSync(
  new URL('../supabase/migrations/20260821143000_roadmap_publico.sql', import.meta.url),
  'utf8',
);

/** Sem comentários: evita que uma frase em comentário faça um teste passar. */
const code = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('roadmap — migration', () => {
  it('é idempotente no padrão das outras', () => {
    expect(code).toContain('create table if not exists public.roadmap_cards');
    expect(code).toContain('create table if not exists public.roadmap_votes');
    expect(code).toMatch(/drop policy if exists/);
    expect(code).toContain('begin;');
    expect(code).toContain('commit;');
  });

  it('documenta no topo o que faz e o que NÃO faz', () => {
    expect(sql).toMatch(/O QUE ESTA MIGRATION FAZ/);
    expect(sql).toMatch(/O QUE ELA NÃO FAZ/);
  });

  it('trava as 4 colunas num CHECK, sem coluna configurável', () => {
    expect(code).toContain("check (status in ('backlog', 'faremos', 'cozinhando', 'pronto'))");
  });

  it('trava os 3 estados de aprovação e nasce PENDENTE', () => {
    expect(code).toContain("check (approval in ('pending', 'approved', 'rejected'))");
    expect(code).toMatch(/approval text not null default 'pending'/);
  });

  it('limita título e descrição também no banco, não só na rota', () => {
    expect(code).toContain('roadmap_cards_title_len');
    expect(code).toContain('roadmap_cards_description_len');
  });
});

describe('roadmap — conta apagada', () => {
  /**
   * O card é conteúdo público em que terceiros votaram: apagar a conta do autor
   * não pode apagar o card nem zerar o voto dos outros.
   */
  it('autor do card: set null (o card sobrevive)', () => {
    expect(code).toMatch(/author_id uuid references auth\.users\(id\) on delete set null/);
  });

  /** Voto é pessoal: sem votante não faz sentido, e a contagem tem de cair. */
  it('votante: cascade (o voto vai embora)', () => {
    expect(code).toMatch(/user_id uuid not null references auth\.users\(id\) on delete cascade/);
  });

  it('apagar um card leva os votos dele junto', () => {
    expect(code).toMatch(/card_id uuid not null references public\.roadmap_cards\(id\) on delete cascade/);
  });
});

describe('roadmap — voto único é do BANCO, não da UI', () => {
  it('tem UNIQUE de verdade no par (card, usuário)', () => {
    expect(code).toContain('unique (card_id, user_id)');
  });
});

describe('roadmap — RLS', () => {
  it('liga RLS nas duas tabelas', () => {
    expect(code).toContain('alter table public.roadmap_cards enable row level security');
    expect(code).toContain('alter table public.roadmap_votes enable row level security');
  });

  it('leitura pública só dos aprovados', () => {
    expect(code).toMatch(/create policy roadmap_cards_public_read[\s\S]*?for select using \(approval = 'approved'\)/);
  });

  it('sugestão só em nome próprio, pendente e no backlog', () => {
    const policy = code.match(/create policy roadmap_cards_suggest[\s\S]*?;/)?.[0] ?? '';
    expect(policy).toContain('for insert to authenticated');
    expect(policy).toContain('auth.uid() = author_id');
    expect(policy).toContain("approval = 'pending'");
    expect(policy).toContain("status = 'backlog'");
  });

  /**
   * ESTE é o teste que prova "usuário comum não muda status" e "não edita card
   * de outro" de uma vez: com RLS ligada e SEM policy de update, o banco nega as
   * duas coisas para anon e authenticated — inclusive para o próprio autor.
   * Se alguém acrescentar uma policy de update aqui, este teste cai.
   */
  it('NÃO existe policy de update nem de delete em roadmap_cards', () => {
    const cardPolicies = [...code.matchAll(/create policy (\w+) on public\.roadmap_cards\s+for (\w+)/g)];
    const operacoes = cardPolicies.map((m) => m[2]);
    expect(operacoes).toContain('select');
    expect(operacoes).toContain('insert');
    expect(operacoes).not.toContain('update');
    expect(operacoes).not.toContain('delete');
    expect(operacoes).not.toContain('all');
  });

  /** A contagem não pode virar lista de votantes. */
  it('cada um vê só o próprio voto', () => {
    const policy = code.match(/create policy roadmap_votes_own[\s\S]*?;/)?.[0] ?? '';
    expect(policy).toContain('for select to authenticated');
    expect(policy).toContain('using (auth.uid() = user_id)');
  });

  it('vota em nome próprio e só em card aprovado; desfaz só o próprio', () => {
    const insert = code.match(/create policy roadmap_votes_insert_own[\s\S]*?;/)?.[0] ?? '';
    expect(insert).toContain('auth.uid() = user_id');
    expect(insert).toContain("c.approval = 'approved'");

    const del = code.match(/create policy roadmap_votes_delete_own[\s\S]*?;/)?.[0] ?? '';
    expect(del).toContain('for delete to authenticated');
    expect(del).toContain('using (auth.uid() = user_id)');
  });

  /** Nenhum e-mail de admin em policy: o banco não sabe quem é admin. */
  it('não tenta decidir admin no banco', () => {
    expect(code).not.toMatch(/ADMIN_EMAILS/);
    expect(code).not.toMatch(/@[\w.-]+\.\w+/);
    expect(code).not.toMatch(/create table[\s\S]*admin_users/);
  });

  it('anon não recebe grant de escrita', () => {
    expect(code).toContain('revoke all on table public.roadmap_cards from public, anon, authenticated');
    expect(code).toContain('grant insert on table public.roadmap_cards to authenticated');
    expect(code).not.toMatch(/grant\s+[\w, ]*insert[\w, ]*on table public\.roadmap_cards to [\w, ]*anon/);
  });
});
