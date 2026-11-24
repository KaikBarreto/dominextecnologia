import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDomiLink } from './useDomiLink';
import * as client from '@/lib/domilink/client';
import { clearDomiLinkSession, readDomiLinkSession, writeDomiLinkEnabled, writeDomiLinkSession } from '@/lib/domilink/storage';
import type { DomiLinkPairResult, DomiLinkProfile, DomiLinkScaleReading } from '@/lib/domilink/types';

const auth = vi.hoisted(() => ({ current: {
  user: { id: 'user-a' } as { id: string } | null,
  profile: { user_id: 'user-a', company_id: 'company-a' } as { user_id: string; company_id: string } | null,
  loading: false, profileLoading: false,
} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth.current }));
vi.mock('@/lib/domilink/client', async (original) => {
  const actual = await original<typeof import('@/lib/domilink/client')>();
  return { ...actual, detectDomiLink: vi.fn(), loadDomiLinkProfile: vi.fn(), pairDomiLink: vi.fn(), revokeDomiLink: vi.fn(), readDomiLinkScale: vi.fn(), readDomiLinkBarcode: vi.fn(), queueDomiLinkTestPrint: vi.fn(), waitForDomiLinkPrintJob: vi.fn() };
});
const scope = { userId: 'user-a', companyId: 'company-a' };
const health = { name: 'DomiLink', status: 'ok', version: '1', bind: 'loopback' } as const;
const profile: DomiLinkProfile = { health, capabilities: { fiscal: false, printing: [], scales: [], barcodes: [], paper_widths_mm: [] }, devices: [{ id: 'scale-a', kind: 'scale', label: 'Balança A', online: true, capabilities: {} }] };
const reading: DomiLinkScaleReading = { weight_kg: 2, stable: true, unit: 'kg' };
const pairResult = (token: string): DomiLinkPairResult => ({ token, expires_in: 3600, token_type: 'Bearer' });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function changeCompany() { auth.current = { ...auth.current, profile: { user_id: 'user-a', company_id: 'company-b' } }; }

describe('isolamento de sessão do DomiLink', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear(); sessionStorage.clear(); clearDomiLinkSession();
    writeDomiLinkEnabled(true);
    auth.current = { user: { id: 'user-a' }, profile: { user_id: 'user-a', company_id: 'company-a' }, loading: false, profileLoading: false };
    vi.mocked(client.detectDomiLink).mockResolvedValue(health);
    vi.mocked(client.loadDomiLinkProfile).mockResolvedValue(profile);
    vi.mocked(client.revokeDomiLink).mockResolvedValue(undefined);
  });

  it.each(['loading', 'profileLoading', 'profile-mismatch', 'no-user', 'no-company'])('falha fechado com contexto desconhecido: %s', async (kind) => {
    writeDomiLinkSession('token-a', scope);
    if (kind === 'loading') auth.current.loading = true;
    if (kind === 'profileLoading') auth.current.profileLoading = true;
    if (kind === 'profile-mismatch') auth.current.profile!.user_id = 'user-b';
    if (kind === 'no-user') auth.current.user = null;
    if (kind === 'no-company') auth.current.profile = null;
    const { result } = renderHook(() => useDomiLink());
    expect(result.current.profile).toBeNull();
    expect(result.current.status).toBe('disabled');
    await expect(result.current.pair('123456')).rejects.toThrow('conta ou empresa mudou');
    await expect(result.current.readScale('scale-a')).rejects.toThrow('conta ou empresa mudou');
    expect(client.detectDomiLink).not.toHaveBeenCalled();
    expect(client.pairDomiLink).not.toHaveBeenCalled();
    expect(client.readDomiLinkScale).not.toHaveBeenCalled();
  });

  it.each(['company', 'user'])('mascara perfil e revoga token ao trocar %s', async (kind) => {
    writeDomiLinkSession('token-a', scope);
    const { result, rerender } = renderHook(() => useDomiLink());
    await waitFor(() => expect(result.current.status).toBe('connected'));
    if (kind === 'company') changeCompany();
    else auth.current = { ...auth.current, user: { id: 'user-b' }, profile: { user_id: 'user-b', company_id: 'company-a' } };
    rerender();
    expect(result.current.profile).toBeNull();
    expect(result.current.devices.scales).toEqual([]);
    expect(client.revokeDomiLink).toHaveBeenCalledWith('token-a');
    await waitFor(() => expect(result.current.status).toBe('pairing'));
    expect(client.loadDomiLinkProfile).toHaveBeenCalledTimes(1);
  });

  it('pareamento atrasado não persiste após troca de empresa e revoga token recebido', async () => {
    const pending = deferred<DomiLinkPairResult>();
    vi.mocked(client.pairDomiLink).mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(() => useDomiLink());
    await waitFor(() => expect(result.current.status).toBe('pairing'));
    let pairing!: Promise<void>;
    act(() => { pairing = result.current.pair('123456'); });
    const rejected = expect(pairing).rejects.toThrow('conta ou empresa mudou');
    changeCompany(); rerender();
    await act(async () => { pending.resolve(pairResult('token-antigo')); await rejected; });
    expect(readDomiLinkSession({ ...scope, companyId: 'company-b' })).toBeNull();
    expect(client.revokeDomiLink).toHaveBeenCalledWith('token-antigo');
    expect(result.current.profile).toBeNull();
  });

  it.each(['scale', 'barcode'])('descarta leitura %s atrasada sem apagar ação ocupada da empresa nova', async (kind) => {
    writeDomiLinkSession('token-a', scope);
    const pendingReading = deferred<DomiLinkScaleReading>();
    const pendingBarcode = deferred<string>();
    const pendingPair = deferred<DomiLinkPairResult>();
    vi.mocked(client.readDomiLinkScale).mockReturnValue(pendingReading.promise);
    vi.mocked(client.readDomiLinkBarcode).mockReturnValue(pendingBarcode.promise);
    vi.mocked(client.pairDomiLink).mockReturnValue(pendingPair.promise);
    const { result, rerender } = renderHook(() => useDomiLink());
    await waitFor(() => expect(result.current.status).toBe('connected'));
    let request!: Promise<unknown>;
    act(() => { request = kind === 'scale' ? result.current.readScale('scale-a') : result.current.readBarcode('barcode-a'); });
    const rejected = expect(request).rejects.toThrow('conta ou empresa mudou');
    changeCompany(); rerender();
    await waitFor(() => expect(result.current.status).toBe('pairing'));
    let pairing!: Promise<void>;
    act(() => { pairing = result.current.pair('654321'); });
    await act(async () => { pendingReading.resolve(reading); pendingBarcode.resolve('codigo-antigo'); await rejected; });
    expect(result.current.lastScaleReading).toBeNull();
    expect(result.current.lastBarcode).toBeNull();
    expect(result.current.busyAction).toBe('pair');
    await act(async () => { pendingPair.resolve(pairResult('token-b')); await pairing; });
    expect(readDomiLinkSession({ ...scope, companyId: 'company-b' })).toBe('token-b');
  });

  it('perfil carregado no contexto anterior não reconecta após mudança', async () => {
    writeDomiLinkSession('token-a', scope);
    const pending = deferred<DomiLinkProfile>();
    vi.mocked(client.loadDomiLinkProfile).mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(() => useDomiLink());
    await waitFor(() => expect(client.loadDomiLinkProfile).toHaveBeenCalled());
    changeCompany(); rerender();
    await act(async () => { pending.resolve(profile); });
    expect(result.current.profile).toBeNull();
    expect(result.current.status).toBe('pairing');
  });

  it('limpeza síncrona do logout invalida pareamento antes de auth renderizar', async () => {
    const pending = deferred<DomiLinkPairResult>();
    vi.mocked(client.pairDomiLink).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useDomiLink());
    await waitFor(() => expect(result.current.status).toBe('pairing'));
    let pairing!: Promise<void>;
    act(() => { pairing = result.current.pair('123456'); });
    const rejected = expect(pairing).rejects.toThrow('conta ou empresa mudou');
    clearDomiLinkSession();
    await act(async () => { pending.resolve(pairResult('token-atrasado')); await rejected; });
    expect(readDomiLinkSession(scope)).toBeNull();
    expect(client.revokeDomiLink).toHaveBeenCalledWith('token-atrasado');
  });

  it('preserva pareamento em StrictMode e remount comum no mesmo contexto', async () => {
    writeDomiLinkSession('token-a', scope);
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const first = renderHook(() => useDomiLink(), { wrapper });
    await waitFor(() => expect(first.result.current.status).toBe('connected'));
    first.unmount();
    expect(readDomiLinkSession(scope)).toBe('token-a');
    const second = renderHook(() => useDomiLink(), { wrapper });
    await waitFor(() => expect(second.result.current.status).toBe('connected'));
    expect(client.revokeDomiLink).not.toHaveBeenCalled();
  });

  it('impressão enfileirada após troca não retorna job nem continua polling', async () => {
    writeDomiLinkSession('token-a', scope);
    const pending = deferred<Awaited<ReturnType<typeof client.queueDomiLinkTestPrint>>>();
    vi.mocked(client.queueDomiLinkTestPrint).mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(() => useDomiLink());
    await waitFor(() => expect(result.current.status).toBe('connected'));
    let printing!: ReturnType<typeof result.current.testPrint>;
    act(() => { printing = result.current.testPrint({ id: 'printer-a', kind: 'printer', label: 'PDF', online: true, capabilities: { print_formats: ['pdf'] } }); });
    const rejected = expect(printing).rejects.toThrow('conta ou empresa mudou');
    changeCompany(); rerender();
    await act(async () => { pending.resolve({ job: { id: 'job-a', status: 'queued', device_id: 'printer-a' }, replayed: false }); await rejected; });
    expect(client.waitForDomiLinkPrintJob).not.toHaveBeenCalled();
  });
  it('expiração durante uma leitura limpa o pareamento e pede um novo código', async () => {
    writeDomiLinkEnabled(true);
    writeDomiLinkSession('fixture-session', scope);
    vi.mocked(client.detectDomiLink).mockResolvedValue(health);
    vi.mocked(client.loadDomiLinkProfile).mockResolvedValue(profile);
    const { result } = renderHook(() => useDomiLink());
    await waitFor(() => expect(result.current.status).toBe('connected'));
    vi.mocked(client.readDomiLinkScale).mockRejectedValue(new client.DomiLinkError('session_expired', 'A conexão expirou.', 401));
    await act(async () => { await expect(result.current.readScale('scale-a')).rejects.toThrow(/expirou/); });
    expect(result.current.status).toBe('pairing');
    expect(result.current.profile).toBeNull();
    expect(readDomiLinkSession(scope)).toBeNull();
  });

});
