// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const { guard, createAdmin, load } = vi.hoisted(() => ({ guard: vi.fn(), createAdmin: vi.fn(), load: vi.fn() }));
vi.mock('@/lib/admin-page-guard', () => ({ requireAdminPage: guard }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabaseClient: createAdmin }));
vi.mock('@/lib/admin-health', () => ({ loadAdminHealth: load }));
vi.mock('@/app/admin/saude/HealthDashboard', () => ({ default: () => <div>saúde</div> }));

async function page() {
  vi.resetModules();
  return (await import('@/app/admin/saude/page')).default;
}

afterEach(() => vi.clearAllMocks());

describe('/admin/saude', () => {
  it.each([401, 403])('nega %i antes de criar o service_role', async (status) => {
    guard.mockRejectedValue(new Error(`INTERRUPT:${status}`));
    await expect((await page())()).rejects.toThrow(`INTERRUPT:${status}`);
    expect(createAdmin).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('autoriza antes de carregar as verificações', async () => {
    guard.mockResolvedValue({ ok: true });
    createAdmin.mockReturnValue({ service: true });
    load.mockResolvedValue([]);
    await expect((await page())()).resolves.toBeTruthy();
    expect(guard).toHaveBeenCalledBefore(createAdmin);
    expect(load).toHaveBeenCalledWith({ service: true });
  });
});
