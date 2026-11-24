import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rpc: vi.fn(), scope: { ready: true, key: ['scope', 'company-1', 'user-1', 'explicit', '*', 'admin'] } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
vi.mock('@/hooks/pdvReportCache', () => ({ usePdvAuthorizedQueryScope: () => state.scope }));
import { projectPdvCustomerPaymentOptions, usePdvCustomerPaymentOptions } from './usePdvCustomerPaymentOptions';

describe('Saldo e vouchers autorizados do cliente', () => {
  beforeEach(() => { vi.clearAllMocks(); state.scope = { ready: true, key: ['scope', 'company-1', 'user-1', 'explicit', '*', 'admin'] }; });
  function context() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
  }
  it('não reaproveita crédito do mesmo cliente ao trocar usuário ou permissão', async () => {
    state.rpc.mockResolvedValueOnce({ data: { available_credit: 150, vouchers: [] }, error: null }).mockResolvedValueOnce({ data: { available_credit: 0, vouchers: [] }, error: null });
    const { wrapper, client } = context();
    const { result, rerender } = renderHook(() => usePdvCustomerPaymentOptions('customer-1'), { wrapper });
    await waitFor(() => expect(result.current.data?.availableCredit).toBe(150));
    expect(client.getQueryCache().getAll()[0].queryKey).toEqual(['pdv-customer-payment-options', ...state.scope.key, 'customer-1']);
    state.scope = { ready: true, key: ['scope', 'company-1', 'user-2', 'explicit', 'screen:pdv', 'operator'] };
    rerender();
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.availableCredit).toBe(0));
    expect(state.rpc).toHaveBeenCalledTimes(2);
  });
  it('não consulta enquanto autorização da sessão é desconhecida', () => {
    state.scope.ready = false;
    const { wrapper } = context();
    renderHook(() => usePdvCustomerPaymentOptions('customer-1'), { wrapper });
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('não mostra erro interno do servidor nem converte erro em saldo zero', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied table private' } });
    const { wrapper } = context();
    const { result } = renderHook(() => usePdvCustomerPaymentOptions('customer-1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error?.message).toBe('Não foi possível carregar o saldo e os vouchers deste cliente.');
  });
  it('descarta vouchers sem identidade e números não finitos na resposta', () => {
    expect(projectPdvCustomerPaymentOptions({ available_credit: Infinity, vouchers: [{ public_code: 'SEM-ID', balance: 50 }, { id: 'v1', public_code: 'CR-1', balance: Number.NaN, expires_on: null }] })).toEqual({ availableCredit: 0, vouchers: [{ id: 'v1', code: 'CR-1', balance: 0, expiresOn: null }] });
  });
});
