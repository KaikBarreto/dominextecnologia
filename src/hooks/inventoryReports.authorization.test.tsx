import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: { user: { id: 'user-a' }, profile: { company_id: 'company-a', user_id: 'user-a', is_active: true as boolean | undefined },
    permissions: ['screen:inventory'], roles: ['comercial'], hasPermissionRecord: true, profileLoading: false, loading: false },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (name: string, args: unknown) => {
  const response = state.rpc(name, args);
  return name === 'get_inventory_abc_report' ? { range: () => ({ order: () => response }) } : response;
} } }));
import { useInventoryAbcReport } from './useInventoryAbcReport';
import { useMaterialPurchaseReport } from './useMaterialPurchaseReport';

const row = (id: string) => ({
  inventory_id: id, sku: id, material_name: id, unit: 'un', group_id: null, group_name: null, group_color: null,
  current_balance: 2, registered_sale_price: 30, purchased_quantity: 2, priced_quantity: 2, unpriced_quantity: 0,
  purchased_total: 20, average_paid: 10, purchase_count: 1, last_purchase_date: '2026-11-16', history: [],
  delivered_quantity: 1, returned_quantity: 0, net_sold_quantity: 1, returned_amount: 0, net_revenue: 30,
  net_cmv: 10, cost_coverage: 'complete', cost_coverage_percent: 100, margin: 20,
});
const page = (rows: ReturnType<typeof row>[], count = rows.length, offset = 0, limit = 500) => ({
  scope: 'inventory_material_period', rows, total_count: count, offset, limit, has_more: offset + rows.length < count,
});
const abcRow = (id: string) => ({ ...row(id), minimum_balance: 0, unit_cost: 10, sale_price: 30, stock_value: 20, usage_quantity: 0, usage_value: 0, pdv_quantity: 1, pdv_revenue: 30, pdv_cost: 10, pdv_margin: 20 });
const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
};
beforeEach(() => {
  state.rpc.mockReset();
  Object.assign(state.auth, { user: { id: 'user-a' }, profile: { company_id: 'company-a', user_id: 'user-a', is_active: true },
    permissions: ['screen:inventory'], roles: ['comercial'], hasPermissionRecord: true, profileLoading: false, loading: false });
});

describe.each([
  { name: 'ABC', hook: useInventoryAbcReport, response: (id: string) => [abcRow(id)] },
  { name: 'compras e vendas', hook: useMaterialPurchaseReport, response: (id: string) => page([row(id)]) },
])('isolamento do relatório $name', ({ hook, response }) => {
  it.each(['empresa', 'usuário', 'permissão'] as const)('mascara imediatamente dados ao mudar %s', async change => {
    state.rpc.mockResolvedValueOnce({ data: response('autorizado-a'), error: null })
      .mockImplementationOnce(() => new Promise(() => {}));
    const { wrapper, client } = setup();
    const { result, rerender, unmount } = renderHook(() => hook({}), { wrapper });
    await waitFor(() => expect(result.current.data?.[0].material_name).toBe('autorizado-a'));
    if (change === 'empresa') state.auth.profile.company_id = 'company-b';
    if (change === 'usuário') { state.auth.user.id = 'user-b'; state.auth.profile.user_id = 'user-b'; }
    if (change === 'permissão') state.auth.permissions = [];
    rerender();
    expect(result.current.data).toBeUndefined();
    unmount(); client.clear();
  });
  it.each(['profileLoading', 'loading', 'inativo', 'perfil antigo'] as const)('não consulta nem mostra cache com %s', async change => {
    state.rpc.mockResolvedValue({ data: response('autorizado-a'), error: null });
    const { wrapper, client } = setup();
    const { result, rerender, unmount } = renderHook(() => hook({}), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    if (change === 'profileLoading' || change === 'loading') state.auth[change] = true;
    if (change === 'inativo') state.auth.profile.is_active = false;
    if (change === 'perfil antigo') state.auth.profile.user_id = 'user-b';
    rerender();
    expect(result.current.data).toBeUndefined(); expect(state.rpc).toHaveBeenCalledTimes(1);
    unmount(); client.clear();
  });
  it('descarta resposta que chega depois da troca de empresa', async () => {
    let resolve!: (response: unknown) => void;
    state.rpc.mockImplementationOnce(() => new Promise(r => { resolve = r; }))
      .mockResolvedValueOnce({ data: response('autorizado-b'), error: null });
    const { wrapper, client } = setup();
    const { result, rerender, unmount } = renderHook(() => hook({}), { wrapper });
    await waitFor(() => expect(state.rpc).toHaveBeenCalledTimes(1));
    state.auth.profile.company_id = 'company-b'; rerender();
    await waitFor(() => expect(result.current.data?.[0].material_name).toBe('autorizado-b'));
    await act(async () => resolve({ data: response('antigo-a'), error: null }));
    expect(result.current.data?.[0].material_name).toBe('autorizado-b');
    unmount(); client.clear();
  });
  it('traduz erro de acesso sem expor mensagem técnica', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'private_rpc SQLSTATE secret_table' } });
    const { wrapper, client } = setup();
    const { result, unmount } = renderHook(() => hook({}), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Seu perfil não permite consultar este relatório.');
    unmount(); client.clear();
  });
});

describe('integridade das páginas da Curva ABC', () => {
  it('consulta mais de mil materiais e publica a classificação somente com todas as páginas', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => abcRow(`material-${index}`));
    for (const offset of [0, 500, 1000]) state.rpc.mockResolvedValueOnce({ data: rows.slice(offset, offset + 500), error: null });
    const { wrapper, client } = setup();
    const { result, unmount } = renderHook(() => useInventoryAbcReport({}), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1001));
    expect(state.rpc).toHaveBeenCalledTimes(3);
    unmount(); client.clear();
  });
  it.each(['duplicado', 'valor inválido', 'limite'] as const)('não anuncia total parcial com %s', async reason => {
    if (reason === 'valor inválido') state.rpc.mockResolvedValueOnce({ data: [{ ...abcRow('a'), stock_value: null }], error: null });
    else {
      const rows = Array.from({ length: reason === 'limite' ? 5001 : 500 }, (_, index) => abcRow(`material-${index}`));
      if (reason === 'duplicado') rows.push(rows[0]);
      for (let offset = 0; offset < rows.length; offset += 500) state.rpc.mockResolvedValueOnce({ data: rows.slice(offset, offset + 500), error: null });
    }
    const { wrapper, client } = setup();
    const { result, unmount } = renderHook(() => useInventoryAbcReport({}), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    unmount(); client.clear();
  });
});

describe('integridade das páginas de compras e vendas', () => {
  it('carrega todas as páginas antes de publicar os totais', async () => {
    state.rpc.mockResolvedValueOnce({ data: page([row('primeiro')], 2, 0, 1), error: null })
      .mockResolvedValueOnce({ data: page([row('segundo')], 2, 1, 1), error: null });
    const { wrapper, client } = setup();
    const { result, unmount } = renderHook(() => useMaterialPurchaseReport({}), { wrapper });
    await waitFor(() => expect(result.current.data?.map(item => item.inventory_id)).toEqual(['primeiro', 'segundo']));
    expect(state.rpc).toHaveBeenLastCalledWith('get_material_purchase_report_v2', expect.objectContaining({ p_offset: 1 }));
    unmount(); client.clear();
  });
  it.each(['limite', 'sem progresso', 'offset', 'duplicado', 'contagem'] as const)('rejeita relatório parcial: %s', async reason => {
    const first = reason === 'limite' ? page([row('a')], 5001)
      : reason === 'sem progresso' ? page([], 1) : page([row('a')], 2, 0, 1);
    const second = reason === 'offset' ? page([row('b')], 2, 0, 1)
      : reason === 'contagem' ? page([row('b')], 3, 1, 1) : page([row('a')], 2, 1, 1);
    state.rpc.mockResolvedValueOnce({ data: first, error: null }).mockResolvedValueOnce({ data: second, error: null });
    const { wrapper, client } = setup();
    const { result, unmount } = renderHook(() => useMaterialPurchaseReport({}), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    if (reason === 'limite') expect(result.current.error?.message).toContain('período ou filtros menores');
    expect(state.rpc.mock.calls.length).toBeLessThanOrEqual(2);
    unmount(); client.clear();
  });
});
