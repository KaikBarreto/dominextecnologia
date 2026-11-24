import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdvSalesPanel } from './PdvSalesPanel';

const mocks = vi.hoisted(() => ({ mobile: false, data: null as unknown, exportEntries: vi.fn() }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mocks.mobile }));
vi.mock('@/lib/format/hooks', () => ({ useLocaleFormatters: () => ({ money: (v: number) => `R$ ${v}`, date: (v: string) => v }) }));
vi.mock('@/hooks/usePdvReportsV2', () => ({
  usePdvSalesReport: () => ({ isLoading: false, error: null, refetch: vi.fn(), data: mocks.data }),
  usePdvSalesExport: () => ({ exportEntries: mocks.exportEntries, isPending: false, error: null, ready: true }),
}));

const report = (dimension: string, rows: unknown[]) => ({
  dimension, from: '2026-11-01', to: '2026-11-21', totalCount: rows.length, limit: 25, offset: 0, hasMore: false,
  totals: { ordersCount: 11, quantity: 20, revenue: 662.1, cmv: null, margin: null }, rows,
});
const productRows = [
  { key: 'p1', label: 'Capacitor 35uF', detail: 'SKU 123 · un', ordersCount: 8, quantity: 12, revenue: 500, cmv: 200, margin: 300, share: 0.755 },
];

describe('aba Vendas do PDV', () => {
  beforeEach(() => {
    mocks.mobile = false; mocks.exportEntries.mockReset();
    mocks.data = report('product', productRows);
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });

  it.each([false, true])('mostra o ranking com totais (mobile=%s)', (mobile) => {
    mocks.mobile = mobile;
    render(<PdvSalesPanel from="2026-11-01" to="2026-11-21" onDownloadCsv={vi.fn()} />);
    expect(screen.getAllByText('Capacitor 35uF').length).toBeGreaterThan(0);
    expect(screen.getByText('R$ 662.1')).toBeInTheDocument();
    expect(screen.getAllByText('Indisponível').length).toBeGreaterThan(0);
    expect(screen.getByText('Leitura do período')).toBeInTheDocument();
    expect(screen.getByText('Concentração de receita')).toBeInTheDocument();
    expect(screen.getAllByText('75,5%').length).toBeGreaterThan(0);
    expect(screen.getByText(/por venda/)).toBeInTheDocument();
    expect(screen.getByText(/de 1 registros/)).toBeInTheDocument();
  });

  it('mostra horário como faixa e esconde a coluna de quantidade fora de produtos', () => {
    mocks.data = report('hour', [{ ...productRows[0], key: '14', label: '14', detail: null }]);
    render(<PdvSalesPanel from="2026-11-01" to="2026-11-21" onDownloadCsv={vi.fn()} />);
    expect(screen.getAllByText('14h às 15h').length).toBeGreaterThan(0);
    expect(screen.getByText('Horário de pico')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Quantidade' })).toBeNull();
  });

  it('mostra estado vazio sem venda no período', () => {
    mocks.data = report('product', []);
    render(<PdvSalesPanel from="2026-11-01" to="2026-11-21" onDownloadCsv={vi.fn()} />);
    expect(screen.getByText('Nenhuma venda no período')).toBeInTheDocument();
  });

  it('exporta a planilha completa com cabeçalho em português', () => {
    const download = vi.fn();
    mocks.exportEntries.mockImplementation((done: (rows: unknown[]) => void) => done(productRows));
    render(<PdvSalesPanel from="2026-11-01" to="2026-11-21" onDownloadCsv={download} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(download).toHaveBeenCalledWith('vendas-pdv-produtos-2026-11-01-2026-11-21.csv', [
      ['Produto', 'Detalhe', 'Vendas', 'Quantidade', 'Receita', 'Custo dos materiais', 'Margem', 'Participação'],
      ['Capacitor 35uF', 'SKU 123 · un', 8, 12, 500, 200, 300, 75.5],
    ]);
  });

  it('exporta Excel da dimensão ativa quando o menu global solicita', async () => {
    const downloadExcel = vi.fn().mockResolvedValue(undefined);
    mocks.exportEntries.mockImplementation((done: (rows: unknown[]) => void) => done(productRows));
    const { rerender } = render(
      <PdvSalesPanel
        from="2026-11-01"
        to="2026-11-21"
        excelRequestKey={0}
        onDownloadExcel={downloadExcel}
        onDownloadCsv={vi.fn()}
      />,
    );
    rerender(
      <PdvSalesPanel
        from="2026-11-01"
        to="2026-11-21"
        excelRequestKey={1}
        onDownloadExcel={downloadExcel}
        onDownloadCsv={vi.fn()}
      />,
    );
    await waitFor(() => expect(downloadExcel).toHaveBeenCalledWith(
      'vendas-pdv-produtos-2026-11-01-2026-11-21',
      'Produtos',
      [
        ['Produto', 'Detalhe', 'Vendas', 'Quantidade', 'Receita', 'Custo dos materiais', 'Margem', 'Participação'],
        ['Capacitor 35uF', 'SKU 123 · un', 8, 12, 500, 200, 300, 75.5],
      ],
    ));
  });
});
