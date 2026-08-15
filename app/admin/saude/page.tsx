import { requireAdminPage } from '@/lib/admin-page-guard';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { loadAdminHealth } from '@/lib/admin-health';
import { Activity } from 'lucide-react';
import HealthDashboard from './HealthDashboard';

export default async function AdminSaudePage() {
  await requireAdminPage();
  const checks = await loadAdminHealth(createAdminSupabaseClient());

  return (
    <div className="admin-page">
      <header className="admin-topbar">
        <div className="admin-section-title"><span className="admin-section-icon"><Activity size={16} /></span><div><h1>Saúde</h1><p>Alertas e inconsistências acionáveis</p></div></div>
        <span className="admin-scope-badge admin-topbar-badge">Somente leitura</span>
      </header>
      <HealthDashboard checks={checks} />
    </div>
  );
}
