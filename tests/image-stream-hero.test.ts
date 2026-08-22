import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, root), 'utf8');

describe('hero ImageStreamHero', () => {
  it('usa o corredor de imagens fornecido no hero da landing', () => {
    const page = read('app/(marketing)/page.tsx');

    expect(page).toContain("@/components/ui/image-stream-hero");
    expect(page).toContain('<ImageStreamHero');
    expect(page).toContain('axis="var(--hero-stream-axis)"');
    expect(page).toContain('scale="var(--hero-stream-card-scale)"');
    expect(page).toContain('--hero-stream-card-scale: 1.22;');
    expect(page).toContain('--hero-stream-card-scale: 1;');
    expect(page).toContain('overflow-x-clip overflow-y-visible');
    expect(page).toContain('h-[440px] w-full md:h-[560px]');
    expect(page).toContain('pb-6 md:pb-14');
    expect(page).not.toContain('function heroSlotX');
  });

  it('mantém o contrato de movimento, perspectiva e carregamento do componente', () => {
    const page = read('app/(marketing)/page.tsx');
    const component = read('components/ui/image-stream-hero.tsx');

    expect(component).toContain('containerType: "inline-size"');
    expect(component).toContain('prefers-reduced-motion:reduce');
    expect(component).toContain('loading="lazy"');
    expect(component).toContain('aria-hidden');
    expect(component).toContain('cardWidth: 20');
    expect(component).toContain('aspectRatio: "4 / 5"');
    expect(component).toContain('overflow-x-clip');
    expect(component).toContain('overflow-y-visible');
    expect(component).toContain('className="block h-full w-full object-cover"');
    expect(component).toContain('transform: "scale(1.08)"');
    expect(component).toContain('transformOrigin: "center"');
    expect(component).toContain('boxShadow: "var(--sh-soft)"');
    expect(page).toContain('.lp-nav-shell .lp-btn { border-radius: 999px; }');
    expect(page).toContain('.lp-nav-shell .lp-btn.black { border: 0; box-shadow: none; }');
    expect(page).toContain('.lp-nav-shell .lp-btn.black:hover,');
    expect(page).toContain('.lp-nav-shell .lp-btn.black:hover { transform: translateY(-1px); }');
  });
});
