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

/**
 * Abre o wizard já no passo de TEMPLATE (2 de 4). O passo 1 é o formato do
 * post (4:5 / 1:1 / 9:16) e não interessa a estes testes.
 */
function abreWizard() {
  const r = render(<CreateWizard onClose={vi.fn()} />);
  fireEvent.click(screen.getByText('Continuar'));
  return r;
}

/** Vai do passo de template para o de conteúdo. */
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

  /** O controle de quantidade virou uma grade de pills de 1 a 20. */
  function pillsDeQuantidade() {
    return screen.queryByRole('group', { name: 'Número de slides' });
  }

  it('escolher o Template 2 MANTÉM o controle de quantidade', () => {
    abreWizard();
    fireEvent.click(screen.getByText('Template 2'));
    avanca();
    // O controle existe (o T1 esconde o dele) e abre no padrão do spec.
    const grade = pillsDeQuantidade();
    expect(grade).toBeTruthy();
    const ativa = grade!.querySelector('[aria-pressed="true"]');
    expect(ativa?.textContent).toBe(String(TEMPLATE_02_DEFAULT_MODELS.length));
  });

  it('o Template 1 continua sem controle de quantidade — o deck dele é fechado', () => {
    // A generalização não pode ter afrouxado a regra do T1.
    abreWizard();
    fireEvent.click(screen.getByText('Template 1'));
    avanca();
    expect(pillsDeQuantidade()).toBeNull();
    expect(screen.getByText(/Deck fixo de 6 slides/)).toBeTruthy();
  });

  it('o modo manual é o caminho SEM crédito: não chama a API de geração', () => {
    // O rótulo do botão final virou "Gerar" para todos os modos, então o que
    // vale provar é o comportamento: no manual nada vai para a OpenAI.
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    abreWizard();
    fireEvent.click(screen.getByText('Template 2'));
    avanca();
    fireEvent.change(screen.getByDisplayValue('Criar com IA'), { target: { value: 'manual' } });
    // O T2 não tem passo de identidade visual: o conteúdo já é o último.
    fireEvent.click(screen.getByText('Gerar'));

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
