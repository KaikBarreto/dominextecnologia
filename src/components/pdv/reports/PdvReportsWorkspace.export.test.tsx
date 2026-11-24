import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdvReportsWorkspace } from './PdvReportsWorkspace';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), createUrl: vi.fn(), revokeUrl: vi.fn(), click: vi.fn(), mobile: false }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/hooks/pdvReportCache', () => ({ PDV_REPORTS_QUERY_ROOT: ['pdv', 'reports-v2'], invalidatePdvReportCaches: vi.fn(), usePdvAuthorizedQueryScope: () => ({ key: ['fixture-company', 'fixture-user', 'reports'], ready: true }) }));
vi.mock('@/hooks/usePdvCounterFlow', () => ({ usePdvWorkflowSettings: () => ({ data: { pdvMode: 'simples', fulfillmentMode: 'cashier' } }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mocks.mobile }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ timezone: 'America/Sao_Paulo' }) }));
vi.mock('@/lib/format/hooks', () => ({ useLocaleFormatters: () => ({ money: (value: number) => `R$ ${value}`, date: (value: string) => value }) }));
vi.mock('@/components/ui/DateRangeFilter', () => ({ DateRangeFilter: () => <div>Período fictício</div>, useDateRangeFilter: () => ({ range: { from: new Date(2026, 10, 1), to: new Date(2026, 10, 7) }, preset: 'custom', setPreset: vi.fn(), setRange: vi.fn() }) }));
vi.mock('@/components/pdv/reports/PdvCardSettlementsPanel', () => ({ PdvCardSettlementsPanel: () => null }));
vi.mock('@/components/pdv/reports/PdvOverviewPanel', () => ({ PdvOverviewPanel: () => <div>Visão geral fictícia</div> }));
vi.mock('@/components/pdv/reports/PdvPaymentsCashPanel', () => ({ PdvPaymentsCashPanel: () => null }));
vi.mock('@/hooks/usePdvReportsV2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/usePdvReportsV2')>();
  const empty = { isLoading: false, error: null, refetch: vi.fn(), data: { entries: [], documents: [], totalCount: 501, revenue: 100, cmv: null, expense: 0, result: null, cashFlow: 40 } };
  return { ...actual, usePdvManagementReport: () => ({ ...empty, data: null }), usePdvPartialProjection: () => empty, usePdvGlobalHistory: () => empty, usePdvDocumentIndex: () => empty };
});
function page(offset: number, history = false) {
  const entries = Array.from({ length: offset === 0 ? 500 : 1 }, (_, index) => history ? {
    event_id: `event-${offset + index}`, event_type: 'delivery', event_date: '2026-11-07',
    cash_session_id: null, cash_session_label: 'Caixa fictício', label: `Evento ${offset + index}`, amount: null, direction: null, deep_link: '',
  } : {
    event_id: `event-${offset + index}`, event_date: '2026-11-07', source_type: 'delivery_v2', revenue: 1, cmv: null, expense: 0, cash_flow: 0, order_number: null, item_count: 1, details: [],
  });
  return { data: {
    scope: history ? 'pdv_global_history' : 'pdv_partial', projection: 'dre_competence', from: '2026-11-01', to: '2026-11-07',
    total_count: 501, limit: 500, offset, has_more: offset === 0, entries,
    revenue: 100, cmv: null, expense: 0, result: null, cash_flow: 40,
    initial_balance: null, opening_availability: null, closing_availability: null, availability_status: 'not_calculated_for_partial_projection',
  }, error: null };
}
function mount(history: boolean) {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PdvReportsWorkspace /></MemoryRouter>);
  fireEvent.click(screen.getByRole('tab', { name: 'Operacional' }));
  if (history) fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
}
async function blobText(blob: Blob) {
  return new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
}
describe('arquivo CSV completo na UI real de relatórios', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.mobile = false;
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: mocks.createUrl.mockReturnValue('blob:fixture') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: mocks.revokeUrl });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(mocks.click);
  });
  it.each([false, true])('Resumo/Histórico (%s) exporta 501 eventos sem depender da página visível', async (history) => {
    mocks.mobile = history;
    mocks.rpc.mockResolvedValueOnce(page(0, history)).mockResolvedValueOnce(page(500, history));
    mount(history);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() => expect(mocks.click).toHaveBeenCalledOnce());
    const content = await blobText(mocks.createUrl.mock.calls[0][0]);
    expect(content.split('\n')).toHaveLength(502);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[1][1].p_offset).toBe(500);
    if (history) {
      expect(content).toContain('Evento 500');
      expect(content.split('\n')[1]).toMatch(/;"Retirada";"Caixa fictício";"Evento 0";"";$/);
    }
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled();
  });
  it.each([false, true])('Resumo/Histórico (%s) mantém loading e não salva arquivo se a segunda página falhar', async (history) => {
    let fail!: (value: unknown) => void;
    mocks.rpc.mockResolvedValueOnce(page(0, history)).mockReturnValueOnce(new Promise((resolve) => { fail = resolve; }));
    mount(history);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(await screen.findByRole('button', { name: 'Exportando…' })).toBeDisabled();
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    fail({ data: null, error: { code: '42501', details: 'code=forbidden' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Seu perfil não permite consultar este relatório.');
    expect(mocks.createUrl).not.toHaveBeenCalled();
    expect(mocks.click).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled();
  });
  it.each(['=1+1', '+SUM(A1)', '-SUM(A1)', '@SUM(A1)', '\t=1+1', '\r=1+1'])('neutraliza descrição textual %j sem converter valor negativo em texto', async (description) => {
    const payload = page(500, true);
    payload.data.total_count = 1; payload.data.offset = 0;
    const entry = payload.data.entries[0];
    Object.assign(entry, { label: description, amount: -12.5, direction: 'saida' });
    mocks.rpc.mockResolvedValueOnce(payload);
    mount(true);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() => expect(mocks.click).toHaveBeenCalledOnce());
    const content = await blobText(mocks.createUrl.mock.calls[0][0]);
    expect(content).toContain(`"'${description}"`);
    expect(content).toContain(';"Saída";-12.5');
    expect(content).not.toContain("'-12.5");
  });

  it('Resumo exporta uma linha por produto, com despesa e fluxo da venda só na primeira linha', async () => {
    const payload = page(500);
    payload.data.total_count = 2; payload.data.offset = 0;
    payload.data.entries = [
      { event_id: 'g1', event_date: '2026-11-07', source_type: 'delivery_v2', order_number: 42, item_count: 2, revenue: 100, cmv: 10, expense: 5, cash_flow: 7,
        details: [{ description: 'Capacitor', quantity: 2, revenue: 60, cmv: null }, { description: 'Contator', quantity: 1, revenue: 40, cmv: 10 }] },
      { event_id: 'g2', event_date: '2026-11-07', source_type: 'pdv_card_fee', order_number: null, item_count: 1, revenue: 0, cmv: 0, expense: 3, cash_flow: 0, details: [] },
    ] as unknown as typeof payload.data.entries;
    mocks.rpc.mockResolvedValueOnce(payload);
    mount(false);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() => expect(mocks.click).toHaveBeenCalledOnce());
    const lines = (await blobText(mocks.createUrl.mock.calls[0][0])).replace(/^\uFEFF/, '').split('\n');
    expect(lines[0]).toBe('"Data";"Origem";"Venda";"Item";"Quantidade";"Receita";"Custo dos materiais";"Despesa";"Fluxo"');
    expect(lines.slice(1)).toEqual([
      '"2026-11-07";"Venda 42";42;"Capacitor";2;60;;5;7',
      '"2026-11-07";"Venda 42";42;"Contator";1;40;10;;',
      '"2026-11-07";"Taxa de cartão";;;;0;0;3;0',
    ]);
  });

});
