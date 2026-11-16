import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStockManagement, useStocks, getStockManagementError } from './useStocks';
import { useStockAccess } from './useStockAccess';

const mocks = vi.hoisted(() => ({ auth: { user: { id: 'user-a' }, profile: { company_id: 'company-a' }, roles: ['tecnico'], permissions: [] as string[], loading: false, profileLoading: false }, from: vi.fn(), rpc: vi.fn(), toast: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/hooks/useUserCompany', () => ({ getCurrentUserCompanyId: async () => mocks.auth.profile.company_id }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.auth = { user: { id: 'user-a' }, profile: { company_id: 'company-a' }, roles: ['tecnico'], permissions: [], loading: false, profileLoading: false }; mocks.rpc.mockResolvedValue({ data: { restricted: false, user_ids: [] }, error: null }); });
const wrapper = (client: QueryClient) => function Wrapper({ children }: { children: React.ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; };

describe('fronteira de gestão de locais', () => {
  it('não herda autorização de escrita do fallback de role e libera somente permissão explícita ou gestão', () => {
    const { result, rerender } = renderHook(useStockManagement);
    expect(result.current.canManage).toBe(false);
    mocks.auth.permissions = ['fn:manage_inventory']; rerender();
    expect(result.current.canManage).toBe(true);
    expect(result.current.canManageAccess).toBe(false);
    mocks.auth.roles = ['gestor']; rerender();
    expect(result.current.canManageAccess).toBe(true);
    mocks.auth.profileLoading = true; rerender();
    expect(result.current.canManage).toBe(false);
    expect(result.current.canManageAccess).toBe(false);
  });

  it('separa o cache por empresa, sessão e permissões e mascara durante hidratação', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.from.mockImplementation(() => {
      const query = { select: () => query, eq: () => query, order: () => query, or: () => Promise.resolve({ data: [{ id: mocks.auth.profile.company_id, name: 'Local', is_default: false, customer_id: null }], error: null }) };
      return query;
    });
    const { result, rerender } = renderHook(useStocks, { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.stocks[0]?.id).toBe('company-a'));
    mocks.auth = { ...mocks.auth, user: { id: 'user-b' }, profile: { company_id: 'company-b' }, profileLoading: true }; rerender();
    expect(result.current.stocks).toEqual([]);
    mocks.auth.profileLoading = false; rerender();
    expect(result.current.stocks).toEqual([]);
    await waitFor(() => expect(result.current.stocks[0]?.id).toBe('company-b'));
    expect(client.getQueryCache().findAll({ queryKey: ['stocks'] })).toHaveLength(2);
    await act(async () => { await expect(result.current.deleteStock.mutateAsync('another-stock')).rejects.toThrow(/permissão/); });
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });

  it('não lê ACL sem role gestora, rejeita restrito vazio e invalida saldos e catálogo depois de salvar', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result, rerender } = renderHook(() => useStockAccess('stock-a', true), { wrapper: wrapper(client) });
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.auth.roles = ['admin']; rerender();
    await waitFor(() => expect(result.current.access).toBeDefined());
    await act(async () => { await expect(result.current.setAccess.mutateAsync({ stockId: 'stock-a', restricted: true, userIds: [] })).rejects.toThrow(/pelo menos/); });
    expect(mocks.rpc.mock.calls.filter(call => call[0] === 'set_stock_access')).toHaveLength(0);
    await act(async () => { await result.current.setAccess.mutateAsync({ stockId: 'stock-a', restricted: true, userIds: ['member'] }); });
    for (const root of ['stocks', 'inventory', 'inventory-stock-levels', 'accessible-inventory-ids', 'stock-position']) expect(invalidate).toHaveBeenCalledWith({ queryKey: [root] });
    for (const root of ['pdv-terminal-settings-v2', 'pdv-direct-sale-v2', 'pdv-preorders', 'pdv-counter', 'pdv-terminals']) expect(invalidate).toHaveBeenCalledWith({ queryKey: [root] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv-cash-sessions-v2', 'terminals'] });
  });

  it.each(['pdv_stock_in_use', 'pdv_stock_management_denied', 'pdv_stock_acl_empty', 'stock_management_denied', 'stock_name_invalid', 'stock_scope_immutable', 'stock_pdv_module_required', 'stock_purpose_in_use', 'stock_delete_in_use', 'stock_access_empty', 'stock_access_user_invalid', 'stock_access_denied'])('mapeia o código de domínio %s sem exibi-lo', token => {
    expect(getStockManagementError({ message: token, code: '23514' })).not.toContain(token);
    expect(getStockManagementError({ message: 'Falha ao salvar', details: `code=${token}`, code: '23514' })).not.toContain(token);
  });
});
