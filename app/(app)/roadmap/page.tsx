import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { loadRoadmapBoard, type RoadmapColumn, type RoadmapReadClient } from '@/lib/roadmap';
import RoadmapClient from './RoadmapClient';

/**
 * Roadmap público — o quadro, lido NO SERVIDOR.
 *
 * ── POR QUE O SERVIDOR LÊ, E NÃO O BROWSER ──────────────────────────────────
 * A policy de `roadmap_votes` deixa cada um ver só o PRÓPRIO voto (é ela que
 * impede a contagem de virar lista de votantes). Consequência direta: pela chave
 * anon a contagem daria 0 ou 1. Então o total é agregado aqui, com o client
 * service_role, e o que desce para o navegador é NÚMERO — nunca linha de voto.
 *
 * ⚠️ service_role BYPASSA RLS. O que segura o vazamento aqui não é a policy, é
 * `loadRoadmapBoard`: ela filtra `approval = 'approved'`, não seleciona
 * `author_id` em nenhuma consulta, e a contagem pede só `card_id`. Card pendente
 * ou recusado, autoria de quem sugeriu e identidade de votante não chegam nem a
 * ser buscados — não é que são buscados e descartados. Se alguém acrescentar uma
 * coluna àquele `select`, o vazamento começa AQUI. Ver os testes em
 * `tests/roadmap.test.ts`.
 */
export const dynamic = 'force-dynamic';

export default async function RoadmapPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let columns: RoadmapColumn[] = [];
  let state: 'ready' | 'error' = 'ready';

  try {
    // O cast existe porque `loadRoadmapBoard` declara só o pedaço do builder que
    // usa (ver `RoadmapReadClient`), em vez de exigir o tipo gerado do banco
    // inteiro — é o que mantém o módulo testável com um mock de 10 linhas.
    columns = await loadRoadmapBoard(
      createAdminSupabaseClient() as unknown as RoadmapReadClient,
      user?.id ?? null,
    );
  } catch {
    // A migration do roadmap pode ainda não ter sido aplicada neste ambiente —
    // e nesse caso a tabela não existe. Isso é ERRO de carga, não quadro vazio:
    // mostrar 4 colunas vazias aqui mentiria dizendo "ainda não há nada".
    console.error('[roadmap] board_load_failed');
    state = 'error';
  }

  return <RoadmapClient initialColumns={columns} state={state} isAuthenticated={!!user} />;
}
