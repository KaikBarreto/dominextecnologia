import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoRowsAffectedError } from '@/lib/supabaseMutation';

type Call = { table: string; op: string; options?: unknown; filters: Array<[string, string, unknown]>; values?: unknown };

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  respond: (_call: Call): { data?: unknown; error: unknown; count?: number | null } => ({ data: null, error: null }),
  toast: vi.fn(),
}));

function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  const chain: Record<string, unknown> = {};
  const filter = (kind: string) => (column: string, value: unknown) => { call.filters.push([kind, column, value]); return chain; };
  Object.assign(chain, {
    select: () => { if (call.op === 'select') call.op = 'select'; return chain; },
    delete: (options?: unknown) => { call.op = 'delete'; call.options = options; return chain; },
    update: (values: unknown, options?: unknown) => { call.op = 'update'; call.values = values; call.options = options; return chain; },
    eq: filter('eq'), in: filter('in'), not: () => chain, order: () => chain, limit: () => chain,
    maybeSingle: () => { state.calls.push(call); return Promise.resolve(state.respond(call)); },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      state.calls.push(call);
      return Promise.resolve(state.respond(call)).then(resolve, reject);
    },
  });
  return chain;
}

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'user-a' }, profile: { company_id: 'company-a', user_id: 'user-a', is_active: true },
  permissions: ['screen:finance'], roles: ['admin'], hasPermissionRecord: true, profileLoading: false, loading: false,
}) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => builder(table), rpc: vi.fn() } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ timezone: 'America/Sao_Paulo' }) }));
import { useFinancial } from './useFinancial';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

const isParentDelete = (call: Call) => call.table === 'financial_transactions' && call.op === 'delete'
  && call.filters.some(([kind, column, value]) => kind === 'eq' && column === 'id' && value === 'tx-1');

function scenario(parentDeleteCount: number) {
  state.respond = (call) => {
    if (call.table === 'financial_transactions' && call.op === 'select' && call.filters.some(([, column]) => column === 'id')) {
      return { data: { category: 'Pagamento de Fatura', amount: 30, account_id: 'card-1', credit_card_bill_date: null, transfer_pair_id: null }, error: null };
    }
    if (call.table === 'credit_card_bills' && call.op === 'select') return { data: { id: 'bill-1', amount_paid: 100, status: 'paid', payment_transaction_id: 'tx-1' }, error: null };
    if (call.table === 'financial_transactions' && call.op === 'select') return { data: [{ id: 'child-1' }], error: null };
    if (isParentDelete(call)) return { data: null, error: null, count: parentDeleteCount };
    return { data: null, error: null, count: 1 };
  };
}

beforeEach(() => { state.calls = []; state.toast.mockReset(); });

describe('excluir lançamento no Financeiro', () => {
  it('quando o banco não apaga nada (sem permissão), avisa erro e não mexe em filhas nem na fatura', async () => {
    scenario(0);
    const { result } = renderHook(() => useFinancial({ loadData: false }), { wrapper });
    await expect(result.current.deleteTransaction.mutateAsync('tx-1')).rejects.toBeInstanceOf(NoRowsAffectedError);
    const writes = state.calls.filter((call) => call.op !== 'select');
    expect(writes).toHaveLength(1);
    expect(isParentDelete(writes[0])).toBe(true);
    expect(writes[0].options).toEqual({ count: 'exact' });
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    expect(state.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Transação excluída com sucesso!' }));
  });

  it('quando apaga, remove as filhas e só então devolve o valor à fatura', async () => {
    scenario(1);
    const { result } = renderHook(() => useFinancial({ loadData: false }), { wrapper });
    await result.current.deleteTransaction.mutateAsync('tx-1');
    const writes = state.calls.filter((call) => call.op !== 'select');
    expect(writes.map((call) => `${call.table}:${call.op}`)).toEqual([
      'financial_transactions:delete',
      'financial_transactions:delete',
      'credit_card_bills:update',
    ]);
    expect(writes[1].filters).toContainEqual(['in', 'id', ['child-1']]);
    expect(writes[2].values).toMatchObject({ amount_paid: 70, status: 'partial', payment_transaction_id: null });
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Transação excluída com sucesso!' }));
  });
});
