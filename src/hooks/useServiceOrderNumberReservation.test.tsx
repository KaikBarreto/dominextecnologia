import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useServiceOrderNumberReservation } from './useServiceOrderNumberReservation';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
const COMPANY = '22222222-2222-4222-8222-222222222222';
const USER = '11111111-1111-4111-8111-111111111111';
const REQUEST = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const options = { companyId: COMPANY, userId: USER, requestId: REQUEST, isOpen: true };
const data = (id = REQUEST, number = 123) => ({ reservation_id: id, order_number: number, expires_at: new Date(Date.now() + 30 * 86400000).toISOString() });
const wrapper = (strict = false) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{strict ? <StrictMode>{children}</StrictMode> : children}</QueryClientProvider>;
  };
};
beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation((_name: string, args: { p_request_id: string }) => ({ abortSignal: async () => ({ data: data(args.p_request_id), error: null }) }));
});
afterEach(() => vi.useRealTimers());

describe('useServiceOrderNumberReservation', () => {
  it('reserva somente pelo servidor e inclui usuário, empresa e request id nas chamadas', async () => {
    const { result } = renderHook(() => useServiceOrderNumberReservation(options), { wrapper: wrapper() });
    expect(result.current.reservation).toBeNull(); expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.reservation?.number).toBe(123));
    expect(rpc).toHaveBeenCalledWith('reserve_service_order_number', { p_company_id: COMPANY, p_user_id: USER, p_request_id: REQUEST });
    expect(result.current.reservation?.id).toBe(REQUEST);
    expect(result.current.error).toBeNull();
  });

  it.each([
    { isOpen: false }, { isEditing: true }, { enabled: false },
    { companyId: undefined }, { userId: undefined }, { requestId: undefined },
    { companyId: 'company' }, { userId: 'user' }, { requestId: 'not-a-uuid' },
  ])('não reserva fora de um contexto autenticado ativo: %j', async patch => {
    const { result } = renderHook(() => useServiceOrderNumberReservation({ ...options, ...patch }), { wrapper: wrapper() });
    await act(async () => {});
    expect(rpc).not.toHaveBeenCalled(); expect(result.current.reservation).toBeNull();
    expect(result.current.isLoading).toBe(false); expect(result.current.error).toBeNull();
    await act(() => result.current.retry()); expect(rpc).not.toHaveBeenCalled();
  });

  it('deduplica a chamada em StrictMode sem cancelar e realocar uma nova reserva', async () => {
    const { result } = renderHook(() => useServiceOrderNumberReservation(options), { wrapper: wrapper(true) });
    await waitFor(() => expect(result.current.reservation?.number).toBe(123));
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('revalida ao reabrir o mesmo request id e mantém o mesmo número quando ainda disponível', async () => {
    const { result, rerender } = renderHook(({ isOpen }) => useServiceOrderNumberReservation({ ...options, isOpen }), { wrapper: wrapper(), initialProps: { isOpen: true } });
    await waitFor(() => expect(result.current.reservation?.number).toBe(123));
    rerender({ isOpen: false }); expect(result.current.reservation).toBeNull();
    rerender({ isOpen: true }); expect(result.current.isLoading).toBe(true); expect(result.current.reservation).toBeNull();
    await waitFor(() => expect(result.current.reservation?.number).toBe(123));
    expect(rpc).toHaveBeenCalledTimes(2); expect(rpc.mock.calls[1][1].p_request_id).toBe(REQUEST);
  });

  it('não mantém o número em cache quando outro dispositivo já consumiu a reserva', async () => {
    const { result, rerender } = renderHook(({ isOpen }) => useServiceOrderNumberReservation({ ...options, isOpen }), { wrapper: wrapper(), initialProps: { isOpen: true } });
    await waitFor(() => expect(result.current.reservation?.number).toBe(123));
    rerender({ isOpen: false });
    rpc.mockImplementation(() => ({ abortSignal: async () => ({ data: null, error: { code: 'OSN03', message: 'Backend constraint details' } }) }));
    rerender({ isOpen: true });
    await waitFor(() => expect(result.current.errorKind).toBe('consumed'));
    expect(result.current.reservation).toBeNull(); expect(result.current.error).not.toMatch(/OSN03|constraint|Backend/);
  });

  it('oculta respostas antigas ao trocar request id, usuário ou empresa', async () => {
    let resolveFirst!: (result: { data: ReturnType<typeof data>; error: null }) => void;
    rpc.mockImplementationOnce(() => ({ abortSignal: () => new Promise(resolve => { resolveFirst = resolve; }) }));
    const { result, rerender } = renderHook(props => useServiceOrderNumberReservation(props), { wrapper: wrapper(), initialProps: options });
    rerender({ ...options, companyId: OTHER, userId: OTHER, requestId: OTHER });
    await waitFor(() => expect(result.current.reservation?.id).toBe(OTHER));
    await act(async () => { resolveFirst({ data: data(REQUEST, 999), error: null }); });
    expect(result.current.reservation?.number).toBe(123); expect(result.current.reservation?.id).toBe(OTHER);
  });

  it('não exibe uma resposta que chega após fechar nem ao entrar em edição', async () => {
    let resolve!: (result: { data: ReturnType<typeof data>; error: null }) => void;
    rpc.mockImplementation(() => ({ abortSignal: () => new Promise(done => { resolve = done; }) }));
    const { result, rerender } = renderHook(({ isOpen, isEditing }) => useServiceOrderNumberReservation({ ...options, isOpen, isEditing }), { wrapper: wrapper(), initialProps: { isOpen: true, isEditing: false } });
    rerender({ isOpen: false, isEditing: false });
    await act(async () => { resolve({ data: data(), error: null }); });
    expect(result.current.reservation).toBeNull(); expect(result.current.isLoading).toBe(false);
    rerender({ isOpen: true, isEditing: true }); expect(result.current.reservation).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('permite nova tentativa de rede usando exatamente o mesmo request id', async () => {
    rpc.mockImplementationOnce(() => ({ abortSignal: async () => ({ data: null, error: { code: '42501', message: 'private schema info' } }) }));
    const { result } = renderHook(() => useServiceOrderNumberReservation(options), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.errorKind).toBe('unavailable'));
    expect(result.current.error).not.toMatch(/42501|schema|private/); expect(result.current.reservation).toBeNull();
    await act(() => result.current.retry()); await waitFor(() => expect(result.current.reservation?.number).toBe(123));
    expect(rpc.mock.calls[1][1].p_request_id).toBe(REQUEST);
  });

  it('aborta em 10 segundos e informa falha mesmo se o transporte ignorar o abort signal', async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined;
    rpc.mockImplementation(() => ({ abortSignal: (value: AbortSignal) => { signal = value; return new Promise(() => {}); } }));
    const { result } = renderHook(() => useServiceOrderNumberReservation(options), { wrapper: wrapper() });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_001); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(signal?.aborted).toBe(true); expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toContain('demorou mais'); expect(result.current.reservation).toBeNull();
  });

  it.each([
    null, [], { ...data(), order_number: 0 }, { ...data(), order_number: -1 },
    { ...data(), order_number: 1.5 }, { ...data(), order_number: '123' },
    { ...data(), order_number: Number.NaN }, { ...data(), order_number: Number.POSITIVE_INFINITY },
    { ...data(), order_number: true },
    { ...data(), order_number: Number.MAX_SAFE_INTEGER + 1 },
    { ...data(), reservation_id: OTHER }, { ...data(), reservation_id: 'invalid' },
    { ...data(), expires_at: 'yesterday' }, { ...data(), expires_at: '2000-01-01T00:00:00Z' },
  ])('não anuncia reserva para resposta inválida: %j', async response => {
    rpc.mockImplementation(() => ({ abortSignal: async () => ({ data: response, error: null }) }));
    const { result } = renderHook(() => useServiceOrderNumberReservation(options), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.errorKind).toBe('invalid_response'));
    expect(result.current.reservation).toBeNull();
  });

  it('apresenta expiração como orientação de domínio sem expor o código SQL', async () => {
    rpc.mockImplementation(() => ({ abortSignal: async () => ({ data: null, error: { code: 'OSN02', message: 'internal reservation table' } }) }));
    const { result } = renderHook(() => useServiceOrderNumberReservation(options), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.errorKind).toBe('expired'));
    expect(result.current.error).toContain('expirou'); expect(result.current.error).not.toMatch(/OSN02|internal|table/);
  });

  it('deixa de anunciar o número quando o prazo vence com o modal ainda aberto', async () => {
    vi.useFakeTimers();
    rpc.mockImplementation(() => ({ abortSignal: async () => ({ data: { ...data(), expires_at: new Date(Date.now() + 1000).toISOString() }, error: null }) }));
    const { result } = renderHook(() => useServiceOrderNumberReservation(options), { wrapper: wrapper() });
    await act(async () => { await vi.advanceTimersByTimeAsync(5); });
    expect(result.current.reservation?.number).toBe(123);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.reservation).toBeNull(); expect(result.current.errorKind).toBe('expired');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([{ companyId: OTHER }, { userId: OTHER }, { requestId: OTHER }])('isola o cache quando muda apenas uma identidade: %j', async patch => {
    const { result, rerender } = renderHook(props => useServiceOrderNumberReservation(props), { wrapper: wrapper(), initialProps: options });
    await waitFor(() => expect(result.current.reservation?.number).toBe(123));
    rerender({ ...options, ...patch });
    expect(result.current.reservation).toBeNull();
    await waitFor(() => expect(result.current.reservation?.number).toBe(123));
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toEqual({
      p_company_id: patch.companyId ?? COMPANY,
      p_user_id: patch.userId ?? USER,
      p_request_id: patch.requestId ?? REQUEST,
    });
  });

  it('normaliza UUIDs e aceita a confirmação do mesmo request em caixa alta', async () => {
    const companyId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
    const userId = 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB';
    const requestId = 'CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC';
    rpc.mockImplementation(() => ({ abortSignal: async () => ({ data: data(requestId, 987), error: null }) }));
    const { result } = renderHook(() => useServiceOrderNumberReservation({ ...options, companyId, userId, requestId }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.reservation?.number).toBe(987));
    expect(result.current.reservation?.id).toBe(requestId.toLowerCase());
    expect(rpc).toHaveBeenCalledWith('reserve_service_order_number', {
      p_company_id: companyId.toLowerCase(), p_user_id: userId.toLowerCase(), p_request_id: requestId.toLowerCase(),
    });
  });

  it('acompanha a expiração de uma reserva de 30 dias sem estourar o limite do timer do navegador', async () => {
    vi.useFakeTimers();
    const lifetime = 30 * 86400000;
    const { result } = renderHook(() => useServiceOrderNumberReservation(options), { wrapper: wrapper() });
    await act(async () => { await vi.advanceTimersByTimeAsync(5); });
    expect(result.current.reservation?.number).toBe(123);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_147_483_647); });
    expect(result.current.reservation?.number).toBe(123);
    await act(async () => { await vi.advanceTimersByTimeAsync(lifetime - 2_147_483_647); });
    expect(result.current.reservation).toBeNull();
    expect(result.current.errorKind).toBe('expired');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

});
