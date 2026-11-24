import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FinancialTransaction } from '@/types/database';
import { selectFinancialOverviewSources } from '@/lib/financial-summary';

vi.mock('@/hooks/useFinancialAccounts', () => ({ useFinancialAccounts: () => ({ accounts: [], balances: {}, cardBillTotals: {}, canManageBankAccounts: false }) }));
vi.mock('@/hooks/useCanManageFinanceTransactions', () => ({ useCanManageFinanceTransactions: () => false }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL', timezone: 'America/Sao_Paulo' }) }));
vi.mock('recharts', () => {
  const container = ({ children }: { children: ReactNode }) => <>{children}</>;
  const empty = () => null;
  return { ResponsiveContainer: container, PieChart: container, BarChart: container,
    ComposedChart: ({ data }: { data: unknown }) => <output data-testid="fluxo-realizado">{JSON.stringify(data)}</output>,
    AreaChart: ({ data }: { data: unknown }) => <output data-testid="evolucao">{JSON.stringify(data)}</output>,
    Area: empty, Bar: empty, CartesianGrid: empty, Cell: empty, Legend: empty, Line: empty,
    Pie: empty, ReferenceLine: empty, Tooltip: empty, XAxis: empty, YAxis: empty };
});
import { TooltipProvider } from '@/components/ui/tooltip';
import { FinanceOverview } from './FinanceOverview';

const tx = (id: string, role: string, amount: number): FinancialTransaction & { pdv_financial_role: string } => ({
  id, transaction_type: 'saida', amount, description: id, category: 'Materiais', transaction_date: '2026-11-01',
  paid_date: '2026-11-16', is_paid: true, pdv_financial_role: role,
  created_at: '2026-11-01T12:00:00Z', updated_at: '2026-11-16T12:00:00Z',
});
describe('gráficos realizados da visão geral', () => {
  it('compra20 quitada com crédito10 e dinheiro10 sai uma única vez na data do pagamento', () => {
    render(<TooltipProvider><FinanceOverview
      transactions={selectFinancialOverviewSources([tx('obrigacao', 'pdv_supplier_obligation', 20), { ...tx('pagamento', 'pdv_supplier_payment', 10), parent_transaction_id: 'obrigacao' }])}
      projectionTransactions={[]} dateRange={{ from: new Date(2026, 10, 1), to: new Date(2026, 10, 30) }}
      summary={{ totalEntradas: 0, totalSaidas: 10, saldo: -10, aPagar: 0, aReceber: 0 }}
      onNavigate={vi.fn()} onNewMovement={vi.fn()} onTransfer={vi.fn()} canTransfer={false}
    /></TooltipProvider>);
    const flow = JSON.parse(screen.getByTestId('fluxo-realizado').textContent!) as Array<{ sortKey: string; saidas: number; resultado: number }>;
    expect(flow.reduce((sum, period) => sum + period.saidas, 0)).toBe(10);
    expect(flow.find(period => period.saidas > 0)).toMatchObject({ sortKey: '2026-11-16', resultado: -10 });
    const evolution = screen.getAllByTestId('evolucao').map(element => JSON.parse(element.textContent!) as Array<{ date: string; saldo: number }>);
    expect(evolution.some(series => series.length === 1 && series[0].date === '2026-11-16' && series[0].saldo === -10)).toBe(true);
  });
});
