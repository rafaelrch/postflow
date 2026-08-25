// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement, forwardRef, useEffect, useImperativeHandle } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import {
  Plus as AnimatedPlus,
  type AnimatedHeroiconHandle,
  useNativeHoverAnimation,
} from '@/lib/animated-heroicons';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

afterEach(() => cleanup());

describe('controle nativo dos Heroicons Animated aprovados', () => {
  it('confirma no pacote instalado a ref imperativa e o modo controlado', () => {
    const types = read('node_modules/@heroicons-animated/react/dist/icons/plus.d.ts');
    const implementation = read('node_modules/@heroicons-animated/react/dist/icons/plus.js');

    expect(types).toContain('startAnimation: () => void');
    expect(types).toContain('stopAnimation: () => void');
    expect(implementation).toContain('useImperativeHandle(ref');
    expect(implementation).toContain('startAnimation: () => controls.start("animate")');
    expect(implementation).toContain('stopAnimation: () => controls.start("normal")');
    expect(implementation).toContain('if (isControlledRef.current)');
  });

  it('usa a ref do AnimatedPlus real quando o botão semântico recebe hover', () => {
    let nativeHandle: AnimatedHeroiconHandle | null = null;

    function Fixture() {
      const hover = useNativeHoverAnimation();
      useEffect(() => {
        nativeHandle = hover.iconRef.current;
      }, [hover.iconRef]);
      return createElement(
        'button',
        {
          type: 'button',
          onMouseEnter: hover.onMouseEnter,
          onMouseLeave: hover.onMouseLeave,
        },
        createElement(AnimatedPlus, { ref: hover.iconRef, size: 16, 'aria-hidden': true }),
      );
    }

    const { getByRole } = render(createElement(Fixture));
    expect(nativeHandle).not.toBeNull();
    const startAnimation = vi.spyOn(nativeHandle!, 'startAnimation');
    const stopAnimation = vi.spyOn(nativeHandle!, 'stopAnimation');
    const semanticTarget = getByRole('button');

    fireEvent.mouseEnter(semanticTarget);
    fireEvent.mouseLeave(semanticTarget);

    expect(startAnimation).toHaveBeenCalledTimes(1);
    expect(stopAnimation).toHaveBeenCalledTimes(1);
  });

  it('chama start/stop no componente nativo ao entrar/sair do elemento semântico', () => {
    const startAnimation = vi.fn();
    const stopAnimation = vi.fn();
    const NativeIcon = forwardRef<AnimatedHeroiconHandle>(function NativeIcon(_, ref) {
      useImperativeHandle(ref, () => ({ startAnimation, stopAnimation }));
      return createElement('span', { 'data-testid': 'native-icon' });
    });

    function Fixture() {
      const hover = useNativeHoverAnimation();
      return createElement(
        'button',
        {
          type: 'button',
          onMouseEnter: hover.onMouseEnter,
          onMouseLeave: hover.onMouseLeave,
        },
        createElement(NativeIcon, { ref: hover.iconRef }),
      );
    }

    const { getByRole } = render(createElement(Fixture));
    const semanticTarget = getByRole('button');

    fireEvent.mouseEnter(semanticTarget);
    expect(startAnimation).toHaveBeenCalledTimes(1);
    expect(stopAnimation).not.toHaveBeenCalled();

    fireEvent.mouseLeave(semanticTarget);
    expect(stopAnimation).toHaveBeenCalledTimes(1);
  });

  it('não inicia ao pairar o SVG isolado; só o grupo semântico dispara', () => {
    let nativeHandle: AnimatedHeroiconHandle | null = null;

    function Fixture() {
      const hover = useNativeHoverAnimation();
      useEffect(() => {
        nativeHandle = hover.iconRef.current;
      }, [hover.iconRef]);
      return createElement('div', null,
        createElement('div', { 'data-testid': 'isolated-icon' }, createElement(AnimatedPlus, {
          ref: hover.iconRef,
          size: 16,
          'aria-hidden': true,
        })),
        createElement('button', {
          type: 'button',
          onMouseEnter: hover.onMouseEnter,
          onMouseLeave: hover.onMouseLeave,
        }, 'semantic target'),
      );
    }

    const { getByRole, getByTestId } = render(createElement(Fixture));
    const startAnimation = vi.spyOn(nativeHandle!, 'startAnimation');
    const icon = getByTestId('isolated-icon').querySelector('svg');
    expect(icon).not.toBeNull();

    fireEvent.mouseEnter(icon!);
    expect(startAnimation).not.toHaveBeenCalled();

    fireEvent.focus(getByRole('button'));
    fireEvent.click(getByRole('button'));
    expect(startAnimation).not.toHaveBeenCalled();

    fireEvent.mouseEnter(getByRole('button'));
    expect(startAnimation).toHaveBeenCalledTimes(1);
  });

  it('não inicia com foco/clique/teclado e respeita reduced-motion', () => {
    const startAnimation = vi.fn();
    const stopAnimation = vi.fn();
    const NativeIcon = forwardRef<AnimatedHeroiconHandle>(function NativeIcon(_, ref) {
      useImperativeHandle(ref, () => ({ startAnimation, stopAnimation }));
      return createElement('span');
    });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));

    function Fixture() {
      const hover = useNativeHoverAnimation();
      return createElement(
        'button',
        {
          type: 'button',
          onMouseEnter: hover.onMouseEnter,
          onMouseLeave: hover.onMouseLeave,
        },
        createElement(NativeIcon, { ref: hover.iconRef }),
      );
    }

    const { getByRole } = render(createElement(Fixture));
    const semanticTarget = getByRole('button');
    fireEvent.focus(semanticTarget);
    fireEvent.click(semanticTarget);
    fireEvent.keyDown(semanticTarget, { key: 'Enter' });
    fireEvent.mouseEnter(semanticTarget);
    fireEvent.mouseLeave(semanticTarget);

    expect(startAnimation).not.toHaveBeenCalled();
    expect(stopAnimation).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('não mantém animação CSS customizada nem ponteiro passivo no bridge', () => {
    const css = read('app/globals.css');
    const bridge = read('lib/animated-heroicons.ts');

    expect(css).not.toContain('.group:hover .hero-icon-motion');
    expect(css).not.toContain('@keyframes hero-icon-group-hover');
    expect(css).not.toContain('hero-icon-motion');
    expect(css).not.toContain('hero-icon-control');
    expect(bridge).not.toContain('pointer-events-none');
    expect(bridge).not.toContain('hero-icon-motion');
  });

  it('usa handlers nativos nos arquivos que renderizam Heroicons Animated', () => {
    const bridge = read('lib/animated-heroicons.ts');
    expect(bridge).toContain('useNativeHoverAnimation');

    for (const file of [
      'components/ui/AppSidebar.tsx',
      'app/(app)/dashboard/DashboardClient.tsx',
      'app/(app)/agenda/AgendaClient.tsx',
      'app/(app)/roadmap/RoadmapClient.tsx',
      'components/onboarding/OnboardingForm.tsx',
    ]) {
      const source = read(file);
      expect(source, file).toContain('useNativeHoverAnimation');
      expect(source, file).not.toContain('onFocus={() =>');
      expect(source, file).not.toContain('onBlur={() =>');
    }
  });

  it('mantém a ponte somente nos exports Heroicons já aprovados', () => {
    const bridge = read('lib/animated-heroicons.ts');
    for (const name of [
      'arrow-left-end-on-rectangle',
      'calendar-days',
      'cog-6-tooth',
      'map',
      'moon',
      'newspaper',
      'plus',
      'squares-2x2',
      'sun',
      'swatch',
    ]) {
      expect(bridge).toContain(`@heroicons-animated/react/${name}`);
    }
  });
});
