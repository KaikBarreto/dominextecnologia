import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  auth: { user: { id: 'user-A' }, profile: { user_id: 'user-A', company_id: 'company-A', is_active: true }, permissions: ['screen:pdv_orders'], roles: ['comercial'], hasPermissionRecord: true, loading: false, profileLoading: false },
  rpc: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
import { isPdvModuleFeatureEnabled, usePdvModuleFeature } from './usePdvModuleFeatures';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData } } });
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
const available = (companyId = 'company-A') => ({ company_id: companyId, module_available: true, returns: true, after_sale: true });

beforeEach(() => {
  vi.clearAllMocks();
  state.auth = { user: { id: 'user-A' }, profile: { user_id: 'user-A', company_id: 'company-A', is_active: true }, permissions: ['screen:pdv_orders'], roles: ['comercial'], hasPermissionRecord: true, loading: false, profileLoading: false };
  state.rpc.mockImplementation(() => ({ abortSignal: () => Promise.resolve({ data: available(), error: null }) }));
});

describe('recursos publicados acompanham a disponibilidade canônica', () => {
  it('exige tenant, vigência e booleano explícito; flags de rollout nunca concedem acesso', () => {
    expect(isPdvModuleFeatureEnabled(available(), 'company-A', 'returns')).toBe(true);
    for (const payload of [null, {}, { enabled: true }, { enabled: false, company_allowlist: ['company-A'] }, available('company-B'), { ...available(), module_available: false }, { ...available(), returns: 'true' }]) {
      expect(isPdvModuleFeatureEnabled(payload, 'company-A', 'returns')).toBe(false);
    }
    expect(isPdvModuleFeatureEnabled(available(), null, 'returns')).toBe(false);
  });

  it('consulta apenas a RPC da sessão sem enviar company_id nem ler flags', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => usePdvModuleFeature('company-A', 'returns', ['pdv-returns']), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(true));
    expect(state.rpc).toHaveBeenCalledWith('pdv_get_module_features_v3');
  });

  it.each(['company', 'user', 'permissions', 'inactive', 'loading'])('mascara a capacidade antiga imediatamente ao mudar %s e descarta resposta atrasada', async change => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(() => usePdvModuleFeature(state.auth.profile.company_id, 'after_sale', ['pdv-after-sale-v2']), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(true));
    let resolve!: (value: unknown) => void;
    state.rpc.mockImplementation(() => ({ abortSignal: () => new Promise(r => { resolve = r; }) }));
    if (change === 'company') state.auth.profile.company_id = 'company-B';
    if (change === 'user') { state.auth.user.id = 'user-B'; state.auth.profile.user_id = 'user-B'; }
    if (change === 'permissions') state.auth.permissions = [];
    if (change === 'inactive') state.auth.profile.is_active = false;
    if (change === 'loading') state.auth.profileLoading = true;
    rerender();
    expect(result.current.data).not.toBe(true);
    if (resolve) resolve({ data: available(), error: null });
    if (change === 'company') await waitFor(() => expect(result.current.data).toBe(false));
  });

  it('não reutiliza resposta antiga ao retornar A→B→A durante uma consulta', async () => {
    const { wrapper } = setup();
    const pending: Array<(value: unknown) => void> = [];
    state.rpc.mockImplementation(() => ({ abortSignal: () => new Promise(resolve => pending.push(resolve)) }));
    const { result, rerender } = renderHook(() => usePdvModuleFeature(state.auth.profile.company_id, 'returns', ['pdv-returns']), { wrapper });
    await waitFor(() => expect(pending).toHaveLength(1));
    state.auth.profile.company_id = 'company-B'; rerender();
    await waitFor(() => expect(pending).toHaveLength(2));
    state.auth.profile.company_id = 'company-A'; rerender();
    await waitFor(() => expect(pending).toHaveLength(3));
    pending[0]({ data: available(), error: null });
    expect(result.current.data).not.toBe(true);
    pending[2]({ data: { ...available(), module_available: false }, error: null });
    await waitFor(() => expect(result.current.data).toBe(false));
  });

  it('falha fechado quando o servidor retorna erro ou payload desconhecido', async () => {
    const { wrapper } = setup();
    state.rpc.mockImplementation(() => ({ abortSignal: () => Promise.resolve({ data: null, error: { code: '42501', message: 'private_table' } }) }));
    const { result } = renderHook(() => usePdvModuleFeature('company-A', 'returns', ['pdv-returns']), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBe(false);
    expect(result.current.error?.message).not.toMatch(/42501|private_table/);
  });
});
