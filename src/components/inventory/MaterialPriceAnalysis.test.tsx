import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { MaterialPurchaseReportRow } from '@/hooks/useMaterialPurchaseReport';
import type { MaterialPriceChange } from '@/lib/material-purchase-report';
import { MaterialPriceAnalysis } from './MaterialPriceAnalysis';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useSignedUrl', () => ({ resolveStorageUrl: async (url: string) => url }));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div data-testid="responsive-chart">{children}</div>,
  AreaChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ children, data, onClick }: {
    children: ReactNode;
    data?: MaterialPriceChange[];
    onClick?: (state: { activePayload: Array<{ payload: MaterialPriceChange }> }) => void;
  }) => (
    <div data-testid="bar-chart">
      {data?.[0] && onClick && (
        <button
          type="button"
          onClick={() => onClick({ activePayload: [{ payload: data[0] }] })}
        >
          Selecionar barra do gráfico
        </button>
      )}
      {children}
    </div>
  ),
  CartesianGrid: () => null,
  Area: ({ connectNulls, type }: { connectNulls?: boolean; type?: string }) => (
    <div data-testid="price-area" data-connect-nulls={String(Boolean(connectNulls))} data-type={type} />
  ),
  Bar: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Cell: () => null,
  ReferenceLine: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

function row(): MaterialPurchaseReportRow {
  return {
    inventory_id: 'copper', sku: 'COB-01', material_name: 'Cobre', unit: 'kg',
    group_id: 'metals', group_name: 'Metais', group_color: '#333333', current_balance: 5,
    registered_sale_price: 160, purchased_quantity: 3, priced_quantity: 3, unpriced_quantity: 0,
    purchased_total: 330, average_paid: 110, purchase_count: 2, last_purchase_date: '2026-10-10',
    history: [
      {
        date: '2026-10-10', kind: 'compra', order_id: 'order-2', order_number: 2,
        supplier_id: 'supplier', supplier_name: 'Fornecedor', stock_id: 'stock', stock_name: 'Central',
        created_by: 'user', created_by_name: 'Ana', financial_transaction_id: 'transaction-2',
        payment_method: 'pix', is_paid: true, payment_status: 'pago', flow_type: 'compra_direta',
        unit: 'kg', quantity: 1, unit_price: 130, total: 130,
      },
      {
        date: '2026-10-01', kind: 'compra', order_id: 'order-1', order_number: 1,
        supplier_id: 'supplier', supplier_name: 'Fornecedor', stock_id: 'stock', stock_name: 'Central',
        created_by: 'user', created_by_name: 'Ana', financial_transaction_id: 'transaction-1',
        payment_method: 'pix', is_paid: true, payment_status: 'pago', flow_type: 'ordem_compra',
        unit: 'kg', quantity: 2, unit_price: 100, total: 200,
      },
    ],
  };
}

describe('MaterialPriceAnalysis', () => {
  it('starts with the general ranking and opens the selected material trend', () => {
    render(<MaterialPriceAnalysis rows={[row()]} startDate="2026-10-01" endDate="2026-10-10" />);

    expect(screen.getByText('Variações recentes de preço')).toBeInTheDocument();
    expect(screen.getByText('Maiores altas')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Cobre/ })[0]);

    expect(screen.getByRole('heading', { name: 'Cobre' })).toBeInTheDocument();
    expect(screen.getByText('Último preço')).toBeInTheDocument();
    expect(screen.getByText('R$ 130,00 / kg')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-chart')).toBeInTheDocument();
    expect(screen.getByTestId('price-area')).toHaveAttribute('data-connect-nulls', 'true');
    expect(screen.getByTestId('price-area')).toHaveAttribute('data-type', 'monotone');
  });

  it('opens a material from the overview chart and offers the purchased volume view', () => {
    render(<MaterialPriceAnalysis rows={[row()]} startDate="2026-10-01" endDate="2026-10-10" />);

    expect(screen.getByRole('img', { name: 'Comparação das maiores altas e quedas de preço por material' }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar barra do gráfico' }));

    expect(screen.getByRole('heading', { name: 'Cobre' })).toBeInTheDocument();
    const volumeTab = screen.getByRole('tab', { name: 'Volume comprado' });
    fireEvent.mouseDown(volumeTab, { button: 0, ctrlKey: false });
    expect(screen.getByRole('img', { name: 'Volume comprado de Cobre' })).toBeInTheDocument();
  });

  it('explains when there is not enough history for a ranking', () => {
    const singlePurchase = row();
    singlePurchase.history = singlePurchase.history.slice(0, 1);
    render(<MaterialPriceAnalysis rows={[singlePurchase]} />);
    expect(screen.getByText('Histórico ainda insuficiente')).toBeInTheDocument();
  });

  it('shows the material photo in the list when the catalog has one', async () => {
    render(
      <MaterialPriceAnalysis
        rows={[row()]}
        imageUrlsByInventoryId={new Map([['copper', 'https://example.com/copper.jpg']])}
      />,
    );

    expect(await screen.findByRole('img', { name: 'Foto de Cobre' }))
      .toHaveAttribute('src', 'https://example.com/copper.jpg');
  });
});
