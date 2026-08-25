import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hotspotFiles = [
  'components/ui/AppSidebar.tsx',
  'components/ui/Navbar.tsx',
  'components/editor/sidebar/panels.ts',
  'components/editor/sidebar/SidebarPanel.tsx',
  'components/editor/CreateWizard.tsx',
  'components/admin/MetricCard.tsx',
  'app/admin/OverviewMetrics.tsx',
  'app/admin/financeiro/FinanceDashboard.tsx',
  'app/admin/produto/ProductDashboard.tsx',
].map((path) => readFileSync(path, 'utf8'));

describe('TASK 13 — HugeIcons hotspots', () => {
  it('removes Lucide imports from the first migration slice', () => {
    for (const source of hotspotFiles) {
      expect(source).not.toContain('lucide-react');
    }
  });

  it('uses the official HugeiconsIcon renderer', () => {
    expect(hotspotFiles.join('\n')).toContain("from '@hugeicons/react'");
    expect(hotspotFiles.join('\n')).toContain('<HugeiconsIcon');
  });
});
