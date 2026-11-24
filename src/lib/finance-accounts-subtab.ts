import type { TransactionType } from '@/types/database';

export type FinanceAccountsSubTab = 'todas' | 'pagar' | 'receber';

/** A tela de contas abre no contexto que o nome promete: contas a pagar. */
export const DEFAULT_FINANCE_ACCOUNTS_SUBTAB: FinanceAccountsSubTab = 'pagar';

export function matchesFinanceAccountsSubTab(
  transactionType: TransactionType,
  subTab: FinanceAccountsSubTab,
): boolean {
  if (subTab === 'todas') return true;
  return subTab === 'pagar'
    ? transactionType === 'saida'
    : transactionType === 'entrada';
}
