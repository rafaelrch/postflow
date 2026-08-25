import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = [
  'app/(app)/agenda/AgendaClient.tsx',
  'app/(app)/dashboard/DashboardClient.tsx',
  'app/(app)/reels/page.tsx',
  'app/(app)/roadmap/RoadmapClient.tsx',
  'app/(app)/setup/page.tsx',
  'app/(auth)/definir-senha/page.tsx',
  'app/(auth)/recuperar-senha/page.tsx',
  'app/(auth)/redefinir-senha/page.tsx',
  'components/billing/CancelSubscriptionButton.tsx',
];

describe('TASK 13 — lote 3 do produto preserva ações e acessibilidade', () => {
  it('migra os dez arquivos para HugeIcons sem Lucide', () => {
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source, file).not.toContain('lucide-react');
      expect(source, file).toContain('HugeiconsIcon');
    }
  });

  it('mantém proteção de movimento reduzido nos ícones animados', () => {
    const source = files.map((file) => readFileSync(join(process.cwd(), file), 'utf8')).join('\n');
    expect(source).toContain('motion-reduce:animate-none');
  });
});
