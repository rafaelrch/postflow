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

/**
 * ⚠️ A REGRA DE INSERT DESTE ARQUIVO ESTÁ SUPERADA. A migration
 * `20260821170000_roadmap_backlog_sem_aprovacao.sql` (lida logo abaixo) troca
 * `approval = 'pending'` por `'approved'` na policy de sugestão e no default da
 * coluna. Os testes daqui continuam existindo porque esta migration JÁ FOI
 * APLICADA no banco e não pode ser editada: o que eles guardam é o que este
 * arquivo diz, não o que vale hoje. Quem quiser saber a regra em vigor lê o
 * bloco "roadmap — backlog sem aprovação".
 */
const sqlNovo = readFileSync(
  new URL('../supabase/migrations/20260821170000_roadmap_backlog_sem_aprovacao.sql', import.meta.url),
  'utf8',
);

/** Sem comentários: evita que uma frase em comentário faça um teste passar. */
function semComentarios(texto: string) {
  return texto
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

const code = semComentarios(sql);
const codeNovo = semComentarios(sqlNovo);

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

  /** O default 'pending' é o que a migration SEGUINTE inverte. */
  it('trava os 3 estados de aprovação e, NESTE arquivo, nascia PENDENTE', () => {
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

  /** Regra superada pela migration de 17:00 — ver o bloco do fim do arquivo. */
  it('sugestão só em nome próprio, pendente e no backlog (regra ANTIGA)', () => {
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

// ---------------------------------------------------------------------------
// A REGRA EM VIGOR
// ---------------------------------------------------------------------------

/**
 * `20260821170000_roadmap_backlog_sem_aprovacao.sql` — a task do usuário nasce
 * VISÍVEL no Backlog. Esta é a regra que vale; a de cima é o histórico.
 */
describe('roadmap — backlog sem aprovação', () => {
  it('avisa no topo que SUBSTITUI a regra da migration anterior', () => {
    expect(sqlNovo).toMatch(/SUBSTITUI A REGRA/i);
    expect(sqlNovo).toContain('20260821143000_roadmap_publico.sql');
  });

  it('é idempotente e transacional, no padrão das outras', () => {
    expect(codeNovo).toContain('begin;');
    expect(codeNovo).toContain('commit;');
    expect(codeNovo).toContain('drop policy if exists roadmap_cards_suggest on public.roadmap_cards');
  });

  it('documenta o que faz e o que NÃO faz', () => {
    expect(sqlNovo).toMatch(/O QUE ESTA MIGRATION FAZ/);
    expect(sqlNovo).toMatch(/O QUE ELA NÃO FAZ/);
  });

  /** O ponto da mudança: a sugestão nasce aprovada, e só no backlog. */
  it('a policy de insert passa a exigir approved, ainda no backlog e em nome próprio', () => {
    const policy = codeNovo.match(/create policy roadmap_cards_suggest[\s\S]*?;/)?.[0] ?? '';
    expect(policy).toContain('for insert to authenticated');
    expect(policy).toContain('auth.uid() = author_id');
    expect(policy).toContain("approval = 'approved'");
    expect(policy).not.toContain("approval = 'pending'");
    expect(policy).toContain("status = 'backlog'");
  });

  it('o default da coluna acompanha a policy', () => {
    expect(codeNovo).toMatch(/alter column approval set default 'approved'/);
  });

  /**
   * O conceito de aprovação FICA. 'rejected' é como o admin tira spam do quadro
   * sem apagar a linha — o que mudou foi o padrão, não a existência da coluna.
   */
  it('não remove a coluna approval nem nenhum dos 3 valores', () => {
    expect(codeNovo).not.toMatch(/drop column\s+(if exists\s+)?approval/i);
    expect(codeNovo).not.toMatch(/drop constraint[\s\S]*approval/i);
    expect(sqlNovo).toMatch(/rejected/);
  });

  /**
   * ESTE é o teste que prova que a metade fechada continua fechada: sem policy
   * de update, mover de coluna segue impossível pelo caminho do cliente.
   */
  it('não cria policy de update, delete nem leitura nova', () => {
    const policies = [...codeNovo.matchAll(/create policy (\w+) on public\.(\w+)\s+for (\w+)/g)];
    expect(policies).toHaveLength(1);
    expect(policies[0][1]).toBe('roadmap_cards_suggest');
    expect(policies[0][3]).toBe('insert');
  });

  /** Aprovar em massa por migration decidiria pelo admin o que ele não olhou. */
  it('não faz backfill dos cards que já estavam pendentes', () => {
    expect(codeNovo).not.toMatch(/update public\.roadmap_cards/i);
  });
});
