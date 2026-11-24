import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  auth: { profile: { company_id: 'company-1' }, hasScreenAccess: vi.fn(() => true) },
  scope: { ready: true, key: ['scope', 'company-1', 'operator-1', 'explicit', 'screen:pdv', 'operator'] },
  result: { data: [] as unknown[], error: null as unknown, count: 0 },
  from: vi.fn(), rpc: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), returns: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/hooks/pdvReportCache', () => ({ usePdvAuthorizedQueryScope: () => state.scope }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: state.from, rpc: state.rpc } }));
import { usePdvCustomerHistory } from './usePdvCustomerHistory';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('Histórico PDV do cliente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.scope.ready = true;
    state.auth.hasScreenAccess.mockReturnValue(true);
    state.result = { data: [], error: null, count: 0 };
    const chain = { select: state.select, eq: state.eq, order: state.order, range: state.range, returns: state.returns, then: (resolve: (value: unknown) => unknown) => Promise.resolve(state.result).then(resolve) };
    for (const call of [state.from, state.rpc, state.select, state.eq, state.order, state.range, state.returns]) call.mockReturnValue(chain);
  });
  it('pagina por UUID do cliente e empresa na tabela protegida pela custódia RLS', async () => {
    state.result = { data: [{ id: 'order-1', number: 27, status: 'pago', total: 45, created_at: '2026-11-14T00:00:00Z' }], error: null, count: 42 };
    const { result } = renderHook(() => usePdvCustomerHistory('customer-1', 'orders', 1, true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(state.from).toHaveBeenCalledWith('pdv_orders');
    expect(state.eq).toHaveBeenCalledWith('company_id', 'company-1');
    expect(state.eq).toHaveBeenCalledWith('customer_id', 'customer-1');
    expect(state.range).toHaveBeenCalledWith(20, 39);
    expect(result.current.data?.total).toBe(42);
  });
  it('filtra e pagina o resultado autorizado da RPC de orçamentos, sem ler a tabela', async () => {
    state.result = { data: [{ id: 'quote-1', number: 4, status: 'edicao', total: null, updated_at: '2026-11-14T12:00:00Z' }], error: null, count: 23 };
    const { result } = renderHook(() => usePdvCustomerHistory('customer-1', 'quotes', 1, true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(state.from).not.toHaveBeenCalled();
    expect(state.rpc).toHaveBeenCalledWith('pdv_list_preorders_v2', { p_status: null }, { count: 'exact' });
    expect(state.eq).toHaveBeenCalledWith('customer_id', 'customer-1');
    expect(state.range).toHaveBeenCalledWith(20, 39);
    expect(result.current.data?.rows[0]).toMatchObject({ total: null, created_at: '2026-11-14T12:00:00Z' });
    expect(result.current.data?.total).toBe(23);
  });
  it.each(['closed', 'profile-loading', 'no-access'])('não consulta quando %s', mode => {
    state.scope.ready = mode !== 'profile-loading';
    state.auth.hasScreenAccess.mockReturnValue(mode !== 'no-access');
    renderHook(() => usePdvCustomerHistory('customer-1', 'orders', 0, mode !== 'closed'), { wrapper });
    expect(state.from).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('mostra falha sem expor SQL ou converter em histórico vazio', async () => {
    state.result = { data: [], error: { message: 'table secret denied' }, count: 0 };
    const { result } = renderHook(() => usePdvCustomerHistory('customer-1', 'orders', 0, true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Não foi possível consultar o histórico deste cliente. Tente novamente.');
    expect(result.current.data).toBeUndefined();
  });
});
