import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

describe('TASK 13 — rodada 2: hotspots do editor usam o gatilho semântico nativo', () => {
  it('liga cada alvo ao ícone animado pela ref do grupo semântico', () => {
    const sidebar = read('components/editor/EditorSidebar.tsx');
    const canvas = read('components/editor/SlideCanvas.tsx');

    for (const icon of ['AnimatedArrowDownTray', 'AnimatedArchiveBoxArrowDown']) {
      expect(sidebar, icon).toContain(icon);
    }
    for (const icon of [
      'AnimatedMoon',
      'AnimatedSun',
      'AnimatedCalendarDateRange',
      'AnimatedBookmarkSquare',
      'AnimatedPlus',
      'AnimatedTrash',
    ]) {
      expect(canvas, icon).toContain(icon);
    }

    expect(sidebar).toContain('useNativeHoverAnimation');
    expect(canvas).toContain('useNativeHoverAnimation');
    expect(sidebar).toMatch(/onMouseEnter=\{[^}]*\.onMouseEnter\}/);
    expect(sidebar).toMatch(/onMouseLeave=\{[^}]*\.onMouseLeave\}/);
    expect(canvas).toMatch(/onMouseEnter=\{[^}]*\.onMouseEnter\}/);
    expect(canvas).toMatch(/onMouseLeave=\{[^}]*\.onMouseLeave\}/);
  });

  it('não usa hover CSS no SVG como gatilho dos sete alvos', () => {
    const source = `${read('components/editor/EditorSidebar.tsx')}\n${read('components/editor/SlideCanvas.tsx')}`;
    const targetIconLines = source
      .split('\n')
      .filter((line) => line.includes('<Animated'))
      .join('\n');
    expect(targetIconLines).not.toContain('group-hover:');
    expect(targetIconLines).not.toContain('onMouseEnter=');
    expect(targetIconLines).not.toContain('onClick=');
  });

  it('mantém o estado disabled e bloqueia animação inválida', () => {
    const canvas = read('components/editor/SlideCanvas.tsx');
    expect(canvas).toContain("useNativeHoverAnimation(saveStatusProp !== 'saving')");
    expect(canvas).toContain('useNativeHoverAnimation(slides.length > 1)');
    expect(canvas).toContain('disabled={saveStatusProp === \'saving\'}');
    expect(canvas).toContain('disabled={slides.length <= 1}');
  });
});
