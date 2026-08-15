import { requireAdminPage } from '@/lib/admin-page-guard';
import { resolvePeriod } from '@/lib/admin-period';
import OverviewShell from '@/components/admin/OverviewShell';
import OverviewMetrics from './OverviewMetrics';

/**
 * /admin — Visão geral.
 *
 * Só entram métricas que já têm dado real hoje (ver
 * docs/admin-dashboard-analise.md). Se um número não existe, o card não
 * existe: é a única regra que impede um painel interno de virar ficção.
 *
 * 🔴 SEM `loading.tsx` E SEM <Suspense> EM VOLTA DE OverviewMetrics. Não é
 * esquecimento: no Next 16 o boundary não resolve quando o Server Component
 * faz fetch, e a tela fica no esqueleto para sempre — docs/
 * bug-loading-fetch-next16.md, com teste em tests/loading-rotas.test.tsx. O
 * esqueleto existe, mas vem da transição do cliente, dentro de OverviewShell.
 */

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminPage();
  const period = resolvePeriod(await searchParams);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-3xl leading-none">Visão geral</h2>
        <p className="mt-1 text-[11px] text-[var(--ink-dim)]">
          Sessão de <span className="font-mono">{admin.email}</span> · valores em BRL, fuso de São
          Paulo
        </p>
      </div>

      <OverviewShell period={period}>
        <OverviewMetrics period={period} />
      </OverviewShell>
    </div>
  );
}
