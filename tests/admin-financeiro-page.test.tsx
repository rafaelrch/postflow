// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const { guard, createAdmin, load } = vi.hoisted(() => ({ guard: vi.fn(), createAdmin: vi.fn(), load: vi.fn() }));
vi.mock('@/lib/admin-page-guard', () => ({ requireAdminPage: guard }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabaseClient: createAdmin }));
vi.mock('@/lib/admin-finance', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/admin-finance')>()), loadAdminFinance: load }));
vi.mock('@/components/admin/FinanceShell', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/app/admin/financeiro/FinanceDashboard', () => ({ default: () => <div>financeiro</div> }));

async function page() {
  vi.resetModules();
  return (await import('@/app/admin/financeiro/page')).default;
}

afterEach(() => vi.clearAllMocks());

describe('/admin/financeiro', () => {
  it.each([401, 403])('nega %i antes de criar o service_role', async (status) => {
    guard.mockRejectedValue(new Error(`INTERRUPT:${status}`));
    await expect((await page())({ searchParams: Promise.resolve({}) })).rejects.toThrow(`INTERRUPT:${status}`);
    expect(createAdmin).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('admin autorizado carrega as quatro leituras no servidor', async () => {
    guard.mockResolvedValue({ ok: true });
    createAdmin.mockReturnValue({ service: true });
    load.mockResolvedValue({ revenue: { ok: false }, current: { ok: false }, attention: { ok: false }, forecast: { ok: false } });
    await expect((await page())({ searchParams: Promise.resolve({ periodo: '7d' }) })).resolves.toBeTruthy();
    expect(guard).toHaveBeenCalledBefore(createAdmin);
    expect(load).toHaveBeenCalledWith({ service: true }, expect.objectContaining({ key: '7d' }));
  });
});
