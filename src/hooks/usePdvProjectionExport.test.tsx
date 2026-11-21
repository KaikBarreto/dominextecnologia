import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePdvHistoryExport, usePdvProjectionExport } from './usePdvReportsV2';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), scope: { key: ['company-a', 'user-a', 'reports'], ready: true } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/hooks/pdvReportCache', () => ({
  PDV_REPORTS_QUERY_ROOT: ['pdv', 'reports-v2'], invalidatePdvReportCaches: vi.fn(),
  usePdvAuthorizedQueryScope: () => mocks.scope,
}));
const params = { projection: 'dre_competence' as const, from: '2026-11-01', to: '2026-11-07', enabled: true };
function page(offset: number, total = 501, extra: Record<string, unknown> = {}) {
  return { data: {
    scope: 'pdv_partial', projection: params.projection, from: params.from, to: params.to,
    total_count: total, limit: 500, offset, has_more: offset + Math.min(500, total - offset) < total,
    revenue: 100, cmv: null, expense: 0, result: null, cash_flow: 40,
    initial_balance: null, opening_availability: null, closing_availability: null,
    availability_status: 'not_calculated_for_partial_projection',
    entries: Array.from({ length: Math.min(500, total - offset) }, (_, index) => ({
      event_id: `event-${offset + index}`, event_date: '2026-11-07', source_type: 'delivery_v2',
      revenue: 1, cmv: null, expense: 0, cash_flow: 0, order_number: null, item_count: 1, details: [],
    })), ...extra,
  }, error: null };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('exportação integral e autorizada do período PDV', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scope = { key: ['company-a', 'user-a', 'reports'], ready: true };
  });
  it('só publica o arquivo depois de receber duas páginas completas, preservando null', async () => {
    const second = deferred<ReturnType<typeof page>>();
    mocks.rpc.mockResolvedValueOnce(page(0)).mockReturnValueOnce(second.promise);
    const complete = vi.fn();
    const { result } = renderHook(() => usePdvProjectionExport(params));
    let work!: Promise<void>;
    await act(async () => { work = result.current.exportEntries(complete); });
    expect(result.current.isPending).toBe(true);
    expect(complete).not.toHaveBeenCalled();
    await act(async () => { second.resolve(page(500)); await work; });
    expect(complete).toHaveBeenCalledOnce();
    const entries = complete.mock.calls[0][0];
    expect(entries).toHaveLength(501);
    expect(entries[0].cmv).toBeNull();
    expect(entries[500].eventId).toBe('event-500');
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'pdv_partial_projection_report_v4', {
      p_projection: params.projection, p_from: params.from, p_to: params.to, p_limit: 500, p_offset: 500,
    });
    expect(result.current.isPending).toBe(false);
  });
  it('falha na segunda página sem publicar arquivo parcial nem código interno', async () => {
    mocks.rpc.mockResolvedValueOnce(page(0)).mockResolvedValueOnce({ data: null, error: { code: '42501', details: 'code=forbidden_private_table' } });
    const complete = vi.fn();
    const { result } = renderHook(() => usePdvProjectionExport(params));
    await act(async () => { await result.current.exportEntries(complete); });
    expect(complete).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Seu perfil não permite consultar este relatório.');
    expect(result.current.isPending).toBe(false);
  });
  it.each(['company', 'user', 'permission', 'filter', 'tab', 'ready'] as const)('descarta resposta após mudança de %s, mesmo retornando ao contexto anterior', async (change) => {
    const pending = deferred<ReturnType<typeof page>>();
    mocks.rpc.mockReturnValueOnce(pending.promise);
    const complete = vi.fn();
    const { result, rerender } = renderHook((input) => usePdvProjectionExport(input), { initialProps: params });
    let work!: Promise<void>;
    act(() => { work = result.current.exportEntries(complete); });
    if (change === 'filter') rerender({ ...params, from: '2026-11-02' });
    else if (change === 'tab') rerender({ ...params, enabled: false });
    else if (change === 'ready') { mocks.scope.ready = false; rerender(params); }
    else {
      mocks.scope = { key: [change === 'company' ? 'company-b' : 'company-a', change === 'user' ? 'user-b' : 'user-a', change === 'permission' ? 'no-reports' : 'reports'], ready: true };
      rerender(params);
    }
    expect(result.current.isPending).toBe(false);
    mocks.scope = { key: ['company-a', 'user-a', 'reports'], ready: true };
    rerender(params);
    await act(async () => { pending.resolve(page(0)); await work; });
    expect(complete).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });
  it('descarta a resposta ao sair da tela', async () => {
    const pending = deferred<ReturnType<typeof page>>();
    mocks.rpc.mockReturnValueOnce(pending.promise);
    const complete = vi.fn();
    const { result, unmount } = renderHook(() => usePdvProjectionExport(params));
    let work!: Promise<void>;
    act(() => { work = result.current.exportEntries(complete); });
    unmount();
    pending.resolve(page(0));
    await work;
    expect(complete).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['quantidade', () => page(500, 502)],
    ['totais', () => page(500, 501, { revenue: 200 })],
    ['duplicidade', () => page(500, 501, { entries: [{ event_id: 'event-0', event_date: '2026-11-07', source_type: 'delivery_v2', revenue: 1, cmv: null, expense: 0, cash_flow: 0, order_number: null, item_count: 1, details: [] }] })],
  ] as const)('rejeita conjunto alterado em %s em vez de confiar na primeira página', async (_, changed) => {
    mocks.rpc.mockResolvedValueOnce(page(0)).mockResolvedValueOnce(changed());
    const complete = vi.fn();
    const { result } = renderHook(() => usePdvProjectionExport(params));
    await act(async () => { await result.current.exportEntries(complete); });
    expect(complete).not.toHaveBeenCalled();
    expect(result.current.error).toContain('mudaram durante a exportação');
  });
  it('limita conjuntos grandes e recusa páginas sem progresso', async () => {
    mocks.rpc.mockResolvedValueOnce(page(0, 10_001));
    const complete = vi.fn();
    const { result } = renderHook(() => usePdvProjectionExport(params));
    await act(async () => { await result.current.exportEntries(complete); });
    expect(complete).not.toHaveBeenCalled();
    expect(result.current.error).toContain('10 mil eventos');
    mocks.rpc.mockResolvedValueOnce(page(0, 501, { entries: [] }));
    await act(async () => { await result.current.exportEntries(complete); });
    expect(complete).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(result.current.error).toContain('mudaram durante a exportação');
  });
  it('não consulta enquanto a identidade está pendente', async () => {
    mocks.scope.ready = false;
    const { result } = renderHook(() => usePdvProjectionExport(params));
    await act(async () => { await result.current.exportEntries(vi.fn()); });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.current.ready).toBe(false);
  });
  it('histórico usa tipo + identificador e preserva valor restrito na segunda página', async () => {
    const historyPage = (offset: number) => ({ data: {
      scope: 'pdv_global_history', total_count: 501, limit: 500, offset, has_more: offset === 0,
      entries: Array.from({ length: offset === 0 ? 500 : 1 }, (_, index) => ({
        event_id: `event-${offset === 0 ? index : 0}`, event_type: offset === 0 ? 'delivery' : 'return',
        event_date: '2026-11-07', cash_session_id: null, cash_session_label: 'Caixa fictício',
        label: 'Movimento fictício', amount: null, direction: null, deep_link: '',
      })),
    }, error: null });
    mocks.rpc.mockResolvedValueOnce(historyPage(0)).mockResolvedValueOnce(historyPage(500));
    const complete = vi.fn();
    const { result } = renderHook(() => usePdvHistoryExport({ from: params.from, to: params.to }));
    await act(async () => { await result.current.exportEntries(complete); });
    expect(complete.mock.calls[0][0]).toHaveLength(501);
    expect(complete.mock.calls[0][0][500]).toMatchObject({ eventId: 'event-0', eventType: 'return', amount: null });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'pdv_global_event_history_v3', {
      p_from: params.from, p_to: params.to, p_cash_session_id: null, p_limit: 500, p_offset: 500,
    });
  });
  it('não expõe mensagem técnica quando o transporte rejeita fora do contrato', async () => {
    mocks.rpc.mockRejectedValueOnce(new Error('private_table internal transport details'));
    const complete = vi.fn();
    const { result } = renderHook(() => usePdvProjectionExport(params));
    await act(async () => { await result.current.exportEntries(complete); });
    expect(complete).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Não foi possível exportar o relatório. Tente novamente.');
  });

});
