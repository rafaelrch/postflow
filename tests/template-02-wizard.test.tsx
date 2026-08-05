// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TEMPLATE_02_DEFAULT_MODELS } from '@/lib/templates/template-02';

/**
 * WIZARD × TEMPLATE 2 (fatia S3) — renderizado de verdade.
 *
 * O que importa provar: o card existe, e escolher o Template 2 NÃO transforma o
 * deck em fixo. `isFixedDeck` é só do Template 1 — se o T2 caísse ali, o slider
 * de quantidade sumiria e o usuário perderia o controle que o spec lhe dá.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({
  default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
// O wizard carrega o contexto de marca ao montar. Sem sessão ele desiste cedo,
// que é o caminho que interessa aqui.
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn() }));

import CreateWizard from '@/components/editor/CreateWizard';

function abreWizard() {
  return render(<CreateWizard onClose={vi.fn()} />);
}

/** Vai do passo 1 (estilo) para o 2 (conteúdo). */
function avanca() {
  fireEvent.click(screen.getByText('Continuar'));
}

afterEach(cleanup);

describe('TEMPLATE 2 no wizard', () => {
  it('o card aparece ao lado dos outros estilos', () => {
    abreWizard();
    expect(screen.getByText('Template 1')).toBeTruthy();
    expect(screen.getByText('Template 2')).toBeTruthy();
  });

  it('o card promete deck aberto, não fechado', () => {
    abreWizard();
    // O T1 anuncia "deck fechado de 6 slides"; o T2 não pode prometer o mesmo.
    expect(screen.getByText(/Quantos slides você quiser/i)).toBeTruthy();
  });

  it('escolher o Template 2 MANTÉM o controle de quantidade', () => {
    abreWizard();
    fireEvent.click(screen.getByText('Template 2'));
    avanca();
    // O slider existe (o T1 esconde o dele) e abre no padrão do spec.
    const slider = screen.getByRole('slider');
    expect(slider).toBeTruthy();
    expect((slider as HTMLInputElement).value).toBe(String(TEMPLATE_02_DEFAULT_MODELS.length));
    expect(screen.getByText(String(TEMPLATE_02_DEFAULT_MODELS.length))).toBeTruthy();
  });

  it('o Template 1 continua sem slider — o deck dele é fechado', () => {
    // A generalização não pode ter afrouxado a regra do T1.
    abreWizard();
    fireEvent.click(screen.getByText('Template 1'));
    avanca();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('"Colar copy manual" está disponível — é o caminho SEM crédito de IA', () => {
    abreWizard();
    fireEvent.click(screen.getByText('Template 2'));
    avanca();
    fireEvent.click(screen.getByText('Colar copy manual'));
    // O botão final deixa de falar em gerar: nada vai para a OpenAI.
    expect(screen.getByText('Criar carrossel')).toBeTruthy();
  });
});
