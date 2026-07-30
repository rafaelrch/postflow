// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';

/**
 * O par visível do C2b: o redirect pro /login?authError=invalid_code só serve se
 * a pessoa vir o motivo. A exibição mora aqui, e não no AuthForm, porque aquele
 * arquivo é protegido pela SPEC.
 */

const { mockToastError, searchParams } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  searchParams: { current: new URLSearchParams() },
}));

vi.mock('react-hot-toast', () => ({
  default: { error: mockToastError },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams.current,
}));

async function renderNotice(query: string) {
  searchParams.current = new URLSearchParams(query);
  vi.resetModules();
  const { default: AuthErrorNotice } = await import('../components/auth/AuthErrorNotice');
  return render(
    <StrictMode>
      <AuthErrorNotice />
    </StrictMode>,
  );
}

beforeEach(() => searchParams.current = new URLSearchParams());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AuthErrorNotice', () => {
  it('avisa que o link expirou quando o callback devolve authError=invalid_code', async () => {
    await renderNotice('authError=invalid_code');
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(
      'Link de confirmação inválido ou expirado. Faça login ou cadastre-se novamente.',
    ));
  });

  it('não duplica o toast sob StrictMode (efeito roda duas vezes em dev)', async () => {
    await renderNotice('authError=invalid_code');
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockToastError).toHaveBeenCalledTimes(1);
  });

  it('fica calado sem authError e diante de código desconhecido', async () => {
    await renderNotice('');
    await renderNotice('authError=coisa_que_nao_existe');
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
