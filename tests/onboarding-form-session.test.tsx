// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const { mockGetSession, mockOnAuthStateChange } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ auth: { getSession: mockGetSession, onAuthStateChange: mockOnAuthStateChange } }),
}));
vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn() }));

const USER_A = { user: { id: 'usuario-a' } };
const USER_B = { user: { id: 'usuario-b' } };

describe('OnboardingForm — troca de conta na mesma aba', () => {
  beforeEach(() => {
    localStorage.setItem('onboarding-draft:usuario-a', JSON.stringify({ brandName: 'Marca A' }));
    localStorage.setItem('onboarding-draft:usuario-b', JSON.stringify({ brandName: 'Marca B' }));
    mockGetSession.mockResolvedValue({ data: { session: USER_A } });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ profile: null }), { status: 200 }))));
  });

  afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

  it('descarta os dados da conta anterior e carrega o rascunho da nova sessão', async () => {
    let onAuthChange: ((event: string, session: typeof USER_A | typeof USER_B | null) => void) | undefined;
    mockOnAuthStateChange.mockImplementation((callback) => {
      onAuthChange = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    const { default: OnboardingForm } = await import('../components/onboarding/OnboardingForm');
    const screen = render(<OnboardingForm />);

    await waitFor(() => expect((screen.getByLabelText('Nome da marca') as HTMLInputElement).value).toBe('Marca A'));
    onAuthChange?.('SIGNED_IN', USER_B);

    await waitFor(() => expect((screen.getByLabelText('Nome da marca') as HTMLInputElement).value).toBe('Marca B'));
  });
});
