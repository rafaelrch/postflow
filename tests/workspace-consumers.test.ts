import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sidebar = readFileSync(new URL('../components/ui/AppSidebar.tsx', import.meta.url), 'utf8');
const generator = readFileSync(new URL('../app/(app)/generator/GeneratorClient.tsx', import.meta.url), 'utf8');
const news = readFileSync(new URL('../app/(app)/news/page.tsx', import.meta.url), 'utf8');
const onboarding = readFileSync(new URL('../components/onboarding/OnboardingForm.tsx', import.meta.url), 'utf8');
const onboardingRoute = readFileSync(new URL('../app/api/onboarding/route.ts', import.meta.url), 'utf8');

describe('consumidores dependentes do workspace', () => {
  it('salva antes da troca e invalida o estado em memória do editor', () => {
    expect(sidebar).toContain('prepareWorkspaceChange');
    expect(sidebar).toContain('notifyWorkspaceChanged');
    expect(generator).toContain('registerWorkspaceChangeGuard');
    expect(generator).toContain('resetEditor');
    expect(generator).toContain("router.replace('/generator')");
  });

  it('zera notícias e recarrega lotes, templates e marca do workspace novo', () => {
    expect(news).toContain('registerWorkspaceChangeListener');
    expect(news).toContain('setSavedTemplates([])');
    expect(news).toContain('setBrandLogoUrl(undefined)');
    expect(news).toContain('await loadBatches(1)');
    expect(news).toContain("from('workspace_brand_context')");
  });

  it('carrega e persiste o setup do workspace sem misturá-lo ao perfil do usuário', () => {
    expect(onboarding).toContain("fetch('/api/workspaces'");
    expect(onboarding).toContain('/brand');
    expect(onboarding).toContain('registerWorkspaceChangeListener');
    expect(onboarding).toContain('onboarding-draft:${id}:${activeWorkspace.id}');
    expect(onboardingRoute).toContain('profileToPersist');
    expect(onboardingRoute).toContain("from('workspace_brand_context')");
  });
});
