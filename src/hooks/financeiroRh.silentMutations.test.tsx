import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoRowsAffectedError } from '@/lib/supabaseMutation';

// Varredura "sucesso falso": RLS barrando UPDATE/DELETE devolve 204 com zero
// linhas e `error: null`. Cada ação principal do Financeiro & RH tem que virar
// erro visível, sem toast de sucesso e sem efeito colateral depois.

type Call = { table: string; op: string; options?: unknown; filters: Array<[string, string, unknown]>; values?: unknown };

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  writeCount: 0 as number,
  toast: vi.fn(),
  sonner: { success: vi.fn(), error: vi.fn() },
  rpc: vi.fn(),
  storageRemove: vi.fn(),
}));

function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  const chain: Record<string, unknown> = {};
  const filter = (kind: string) => (column: string, value: unknown) => { call.filters.push([kind, column, value]); return chain; };
  const settle = () => {
    state.calls.push(call);
    if (call.op === 'select') return Promise.resolve({ data: [], error: null, count: 0 });
    return Promise.resolve({ data: null, error: null, count: state.writeCount });
  };
  Object.assign(chain, {
    select: () => chain,
    insert: (values: unknown) => { call.op = 'insert'; call.values = values; return chain; },
    delete: (options?: unknown) => { call.op = 'delete'; call.options = options; return chain; },
    update: (values: unknown, options?: unknown) => { call.op = 'update'; call.values = values; call.options = options; return chain; },
    eq: filter('eq'), in: filter('in'), is: filter('is'), or: () => chain, not: () => chain, order: () => chain, limit: () => chain, range: () => chain,
    maybeSingle: settle, single: settle,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => settle().then(resolve, reject),
  });
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => builder(table),
    rpc: state.rpc,
    auth: { getUser: async () => ({ data: { user: { id: 'user-a' } } }) },
    storage: { from: () => ({ remove: state.storageRemove }) },
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'user-a' }, profile: { company_id: 'company-a', user_id: 'user-a', is_active: true },
  permissions: ['screen:finance'], roles: ['admin'], hasPermissionRecord: true, profileLoading: false, loading: false,
}) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('sonner', () => ({ toast: state.sonner }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br', timezone: 'America/Sao_Paulo' }) }));
vi.mock('@/hooks/useUserCompany', () => ({ getCurrentUserCompanyId: async () => 'company-a', useUserCompany: () => ({ companyId: 'company-a' }) }));
vi.mock('@/hooks/useBankPermissions', () => ({ useBankPermissions: () => ({ canUseBankAccounts: true, canManageBankAccounts: true }) }));
vi.mock('@/hooks/pdvReportCache', () => ({ usePdvAuthorizedQueryScope: () => ({ ready: true, key: ['scope', 'company-a'] }) }));
vi.mock('@/utils/supabasePagination', () => ({ fetchAllPaginated: async () => [] }));

import { useCostCenters } from './useCostCenters';
import { useFinancialAccounts } from './useFinancialAccounts';
import { useEmployeeContracts } from './useEmployeeContracts';
import { useFinancialCategories } from './useFinancialCategories';
import { useDeleteAdminFinancialTransaction } from './useAdminFinancialTransactions';
import { useDeleteAdminFinancialCategory } from './useAdminFinancialCategories';
import { useSuppliers } from './useSuppliers';
import { useCompras } from './useCompras';
import { useCompraOrdens } from './useCompraOrdens';
import { useCompraCotacoes } from './useCompraCotacoes';
import { useDeleteAdvance, useDeletePayment } from './useSalespersonData';
import { useOrgCharts } from './useOrgCharts';
import { useRemoveTransactionAttachment } from './useTransactionAttachments';
import { usePunchMutations } from './useTimeRecords';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

const writes = () => state.calls.filter((call) => call.op !== 'select');

beforeEach(() => {
  state.calls = [];
  state.writeCount = 0;
  state.toast.mockReset();
  state.sonner.success.mockReset();
  state.sonner.error.mockReset();
  state.rpc.mockReset();
  state.rpc.mockResolvedValue({ data: null, error: null });
  state.storageRemove.mockReset();
  state.storageRemove.mockResolvedValue({ data: null, error: null });
});

async function expectBlocked(run: () => Promise<unknown>) {
  let caught: unknown;
  await act(async () => { caught = await run().catch((error) => error); });
  expect(caught).toBeInstanceOf(NoRowsAffectedError);
  await waitFor(() => {
    const destructive = state.toast.mock.calls.some(([arg]) => arg?.variant === 'destructive');
    expect(destructive || state.sonner.error.mock.calls.length > 0).toBe(true);
  });
  expect(state.toast.mock.calls.every(([arg]) => arg?.variant === 'destructive')).toBe(true);
  expect(state.sonner.success).not.toHaveBeenCalled();
  // Toda escrita que decide o sucesso pediu a contagem exata.
  const main = writes()[0];
  if (main.op === 'delete') expect(main.options).toEqual({ count: 'exact' });
  if (main.op === 'update') expect(main.options).toEqual({ count: 'exact' });
}

describe('sucesso falso barrado no Financeiro & RH', () => {
  it('excluir centro de custo', async () => {
    const { result } = renderHook(() => useCostCenters(), { wrapper });
    await expectBlocked(() => result.current.deleteCostCenter.mutateAsync('cc-1'));
  });

  it('excluir conta bancária', async () => {
    const { result } = renderHook(() => useFinancialAccounts(), { wrapper });
    await expectBlocked(() => result.current.deleteAccount.mutateAsync('acc-1'));
  });

  it('encerrar contrato do funcionário', async () => {
    const { result } = renderHook(() => useEmployeeContracts('emp-1'), { wrapper });
    await expectBlocked(() => result.current.endContract.mutateAsync('ct-1'));
  });

  it('renovar contrato não cria o novo se o atual não foi encerrado', async () => {
    const { result } = renderHook(() => useEmployeeContracts('emp-1'), { wrapper });
    await expectBlocked(() => result.current.renewContract.mutateAsync({ previousId: 'ct-1', next: { employee_id: 'emp-1' } as any }));
    expect(writes().some((call) => call.op === 'insert')).toBe(false);
  });

  it('excluir categoria financeira', async () => {
    const { result } = renderHook(() => useFinancialCategories(), { wrapper });
    await expectBlocked(() => result.current.deleteCategory.mutateAsync('cat-1'));
  });

  it('reordenar categorias para na primeira barrada e avisa', async () => {
    const { result } = renderHook(() => useFinancialCategories(), { wrapper });
    await expectBlocked(() => result.current.reorderCategories.mutateAsync([{ id: 'a', sort_order: 1 }, { id: 'b', sort_order: 2 }]));
    expect(writes()).toHaveLength(1);
  });

  it('excluir movimentação do financeiro admin', async () => {
    const { result } = renderHook(() => useDeleteAdminFinancialTransaction(), { wrapper });
    await expectBlocked(() => result.current.mutateAsync('adm-1'));
  });

  it('excluir categoria do financeiro admin', async () => {
    const { result } = renderHook(() => useDeleteAdminFinancialCategory(), { wrapper });
    await expectBlocked(() => result.current.mutateAsync('adm-cat-1'));
  });

  it('editar fornecedor', async () => {
    const { result } = renderHook(() => useSuppliers(), { wrapper });
    await expectBlocked(() => result.current.updateSupplier.mutateAsync({ id: 'sup-1', name: 'Fornecedor' } as any));
  });

  it('mudar status da requisição de compra', async () => {
    const { result } = renderHook(() => useCompras(), { wrapper });
    await expectBlocked(() => result.current.setStatus.mutateAsync({ id: 'cmp-1', status: 'concluida' }));
  });

  it('mudar status da ordem de compra', async () => {
    const { result } = renderHook(() => useCompraOrdens('cmp-1'), { wrapper });
    await expectBlocked(() => result.current.setOrdemStatus.mutateAsync({ ordemId: 'oc-1', status: 'cancelada' }));
  });

  it('salvar preços da cotação não apaga os preços se a cotação está barrada', async () => {
    const { result } = renderHook(() => useCompraCotacoes('cmp-1'), { wrapper });
    await expectBlocked(() => result.current.savePrices.mutateAsync({ cotacaoId: 'cot-1', prices: [{ compra_material_id: 'm-1', unit_price: 10 }] }));
    expect(writes().map((call) => `${call.table}:${call.op}`)).toEqual(['compra_cotacoes:update']);
  });

  it('excluir vale do vendedor não apaga a despesa espelhada', async () => {
    const { result } = renderHook(() => useDeleteAdvance(), { wrapper });
    await expectBlocked(() => result.current.mutateAsync('adv-1'));
    expect(writes().map((call) => `${call.table}:${call.op}`)).toEqual(['salesperson_advances:delete']);
  });

  it('excluir pagamento do vendedor não apaga as despesas espelhadas', async () => {
    const { result } = renderHook(() => useDeletePayment(), { wrapper });
    await expectBlocked(() => result.current.mutateAsync('pay-1'));
    expect(writes().map((call) => `${call.table}:${call.op}`)).toEqual(['salesperson_payments:delete']);
  });

  it('excluir organograma', async () => {
    const { result } = renderHook(() => useOrgCharts(), { wrapper });
    await expectBlocked(() => result.current.deleteChart.mutateAsync('org-1'));
  });

  it('remover anexo do lançamento não apaga o arquivo', async () => {
    const { result } = renderHook(() => useRemoveTransactionAttachment(), { wrapper });
    await expectBlocked(() => result.current.mutateAsync({ id: 'att-1', storage_path: 'c/a.pdf', transaction_id: 'tx-1' }));
    expect(state.storageRemove).not.toHaveBeenCalled();
  });

  it('excluir batida de ponto não recalcula o espelho', async () => {
    const { result } = renderHook(() => usePunchMutations(), { wrapper });
    await expectBlocked(() => result.current.deletePunch.mutateAsync({ id: 'p-1', employee_id: 'emp-1', company_id: 'company-a', date: '2026-11-20' } as any));
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('editar batida de ponto não recalcula o espelho', async () => {
    const { result } = renderHook(() => usePunchMutations(), { wrapper });
    await expectBlocked(() => result.current.updatePunch.mutateAsync({
      record: { id: 'p-1', employee_id: 'emp-1', company_id: 'company-a', date: '2026-11-20', recorded_at: '2026-11-20T11:00:00Z' } as any,
      type: 'entrada' as any, recordedAt: '2026-11-20T12:00:00Z', notes: '',
    }));
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('com a linha alterada de fato, segue para o sucesso', async () => {
    state.writeCount = 1;
    const { result } = renderHook(() => useCompras(), { wrapper });
    await act(async () => { await result.current.setStatus.mutateAsync({ id: 'cmp-1', status: 'concluida' }); });
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Requisição concluída.' }));
  });
});
