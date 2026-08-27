// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProfileSettingsForm from '@/components/settings/ProfileSettingsForm';

vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('edição do perfil global em Configurações', () => {
  it('edita e persiste nome, perfil, origem e foto sem contexto de workspace', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ profile: {} }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<ProfileSettingsForm initialValues={{
      firstName: 'Ana', lastName: 'Silva', professionalProfile: 'agency', referralSource: 'instagram', photoUrl: 'https://cdn.example/profile.png',
    }} />);

    fireEvent.change(screen.getByLabelText('Seu nome'), { target: { value: 'Beatriz' } });
    fireEvent.change(screen.getByLabelText('Seu sobrenome'), { target: { value: 'Costa' } });
    fireEvent.change(screen.getByLabelText('Perfil profissional'), { target: { value: 'creator' } });
    fireEvent.change(screen.getByLabelText('Como você conheceu o Creatools?'), { target: { value: 'youtube' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar dados pessoais' }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ method: 'PATCH' })));
    const [, options] = mockFetch.mock.calls[0];
    expect(JSON.parse(String(options.body))).toEqual({
      firstName: 'Beatriz', lastName: 'Costa', professionalProfile: 'creator', referralSource: 'youtube', photoUrl: 'https://cdn.example/profile.png',
    });
  });
});
