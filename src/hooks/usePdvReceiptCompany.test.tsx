import { useState, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectPdvReceiptCompany, usePdvReceiptCompany } from './usePdvReceiptCompany';
import { PDV_RECEIPT_COMPANY_QUERY_ROOT } from '@/lib/pdv/receipt/cacheKeys';

const state = vi.hoisted(() => ({
  userId: 'operator-1', profileUserId: 'operator-1', companyId: 'company-a',
  loading: false, profileLoading: false, roles: ['comercial'] as string[], permissions: ['screen:pdv'], rpc: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
  user: state.userId ? { id: state.userId } : null,
  profile: { user_id: state.profileUserId, company_id: state.companyId },
  loading: state.loading, profileLoading: state.profileLoading, roles: state.roles, permissions: state.permissions, hasPermissionRecord: true,
}) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));

function company(id: string, whiteLabel = false) {
  return { company_id: id, name: `Empresa ${id}`, document: `Documento fictício ${id}`, address: `Rua ${id}`, phone: '0000000000', logo_url: whiteLabel ? `marca-${id}` : `logo-${id}`, time_zone: 'America/Sao_Paulo', white_label_enabled: whiteLabel };
}
function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('identidade operacional da empresa nos comprovantes PDV', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(state, { userId: 'operator-1', profileUserId: 'operator-1', companyId: 'company-a', loading: false, profileLoading: false, roles: ['comercial'], permissions: ['screen:pdv'] });
    state.rpc.mockImplementation(async () => ({ data: company(state.companyId), error: null }));
  });

  it('mascara imediatamente A→B com mesmo usuário e carrega a nova identidade em chave própria', async () => {
    const { result, rerender } = renderHook(() => usePdvReceiptCompany(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current?.name).toBe('Empresa company-a'));
    let resolve!: (value: unknown) => void;
    state.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    state.companyId = 'company-b';
    rerender();
    expect(result.current).toBeNull();
    await waitFor(() => expect(state.rpc).toHaveBeenCalledTimes(2));
    await act(async () => { resolve({ data: company('company-b', true), error: null }); });
    await waitFor(() => expect(result.current).toMatchObject({ name: 'Empresa company-b', logoUrl: 'marca-company-b', whiteLabelEnabled: true }));
    expect(JSON.stringify(result.current)).not.toContain('company-a');
  });

  it.each(['loading', 'profileLoading'] as const)('falha fechado durante %s sem consultar nem presumir política de marca', (flag) => {
    state[flag] = true;
    const { result } = renderHook(() => usePdvReceiptCompany(), { wrapper: Wrapper });
    expect(result.current).toBeNull();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('rejeita perfil de outro usuário e empresa ausente sem consultar dados', () => {
    state.profileUserId = 'previous-user';
    const { result, rerender } = renderHook(() => usePdvReceiptCompany(), { wrapper: Wrapper });
    expect(result.current).toBeNull();
    state.profileUserId = state.userId;
    state.companyId = '';
    rerender();
    expect(result.current).toBeNull();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('permite Master com empresa operacional e identidade canônica sem depender do hook decorativo', async () => {
    state.roles = ['super_admin'];
    state.rpc.mockResolvedValue({ data: { ...company('company-a'), name: 'Nome canônico da empresa sem settings', logo_url: null }, error: null });
    const { result } = renderHook(() => usePdvReceiptCompany(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current?.name).toBe('Nome canônico da empresa sem settings'));
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith('pdv_get_receipt_company_v3');
  });

  it('mascara a identidade antiga enquanto a marca da empresa é atualizada', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => usePdvReceiptCompany(), { wrapper });
    await waitFor(() => expect(result.current?.whiteLabelEnabled).toBe(false));
    let resolve!: (value: unknown) => void;
    state.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    act(() => { void client.invalidateQueries({ queryKey: PDV_RECEIPT_COMPANY_QUERY_ROOT }); });
    await waitFor(() => expect(result.current).toBeNull());
    await act(async () => { resolve({ data: company('company-a', true), error: null }); });
    await waitFor(() => expect(result.current).toMatchObject({ whiteLabelEnabled: true, logoUrl: 'marca-company-a' }));
  });

  it.each([
    { data: null, error: null },
    { data: company('other-company'), error: null },
    { data: { ...company('company-a'), white_label_enabled: undefined }, error: null },
    { data: null, error: { details: 'code=internal_forbidden', message: 'dados internos' } },
  ])('mantém identidade nula em resposta ausente, cruzada, desconhecida ou negada', async (response) => {
    state.rpc.mockResolvedValue(response);
    const { result } = renderHook(() => usePdvReceiptCompany(), { wrapper: Wrapper });
    await waitFor(() => expect(state.rpc).toHaveBeenCalledOnce());
    expect(result.current).toBeNull();
  });

  it('projetor descarta dados extras e preserva política de white-label conhecida, sem fallback durante loading', () => {
    expect(projectPdvReceiptCompany({ ...company('company-a', true), credit_limit: 100, notes: 'Não expor' }, 'company-a')).toEqual({ name: 'Empresa company-a', document: 'Documento fictício company-a', address: 'Rua company-a', phone: '0000000000', logoUrl: 'marca-company-a', timeZone: 'America/Sao_Paulo', whiteLabelEnabled: true });
    expect(projectPdvReceiptCompany({ ...company('company-a'), white_label_enabled: null }, 'company-a')).toBeNull();
    expect(projectPdvReceiptCompany(company('company-b'), 'company-a')).toBeNull();
  });
});
