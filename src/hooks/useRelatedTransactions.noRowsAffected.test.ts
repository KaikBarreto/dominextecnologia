import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoRowsAffectedError } from '@/lib/supabaseMutation';

type Call = { table: string; op: string; options?: unknown; filters: Array<[string, string, unknown]>; values?: unknown };

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  respond: (_call: Call): { data?: unknown; error: unknown; count?: number | null } => ({ data: null, error: null }),
}));

function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  const chain: Record<string, unknown> = {};
  const filter = (kind: string) => (column: string, value: unknown) => { call.filters.push([kind, column, value]); return chain; };
  const settle = () => { state.calls.push(call); return Promise.resolve(state.respond(call)); };
  Object.assign(chain, {
    select: () => chain,
    delete: (options?: unknown) => { call.op = 'delete'; call.options = options; return chain; },
    update: (values: unknown, options?: unknown) => { call.op = 'update'; call.values = values; call.options = options; return chain; },
    eq: filter('eq'), in: filter('in'),
    maybeSingle: settle,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => settle().then(resolve, reject),
  });
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => builder(table), rpc: vi.fn() } }));
import { deleteTransactionCascade, unmarkTransactionCascade } from './useRelatedTransactions';

const writes = () => state.calls.filter((call) => call.op !== 'select');

beforeEach(() => { state.calls = []; });

describe('exclusão e estorno de lançamento relacionados', () => {
  it('excluir só este lançamento: 0 linhas (sem permissão) lança erro e NÃO destrava o orçamento', async () => {
    state.respond = (call) => {
      if (call.op === 'select' && call.table === 'financial_transactions') return { data: { category: 'Serviço', transfer_pair_id: null }, error: null };
      if (call.op === 'select' && call.table === 'quotes') return { data: [{ id: 'quote-1' }], error: null };
      return { data: null, error: null, count: 0 };
    };
    await expect(deleteTransactionCascade('tx-1', false)).rejects.toBeInstanceOf(NoRowsAffectedError);
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({ table: 'financial_transactions', op: 'delete', options: { count: 'exact' } });
  });

  it('excluir só este lançamento: quando apaga, destrava o orçamento', async () => {
    state.respond = (call) => {
      if (call.op === 'select' && call.table === 'financial_transactions') return { data: { category: 'Serviço', transfer_pair_id: null }, error: null };
      if (call.op === 'select' && call.table === 'quotes') return { data: [{ id: 'quote-1' }], error: null };
      return { data: null, error: null, count: 1 };
    };
    await deleteTransactionCascade('tx-1', false);
    expect(writes().map((call) => `${call.table}:${call.op}`)).toEqual(['financial_transactions:delete', 'quotes:update']);
  });

  it('excluir todos: 0 linhas lança erro e não mexe no orçamento', async () => {
    state.respond = (call) => {
      if (call.op === 'select' && call.table === 'financial_transactions') {
        const byId = call.filters.find(([, column]) => column === 'id');
        if (byId) return { data: { id: 'tx-1', category: 'Serviço', transfer_pair_id: null, parent_transaction_id: null }, error: null };
        return { data: [{ id: 'child-1', parent_transaction_id: 'tx-1' }], error: null };
      }
      if (call.op === 'select' && call.table === 'quotes') return { data: { id: 'quote-1', quote_number: 7 }, error: null };
      return { data: null, error: null, count: 0 };
    };
    await expect(deleteTransactionCascade('tx-1', true)).rejects.toBeInstanceOf(NoRowsAffectedError);
    expect(writes().map((call) => `${call.table}:${call.op}`)).toEqual(['financial_transactions:delete']);
  });

  it('desmarcar pago em lote: menos linhas que o pedido também é erro', async () => {
    state.respond = (call) => {
      if (call.op === 'select' && call.table === 'financial_transactions') {
        const byId = call.filters.find(([, column]) => column === 'id');
        if (byId) return { data: { id: 'tx-1', parent_transaction_id: null }, error: null };
        return { data: [{ id: 'child-1', parent_transaction_id: 'tx-1' }], error: null };
      }
      if (call.op === 'select') return { data: null, error: null };
      return { data: null, error: null, count: 1 };
    };
    await expect(unmarkTransactionCascade('tx-1', true)).rejects.toBeInstanceOf(NoRowsAffectedError);
    expect(writes()[0]).toMatchObject({ op: 'update', options: { count: 'exact' } });
  });

  it('desmarcar pago de um só: 0 linhas lança erro', async () => {
    state.respond = () => ({ data: null, error: null, count: 0 });
    await expect(unmarkTransactionCascade('tx-1', false)).rejects.toBeInstanceOf(NoRowsAffectedError);
  });
});
