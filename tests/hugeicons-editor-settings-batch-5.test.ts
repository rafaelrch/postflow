import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = [
  'components/editor/sidebar/ImageThumb.tsx',
  'components/editor/sidebar/SidebarScopeHeader.tsx',
  'components/editor/sidebar/WordHighlightPicker.tsx',
  'components/news/NewsCardStage.tsx',
  'components/onboarding/OnboardingForm.tsx',
  'components/onboarding/PhotoEditor.tsx',
  'components/settings/ChangeEmailButton.tsx',
  'components/settings/ChangePasswordButton.tsx',
  'components/ui/CreditsExhaustedModal.tsx',
  'components/ui/Pagination.tsx',
];

describe('TASK 13 — lote 5 editor, onboarding e configurações', () => {
  it('usa HugeIcons e mantém os arquivos livres de Lucide', () => {
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source, file).not.toContain('lucide-react');
      expect(source, file).toContain('HugeiconsIcon');
    }
  });

  it('mantém redução de movimento para loaders', () => {
    const source = files.map((file) => readFileSync(join(process.cwd(), file), 'utf8')).join('\n');
    expect(source).toContain('motion-reduce:animate-none');
  });
});
