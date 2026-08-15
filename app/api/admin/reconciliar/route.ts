import { NextResponse } from 'next/server';
import { adminDenialResponse, requireAdmin } from '@/lib/admin-auth';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { runReconciliation } from '@/lib/asaas-reconciliation';

/**
 * POST /api/admin/reconciliar — reprocessa os eventos do Asaas que ficaram
 * pendentes (`processed_at` nulo).
 *
 * ── POR QUE ESTE GATILHO, E NÃO OUTRO ───────────────────────────────────────
 * As opções eram: (a) rodar na chegada do próximo evento, (b) uma rota
 * administrativa, (c) verificação sob demanda. Ficou (b), acionada pelo botão
 * na aba Saúde, por três razões:
 *
 *   1. Evento pendente é EXCEÇÃO, não rotina. Pendurar uma varredura na
 *      chegada de todo webhook põe trabalho extra no caminho do dinheiro para
 *      resolver algo que acontece uma vez a cada muitos meses — e o webhook é
 *      justamente onde nada pode ficar mais frágil.
 *   2. A pendência JÁ é visível: a aba Saúde alerta. Uma correção que acontece
 *      sozinha, invisível, esconde a falha que a causou; aqui o Rafael vê o
 *      alerta, aperta o botão e vê o resultado.
 *   3. Coerência com a regra do painel: quem decide sobre cliente é o Rafael.
 *      O botão reconcilia estado; o que ele não resolve continua no alerta.
 *
 * ⚠️ NÃO É CRON e não deve virar um sem combinar antes. Também não altera o
 * webhook: ele continua respondendo 2xx sempre, por conta própria.
 *
 * ⚠️ requireAdmin() ANTES de qualquer coisa — o client service_role bypassa
 * RLS, e criá-lo antes da checagem transformaria um bug de ordem em vazamento.
 */
export const dynamic = 'force-dynamic';

export async function POST() {
  const access = await requireAdmin();
  if (!access.ok) return adminDenialResponse(access);

  try {
    const summary = await runReconciliation(createAdminSupabaseClient());
    return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // A mensagem do Postgres carrega nome de tabela e detalhe de query: fica
    // no log do servidor, não na resposta.
    console.error('[api/admin/reconciliar]', error);
    return NextResponse.json({ error: 'Falha ao reconciliar os eventos' }, { status: 500 });
  }
}
