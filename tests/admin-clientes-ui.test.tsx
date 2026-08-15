// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import CustomersShell from '@/components/admin/CustomersShell';
import type { AdminCustomerRow } from '@/lib/admin-customers';

const { replace, params } = vi.hoisted(() => ({ replace: vi.fn(), params: { current: new URLSearchParams('periodo=30d') } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
  usePathname: () => '/admin/clientes',
  useSearchParams: () => params.current,
}));

const row: AdminCustomerRow = {
  customerKey: 'subscription:orfa', userId: null, subscriptionId: 'orfa', name: 'Cliente suporte', email: 'orfa@example.com',
  accountCreatedAt: null, emailConfirmedAt: null, onboardingCompleted: null, planInterval: 'month', subscriptionStatus: 'active',
  subscriptionValue: 59.5, accessUntil: null, cancelAtPeriodEnd: false, creditBalance: null, creditLimit: null,
  carouselCount: 0, newsCount: 0, scheduledCount: 0, leadCreatedAt: '2026-08-10T12:00:00Z', checkoutCreatedAt: '2026-08-10T12:05:00Z',
  subscriptionCreatedAt: '2026-08-10T12:10:00Z', onboardingAt: null, firstContentAt: null,
};
const query = { search: '', filters: [] as [], page: 1 };
const data = { rows: [row], total: 1, page: 1, pageSize: 25, totalPages: 1 };

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); params.current = new URLSearchParams('periodo=30d'); });

describe('UI de Clientes', () => {
  it('abre detalhe só com metadados e contagens', () => {
    render(<CustomersShell query={query} data={data} />);
    fireEvent.click(screen.getByRole('button', { name: /Cliente suporte/i }));
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByText('Linha do tempo reconstruível')).toBeTruthy();
    expect(drawer.textContent).toMatch(/Nenhum título, texto, prompt ou legenda/);
    expect(drawer.textContent).not.toMatch(/slide privado|legenda privada/i);
  });

  it('preserva a query existente ao ativar um filtro', () => {
    render(<CustomersShell query={query} data={data} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pagou sem conta' }));
    expect(replace).toHaveBeenCalledWith('/admin/clientes?periodo=30d&f=paid_without_account', { scroll: false });
  });

  it('faz debounce da busca e a grava na URL', async () => {
    vi.useFakeTimers();
    render(<CustomersShell query={query} data={data} />);
    fireEvent.change(screen.getByPlaceholderText('Buscar por e-mail ou nome'), { target: { value: '@example.com' } });
    expect(replace).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(350);
    expect(replace).toHaveBeenCalledWith('/admin/clientes?periodo=30d&q=%40example.com', { scroll: false });
  });

  it('diferencia base vazia de busca sem resultado', () => {
    const empty = { ...data, rows: [], total: 0 };
    const { rerender } = render(<CustomersShell query={query} data={empty} />);
    expect(screen.getByText('Nenhum cliente cadastrado')).toBeTruthy();
    rerender(<CustomersShell query={{ ...query, search: 'nada' }} data={empty} />);
    expect(screen.getByText('Nenhum cliente com esses filtros')).toBeTruthy();
  });
});
