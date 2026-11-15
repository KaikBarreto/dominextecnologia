import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { keepPreviousData, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  auth: { user: { id: 'user-1' }, profile: { company_id: 'company-1', user_id: 'user-1', is_active: true as boolean | undefined }, roles: ['comercial'], permissions: ['screen:pdv_orders'], hasPermissionRecord: true, loading: false, profileLoading: false }, rpc: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
import { usePdvOrderReceiptSnapshot } from './usePdvOrderReceiptSnapshot';

const payload = (name: string) => ({ company: { name, white_label_enabled: false }, order: { number: 1, issued_at: '2026-11-15T10:00:00Z', operator_name: 'Operador fictício' }, items: [{ description: 'Item fictício', quantity: 1, unit: 'un', unit_price: 10, discount: 0, total: 10 }], totals: { subtotal: 10, discount: 0, total: 10 }, payments: [{ method: 'pix', amount: 10 }] });
function context() { const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData } } }); return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }; }

describe('snapshot do comprovante não publica cache nem retorno de outro contexto', () => {
  beforeEach(() => { vi.clearAllMocks(); state.auth = { user: { id: 'user-1' }, profile: { company_id: 'company-1', user_id: 'user-1', is_active: true }, roles: ['comercial'], permissions: ['screen:pdv_orders'], hasPermissionRecord: true, loading: false, profileLoading: false }; });
  it.each(['empresa', 'usuário', 'permissão'])('separa o mesmo pedido ao mudar %s', async change => {
    state.rpc.mockResolvedValueOnce({ data: payload('Anterior'), error: null }).mockResolvedValueOnce({ data: payload('Atual'), error: null });
    const { client, wrapper } = context(); const { result, rerender } = renderHook(() => usePdvOrderReceiptSnapshot('same-id', true), { wrapper });
    await waitFor(() => expect(result.current.data?.company.name).toBe('Anterior'));
    if (change === 'empresa') state.auth.profile.company_id = 'company-2';
    if (change === 'usuário') { state.auth.user.id = 'user-2'; state.auth.profile.user_id = 'user-2'; }
    if (change === 'permissão') state.auth.permissions = [];
    rerender(); expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.company.name).toBe('Atual')); client.clear();
  });
  it.each(['loading', 'inativo', 'desconhecido', 'perfil antigo'])('mascara dado imediatamente e bloqueia refetch durante %s', async phase => {
    state.rpc.mockResolvedValue({ data: payload('Restrito'), error: null });
    const { client, wrapper } = context(); const { result, rerender } = renderHook(() => usePdvOrderReceiptSnapshot('same-id', true), { wrapper });
    await waitFor(() => expect(result.current.data?.company.name).toBe('Restrito'));
    if (phase === 'loading') state.auth.loading = true;
    if (phase === 'inativo') state.auth.profile.is_active = false;
    if (phase === 'desconhecido') state.auth.profile.is_active = undefined;
    if (phase === 'perfil antigo') state.auth.profile.user_id = 'old-user';
    rerender(); expect(result.current.data).toBeUndefined();
    await act(async () => { await result.current.refetch(); }); expect(state.rpc).toHaveBeenCalledOnce(); client.clear();
  });
  it('cancela transporte de A e não aceita resposta antiga ao voltar de B para A', async () => {
    let finish!: (data: unknown) => void;
    const pending = new Promise(resolve => { finish = resolve; }); let signal!: AbortSignal;
    const request = Object.assign(pending, { abortSignal: (value: AbortSignal) => { signal = value; return request; } });
    state.rpc.mockReturnValueOnce(request).mockResolvedValueOnce({ data: payload('B'), error: null }).mockResolvedValueOnce({ data: payload('A confirmado'), error: null });
    const { client, wrapper } = context(); const { result, rerender } = renderHook(() => usePdvOrderReceiptSnapshot('same-id', true), { wrapper });
    await waitFor(() => expect(state.rpc).toHaveBeenCalledOnce());
    state.auth.profile.company_id = 'company-2'; rerender(); await waitFor(() => expect(result.current.data?.company.name).toBe('B')); expect(signal.aborted).toBe(true);
    state.auth.profile.company_id = 'company-1'; rerender(); await waitFor(() => expect(result.current.data?.company.name).toBe('A confirmado'));
    await act(async () => { finish({ data: payload('A obsoleto'), error: null }); }); expect(result.current.data?.company.name).toBe('A confirmado'); client.clear();
  });
});
