import { NextResponse, type NextRequest } from 'next/server';
import { adminDenialResponse, requireAdmin } from '@/lib/admin-auth';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { isRoadmapApproval, isRoadmapStatus } from '@/lib/roadmap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/roadmap/admin — mover card de coluna e aprovar/recusar sugestão.
 *
 * ── POR QUE ESTAS DUAS OPERAÇÕES PRECISAM DE ROTA ───────────────────────────
 * O BANCO NÃO SABE QUEM É ADMIN. Nesta árvore o admin é uma allowlist de e-mail
 * em `lib/admin-auth.ts` (env `ADMIN_EMAILS`, fail closed) — não há tabela de
 * papéis, e o comentário no topo daquele arquivo explica por quê. Nenhuma policy
 * consegue tomar esta decisão sozinha, então `roadmap_cards` simplesmente NÃO
 * TEM policy de update: a operação é negada para anon e authenticated, sem
 * exceção, e só existe aqui.
 *
 * ⚠️ `requireAdmin()` ANTES de tocar no client service_role, que BYPASSA RLS.
 * Se o client nascesse antes da checagem, um `return` esquecido viraria
 * escrita livre no banco. A ordem é a proteção.
 */
export async function PATCH(request: NextRequest) {
  const access = await requireAdmin();
  if (!access.ok) return adminDenialResponse(access);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { cardId, status, approval, position } = (body ?? {}) as {
    cardId?: unknown;
    status?: unknown;
    approval?: unknown;
    position?: unknown;
  };

  if (typeof cardId !== 'string' || !UUID_RE.test(cardId)) {
    return NextResponse.json({ error: '"cardId" deve ser o id de um card.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (status !== undefined) {
    if (!isRoadmapStatus(status)) {
      return NextResponse.json(
        { error: '"status" deve ser uma das 4 colunas: backlog, faremos, cozinhando, pronto.' },
        { status: 400 },
      );
    }
    patch.status = status;
  }

  if (approval !== undefined) {
    if (!isRoadmapApproval(approval)) {
      return NextResponse.json(
        { error: '"approval" deve ser pending, approved ou rejected.' },
        { status: 400 },
      );
    }
    patch.approval = approval;
  }

  if (position !== undefined) {
    if (typeof position !== 'number' || !Number.isInteger(position) || position < 0) {
      return NextResponse.json(
        { error: '"position" deve ser um inteiro não negativo.' },
        { status: 400 },
      );
    }
    patch.position = position;
  }

  // Pedido sem nenhum campo é erro do cliente, não no-op silencioso: um PATCH
  // que "funciona" sem mudar nada esconde um bug de quem chamou.
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: 'Informe ao menos um de: status, approval, position.' },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await createAdminSupabaseClient()
      .from('roadmap_cards')
      .update(patch)
      .eq('id', cardId)
      .select('id, title, description, status, approval, position')
      .maybeSingle();

    if (error) {
      console.error('[api/roadmap/admin] update_failed');
      return NextResponse.json({ error: 'Falha ao atualizar o card' }, { status: 500 });
    }
    // `maybeSingle` devolve null sem erro quando o id não existe — é ausência, e
    // ausência é 404, não 500. (Mesma distinção de `lib/carousel-load.ts`.)
    if (!data) {
      return NextResponse.json({ error: 'Card não encontrado.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, card: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.error('[api/roadmap/admin] unexpected_error');
    return NextResponse.json({ error: 'Falha ao atualizar o card' }, { status: 500 });
  }
}
