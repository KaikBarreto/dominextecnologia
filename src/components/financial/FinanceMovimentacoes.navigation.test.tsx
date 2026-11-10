import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  accounts: [] as Array<Record<string, unknown>>,
  accountsLoading: false,
  isMobile: false,
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mocks.isMobile,
  useIsCompact: () => false,
}));
vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL' }),
}));
vi.mock('@/hooks/useFinancialAccounts', () => ({
  useFinancialAccounts: () => ({
    accounts: mocks.accounts,
    balances: Object.fromEntries(mocks.accounts.map((account) => [account.id, 0])),
    cardBillTotals: {},
    isLoading: mocks.accountsLoading,
    canManageBankAccounts: true,
    deleteAccount: { mutateAsync: vi.fn() },
    transfer: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/hooks/useRecalculateBills', () => ({
  useRecalculateBills: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    includeCardPurchasesInMovements: false,
    setIncludeCardPurchasesInMovements: vi.fn(),
  }),
}));

vi.mock('./TransactionListPanel', () => ({
  TransactionListPanel: ({ title }: { title: string }) => <div data-testid="transaction-list">{title}</div>,
}));
vi.mock('./AccountFormDialog', () => ({
  AccountFormDialog: ({ open, defaultType }: { open: boolean; defaultType: string }) => open ? (
    <div role="dialog" aria-label={defaultType === 'cartao' ? 'Cadastro de cartão' : 'Cadastro de conta'}>
      {defaultType}
    </div>
  ) : null,
}));
vi.mock('./AdjustBalanceDialog', () => ({ AdjustBalanceDialog: () => null }));
vi.mock('./CreditCardBillPanel', () => ({ CreditCardBillPanel: () => null }));
vi.mock('./TransferFormDialog', () => ({ TransferFormDialog: () => null }));
vi.mock('./ImportSpreadsheetDialog', () => ({ ImportSpreadsheetDialog: () => null }));
vi.mock('./BankInstitutionCombobox', () => ({ BankLogo: () => null }));
vi.mock('@/components/reconciliation/ReconciliationTab', () => ({
  ReconciliationTab: ({ onBack, backLabel }: { onBack?: () => void; backLabel?: string }) => (
    <div>
      <h3>Fluxo de conciliação OFX</h3>
      <button type="button" onClick={onBack}>{backLabel}</button>
    </div>
  ),
}));

import { FinanceMovimentacoes } from './FinanceMovimentacoes';

function renderMovements() {
  return render(
    <FinanceMovimentacoes
      transactions={[]}
      allTransactions={[]}
      isLoading={false}
      onNew={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

describe('FinanceMovimentacoes — ações de contas e conciliação', () => {
  beforeEach(() => {
    mocks.accounts = [];
    mocks.accountsLoading = false;
    mocks.isMobile = false;
  });

  it('abre o cadastro de uma nova conta bancária pela toolbar da lista', () => {
    renderMovements();

    const action = screen.getByRole('button', { name: 'Nova conta bancária' });
    expect(action).toHaveClass('grid-cols-[1rem_0fr]');
    expect(screen.getByLabelText('0 contas')).toBeInTheDocument();
    fireEvent.click(action);

    expect(screen.getByRole('dialog', { name: 'Cadastro de conta' })).toHaveTextContent('banco');
  });

  it('abre o cadastro de um novo cartão de crédito pela toolbar da lista', () => {
    renderMovements();

    const action = screen.getByRole('button', { name: 'Novo cartão de crédito' });
    expect(action).toHaveClass('grid-cols-[1rem_0fr]');
    expect(screen.getByLabelText('0 cartões')).toBeInTheDocument();
    fireEvent.click(action);

    expect(screen.getByRole('dialog', { name: 'Cadastro de cartão' })).toHaveTextContent('cartao');
  });

  it('abre a conciliação por ação principal e retorna à visão geral', () => {
    renderMovements();

    expect(screen.queryByRole('button', { name: 'Conciliação' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Conciliação bancária (OFX)' }));

    expect(screen.getByText('Fluxo de conciliação OFX')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para Visão geral' }));

    expect(screen.getByTestId('transaction-list')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conciliação bancária (OFX)' })).toBeInTheDocument();
  });

  it('mantém a entrada e o retorno da conciliação acessíveis no mobile', () => {
    mocks.isMobile = true;
    renderMovements();

    fireEvent.click(screen.getByRole('button', { name: 'Conciliação bancária (OFX)' }));

    expect(screen.getByText('Fluxo de conciliação OFX')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para Visão geral' }));
    expect(screen.getByTestId('transaction-list')).toBeInTheDocument();
  });

  it('não apresenta vazio durante o carregamento da lista de contas', () => {
    mocks.accountsLoading = true;
    renderMovements();

    expect(screen.getByRole('status', { name: 'Carregando contas e cartões' })).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma conta encontrada.')).not.toBeInTheDocument();
  });

  it('retorna da conciliação para a conta previamente selecionada', () => {
    mocks.accounts = [{
      id: 'account-1',
      name: 'Banco Dominex',
      type: 'banco',
      is_active: true,
      initial_balance: 0,
      color: '#0f172a',
    }];
    renderMovements();

    fireEvent.click(screen.getByRole('button', { name: /Banco Dominex Saldo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Conciliação bancária (OFX)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para Banco Dominex' }));

    expect(screen.getByTestId('transaction-list')).toHaveTextContent('Banco Dominex');
  });
});
