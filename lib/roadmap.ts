/**
 * ROADMAP PÚBLICO — a parte PURA + a leitura do quadro.
 *
 * Módulo sem import de rota e sem client da OpenAI, no padrão de
 * `lib/refine-text.ts` e `lib/lead-capture.ts`: dá para validar a sugestão e
 * montar o quadro em teste de node, sem chave e sem banco.
 *
 * ⚠️ A CONTAGEM DE VOTOS NUNCA CARREGA IDENTIDADE. `loadRoadmapBoard` faz duas
 * consultas separadas de propósito: uma que traz só `card_id` (para contar) e
 * outra restrita ao usuário atual (para saber se ELE votou). Em nenhum momento
 * o servidor tem em memória a lista de quem votou em quê — não é só uma questão
 * de não devolver o dado, é de não buscá-lo.
 */

/** As 4 colunas do quadro. FIXAS — o CHECK do banco espelha esta lista. */
export const ROADMAP_STATUSES = ['backlog', 'faremos', 'cozinhando', 'pronto'] as const;
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

/**
 * Rótulo de interface de cada coluna.
 *
 * `Record<RoadmapStatus, string>` de propósito: uma coluna nova no union quebra
 * o build aqui e obriga alguém a nomeá-la, em vez de sair na tela com a chave
 * crua. (Mesma lição do `satisfies` que mentia em `lib/refine-text.ts`: um array
 * com `satisfies` aceitaria lista incompleta calado.)
 */
export const ROADMAP_STATUS_LABELS: Record<RoadmapStatus, string> = {
  backlog: 'Backlog',
  faremos: 'Faremos',
  cozinhando: 'Estamos cozinhando',
  pronto: 'Pronto',
};

export const ROADMAP_APPROVALS = ['pending', 'approved', 'rejected'] as const;
export type RoadmapApproval = (typeof ROADMAP_APPROVALS)[number];

export function isRoadmapStatus(value: unknown): value is RoadmapStatus {
  return typeof value === 'string' && (ROADMAP_STATUSES as readonly string[]).includes(value);
}

export function isRoadmapApproval(value: unknown): value is RoadmapApproval {
  return typeof value === 'string' && (ROADMAP_APPROVALS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// 1. VALIDAÇÃO DA SUGESTÃO
// ---------------------------------------------------------------------------

export const TITLE_MIN = 5;
export const TITLE_MAX = 120;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 2000;

/**
 * Detecta marcação, não sinal de maior/menor.
 *
 * `<script`, `</div`, `<!--` são rejeitados; "5 < 10" e "a > b" passam. Rejeitar
 * todo `<` seria mais simples e mais burro: a pessoa escrevendo uma sugestão
 * legítima sobre limites levaria um 400 sem entender por quê.
 *
 * Isto é validação de ENTRADA, não sanitização de saída — quem renderiza
 * continua responsável por escapar. As duas coisas, não uma no lugar da outra.
 */
const HTML_LIKE = /<[a-zA-Z/!?]/;

export type SuggestionInput = {
  title: string;
  description: string;
};

export type SuggestionFieldErrors = {
  title?: string;
  description?: string;
};

export type SuggestionValidation =
  | { ok: true; value: SuggestionInput }
  | { ok: false; error: string; fields: SuggestionFieldErrors };

/**
 * Valida título e descrição de uma sugestão.
 *
 * Mensagem por CAMPO, e útil: "Dados inválidos." sozinho obriga a pessoa a
 * adivinhar qual dos dois campos recusou e por quê.
 */
export function validateSuggestion(input: unknown): SuggestionValidation {
  const raw = (input ?? {}) as Record<string, unknown>;
  const fields: SuggestionFieldErrors = {};

  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';

  if (title.length === 0) {
    fields.title = 'Escreva um título.';
  } else if (title.length < TITLE_MIN) {
    fields.title = `O título precisa de pelo menos ${TITLE_MIN} caracteres.`;
  } else if (title.length > TITLE_MAX) {
    fields.title = `O título passa de ${TITLE_MAX} caracteres (tem ${title.length}).`;
  } else if (HTML_LIKE.test(title)) {
    fields.title = 'O título não pode conter HTML.';
  }

  if (description.length === 0) {
    fields.description = 'Escreva uma descrição.';
  } else if (description.length < DESCRIPTION_MIN) {
    fields.description = `A descrição precisa de pelo menos ${DESCRIPTION_MIN} caracteres.`;
  } else if (description.length > DESCRIPTION_MAX) {
    fields.description = `A descrição passa de ${DESCRIPTION_MAX} caracteres (tem ${description.length}).`;
  } else if (HTML_LIKE.test(description)) {
    fields.description = 'A descrição não pode conter HTML.';
  }

  if (fields.title || fields.description) {
    return { ok: false, error: 'Dados inválidos.', fields };
  }

  return { ok: true, value: { title, description } };
}

// ---------------------------------------------------------------------------
// 2. LEITURA DO QUADRO
// ---------------------------------------------------------------------------

/** Um card como o quadro público o mostra. Sem autoria, sem lista de votantes. */
export type RoadmapCard = {
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  position: number;
  createdAt: string;
  voteCount: number;
  /** O usuário ATUAL votou neste card? `false` para visitante sem sessão. */
  hasVoted: boolean;
};

export type RoadmapColumn = {
  status: RoadmapStatus;
  label: string;
  cards: RoadmapCard[];
};

/**
 * O mínimo do client do Supabase que esta leitura usa.
 *
 * Recursivo porque o builder do supabase-js é encadeável E aguardável: cada
 * `.eq()`/`.order()` devolve outro builder, e o `await` no fim é que dispara.
 * Tipar só o que se usa mantém o módulo testável com um mock de 10 linhas, em
 * vez de exigir o tipo gerado do banco inteiro.
 */
export type RoadmapQuery = PromiseLike<{
  data: Record<string, unknown>[] | null;
  error: unknown;
}> & {
  eq(column: string, value: string): RoadmapQuery;
  order(column: string, opts?: { ascending?: boolean }): RoadmapQuery;
};

export type RoadmapReadClient = {
  from(table: string): { select(columns: string): RoadmapQuery };
};

/**
 * O quadro público: as 4 colunas, sempre TODAS, mesmo vazias.
 *
 * Devolver a coluna vazia em vez de omiti-la é o que deixa a fatia 2 desenhar o
 * quadro sem inventar as colunas que faltam — e é o que faz "Pronto" aparecer
 * como coluna vazia em vez de o quadro ter 3 colunas no primeiro dia.
 *
 * `userId` nulo (visitante deslogado) devolve tudo com `hasVoted: false` e NÃO
 * dispara a segunda consulta.
 *
 * ⚠️ Precisa do cliente service_role: a policy de `roadmap_votes` deixa cada um
 * ver só o próprio voto, então a contagem pela chave anon daria 0 ou 1. É por
 * isso que esta função é de SERVIDOR e devolve `voteCount` já agregado — o
 * browser recebe número, nunca linha de voto.
 */
export async function loadRoadmapBoard(
  client: RoadmapReadClient,
  userId: string | null,
): Promise<RoadmapColumn[]> {
  const cardsQuery = await client
    .from('roadmap_cards')
    .select('id, title, description, status, position, created_at')
    .eq('approval', 'approved')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (cardsQuery.error) throw new Error('roadmap_cards_read_failed');
  const rows = cardsQuery.data ?? [];

  // Só `card_id`: o suficiente para contar, insuficiente para saber de quem.
  const countsQuery = await client.from('roadmap_votes').select('card_id');
  if (countsQuery.error) throw new Error('roadmap_votes_count_failed');

  const counts = new Map<string, number>();
  for (const vote of countsQuery.data ?? []) {
    const cardId = vote.card_id as string;
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  }

  const mine = new Set<string>();
  if (userId) {
    const mineQuery = await client.from('roadmap_votes').select('card_id').eq('user_id', userId);
    if (mineQuery.error) throw new Error('roadmap_votes_own_failed');
    for (const vote of mineQuery.data ?? []) mine.add(vote.card_id as string);
  }

  const cards: RoadmapCard[] = rows
    .filter((row) => isRoadmapStatus(row.status))
    .map((row) => {
      const id = row.id as string;
      return {
        id,
        title: (row.title as string) ?? '',
        description: (row.description as string) ?? '',
        status: row.status as RoadmapStatus,
        position: (row.position as number) ?? 0,
        createdAt: (row.created_at as string) ?? '',
        voteCount: counts.get(id) ?? 0,
        hasVoted: mine.has(id),
      };
    });

  return ROADMAP_STATUSES.map((status) => ({
    status,
    label: ROADMAP_STATUS_LABELS[status],
    cards: cards.filter((card) => card.status === status),
  }));
}
