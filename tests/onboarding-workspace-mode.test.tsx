// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

const { mockGetSession, mockOnAuthStateChange, mockUpload, mockToastPromise, mockToastError } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockUpload: vi.fn(),
  mockToastPromise: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ auth: { getSession: mockGetSession, onAuthStateChange: mockOnAuthStateChange } }),
}));
vi.mock('@/lib/upload-image', () => ({ uploadImageFile: mockUpload }));
vi.mock('@/components/ui/toast', () => ({ toastManager: { promise: mockToastPromise } }));
vi.mock('react-hot-toast', () => ({ default: { error: mockToastError, success: vi.fn() } }));

beforeEach(() => {
  mockUpload.mockResolvedValue('https://cdn.example/workspace-logo.png');
  mockToastPromise.mockImplementation((promise: Promise<unknown>) => promise);
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'usuario-existente' } } } });
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url === '/api/workspaces') {
      return Promise.resolve(new Response(JSON.stringify({
        state: 'ready',
        activeWorkspace: { id: 'workspace-novo', name: 'Cliente Novo' },
        workspaces: [{ workspaceId: 'workspace-novo', name: 'Cliente Novo', status: 'active', workspaceStatus: 'active' }],
      }), { status: 200 }));
    }
    if (url === '/api/workspaces/workspace-novo/brand') {
      return Promise.resolve(new Response(JSON.stringify({ brand: {
        brand_name: 'Marca Nova', niche: 'Tecnologia',
        instagram_handle: 'marca-nova', brand_palette: ['#112233'],
      } }), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ profile: {
      onboarding_completed: true,
      first_name: 'Ana', last_name: 'Silva', professional_profile: 'agency', referral_source: 'instagram', photo_url: 'https://cdn.example/profile.png',
    } }), { status: 200 }));
  }));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('OnboardingForm — workspace adicional', () => {
  it('exibe somente configurações do workspace ativo, sem dados globais do usuário', async () => {
    const { default: OnboardingForm } = await import('../components/onboarding/OnboardingForm');
    const screen = render(<OnboardingForm compact />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Seu Workspace' })).toBeTruthy());
    expect(screen.getByLabelText('Nome da marca')).toBeTruthy();
    expect(screen.getByLabelText('Nicho')).toBeTruthy();
    expect(screen.queryByLabelText('Seu nome')).toBeNull();
    expect(screen.queryByLabelText('Seu sobrenome')).toBeNull();
    expect(screen.queryByLabelText('Perfil profissional')).toBeNull();
    expect(screen.queryByLabelText('Como você conheceu o Creatools?')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Foto de perfil' })).toBeNull();
  });

  it('faz upload da logo, mostra preview e envia a URL persistente no Workspace', async () => {
    const { default: OnboardingForm } = await import('../components/onboarding/OnboardingForm');
    const screen = render(<OnboardingForm compact />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Seu Workspace' })).toBeTruthy());

    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('workspace-logo-input'), { target: { files: [file] } });

    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith(file, 'workspace-logos'));
    expect(screen.getByAltText('Logo do Workspace').getAttribute('src')).toBe('https://cdn.example/workspace-logo.png');

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByTestId('onboarding-step').textContent).toBe('2'));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Revise e conclua' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Concluir onboarding' }));

    await waitFor(() => {
      const putCalls = vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method === 'PUT');
      const payload = JSON.parse(String(putCalls.at(-1)?.[1]?.body));
      expect(payload).toEqual(expect.objectContaining({ logoUrl: 'https://cdn.example/workspace-logo.png', complete: true }));
      expect(payload).not.toHaveProperty('photoUrl');
    });
    expect(mockToastPromise).toHaveBeenCalledWith(expect.any(Promise), expect.objectContaining({
      loading: { title: 'Concluindo onboarding...', description: 'Salvando e configurando seu Workspace.' },
      success: { title: 'Onboarding concluído', description: 'Seu Workspace foi criado e configurado.' },
      error: expect.any(Function),
    }));
  });

  it('rejeita arquivos que não são imagem ou excedem 10 MB', async () => {
    const { default: OnboardingForm } = await import('../components/onboarding/OnboardingForm');
    const screen = render(<OnboardingForm compact />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Seu Workspace' })).toBeTruthy());

    const file = new File(['not-an-image'], 'logo.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('workspace-logo-input'), { target: { files: [file] } });

    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith('Escolha uma imagem de até 10 MB.');
  });
});
