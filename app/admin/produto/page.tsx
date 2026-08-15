import { requireAdminPage } from '@/lib/admin-page-guard';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { resolvePeriod } from '@/lib/admin-period';
import { loadAdminProduct } from '@/lib/admin-product';
import ProductShell from '@/components/admin/ProductShell';
import ProductDashboard from './ProductDashboard';

export default async function AdminProdutoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const period = resolvePeriod(await searchParams);
  const data = await loadAdminProduct(createAdminSupabaseClient(), period);
  return <div className="admin-page"><ProductShell period={period}><ProductDashboard data={data} period={period} /></ProductShell></div>;
}
