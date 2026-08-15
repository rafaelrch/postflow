// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const { guard, createAdmin, load } = vi.hoisted(() => ({ guard: vi.fn(), createAdmin: vi.fn(), load: vi.fn() }));
vi.mock('@/lib/admin-page-guard', () => ({ requireAdminPage: guard }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabaseClient: createAdmin }));
vi.mock('@/lib/admin-customers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/admin-customers')>()), loadAdminCustomers: load }));
vi.mock('@/components/admin/CustomersShell', () => ({ default: () => <div>clientes</div> }));

async function page() {
  vi.resetModules();
  return (await import('@/app/admin/clientes/page')).default;
}

afterEach(() => vi.clearAllMocks());

describe('/admin/clientes', () => {
  it.each([401, 403])('nega %i antes de criar o service_role', async (status) => {
    guard.mockRejectedValue(new Error(`INTERRUPT:${status}`));
    await expect((await page())({ searchParams: Promise.resolve({}) })).rejects.toThrow(`INTERRUPT:${status}`);
    expect(createAdmin).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('admin autorizado lê pela camada server-only', async () => {
    guard.mockResolvedValue({ ok: true });
    createAdmin.mockReturnValue({ service: true });
    load.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 25, totalPages: 1 });
    await expect((await page())({ searchParams: Promise.resolve({ q: 'ana@x.com' }) })).resolves.toBeTruthy();
    expect(guard).toHaveBeenCalledBefore(createAdmin);
    expect(load).toHaveBeenCalledWith({ service: true }, expect.objectContaining({ search: 'ana@x.com' }));
  });
});
