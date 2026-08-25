import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const config = fs.readFileSync(
  path.resolve(__dirname, '../next.config.ts'),
  'utf8',
);

describe('execução dos Heroicons no Next', () => {
  it('transpila o pacote oficial client-side do catálogo', () => {
    expect(config).toMatch(
      /transpilePackages\s*:\s*\[[\s\S]*['"]@heroicons-animated\/react['"]/
    );
  });
});
