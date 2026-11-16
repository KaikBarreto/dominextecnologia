import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryAbcSourceRow } from '@/lib/inventory-abc';

const state = vi.hoisted(() => ({ mobile: false, loading: false, error: null as Error | null, rows: [] as InventoryAbcSourceRow[] }));
vi.mock('@/hooks/useInventoryAbcReport', () => ({ useInventoryAbcReport: () => ({ data: state.rows, isLoading: state.loading, error: state.error, refetch: vi.fn() }) }));
vi.mock('@/hooks/useStocks', () => ({ useStocks: () => ({ stocks: [] }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => state.mobile }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL', timezone: 'America/Sao_Paulo' }) }));
vi.mock('@/components/inventory/InventoryItemThumbnail', () => ({ InventoryItemThumbnail: () => null }));
vi.mock('@/components/ui/DateRangeFilter', () => ({ DateRangeFilter: () => null, useDateRangeFilter: () => ({ range: {}, preset: 'all' }) }));
import { InventoryAbcReport } from './InventoryAbcReport';

const row = (name: string, revenue: number): InventoryAbcSourceRow => ({
  inventory_id: name, material_name: name, sku: name, unit: 'un', image_url: '', group_id: '', group_name: '', group_color: '',
  current_balance: 1, minimum_balance: 0, unit_cost: 10, sale_price: 20, stock_value: 10, usage_quantity: 0, usage_value: 0,
  pdv_quantity: Math.sign(revenue), pdv_revenue: revenue, pdv_cost: 0, pdv_margin: revenue,
});
beforeEach(() => { state.mobile = false; state.loading = false; state.error = null; state.rows = [row('Mais vendido', 100), row('Outro produto', 25), row('Devolução de período anterior', -25)]; });

describe('Curva ABC com devoluções', () => {
  it.each([false, true])('mantém negativo visível com filtro padrão e explica participação (mobile=%s)', mobile => {
    state.mobile = mobile;
    render(<InventoryAbcReport />);
    fireEvent.click(screen.getByRole('radio', { name: 'Vendas PDV' }));
    expect(screen.getByText('Devolução de período anterior')).toBeVisible();
    expect(screen.getAllByText(/-R\$\s*25,00/).length).toBeGreaterThan(0);
    expect(screen.getByText('A participação das classes usa somente valores positivos. Devoluções e ajustes negativos continuam no total líquido e na lista.')).toBeVisible();
    expect(screen.getAllByText('80%').length).toBeGreaterThan(0);
    expect(screen.getByText('3 materiais')).toBeVisible();
  });
  it.each(['carregando', 'erro'] as const)('não anuncia capital ou receita zero enquanto %s', phase => {
    state.rows = []; state.loading = phase === 'carregando'; state.error = phase === 'erro' ? new Error('Falha de rede') : null;
    render(<InventoryAbcReport />);
    expect(screen.queryByText(/R\$\s*0,00/)).not.toBeInTheDocument();
    if (phase === 'erro') expect(screen.getByText(/Não foi possível carregar a Curva ABC/)).toBeVisible();
  });
});
