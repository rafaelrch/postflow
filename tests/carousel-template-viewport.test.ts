import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../components/editor/CreateWizard.tsx', import.meta.url), 'utf8');

describe('seletor de template de carrossel', () => {
  it('mantém o popup contido na viewport e a rolagem dentro do conteúdo', () => {
    expect(source).toContain('max-h-[calc(100dvh-2rem)]');
    expect(source).toContain('overflow-y-auto');
    expect(source).toContain('w-[calc(100vw-2rem)]');
  });

  it('mantém dimensões estáveis e separa header, conteúdo rolável e footer', () => {
    expect(source).toContain('h-[min(560px,calc(100dvh-2rem))]');
    expect(source).toContain('flex min-h-0 flex-1 flex-col overflow-hidden');
    expect(source).toContain('className="flex shrink-0 items-center gap-3.5 px-6 pt-6 pb-4"');
    expect(source).toContain('className="flex shrink-0 items-center gap-3 px-6 pb-6"');
    expect(source).not.toContain('...(boxHeight ? { height: boxHeight } : {})');
  });
});
