import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ auth: {} as Record<string, unknown>, pending: false, from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/hooks/useUserCompany', () => ({ useUserCompany: () => ({ companyId: (state.auth.profile as { company_id: string }).company_id }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: state.from, rpc: state.rpc,
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; }, removeChannel: vi.fn() } }));
import { usePdvCashExportCompanyName } from './usePdvCashExport';
import { usePdvCashActorProfiles, usePdvCashCustomerNames, usePdvCashRegister, usePdvCashSessionDetail, usePdvLedgerTransaction } from './usePdvCashRegister';

const session = { id: 'session', company_id: 'company', opened_by: 'user', opened_at: '2026-11-24T10:00:00Z',
  closed_at: null, contract_version: 1, status: 'aberta' };
const rows: Record<string, unknown> = {
  pdv_terminals: [{ id: 'terminal', name: 'Caixa fictício' }],
  pdv_cash_sessions: [session],
  customers: [{ id: 'customer', name: 'Cliente fictício' }],
  profiles: [{ user_id: 'user', full_name: 'Operador fictício', email: 'operador@example.invalid', avatar_url: null }],
  financial_transactions: { id: 'transaction', description: 'Lançamento fictício' },
  companies: { name: 'Empresa fictícia' },
  pdv_orders: [{ id: 'order', number: 1, customer_id: 'customer', total: 10, notes: 'Venda fictício' }], pdv_cash_movements: [],
};
function authorize(permissions = ['*']) {
  state.auth = { user: { id: 'user' }, profile: { user_id: 'user', company_id: 'company', is_active: true },
    permissions, roles: [], hasPermissionRecord: true, profileLoading: false, loading: false };
}
const readers = [
  ['nome da empresa no documento', () => { const name = usePdvCashExportCompanyName(true); return name === 'Empresa' ? undefined : name; }],
  ['detalhe do caixa legado', () => usePdvCashSessionDetail(session as never).orders],
  ['terminais legados', () => usePdvCashRegister().terminals],
  ['lançamento', () => usePdvLedgerTransaction('transaction').transaction],
  ['clientes', () => usePdvCashCustomerNames(['customer'], 'company')],
  ['responsáveis', () => usePdvCashActorProfiles(['user'], 'company')],
] as const;

describe('cache legado do caixa', () => {
  beforeEach(() => {
    vi.clearAllMocks(); authorize(); state.pending = false;
    state.rpc.mockResolvedValue({ data: {}, error: null });
    state.from.mockImplementation((table: string) => {
      let single = false;
      const builder = { select: () => builder, eq: () => builder, in: () => builder, or: () => builder,
        gte: () => builder, lte: () => builder, range: () => builder,
        order: () => builder, limit: () => builder, maybeSingle: () => { single = true; return builder; },
        then: (resolve: (result: unknown) => unknown) => state.pending ? new Promise(() => {})
          : Promise.resolve({ data: table === 'financial_transactions' && !single ? [] : rows[table] ?? [], error: null }).then(resolve) };
      return builder;
    });
  });
  for (const [label, useReader] of readers) {
    it(`${label}: revogação elimina a projeção anterior com os mesmos IDs`, async () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
      const hook = renderHook<unknown, unknown>(useReader, { wrapper });
      await waitFor(() => expect((JSON.stringify(hook.result.current) ?? '')).toMatch(/fictíci[oa]/));
      authorize(['screen:pdv']); state.pending = true;
      hook.rerender();
      expect((JSON.stringify(hook.result.current) ?? '')).not.toMatch(/fictíci[oa]/);
      hook.unmount(); client.clear();
    });
  }
  it('perfil ainda não confirmado não inicia detalhe nem as consultas do caixa', () => {
    state.auth = { ...state.auth, profileLoading: true };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => ({ register: usePdvCashRegister(), detail: usePdvCashSessionDetail(session as never) }), { wrapper });
    expect(state.from).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
    expect(hook.result.current.detail.orders).toEqual([]);
    hook.unmount(); client.clear();
  });
});
