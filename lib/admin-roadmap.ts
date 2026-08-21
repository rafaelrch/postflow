/**
 * ROADMAP NO /admin — a leitura do quadro INTEIRO.
 *
 * Irmã de `lib/roadmap.ts::loadRoadmapBoard`, e deliberadamente separada dela.
 * A pública existe para ESCONDER: filtra `approval = 'approved'` e é o que o
 * visitante pode ver. Esta existe para MOSTRAR o que aquela esconde — pendente e
 * recusado — e por isso só pode rodar atrás de `requireAdminPage()`, com o
 * cliente service_role. Fundir as duas numa função com um parâmetro
 * `incluirTudo` colocaria as duas audiências a um booleano de distância; um
 * default errado num arquivo qualquer viraria vazamento.
 *
 * ⚠️ service_role BYPASSA RLS, então o que protege o dado aqui é o SELECT.
 *   • `author_id` NÃO é lido em nenhuma consulta. O admin decide sobre o CARD,
 *     não sobre a pessoa; saber quem sugeriu não muda nenhuma das três ações
 *     desta tela, e um campo trazido "por via das dúvidas" é um campo que
 *     alguém serializa para o browser depois.
 *   • A contagem de votos pede SÓ `card_id`. Quem votou não é buscado — não é
 *     buscado e descartado, não é buscado. É a mesma decisão da leitura
 *     pública, e vale mais aqui: esta é a tela em que a curiosidade seria
 *     tecnicamente possível.
 * Se alguém acrescentar coluna a um destes `select`, o vazamento começa AQUI.
 * Ver `tests/admin-roadmap.test.ts`.
 */

import {
  ROADMAP_STATUSES,
  ROADMAP_STATUS_LABELS,
  isRoadmapApproval,
  isRoadmapStatus,
  type RoadmapApproval,
  type RoadmapReadClient,
  type RoadmapStatus,
} from './roadmap';

/** Um card como o /admin o vê: com o estado de aprovação, sem autoria. */
export type AdminRoadmapCard = {
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  approval: RoadmapApproval;
  position: number;
  createdAt: string;
  voteCount: number;
};

export type AdminRoadmapColumn = {
  status: RoadmapStatus;
  label: string;
  cards: AdminRoadmapCard[];
};

/**
 * O quadro do admin em três partes, porque são três decisões diferentes.
 *
 * `pendentes` vem PRIMEIRO de propósito: são os cards que ninguém vê e que só
 * esta tela resgata — inclusive os que já estavam no banco antes de a regra
 * mudar, que a migration não aprovou em massa justamente para caírem aqui.
 */
export type AdminRoadmapBoard = {
  pendentes: AdminRoadmapCard[];
  colunas: AdminRoadmapColumn[];
  recusados: AdminRoadmapCard[];
};

/** Quadro vazio com as 4 colunas — usado pelo estado de erro e pelo de vazio. */
export function emptyAdminBoard(): AdminRoadmapBoard {
  return {
    pendentes: [],
    colunas: ROADMAP_STATUSES.map((status) => ({
      status,
      label: ROADMAP_STATUS_LABELS[status],
      cards: [],
    })),
    recusados: [],
  };
}

export async function loadAdminRoadmapBoard(
  client: RoadmapReadClient,
): Promise<AdminRoadmapBoard> {
  // Sem `.eq('approval', ...)`: é exatamente esta ausência que faz a tela do
  // admin ver o que o quadro público não vê.
  const cardsQuery = await client
    .from('roadmap_cards')
    .select('id, title, description, status, approval, position, created_at')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (cardsQuery.error) throw new Error('admin_roadmap_cards_read_failed');

  const countsQuery = await client.from('roadmap_votes').select('card_id');
  if (countsQuery.error) throw new Error('admin_roadmap_votes_count_failed');

  const counts = new Map<string, number>();
  for (const vote of countsQuery.data ?? []) {
    const cardId = vote.card_id as string;
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  }

  const cards: AdminRoadmapCard[] = (cardsQuery.data ?? [])
    // Linha com status ou approval fora do CHECK só aparece se alguém escrever
    // no banco por fora. Descartar é melhor que renderizar um card que nenhuma
    // das três ações sabe tratar.
    .filter((row) => isRoadmapStatus(row.status) && isRoadmapApproval(row.approval))
    .map((row) => {
      const id = row.id as string;
      return {
        id,
        title: (row.title as string) ?? '',
        description: (row.description as string) ?? '',
        status: row.status as RoadmapStatus,
        approval: row.approval as RoadmapApproval,
        position: (row.position as number) ?? 0,
        createdAt: (row.created_at as string) ?? '',
        voteCount: counts.get(id) ?? 0,
      };
    });

  return {
    pendentes: cards.filter((card) => card.approval === 'pending'),
    colunas: ROADMAP_STATUSES.map((status) => ({
      status,
      label: ROADMAP_STATUS_LABELS[status],
      cards: cards.filter((card) => card.approval === 'approved' && card.status === status),
    })),
    recusados: cards.filter((card) => card.approval === 'rejected'),
  };
}
