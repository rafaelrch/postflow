import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = [
  'components/editor/EditorSidebar.tsx',
  'components/editor/SlideCanvas.tsx',
  'components/editor/CarouselPreview.tsx',
  'components/editor/FormatDropdown.tsx',
  'components/editor/ScheduleModal.tsx',
  'components/editor/Section.tsx',
  'components/editor/TemplateModelPicker.tsx',
  'components/editor/CornerPlaceholderModal.tsx',
  'components/editor/sidebar/RefineTextPanel.tsx',
  'components/editor/sidebar/AiGenPanel.tsx',
];

describe('TASK 13 — lote 1 do editor usa HugeIcons sem perder controles', () => {
  it('não mantém Lucide e renderiza ícones oficiais nos arquivos migrados', () => {
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source, file).not.toContain('lucide-react');
      expect(source, file).toContain('HugeiconsIcon');
    }
  });

  it('marca ícones decorativos e respeita redução de movimento nos hotspots animados', () => {
    const source = files.map((file) => readFileSync(join(process.cwd(), file), 'utf8')).join('\n');
    expect(source).toContain('aria-hidden');
    expect(source).toContain('motion-reduce:transition-none');
  });
});
