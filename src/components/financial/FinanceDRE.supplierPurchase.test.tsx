import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FinancialTransaction } from '@/types/database';
const state = vi.hoisted(() => ({ categories: [{ id: 'materials', name: 'Materiais', type: 'saida', dre_group: 'opex', dre_group_id: null, color: '#000000', icon: 'Package' }], groups: [], centers: [] }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { company_id: 'fixture' } }) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL', timezone: 'America/Sao_Paulo' }) }));
vi.mock('@/hooks/useCompanySettings', () => ({ useCompanySettings: () => ({ settings: { name: 'Fixture' } }) }));
vi.mock('@/hooks/useFinancialCategories', () => ({ useFinancialCategories: () => ({ categories: state.categories }) }));
vi.mock('@/hooks/useDreGroups', () => ({ useDreGroups: () => ({ dreGroups: state.groups }) }));
vi.mock('@/hooks/useCanManageFinanceSettings', () => ({ useCanManageFinanceSettings: () => false }));
vi.mock('@/hooks/useDreLayoutProfiles', () => ({ useDreLayoutProfiles: () => ({ configuration: undefined, isLoading: false }), mapDreLayoutBundle: () => null }));
vi.mock('@/hooks/useCostCenters', () => ({ useCostCenters: () => ({ costCenters: state.centers }) }));
vi.mock('@/hooks/useOperationalPatrimony', () => ({ useOperationalPatrimony: () => ({ patrimony: { result: 0 }, isLoading: false }) }));
vi.mock('@/hooks/useDreSubscriptionProjections', () => ({ useDreSubscriptionProjections: () => ({ data: undefined }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('./FinancePdvReconciliation', () => ({ FinancePdvReconciliation: () => null }));
vi.mock('./DreGroupsManagerDialog', () => ({ DreGroupsManagerDialog: () => null }));
vi.mock('./DreComparisonDialog', () => ({ DreComparisonDialog: () => null }));
vi.mock('@/components/financial-report/DreCustomStatementView', () => ({ DreCustomStatementView: () => null }));
vi.mock('./DreHierarchyTable', () => ({ DreHierarchyTable: ({ sections }: { sections: Array<{ code: string; current: number }> }) => <output data-testid="opex">{sections.find(item => item.code === '06')?.current}</output> }));
import { FinanceDRE } from './FinanceDRE';
const tx = (id: string, role: string, amount: number, isPaid = true): FinancialTransaction => ({
  id, company_id: 'fixture', transaction_type: 'saida', description: id, category: 'Materiais', amount, is_paid: isPaid,
  transaction_date: '2026-01-10', paid_date: isPaid ? '2026-01-10' : null,
  amount_received: role === 'pdv_supplier_obligation' ? (isPaid ? 100 : 60) : 0,
  parent_transaction_id: role === 'pdv_supplier_payment' ? 'principal' : null, pdv_financial_role: role,
} as unknown as FinancialTransaction);
describe('DRE real por regime na aquisição com crédito do fornecedor', () => {
  it('competência conta 100 uma vez, caixa conta 60 e compensar crédito não apaga o pagamento', () => {
    const child = tx('payment', 'pdv_supplier_payment', 60);
    const view = render(<FinanceDRE transactions={[tx('principal', 'pdv_supplier_obligation', 100), child]} />);
    expect(screen.getByTestId('opex')).toHaveTextContent('-100');
    fireEvent.click(screen.getByRole('tab', { name: 'Regime de Caixa' }));
    expect(screen.getByTestId('opex')).toHaveTextContent('-60');
    view.rerender(<FinanceDRE transactions={[tx('principal', 'pdv_supplier_obligation', 100, false), child]} />);
    expect(screen.getByTestId('opex')).toHaveTextContent('-60');
    fireEvent.click(screen.getByRole('tab', { name: 'Regime de Competência' }));
    expect(screen.getByTestId('opex')).toHaveTextContent('-100');
  });
});
