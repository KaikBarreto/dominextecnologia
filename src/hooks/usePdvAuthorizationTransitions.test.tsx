import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ auth: {} as Record<string, unknown>, rpc: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
import { usePdvCardSettlements } from './usePdvCardSettlements';
import { usePdvCashQueue, usePdvCounterCapability, usePdvWorkflowSettings } from './usePdvCounterFlow';
import { usePdvCashAccountSettings } from './usePdvCashAccountSettings';
import { usePdvUndoPlan } from './useFinancePdvUndo';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
function authorize(company = 'company-a', user = 'user-a', permissions = ['*']) {
  state.auth = { user: { id: user }, profile: { user_id: user, company_id: company, is_active: true },
    permissions, roles: [], hasPermissionRecord: true, profileLoading: false, loading: false };
}
const payloads: Record<string, unknown> = {
  pdv_list_open_card_authorizations_v3: { company_today: '2026-11-24', payments: [], accounts: [{ id: 'bank', name: 'Banco fictício' }] },
  pdv_get_cash_account_setting_v2: { selected_account: { id: 'cash', name: 'Cofre fictício' }, accounts: [], open_sessions: 1 },
  pdv_get_counter_capability_v2: { mode: 'balcao', counter_enabled: true },
  pdv_get_workflow_settings_v2: { pdv_mode: 'balcao', fulfillment_mode: 'cashier' },
  pdv_list_cash_queue_v3: [{ id: 'same-order', stock_id: 'stock', number: 1, status: 'aguardando_pagamento', total: 10 }],
  finance_pdv_transaction_undo_plan_v1: { allowed: true, effects: [] },
};
const readers = [
  ['conta de dinheiro', () => usePdvCashAccountSettings().selectedAccount ?? undefined],
  ['cartões', () => usePdvCardSettlements().data],
  ['capacidade do balcão', () => usePdvCounterCapability().data],
  ['configurações', () => usePdvWorkflowSettings().data],
  ['fila do mesmo caixa', () => usePdvCashQueue('same-session', 'same-terminal').data],
  ['plano do mesmo lançamento', () => usePdvUndoPlan('same-transaction').data],
] as const;

describe('leituras do PDV ao mudar autorização', () => {
  beforeEach(() => {
    vi.clearAllMocks(); authorize();
    state.rpc.mockImplementation(async (name: string) => ({ data: payloads[name], error: null }));
  });
  for (const [label, useReader] of readers) {
    for (const change of ['empresa', 'usuário', 'permissão', 'perfil pendente', 'perfil inativo'] as const) {
      it(`${label}: remove imediatamente o resultado anterior ao mudar ${change}`, async () => {
        const { client, wrapper } = setup();
        const hook = renderHook<unknown, unknown>(useReader, { wrapper });
        await waitFor(() => expect(hook.result.current).toBeDefined());
        const before = state.rpc.mock.calls.length;
        state.rpc.mockImplementation(() => new Promise(() => {}));
        if (change === 'empresa') authorize('company-b');
        if (change === 'usuário') authorize('company-a', 'user-b');
        if (change === 'permissão') authorize('company-a', 'user-a', ['screen:pdv']);
        if (change === 'perfil pendente') state.auth = { ...state.auth, profileLoading: true };
        if (change === 'perfil inativo') state.auth = { ...state.auth, profile: { user_id: 'user-a', company_id: 'company-a', is_active: false } };
        hook.rerender();
        expect(hook.result.current).toBeUndefined();
        if (change.startsWith('perfil')) expect(state.rpc).toHaveBeenCalledTimes(before);
        else await waitFor(() => expect(state.rpc.mock.calls.length).toBeGreaterThan(before));
        hook.unmount(); client.clear();
      });
    }
  }
  it('resposta de gravação atrasada não substitui a configuração da outra empresa', async () => {
    const { client, wrapper } = setup();
    let finish!: (value: unknown) => void;
    state.rpc.mockImplementation((name: string) => name === 'pdv_save_workflow_settings_v3'
      ? new Promise(resolve => { finish = resolve; })
      : Promise.resolve({ data: { pdv_mode: 'simples', fulfillment_mode: 'dispatch' }, error: null }));
    const hook = renderHook(usePdvWorkflowSettings, { wrapper });
    await waitFor(() => expect(hook.result.current.data?.pdvMode).toBe('simples'));
    let saving!: Promise<unknown>;
    act(() => { saving = hook.result.current.save.mutateAsync({ pdvMode: 'balcao', fulfillmentMode: 'cashier' }); });
    await waitFor(() => expect(finish).toBeDefined());
    authorize('company-b'); hook.rerender();
    await waitFor(() => expect(hook.result.current.data?.pdvMode).toBe('simples'));
    // Isola a escrita no cache da leitura posterior de reconciliação.
    vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    await act(async () => {
      finish({ data: { pdv_mode: 'balcao', fulfillment_mode: 'cashier' }, error: null });
      await saving;
    });
    expect(hook.result.current.data?.pdvMode).toBe('simples');
    hook.unmount(); client.clear();
  });
});
