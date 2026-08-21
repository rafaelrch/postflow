import { Map as MapIcon } from 'lucide-react';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import {
  emptyAdminBoard,
  loadAdminRoadmapBoard,
  type AdminRoadmapBoard,
} from '@/lib/admin-roadmap';
import type { RoadmapReadClient } from '@/lib/roadmap';
import RoadmapAdminClient from './RoadmapAdminClient';

/**
 * Roadmap no /admin — a única tela que enxerga o quadro inteiro.
 *
 * ⚠️ `requireAdminPage()` ANTES de criar o cliente service_role, na mesma ordem
 * das outras seções. O client BYPASSA RLS: se ele nascesse antes da checagem, um
 * `return` esquecido num refactor viraria leitura livre de tudo. A ordem é a
 * proteção, e `tests/admin-roadmap-page.test.tsx` a trava.
 *
 * ⚠️ NÃO existe `loading.tsx` nesta rota, e não pode existir: Server Component
 * com I/O de rede sob o boundary de Suspense do `loading.tsx` nunca resolve no
 * cliente no Next 16.2.10 — ver `docs/bug-loading-fetch-next16.md` e
 * `tests/loading-rotas.test.tsx`, que quebra se alguém criar o arquivo.
 */
export const dynamic = 'force-dynamic';

export default async function AdminRoadmapPage() {
  await requireAdminPage();

  let board: AdminRoadmapBoard = emptyAdminBoard();
  let state: 'ready' | 'error' = 'ready';

  try {
    board = await loadAdminRoadmapBoard(
      // O cast existe porque `loadAdminRoadmapBoard` declara só o pedaço do
      // builder que usa, em vez de exigir o tipo gerado do banco inteiro — é o
      // que mantém o módulo testável com um mock pequeno.
      createAdminSupabaseClient() as unknown as RoadmapReadClient,
    );
  } catch {
    // Falha de leitura NÃO pode virar quadro vazio: "não há card nenhum" e "não
    // deu para ler" levam a decisões opostas.
    console.error('[admin/roadmap] board_load_failed');
    state = 'error';
  }

  return (
    <div className="admin-page">
      <header className="admin-topbar">
        <div className="admin-section-title">
          <span className="admin-section-icon"><MapIcon size={16} /></span>
          <div>
            <h1>Roadmap</h1>
            <p>Todos os cards, inclusive os que o quadro público esconde</p>
          </div>
        </div>
        <span className="admin-scope-badge admin-topbar-badge">Move, aprova e recusa</span>
      </header>
      <RoadmapAdminClient initialBoard={board} state={state} />
    </div>
  );
}
