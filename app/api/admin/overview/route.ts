import { NextResponse, type NextRequest } from 'next/server';
import { adminDenialResponse, requireAdmin } from '@/lib/admin-auth';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { loadAdminOverview } from '@/lib/admin-metrics';
import { resolvePeriod } from '@/lib/admin-period';

/**
 * GET /api/admin/overview — os mesmos números da Visão geral, em JSON.
 *
 * A página não consome esta rota (ela agrega direto no Server Component, sem
 * round-trip). Ela existe para conferência e depuração: quando um card parecer
 * errado, dá para ler o número cru com o mesmo recorte de período e comparar.
 *
 * ⚠️ requireAdmin() ANTES de qualquer coisa. O client service_role bypassa
 * RLS: se ele nascer antes da checagem, um bug de ordem vira vazamento do
 * banco inteiro. Nada de cache — é dado interno e vivo.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const access = await requireAdmin();
  if (!access.ok) return adminDenialResponse(access);

  const period = resolvePeriod(Object.fromEntries(request.nextUrl.searchParams.entries()));

  try {
    const overview = await loadAdminOverview(createAdminSupabaseClient(), period);
    return NextResponse.json(
      { period: { key: period.key, from: period.from, to: period.to, label: period.label }, overview },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    // A mensagem do Postgres não volta para o cliente: ela carrega nome de
    // tabela e detalhe de query.
    console.error('[api/admin/overview]', error);
    return NextResponse.json({ error: 'Falha ao ler as métricas' }, { status: 500 });
  }
}
