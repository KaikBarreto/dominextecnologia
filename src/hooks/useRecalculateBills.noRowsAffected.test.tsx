import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoRowsAffectedError } from '@/lib/supabaseMutation';

type Call = { table: string; op: string; options?: unknown; values?: unknown };

const state = vi.hoisted(() => ({ calls: [] as Call[], txUpdateCount: 0, toast: vi.fn() }));

function builder(table: string) {
  const call: Call = { table, op: 'select' };
  const chain: Record<string, unknown> = {};
  const settle = () => {
    state.calls.push(call);
    if (call.op === 'select') return Promise.resolve({ data: null, error: null });
    if (table === 'financial_transactions') return Promise.resolve({ data: null, error: null, count: state.txUpdateCount });
    return Promise.resolve({ data: null, error: null, count: 1 });
  };
  Object.assign(chain, {
    select: () => chain,
    update: (values: unknown, options?: unknown) => { call.op = 'update'; call.values = values; call.options = options; return chain; },
    upsert: (values: unknown) => { call.op = 'upsert'; call.values = values; return chain; },
    eq: () => chain, not: () => chain,
    single: () => {
      state.calls.push(call);
      return Promise.resolve({ data: { id: 'card-1', company_id: 'company-a', name: 'Cartão', type: 'cartao', closing_day: 10, payment_due_days: 7, due_day: 17 }, error: null });
    },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => settle().then(resolve, reject),
  });
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => builder(table) } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('@/utils/supabasePagination', () => ({
  // Despesa do dia 20 com fatura errada: o recálculo precisa mudar a fatura.
  fetchAllPaginated: async () => [{ id: 'tx-1', transaction_date: '2026-11-20', credit_card_bill_date: '1999-01-01' }],
}));
import { useRecalculateBills } from './useRecalculateBills';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

beforeEach(() => { state.calls = []; state.txUpdateCount = 0; state.toast.mockReset(); });

describe('recalcular faturas do cartão', () => {
  it('quando a permissão barra o UPDATE das despesas (0 linhas), dá erro em vez de "Faturas atualizadas"', async () => {
    const { result } = renderHook(() => useRecalculateBills(), { wrapper });
    await expect(result.current.mutateAsync('card-1')).rejects.toBeInstanceOf(NoRowsAffectedError);
    const txUpdate = state.calls.find((call) => call.table === 'financial_transactions' && call.op === 'update');
    expect(txUpdate?.options).toEqual({ count: 'exact' });
    expect(state.calls.some((call) => call.table === 'credit_card_bills')).toBe(false);
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    expect(state.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Faturas atualizadas' }));
  });

  it('quando grava, segue para as faturas e mostra o sucesso', async () => {
    state.txUpdateCount = 1;
    const { result } = renderHook(() => useRecalculateBills(), { wrapper });
    await expect(result.current.mutateAsync('card-1')).resolves.toMatchObject({ updatedCount: 1 });
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Faturas atualizadas' }));
  });
});
