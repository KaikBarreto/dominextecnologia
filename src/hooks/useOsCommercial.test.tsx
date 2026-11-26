import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), companyId: 'company-a', userId: 'user-a' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/integrations/supabase/anonClient', () => ({ supabaseAnon: { rpc: mocks.rpc } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mocks.userId } }) }));
vi.mock('@/hooks/useUserCompany', () => ({ useUserCompany: () => ({ companyId: mocks.companyId }) }));
vi.mock('@/hooks/useServiceOrderBudget', () => ({ SERVICE_ORDER_BUDGET_KEY: 'service-order-budget' }));
import { useOsFieldBudget, fetchOsCommercialDocument } from './useOsCommercial';
import { osFieldDraftKey } from '@/lib/osCommercial';
const item = { item_type: 'servico' as const, description: 'Limpeza', quantity: 1, unit_price: 100 };
const snapshot = { revision: 3, items: [item], show_values: false, total: 100, adjustment: 0, can_price: false };
function setup(osId = 'os-a') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(({ os }) => useOsFieldBudget(os), { wrapper, initialProps: { os: osId } }), client };
}
describe('orçamento em campo', () => {
  beforeEach(() => {
    localStorage.clear(); mocks.userId = 'user-a'; mocks.companyId = 'company-a'; mocks.rpc.mockReset();
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'get_os_field_budget' ? snapshot : { ...snapshot, revision: 4 }, error: null }));
  });
  it('preserva o mesmo pedido no retry após falha de rede e invalida relatório e orçamento', async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.data).toEqual(snapshot));
    act(() => hook.result.current.change({ items: [{ ...item, quantity: 2 }], show_values: true }));
    const requestId = hook.result.current.draft!.requestId;
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    await act(async () => { expect(await hook.result.current.save()).toBe(false); });
    expect(hook.result.current.draft?.requestId).toBe(requestId);
    const invalidate = vi.spyOn(hook.client, 'invalidateQueries');
    await act(async () => { expect(await hook.result.current.save()).toBe(true); });
    const calls = mocks.rpc.mock.calls.filter(call => call[0] === 'save_os_field_budget');
    expect(calls[0][1]).toEqual(calls[1][1]);
    expect(calls[0][1]).toMatchObject({ p_revision: 3, p_request_id: requestId, p_show_values: true });
    expect(hook.result.current.draft).toBeNull();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['os-commercial-document', 'os-a'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['service-order-budget', 'os-a'] });
  });
  it('recupera conteúdo do aparelho sem substituí-lo pela resposta do servidor', async () => {
    localStorage.setItem(osFieldDraftKey('company-a','user-a','os-a'), JSON.stringify({ requestId: 'pending', revision: 2, items: [{ ...item, quantity: 5 }], show_values: true }));
    const hook = setup();
    await waitFor(() => expect(hook.result.current.data).toEqual(snapshot));
    expect(hook.result.current.draft?.items[0].quantity).toBe(5);
    expect(hook.result.current.draft?.revision).toBe(2);
  });
  it('mascara imediatamente o rascunho quando a empresa muda e ignora resposta atrasada', async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.data).toEqual(snapshot));
    act(() => hook.result.current.change({ items: [item], show_values: true }));
    let resolveSave: (value: unknown) => void;
    mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve; }));
    let pending: Promise<boolean>;
    act(() => { pending = hook.result.current.save(); });
    mocks.companyId = 'company-b';
    hook.rerender({ os: 'os-b' });
    expect(hook.result.current.draft).toBeNull();
    await act(async () => { resolveSave!({ data: { ...snapshot, revision: 99 }, error: null }); await pending; });
    expect(hook.result.current.draft).toBeNull();
    await waitFor(() => expect(hook.result.current.data?.revision).toBe(3));
  });
  it('mantém divergência ao receber conflito e exige conferência antes de mudar a base', async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.data).toEqual(snapshot));
    act(() => hook.result.current.change({ items: [{ ...item, quantity: 3 }], show_values: true }));
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'OSC01' } });
    await act(async () => { await hook.result.current.save(); });
    expect(hook.result.current.errorSaving).toMatchObject({ code: 'OSC01' });
    expect(hook.result.current.draft?.items[0].quantity).toBe(3);
    expect(hook.result.current.draft?.revision).toBe(3);
  });
  it('consulta documento público pelo cliente anônimo e falha fechado em erro', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed' } });
    await expect(fetchOsCommercialDocument('os-a', true)).rejects.toMatchObject({ message: 'Failed' });
    expect(mocks.rpc).toHaveBeenCalledWith('get_os_commercial_document', { p_os_id: 'os-a', p_public: true });
  });
});
