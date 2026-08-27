import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../components/ui/popover.tsx', import.meta.url), 'utf8');

describe('animação do popup de workspaces', () => {
  it('declara entrada e saída pelos estados do popover e desliga animação para reduced motion', () => {
    expect(source).toContain('data-[state=open]:animate-in');
    expect(source).toContain('data-[state=closed]:animate-out');
    expect(source).toContain('motion-reduce:data-[state=open]:animate-none');
    expect(source).toContain('motion-reduce:data-[state=closed]:animate-none');
  });
});
