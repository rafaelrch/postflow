// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

const { mockGetSession, mockOnAuthStateChange } = vi.hoisted(() => ({ mockGetSession: vi.fn(), mockOnAuthStateChange: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ createClient: () => ({ auth: { getSession: mockGetSession, onAuthStateChange: mockOnAuthStateChange } }) }));
vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn() }));

describe('OnboardingForm — etapas do wizard', () => {
  beforeEach(() => {
    localStorage.setItem('onboarding-draft:usuario-wizard', JSON.stringify({ brandName: 'Marca salva', step: 3 }));
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'usuario-wizard' } } } });
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ profile: null }), { status: 200 }))));
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

  it('restaura a etapa salva e persiste a navegação para a mesma conta', async () => {
    const { default: OnboardingForm } = await import('../components/onboarding/OnboardingForm');
    const screen = render(<OnboardingForm compact />);

    await waitFor(() => expect(screen.getByTestId('onboarding-step').textContent).toBe('3'));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    await waitFor(() => expect(screen.getByTestId('onboarding-step').textContent).toBe('2'));
    expect(JSON.parse(localStorage.getItem('onboarding-draft:usuario-wizard') ?? '{}').step).toBe(2);
  });
});
