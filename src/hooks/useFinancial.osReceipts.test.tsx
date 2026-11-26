import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), toast: vi.fn(), received: 0 }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'user-a' }, profile: { company_id: 'company-a', user_id: 'user-a', is_active: true },
  permissions: ['screen:finance', 'fn:manage_finance'], roles: ['financeiro'], hasPermissionRecord: true,
}) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ timezone: 'America/Sao_Paulo' }) }));
vi.mock('@/hooks/useFinancialCategories', () => ({ resolveSystemCategoryNameFresh: async () => 'Tarifa QA' }));
import { useFinancial } from './useFinancial';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useFinancial({ loadData: false }), { wrapper }), invalidate, client };
}
const payment = (amountReceived: number, expectedReceived: number) => ({
  id: 'account-700', amountReceived, expectedReceived, account_id: 'bank-a', payment_method: 'pix', paid_date: '2026-11-26',
});
beforeEach(() => {
  vi.clearAllMocks(); mocks.received = 0;
  mocks.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ single: async () => ({ data: {
    id: 'account-700', company_id: 'company-a', amount: 700, amount_received: mocks.received,
    transaction_type: 'entrada', service_order_id: 'os-a', due_date: '2026-12-26',
  }, error: null }) }) }) }));
  mocks.rpc.mockImplementation(async (_name, args) => {
    mocks.received += args.p_received;
    return { data: { remaining: 700 - mocks.received }, error: null };
  });
});
describe('mesma conta da OS em Contas a Receber', () => {
  it('recebe 300 + 300 + 100, mantendo a conta de 700 e usando uma operação por pagamento', async () => {
    const h = setup();
    for (const [value, before, remaining] of [[300, 0, 400], [300, 300, 100], [100, 600, 0]]) {
      await expect(h.result.current.markAsPaid.mutateAsync(payment(value, before))).resolves.toEqual({ remaining });
    }
    expect(mocks.from).toHaveBeenCalledTimes(3); // somente leitura, nenhuma filha inserida pelo cliente
    expect(mocks.rpc.mock.calls.map(([name, args]) => [name, args.p_received, args.p_expected_received, args.p_transaction_id, args.p_from_finance]))
      .toEqual([[300, 0], [300, 300], [100, 600]].map(([v, base]) => ['bill_os_receive_payment', v, base, 'account-700', true]));
    expect(new Set(mocks.rpc.mock.calls.map(([, args]) => args.p_request_id)).size).toBe(3);
    for (const root of ['service-orders', 'receivable-payments', 'os-commercial-document', 'financial-transactions', 'portal-payments']) {
      expect(h.invalidate).toHaveBeenCalledWith({ queryKey: [root] });
    }
    h.client.clear();
  });
  it('reconcilia timeout com o mesmo UUID e os mesmos valores mesmo após a baixa ser persistida', async () => {
    const h = setup();
    mocks.rpc.mockImplementationOnce(async (_name, args) => {
      mocks.received += args.p_received;
      return { data: null, error: { message: 'Failed to fetch' } };
    }).mockResolvedValueOnce({ data: { remaining: 400 }, error: null });
    const params = payment(300, 0);
    await expect(h.result.current.markAsPaid.mutateAsync(params)).rejects.toMatchObject({ message: 'Failed to fetch' });
    await expect(h.result.current.markAsPaid.mutateAsync(params)).resolves.toEqual({ remaining: 400 });
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(mocks.received).toBe(300);
    expect(mocks.from).toHaveBeenCalledOnce();
    h.client.clear();
  });
  it('envia a base vista no modal, sem aceitar silenciosamente um recebimento concorrente', async () => {
    const h = setup(); mocks.received = 300;
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'OSC01', message: 'O saldo mudou.' } });
    await expect(h.result.current.markAsPaid.mutateAsync(payment(300, 0))).rejects.toMatchObject({ code: 'OSC01' });
    expect(mocks.rpc).toHaveBeenCalledWith('bill_os_receive_payment', expect.objectContaining({ p_expected_received: 0 }));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: expect.stringContaining('O saldo ou o orçamento mudou') }));
    h.client.clear();
  });
  it('inclui tarifa e novo vencimento na mesma transação do recebimento', async () => {
    const h = setup();
    await h.result.current.markAsPaid.mutateAsync({ ...payment(300, 0), fee_amount: 5, newDueDate: '2027-01-26', notes: 'Pagamento 1' });
    expect(mocks.rpc).toHaveBeenCalledWith('bill_os_receive_payment', expect.objectContaining({
      p_fee: 5, p_fee_category: 'Tarifa QA', p_due_date: '2027-01-26', p_notes: 'Pagamento 1',
    }));
    expect(mocks.from).toHaveBeenCalledOnce();
    h.client.clear();
  });
});
