import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdvReportsWorkspace } from './PdvReportsWorkspace';

const mocks = vi.hoisted(() => ({ mode: 'simples', mobile: false }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('@/hooks/pdvReportCache', () => ({ PDV_REPORTS_QUERY_ROOT: ['pdv'], invalidatePdvReportCaches: vi.fn(), usePdvAuthorizedQueryScope: () => ({ key: ['c'], ready: true }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mocks.mobile }));
vi.mock('@/hooks/usePdvCounterFlow', () => ({ usePdvWorkflowSettings: () => ({ data: { pdvMode: mocks.mode, fulfillmentMode: 'dispatch' } }) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ timezone: 'America/Sao_Paulo' }) }));
vi.mock('@/lib/format/hooks', () => ({ useLocaleFormatters: () => ({ money: (v: number) => `R$ ${v}`, date: (v: string) => v }) }));
vi.mock('@/components/ui/DateRangeFilter', () => ({ DateRangeFilter: () => null, useDateRangeFilter: () => ({ range: { from: new Date(2026, 10, 1), to: new Date(2026, 10, 7) }, preset: 'custom', setPreset: vi.fn(), setRange: vi.fn() }) }));
vi.mock('@/components/pdv/reports/PdvCardSettlementsPanel', () => ({ PdvCardSettlementsPanel: () => null }));
vi.mock('@/components/pdv/reports/PdvOverviewPanel', () => ({ PdvOverviewPanel: () => <div>Visão geral fictícia</div> }));
vi.mock('@/components/pdv/reports/PdvPaymentsCashPanel', () => ({ PdvPaymentsCashPanel: () => null }));
vi.mock('@/hooks/usePdvReportsV2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/usePdvReportsV2')>();
  const entries = [
    { eventId: 'g1', eventDate: '2026-11-07', sourceType: 'delivery_v2', sourceLabel: 'Entrega reconhecida', orderNumber: 42, itemCount: 2, revenue: 100, cmv: null, expense: 0, cashFlow: 0,
      details: [{ description: 'Capacitor 35uF', quantity: 2, revenue: 60, cmv: null }, { description: 'Contator', quantity: 1, revenue: 40, cmv: 10 }] },
    { eventId: 'g2', eventDate: '2026-11-07', sourceType: 'pdv_card_fee', sourceLabel: 'Taxa de cartão', orderNumber: null, itemCount: 1, revenue: 0, cmv: 0, expense: 3, cashFlow: 0, details: [] },
  ];
  const data = { entries, totalCount: 2, revenue: 100, cmv: null, expense: 3, result: null, cashFlow: 0 };
  return { ...actual, usePdvManagementReport: () => ({ isLoading: false, error: null, refetch: vi.fn(), data: null }), usePdvPartialProjection: () => ({ isLoading: false, error: null, refetch: vi.fn(), data }), usePdvGlobalHistory: () => ({ isLoading: false, error: null, refetch: vi.fn(), data: null }), usePdvDocumentIndex: () => ({ isLoading: false, error: null, refetch: vi.fn(), data: null }), usePdvProjectionExport: () => ({ exportEntries: vi.fn(), isPending: false, error: null, ready: true }), usePdvHistoryExport: () => ({ exportEntries: vi.fn(), isPending: false, error: null, ready: true }) };
});

const mount = () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PdvReportsWorkspace /></MemoryRouter>);
  fireEvent.click(screen.getByRole('tab', { name: 'Operacional' }));
};

describe('resumo agrupado por venda', () => {
  beforeEach(() => { mocks.mode = 'simples'; mocks.mobile = false; vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
  it.each([false, true])('venda direta (mobile=%s) chama "Venda 42" e expande os itens', (mobile) => {
    mocks.mobile = mobile;
    mount();
    expect(screen.queryByText(/Entrega reconhecida|Retirada/)).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Ver itens de Venda 42' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Capacitor 35uF/)).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Recolher itens de Venda 42' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Capacitor 35uF/)).toBeInTheDocument();
    expect(screen.getAllByText('Taxa de cartão').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /itens de/ })).toHaveLength(1);
  });
  it('balcão chama "Retirada do pedido 42"', () => {
    mocks.mode = 'balcao';
    mount();
    expect(screen.getByRole('button', { name: 'Ver itens de Retirada do pedido 42' })).toBeInTheDocument();
  });
  it('oferece PDF e Excel no menu Exportar da mesma faixa operacional', async () => {
    mount();
    const exportButton = screen.getByRole('button', { name: /^Exportar$/ });
    const subtab = screen.getByRole('tab', { name: 'Movimentações' });
    expect(exportButton.closest('[class*="border-b"]')).toContainElement(subtab);
    fireEvent.keyDown(exportButton, { key: 'Enter', code: 'Enter' });
    expect(await screen.findByRole('menuitem', { name: 'PDF' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Excel' })).toBeInTheDocument();
  });
});
