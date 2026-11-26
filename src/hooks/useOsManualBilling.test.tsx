import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/hooks/useUserCompany', () => ({ useUserCompany: () => ({ companyId: 'company-a' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-a' } }) }));
vi.mock('@/hooks/useFinancialCategories', () => ({ resolveSystemCategoryNameFresh: async () => 'Receita de serviços' }));
vi.mock('./useOsCommercial', () => ({ OS_COMMERCIAL_KEY: 'os-commercial-document' }));
import { useOsManualBilling } from './useOsManualBilling';
describe('recebimento parcial da OS', () => {
  it('reenvia o mesmo complemento após timeout e invalida todas as leituras financeiras', async () => {
    mocks.rpc.mockReset();
    const client = new QueryClient();
    const invalidate = vi.spyOn(client,'invalidateQueries');
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useOsManualBilling('os-a', false), { wrapper });
    mocks.rpc.mockResolvedValueOnce({ error: { message: 'Failed to fetch' } });
    await expect(hook.result.current.complement(3300,2600,'2026-12-26')).rejects.toMatchObject({message:'Failed to fetch'});
    mocks.rpc.mockResolvedValueOnce({data:{amount:700},error:null});
    await hook.result.current.complement(3300,2600,'2026-12-26');
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(mocks.rpc.mock.calls[1]).toEqual(['complement_os_manual_billing',expect.objectContaining({p_expected_total:3300,p_expected_billed:2600})]);
    for (const root of ['service-orders','financial-transactions','financial-summary','os-billing-state','os-billing-flags','os-revenue-summary','portal-payments']) {
      expect(invalidate).toHaveBeenCalledWith({queryKey:[root]});
    }
    client.clear();
  });
  it('reenvia a mesma baixa após timeout mesmo que o refetch já mostre o saldo atualizado', async () => {
    mocks.rpc.mockReset();
    const client = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useOsManualBilling('os-a', false), { wrapper });
    const payment = { amount_received: 2600, account_id: 'account-a', payment_method: 'pix', paid_date: '2026-11-26', fee_amount: 0 };
    const parent = { id: 'parent-a', amount: 3300, amount_received: 0, is_paid: false, due_date: '2026-12-26', installment_total: null };
    mocks.rpc.mockResolvedValueOnce({ error: { message: 'Failed to fetch' } });
    await expect(hook.result.current.receive(3300, payment, '2026-12-26', parent)).rejects.toMatchObject({ message: 'Failed to fetch' });
    mocks.rpc.mockResolvedValueOnce({ data: { remaining: 700 }, error: null });
    await hook.result.current.receive(3300, payment, '2026-12-26', { ...parent, amount_received: 2600 });
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_total: 3300, p_received: 2600, p_expected_received: 0 });
  });
});
