import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), project: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from } }));
vi.mock('@/hooks/usePdvDirectSaleV2', () => ({ projectPdvDirectSaleCatalogV2: mocks.project }));
vi.mock('@/hooks/useSignedUrl', () => ({ resolveStorageUrl: vi.fn() }));

import { canReadPdvDemoPreview, isTrustedPdvDemoBridgeEvent, usePdvLiveDemoReview, type PdvDemoAccess } from './usePdvLiveDemoReview';

const access: PdvDemoAccess = { development: true, email: 'demo@dominex.app', userId: 'user-demo', companyId: 'company-demo', loading: false, active: true, moduleAllowed: true, screenAllowed: true };
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

describe('preview consultivo da conta demo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: access.userId, email: access.email } }, error: null });
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
    mocks.project.mockReturnValue({ materials: [{ id: 'material', name: 'Capacitor', unit: 'un', salePrice: 30, imageUrl: null, availableByStock: [{ availableQuantity: 7 }], cost: 12 }], customers: [{ id: 'customer', name: 'Cliente demo', privateNotes: 'não enviar' }], terminals: [{ id: 'terminal', name: 'Caixa balcão' }], cashAccount: { id: 'cash', name: 'Dinheiro', accountNumber: 'não enviar' }, bankAccounts: [{ id: 'bank', name: 'Conta bancária', accountNumber: 'não enviar' }] });
    mocks.from.mockImplementation((table: string) => {
      const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(table === 'profiles' ? { data: { company_id: 'company-demo', is_active: true }, error: null } : { data: { name: 'Empresa demo', logo_url: null }, error: null }) };
      return query;
    });
  });

  it.each([
    { development: false }, { email: 'cliente@example.com' }, { userId: null }, { companyId: null }, { loading: true }, { active: false }, { moduleAllowed: false }, { screenAllowed: false },
  ])('falha fechado para acesso incompleto: %j', (change) => {
    expect(canReadPdvDemoPreview({ ...access, ...change })).toBe(false);
  });

  it('não consulta antes da autorização', () => {
    renderHook(() => usePdvLiveDemoReview({ ...access, loading: true }, false), { wrapper });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('confirma a identidade no servidor antes de ler dados', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'another-user', email: 'demo@dominex.app' } }, error: null });
    const { result } = renderHook(() => usePdvLiveDemoReview(access, false), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejeita outra conta mesmo que o id local não tenha mudado', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: access.userId, email: 'outra@example.com' } }, error: null });
    const { result } = renderHook(() => usePdvLiveDemoReview(access, false), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('não lê catálogo se a empresa confirmada divergir', async () => {
    mocks.from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { company_id: 'another-company', is_active: true }, error: null }) });
    const { result } = renderHook(() => usePdvLiveDemoReview(access, false), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('usa somente o RPC consultivo e projeta dados sem campos privados', async () => {
    const { result } = renderHook(() => usePdvLiveDemoReview(access, false), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('pdv_get_direct_sale_catalog_v2');
    expect(mocks.from.mock.calls.map(([name]) => name)).toEqual(['profiles', 'company_settings']);
    expect(result.current.data).toEqual({ company: { name: 'Empresa demo' }, products: [{ id: 'material', name: 'Capacitor', unit: 'un', price: 30, stock: 7, photo: undefined }], customers: [{ id: 'customer', name: 'Cliente demo', cpfCnpj: '', phone: '', address: '' }], accounts: [{ id: 'cash', name: 'Dinheiro', kind: 'cash' }, { id: 'bank', name: 'Conta bancária', kind: 'bank' }], registers: [{ id: 'terminal', name: 'Caixa balcão' }] });
    expect(JSON.stringify(result.current.data)).not.toContain('não enviar');
    expect(JSON.stringify(result.current.data)).not.toContain('cost');
  });
});

describe('ponte isolada do preview demo', () => {
  const frame = {} as Window;
  const origin = 'http://localhost:8082';
  const valid = { origin, source: frame, data: { type: 'dominex-demo-ready', nonce: 'expected' } };
  it('aceita apenas a janela, origem e nonce combinados', () => {
    expect(isTrustedPdvDemoBridgeEvent(valid, frame, 'expected', origin)).toBe(true);
    expect(isTrustedPdvDemoBridgeEvent({ ...valid, origin: 'https://other.example' }, frame, 'expected', origin)).toBe(false);
    expect(isTrustedPdvDemoBridgeEvent({ ...valid, source: {} as Window }, frame, 'expected', origin)).toBe(false);
    expect(isTrustedPdvDemoBridgeEvent(valid, frame, 'wrong', origin)).toBe(false);
    expect(isTrustedPdvDemoBridgeEvent(valid, null, 'expected', origin)).toBe(false);
    expect(isTrustedPdvDemoBridgeEvent({ ...valid, data: { type: 'complete-sale', nonce: 'expected' } }, frame, 'expected', origin)).toBe(false);
    expect(isTrustedPdvDemoBridgeEvent(valid, frame, 'expected', 'http://localhost:4192')).toBe(false);
  });
});
