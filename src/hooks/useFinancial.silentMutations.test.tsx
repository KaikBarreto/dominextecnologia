import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoRowsAffectedError } from '@/lib/supabaseMutation';

// Mesmo builder do useFinancial.deleteTransaction.test.tsx: registra cada
// chamada e responde pelo `state.respond`.
type Call = { table: string; op: string; options?: unknown; filters: Array<[string, string, unknown]>; values?: unknown };

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  respond: (_call: Call): { data?: unknown; error: unknown; count?: number | null } => ({ data: null, error: null }),
  toast: vi.fn(),
  rpc: vi.fn(),
}));

function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  const chain: Record<string, unknown> = {};
  const filter = (kind: string) => (column: string, value: unknown) => { call.filters.push([kind, column, value]); return chain; };
  const settle = () => { state.calls.push(call); return Promise.resolve(state.respond(call)); };
  Object.assign(chain, {
    select: () => chain,
    insert: (values: unknown) => { call.op = 'insert'; call.values = values; return chain; },
    delete: (options?: unknown) => { call.op = 'delete'; call.options = options; return chain; },
    update: (values: unknown, options?: unknown) => { call.op = 'update'; call.values = values; call.options = options; return chain; },
    eq: filter('eq'), in: filter('in'), is: filter('is'), not: () => chain, order: () => chain, limit: () => chain,
    maybeSingle: settle, single: settle,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => settle().then(resolve, reject),
  });
  return chain;
}

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'user-a' }, profile: { company_id: 'company-a', user_id: 'user-a', is_active: true },
  permissions: ['screen:finance'], roles: ['admin'], hasPermissionRecord: true, profileLoading: false, loading: false,
}) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => builder(table), rpc: state.rpc } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ timezone: 'America/Sao_Paulo' }) }));
vi.mock('@/hooks/useUserCompany', () => ({ getCurrentUserCompanyId: async () => 'company-a', useUserCompany: () => ({ companyId: 'company-a' }) }));
import { useFinancial } from './useFinancial';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

const writes = () => state.calls.filter((call) => call.op !== 'select');

beforeEach(() => { state.calls = []; state.toast.mockReset(); state.rpc.mockReset(); });

describe('excluir lançamentos em lote', () => {
  function scenario(deleted: string[], ids: string[]) {
    state.respond = (call) => {
      if (call.table !== 'financial_transactions') return { data: null, error: null, count: 1 };
      if (call.op === 'select' && call.filters.some(([kind, column]) => kind === 'in' && column === 'parent_transaction_id')) {
        return { data: ids.map((id) => ({ id: `child-${id}`, parent_transaction_id: id })), error: null };
      }
      if (call.op === 'select' && call.filters.some(([kind, column]) => kind === 'in' && column === 'id')) {
        // 1ª leitura: as linhas da seleção; depois do delete: as que sobraram.
        const after = state.calls.some((c) => c.op === 'delete');
        const rows = after ? ids.filter((id) => !deleted.includes(id)) : ids;
        return { data: rows.map((id) => ({ id, category: 'Receita', transfer_pair_id: null })), error: null };
      }
      if (call.op === 'delete' && call.filters.some(([, , value]) => Array.isArray(value) && value.some((v) => String(v).startsWith('child-')))) {
        return { data: null, error: null, count: (call.filters[0][2] as string[]).length };
      }
      if (call.op === 'delete') return { data: null, error: null, count: deleted.length };
      return { data: null, error: null, count: 1 };
    };
  }

  it('quando a permissão barra tudo, avisa erro e não apaga filha nenhuma', async () => {
    scenario([], ['tx-1', 'tx-2']);
    const { result } = renderHook(() => useFinancial({ loadData: false }), { wrapper });
    await expect(result.current.deleteTransactionsBatch.mutateAsync(['tx-1', 'tx-2'])).rejects.toBeInstanceOf(NoRowsAffectedError);
    expect(writes()).toHaveLength(1);
    expect(writes()[0].options).toEqual({ count: 'exact' });
    expect(writes().some((call) => call.table === 'quotes')).toBe(false);
  });

  it('lote parcial (um lançamento do PDV barrado): apaga só as filhas das mães que saíram e avisa', async () => {
    scenario(['tx-1'], ['tx-1', 'tx-pdv']);
    const { result } = renderHook(() => useFinancial({ loadData: false }), { wrapper });
    const error = await result.current.deleteTransactionsBatch.mutateAsync(['tx-1', 'tx-pdv']).catch((e) => e);
    expect(error).toBeInstanceOf(NoRowsAffectedError);
    expect((error as Error).message).toContain('Alguns itens não foram excluídos');
    const childDelete = writes().find((call) => call.op === 'delete' && call.filters.some(([, , value]) => Array.isArray(value) && String(value[0]).startsWith('child-')));
    expect(childDelete?.filters).toContainEqual(['in', 'id', ['child-tx-1']]);
  });

  it('quando apaga tudo, apaga as mães primeiro e depois as filhas', async () => {
    scenario(['tx-1', 'tx-2'], ['tx-1', 'tx-2']);
    const { result } = renderHook(() => useFinancial({ loadData: false }), { wrapper });
    await expect(result.current.deleteTransactionsBatch.mutateAsync(['tx-1', 'tx-2'])).resolves.toBe(2);
    expect(writes().map((call) => call.filters[0])).toEqual([
      ['in', 'id', ['tx-1', 'tx-2']],
      ['in', 'id', ['child-tx-1', 'child-tx-2']],
    ]);
  });
});

describe('editar lançamentos em lote', () => {
  it('quando só parte da seleção é alterada, avisa erro em vez de sucesso', async () => {
    state.respond = (call) => ({ data: null, error: null, count: call.op === 'update' ? 1 : null });
    const { result } = renderHook(() => useFinancial({ loadData: false }), { wrapper });
    await expect(result.current.updateTransactionsBatch.mutateAsync({ ids: ['tx-1', 'tx-2'], changes: { category: 'Outros' } }))
      .rejects.toBeInstanceOf(NoRowsAffectedError);
    expect(writes()[0].options).toEqual({ count: 'exact' });
  });

  it('quando altera todas, devolve a quantidade', async () => {
    state.respond = () => ({ data: null, error: null, count: 2 });
    const { result } = renderHook(() => useFinancial({ loadData: false }), { wrapper });
    await expect(result.current.updateTransactionsBatch.mutateAsync({ ids: ['tx-1', 'tx-2'], changes: { category: 'Outros' } })).resolves.toBe(2);
  });
});

describe('recebimento parcial com novo vencimento', () => {
  it('quando o vencimento é barrado, o recebimento fica gravado e o usuário vê o aviso, sem toast de sucesso', async () => {
    state.respond = (call) => {
      if (call.table === 'financial_transactions' && call.op === 'select') {
        return { data: { id: 'tx-1', company_id: 'company-a', amount: 100, amount_received: 0, due_date: '2026-11-10', description: 'Conta', customer_id: null, transaction_type: 'entrada', cost_center_id: null }, error: null };
      }
      if (call.op === 'insert') return { data: { id: 'child-1' }, error: null };
      if (call.op === 'update') return { data: null, error: null, count: 0 };
      return { data: null, error: null, count: 1 };
    };
    const { result } = renderHook(() => useFinancial({ loadData: false }), { wrapper });
    const error = await result.current.markAsPaid.mutateAsync({ id: 'tx-1', amountReceived: 40, newDueDate: '2026-12-10', account_id: 'acc-1' } as any).catch((e) => e);
    expect(error).toBeInstanceOf(NoRowsAffectedError);
    expect((error as Error).message).toContain('O recebimento parcial foi registrado');
    expect(writes().map((call) => call.op)).toEqual(['insert', 'update']);
    expect(writes()[1].options).toEqual({ count: 'exact' });
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    expect(state.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Recebimento confirmado!' }));
  });
});
