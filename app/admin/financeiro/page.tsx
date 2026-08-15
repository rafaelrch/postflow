import { requireAdminPage } from '@/lib/admin-page-guard';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { resolvePeriod } from '@/lib/admin-period';
import { loadAdminFinance } from '@/lib/admin-finance';
import FinanceShell from '@/components/admin/FinanceShell';
import FinanceDashboard from './FinanceDashboard';

export default async function AdminFinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const period = resolvePeriod(await searchParams);
  const data = await loadAdminFinance(createAdminSupabaseClient(), period);

  return (
    <div className="admin-page">
      <FinanceShell period={period}>
        <FinanceDashboard data={data} period={period} />
      </FinanceShell>
    </div>
  );
}
