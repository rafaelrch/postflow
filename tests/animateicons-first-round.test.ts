import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const contracts = [
  ['app/(app)/roadmap/RoadmapClient.tsx', 'AnimatedHeartIcon'],
] as const;

const revertedFiles = [
  'app/(app)/dashboard/DashboardClient.tsx',
  'app/(app)/setup/page.tsx',
  'components/editor/EditorSidebar.tsx',
  'app/(app)/reels/page.tsx',
  'components/editor/sidebar/SidebarPanel.tsx',
];

describe('TASK 13 — primeira rodada de ícones animados', () => {
  it.each(contracts)('mantém %s com o componente nomeado %s', (file, component) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    expect(source, file).toContain("from '@animateicons/react/huge'");
    expect(source, file).toContain(component);
  });

  it('reverte a animação da primeira rodada fora dos campos aprovados', () => {
    for (const file of revertedFiles) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source, file).not.toContain("from '@animateicons/react/huge'");
      expect(source, file).not.toContain('startAnimation()');
      expect(source, file).not.toContain('stopAnimation()');
    }
  });

  it('mantém os alvos sem variante animada na semântica Hugeicons original', () => {
    const sources = [
      'components/ui/AppSidebar.tsx',
      'app/(app)/agenda/AgendaClient.tsx',
      'app/(app)/dashboard/DashboardClient.tsx',
      'app/(app)/roadmap/RoadmapClient.tsx',
      'app/(app)/news/page.tsx',
    ].map((file) => readFileSync(join(process.cwd(), file), 'utf8'));
    expect(sources.join('\n')).toContain('<HugeiconsIcon');
    expect(sources.join('\n')).toContain('aria-hidden');
  });
});
