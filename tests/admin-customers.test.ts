import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAdminCustomers, parseAdminCustomerQuery } from '@/lib/admin-customers';

describe('contrato de Clientes', () => {
  it('normaliza busca, filtros permitidos e página da URL', () => {
    expect(parseAdminCustomerQuery({ q: '  Pessoa@X.com ', f: ['active', 'inexistente', 'zero_credits'], page: '2' })).toEqual({
      search: 'Pessoa@X.com', filters: ['active', 'zero_credits'], page: 2,
    });
    expect(parseAdminCustomerQuery({ page: '-4' }).page).toBe(1);
  });

  it('manda busca, filtros e paginação para a RPC em vez de listar o Auth', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { total: 1, rows: [{ customer_key: 'subscription:x', email: 'orfa@x.com' }] }, error: null });
    const admin = { rpc, auth: { admin: { listUsers: vi.fn() } } } as unknown as SupabaseClient;
    const data = await loadAdminCustomers(admin, { search: 'orfa@x.com', filters: ['paid_without_account'], page: 2 });
    expect(rpc).toHaveBeenCalledWith('admin_list_customers', { p_search: 'orfa@x.com', p_filters: ['paid_without_account'], p_page: 2, p_page_size: 25 });
    expect((admin.auth.admin.listUsers as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(data.rows[0]).toMatchObject({ customerKey: 'subscription:x', email: 'orfa@x.com', userId: null });
  });
});
