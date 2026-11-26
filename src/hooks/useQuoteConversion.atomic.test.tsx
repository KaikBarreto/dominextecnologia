import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Quote } from './useQuotes';
const state = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc, from: state.from } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-a' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('@/hooks/useUserCompany', () => ({ getCurrentUserCompanyId: async () => 'company-a' }));
vi.mock('@/hooks/useFinancialCategories', () => ({ resolveSystemCategoryNameFresh: async (_client: unknown, _company: string, role: string) => role === 'receipt_fee' ? 'Tarifa renomeada' : 'Receita renomeada' }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
import { useQuoteConversion } from './useQuoteConversion';
function mount() {
 const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
 return renderHook(() => useQuoteConversion(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
const quote = { id: 'quote-a', quote_number: 1, customer_id: 'customer-a', total_value: 1000, total_price: 2000 } as Quote;
beforeEach(() => vi.clearAllMocks());
describe('aprovação financeira atômica', () => {
 it('envia o total negociado e o plano com clamp mensal em uma única operação', async () => {
  state.rpc.mockResolvedValueOnce({ data: { mode: 'a_receber', count: 3, primaryId: 'a' }, error: null });
  const { result } = mount();
  await act(() => result.current.approveQuoteFinancial.mutateAsync({ quote, approval: { mode: 'a_receber', installments: 3, first_due_date: '2027-01-31' } }));
  expect(state.from).not.toHaveBeenCalled();
  const [name, args] = state.rpc.mock.calls[0];
  expect(name).toBe('approve_quote_financial_atomic');
  expect(args.p_rows.map((row: { amount: number }) => row.amount)).toEqual([333.33, 333.33, 333.34]);
  expect(args.p_rows.map((row: { due_date: string }) => row.due_date)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  expect(args.p_fee).toBe(0);
 });
 it('preserva pedido e payload após timeout, mesmo com orçamento atualizado pela resposta perdida', async () => {
  state.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
  const { result } = mount();
  const approval = { mode: 'recebido' as const, account_id: 'account-a', paid_date: '2026-11-26', payment_method: 'pix', fee_amount: 5 };
  await act(async () => { await expect(result.current.approveQuoteFinancial.mutateAsync({ quote, approval })).rejects.toMatchObject({ message: 'Failed to fetch' }); });
  state.rpc.mockResolvedValueOnce({ data: { mode: 'recebido', count: 1, primaryId: 'a' }, error: null });
  await act(() => result.current.approveQuoteFinancial.mutateAsync({ quote: { ...quote, financial_generated_at: '2026-11-26' }, approval }));
  expect(state.rpc.mock.calls[1]).toEqual(state.rpc.mock.calls[0]);
  expect(state.rpc.mock.calls[1][1]).toMatchObject({ p_fee: 5, p_fee_category: 'Tarifa renomeada' });
 });
});
