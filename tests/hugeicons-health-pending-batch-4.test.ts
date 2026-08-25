import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = [
  'app/admin/saude/HealthDashboard.tsx',
  'app/admin/saude/page.tsx',
  'components/auth/PendingPayment.tsx',
];

describe('TASK 13 — lote 4 saúde e pagamento pendente', () => {
  it('usa HugeIcons sem importar Lucide', () => {
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source, file).not.toContain('lucide-react');
      expect(source, file).toContain('HugeiconsIcon');
    }
  });

  it('mantém movimento reduzido no loader', () => {
    const source = files.map((file) => readFileSync(join(process.cwd(), file), 'utf8')).join('\n');
    expect(source).toContain('motion-reduce:animate-none');
  });
});
