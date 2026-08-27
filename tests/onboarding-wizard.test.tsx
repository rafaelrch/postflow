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

    await waitFor(() => expect(screen.getByTestId('onboarding-step').textContent).toBe('4'));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    await waitFor(() => expect(screen.getByTestId('onboarding-step').textContent).toBe('3'));
    expect(JSON.parse(localStorage.getItem('onboarding-draft:usuario-wizard') ?? '{}')).toEqual(expect.objectContaining({ step: 3, version: 2 }));
  });

  it('segue a ordem final, coleta identidade/referral e envia canais independentes', async () => {
    localStorage.setItem('onboarding-draft:usuario-wizard', JSON.stringify({ step: 1 }));
    const { default: OnboardingForm } = await import('../components/onboarding/OnboardingForm');
    const screen = render(<OnboardingForm compact />);

    await waitFor(() => expect(screen.getByTestId('onboarding-step').textContent).toBe('1'));
    fireEvent.change(screen.getByLabelText('Seu nome'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Seu sobrenome'), { target: { value: 'Silva' } });
    fireEvent.change(screen.getByLabelText('Perfil profissional'), { target: { value: 'agency' } });
    fireEvent.change(screen.getByLabelText('Como você conheceu o Creatools?'), { target: { value: 'instagram' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByTestId('onboarding-step').textContent).toBe('2'));
    fireEvent.change(screen.getByLabelText('Nome do Workspace'), { target: { value: 'Cliente A' } });
    fireEvent.change(screen.getByLabelText('Nome da marca'), { target: { value: 'Marca A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByTestId('onboarding-step').textContent).toBe('3'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Instagram de notícias' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Twitter/X' }));
    fireEvent.change(screen.getByLabelText('@ Instagram de carrossel'), { target: { value: '@carrossel' } });
    fireEvent.change(screen.getByLabelText('@ Instagram de notícias'), { target: { value: '@noticias' } });
    fireEvent.change(screen.getByLabelText('@ Twitter / X'), { target: { value: '@twitter' } });
    for (let index = 0; index < 2; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByTestId('onboarding-step').textContent).toBe('5'));
    fireEvent.click(screen.getByRole('button', { name: 'Concluir onboarding' }));

    await waitFor(() => {
      const putCalls = vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method === 'PUT');
      expect(putCalls.length).toBeGreaterThan(0);
      expect(JSON.parse(String(putCalls.at(-1)?.[1]?.body))).toEqual(expect.objectContaining({
        firstName: 'Ana',
        lastName: 'Silva',
        professionalProfile: 'agency',
        referralSource: 'instagram',
        workspaceName: 'Cliente A',
        selectedChannels: ['instagram_carousel', 'instagram_news', 'twitter'],
        instagramHandle: '@carrossel',
        newsInstagramHandle: '@noticias',
        twitterHandle: '@twitter',
        complete: true,
      }));
    });
  });

  it('mantém a ordem de cinco etapas e exibe somente os campos dos canais selecionados', async () => {
    localStorage.setItem('onboarding-draft:usuario-wizard', JSON.stringify({ step: 1 }));
    const { default: OnboardingForm } = await import('../components/onboarding/OnboardingForm');
    const screen = render(<OnboardingForm compact />);

    await waitFor(() => expect(screen.getByTestId('onboarding-step').textContent).toBe('1'));
    expect(screen.getByRole('heading', { name: 'Boas-vindas ao Creatools' })).not.toBeNull();
    expect(screen.getByLabelText('Perfil profissional').querySelectorAll('option')).toHaveLength(4);
    expect(screen.getByLabelText('Como você conheceu o Creatools?').querySelectorAll('option')).toHaveLength(9);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByTestId('onboarding-step').textContent).toBe('2'));
    expect(screen.getByRole('heading', { name: 'Seu Workspace' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByTestId('onboarding-step').textContent).toBe('3'));
    expect(screen.getByLabelText('@ Instagram de carrossel')).not.toBeNull();
    expect(screen.queryByLabelText('@ Instagram de notícias')).toBeNull();
    expect(screen.queryByLabelText('@ Twitter / X')).toBeNull();
    expect(screen.queryByText('Sobre a marca')).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Instagram de notícias' }));
    expect(screen.getByLabelText('@ Instagram de notícias')).not.toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Instagram de carrossel' }));
    expect(screen.queryByLabelText('@ Instagram de carrossel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByTestId('onboarding-step').textContent).toBe('4'));
    expect(screen.getByRole('heading', { name: 'Foto de perfil' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByTestId('onboarding-step').textContent).toBe('5'));
    expect(screen.getByRole('heading', { name: 'Revise e conclua' })).not.toBeNull();
    expect(screen.queryByText('Sobre a marca')).toBeNull();
  });
});
