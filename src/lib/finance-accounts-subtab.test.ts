import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FINANCE_ACCOUNTS_SUBTAB,
  matchesFinanceAccountsSubTab,
} from './finance-accounts-subtab';

describe('finance accounts subtab', () => {
  it('abre em contas a pagar', () => {
    expect(DEFAULT_FINANCE_ACCOUNTS_SUBTAB).toBe('pagar');
  });

  it('não deixa receitas entrarem no escopo de contas a pagar', () => {
    expect(matchesFinanceAccountsSubTab('entrada', 'pagar')).toBe(false);
    expect(matchesFinanceAccountsSubTab('saida', 'pagar')).toBe(true);
  });

  it('mantém a visão combinada explicitamente selecionada', () => {
    expect(matchesFinanceAccountsSubTab('entrada', 'todas')).toBe(true);
    expect(matchesFinanceAccountsSubTab('saida', 'todas')).toBe(true);
  });
});
