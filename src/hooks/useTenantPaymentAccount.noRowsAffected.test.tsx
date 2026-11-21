import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoRowsAffectedError } from '@/lib/supabaseMutation';

type Call = { table: string; op: string; options?: unknown; filters: Array<[string, string, unknown]>; values?: unknown };

const state = vi.hoisted(() => ({ calls: [] as Call[], writeCount: 0, toast: vi.fn() }));

function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  const chain: Record<string, unknown> = {};
  const filter = (kind: string) => (column: string, value: unknown) => { call.filters.push([kind, column, value]); return chain; };
  const settle = () => {
    state.calls.push(call);
    return Promise.resolve(call.op === 'select' ? { data: null, error: null } : { data: null, error: null, count: state.writeCount });
  };
  Object.assign(chain, {
    select: () => chain,
    update: (values: unknown, options?: unknown) => { call.op = 'update'; call.values = values; call.options = options; return chain; },
    eq: filter('eq'),
    maybeSingle: settle,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => settle().then(resolve, reject),
  });
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => builder(table), functions: { invoke: vi.fn() } } }));
vi.mock('@/hooks/useUserCompany', () => ({ useUserCompany: () => ({ companyId: 'company-a' }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
import { useTenantPaymentAccount } from './useTenantPaymentAccount';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

const updates = () => state.calls.filter((call) => call.op === 'update');

beforeEach(() => { state.calls = []; state.writeCount = 0; state.toast.mockReset(); });

describe('configurações de cobrança: toggle barrado pela permissão não finge que salvou', () => {
  it('lançar no financeiro automaticamente: 0 linhas lança erro', async () => {
    const { result } = renderHook(() => useTenantPaymentAccount(), { wrapper });
    await expect(result.current.setAutoPostToFinance.mutateAsync(false)).rejects.toBeInstanceOf(NoRowsAffectedError);
    expect(updates()[0]).toMatchObject({ table: 'tenant_payment_accounts', options: { count: 'exact' }, filters: [['eq', 'company_id', 'company-a']] });
  });

  it('multa e juros: 0 linhas lança erro', async () => {
    const { result } = renderHook(() => useTenantPaymentAccount(), { wrapper });
    await expect(result.current.setLateFees.mutateAsync({ finePercent: 2, interestPercent: 1 })).rejects.toBeInstanceOf(NoRowsAffectedError);
  });

  it('preferências de cobrança: 0 linhas lança erro e mostra o toast de falha', async () => {
    const { result } = renderHook(() => useTenantPaymentAccount(), { wrapper });
    await expect(result.current.setChargePreferences.mutateAsync({ allow_pix: false })).rejects.toBeInstanceOf(NoRowsAffectedError);
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('quando grava (1 linha), resolve sem erro', async () => {
    state.writeCount = 1;
    const { result } = renderHook(() => useTenantPaymentAccount(), { wrapper });
    await expect(result.current.setAutoPostFees.mutateAsync(true)).resolves.toBeUndefined();
  });
});
