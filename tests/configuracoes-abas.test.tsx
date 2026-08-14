// @vitest-environment jsdom
/**
 * Configurações: as duas abas, o endereço antigo e a navegação.
 *
 * O que estes testes existem para impedir:
 *   • /conta virar 404 — o endereço já circulou em e-mail e estava no badge da
 *     sidebar. Quem paga não pode bater numa página que sumiu.
 *   • a aba escolhida sair da URL. Se ela virar estado de componente, mandar
 *     link direto para uma aba para de funcionar e recarregar joga a pessoa de
 *     volta na primeira — os dois pedidos explícitos desta fase.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const { mockRedirect, mockPermanentRedirect, mockPathname } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockPermanentRedirect: vi.fn(),
  mockPathname: vi.fn(() => '/configuracoes/assinatura'),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  permanentRedirect: mockPermanentRedirect,
  usePathname: mockPathname,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('endereço antigo /conta', () => {
  it('redireciona para a aba de assinatura, sem 404', async () => {
    const { default: ContaPage } = await import('../app/(app)/conta/page');
    ContaPage();

    expect(mockPermanentRedirect).toHaveBeenCalledWith('/configuracoes/assinatura');
  });

  it('é 308 (permanentRedirect), não o 307 temporário', async () => {
    const { default: ContaPage } = await import('../app/(app)/conta/page');
    ContaPage();

    // A mudança é definitiva: navegador e crawler passam a ir direto ao novo
    // endereço. `redirect` deixaria todo mundo batendo aqui para sempre.
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe('/configuracoes sem aba', () => {
  it('cai na aba de assinatura — o que a antiga /conta mostrava', async () => {
    const { default: ConfiguracoesPage } = await import('../app/(app)/configuracoes/page');
    ConfiguracoesPage();

    expect(mockRedirect).toHaveBeenCalledWith('/configuracoes/assinatura');
    // Temporário de propósito: /configuracoes pode ganhar tela própria depois,
    // e um 308 ficaria cacheado no navegador do cliente para sempre.
    expect(mockPermanentRedirect).not.toHaveBeenCalled();
  });
});

describe('abas', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/configuracoes/assinatura');
  });

  async function renderAbas() {
    const { default: SettingsTabs } = await import('../components/settings/SettingsTabs');
    return render(<SettingsTabs />);
  }

  it('cada aba é um LINK com a própria URL — é isso que sobrevive à recarga', async () => {
    const screen = await renderAbas();

    const conta = screen.getByTestId('aba-conta');
    const assinatura = screen.getByTestId('aba-assinatura');

    expect(conta.tagName).toBe('A');
    expect(conta.getAttribute('href')).toBe('/configuracoes/conta');
    expect(assinatura.tagName).toBe('A');
    expect(assinatura.getAttribute('href')).toBe('/configuracoes/assinatura');
  });

  it('a aba ativa sai da URL, não de estado interno', async () => {
    const screen = await renderAbas();
    expect(screen.getByTestId('aba-assinatura').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('aba-conta').getAttribute('aria-current')).toBeNull();

    // Mesma montagem, outra URL: quem manda é o pathname. Uma recarga em
    // /configuracoes/conta cai exatamente neste caso.
    cleanup();
    mockPathname.mockReturnValue('/configuracoes/conta');
    const outra = await renderAbas();
    expect(outra.getByTestId('aba-conta').getAttribute('aria-current')).toBe('page');
    expect(outra.getByTestId('aba-assinatura').getAttribute('aria-current')).toBeNull();
  });
});
