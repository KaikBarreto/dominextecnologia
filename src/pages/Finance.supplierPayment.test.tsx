import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const principal = { id: 'principal', transaction_type: 'saida', amount: 20, amount_received: 20,
    pdv_financial_role: 'pdv_supplier_obligation', is_paid: true, transaction_date: '2026-11-16', paid_date: '2026-11-16' };
  return { principal, payment: { ...principal, id: 'payment', amount: 10, parent_transaction_id: 'principal', pdv_financial_role: 'pdv_supplier_payment' } };
});
vi.mock('@/hooks/useFinancial', () => ({ useFinancial: () => ({
  transactions: [state.principal], transactionsWithChildren: [state.principal, state.payment], isLoading: false,
  createTransaction: {}, updateTransaction: {}, deleteTransaction: {}, markAsPaid: {},
}) }));
vi.mock('@/hooks/useFinancialAccounts', () => ({ useFinancialAccounts: () => ({ accounts: [], transfer: {}, canManageBankAccounts: false }) }));
vi.mock('@/hooks/useCompanyModules', () => ({ useCompanyModules: () => ({ hasModule: () => false }) }));
vi.mock('@/hooks/useCanManageFinanceSettings', () => ({ useCanManageFinanceSettings: () => false }));
vi.mock('@/hooks/useCanManageFinanceTransactions', () => ({ useCanManageFinanceTransactions: () => false }));
vi.mock('@/hooks/useTransactionEditSubmit', () => ({ useTransactionEditSubmit: () => vi.fn() }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('@/components/ui/DateRangeFilter', () => ({ DateRangeFilter: () => null, useDateRangeFilter: () => ({
  preset: 'custom', range: { from: new Date(2026, 10, 1), to: new Date(2026, 10, 30) }, setPreset: vi.fn(), setRange: vi.fn(),
}) }));
vi.mock('@/components/financial/FinanceRelatorio', () => ({ FinanceRelatorio: ({ summary, overviewTransactions }: { summary: unknown; overviewTransactions: { id: string }[] }) =>
  <output data-testid="resumo-real">{JSON.stringify({ summary, ids: overviewTransactions.map(row => row.id) })}</output> }));
vi.mock('@/components/financial/FinanceMovimentacoes', () => ({ FinanceMovimentacoes: () => null }));
vi.mock('@/components/financial/FinanceContas', () => ({ FinanceContas: () => null }));
vi.mock('@/components/financial/TransactionFormDialog', () => ({ TransactionFormDialog: () => null }));
vi.mock('@/components/financial/NewMovementDialog', () => ({ NewMovementDialog: () => null }));
vi.mock('@/components/financial/TransferFormDialog', () => ({ TransferFormDialog: () => null }));
import Finance from './Finance';

describe('origem dos valores da visão geral financeira', () => {
  it('lista de raízes não esconde o pagamento filho na saída nem no gráfico', () => {
    render(<MemoryRouter initialEntries={['/financeiro/relatorio']}><Finance /></MemoryRouter>);
    const data = JSON.parse(screen.getByTestId('resumo-real').textContent!);
    expect(data.ids).toEqual(['principal', 'payment']);
    expect(data.summary).toMatchObject({ totalSaidas: 10, saldo: -10, aPagar: 0 });
  });
});
