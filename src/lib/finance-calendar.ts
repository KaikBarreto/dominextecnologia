import { endOfMonth, endOfWeek, isBefore, startOfMonth, startOfWeek } from 'date-fns';
import type { TransactionType } from '@/types/database';
import {
  matchesFinanceAccountsSubTab,
  type FinanceAccountsSubTab,
} from '@/lib/finance-accounts-subtab';
import { filterByCostCenters } from '@/lib/cost-center-breakdown';

export type FinanceCalendarStatusFilter = 'pendentes' | 'vencidas' | 'pagas' | 'todas';

export interface FinanceCalendarTransactionSource {
  transaction_type: TransactionType;
  credit_card_bill_date?: string | null;
  is_paid: boolean;
  due_date?: string | null;
  category?: string | null;
  cost_center_id?: string | null;
}

const parseCalendarDate = (date: string) => new Date(`${date}T12:00:00`);

interface SelectFinanceCalendarTransactionsOptions<T extends FinanceCalendarTransactionSource> {
  periodTransactions: readonly T[];
  allTransactions?: readonly T[];
  subTab: FinanceAccountsSubTab;
  status: FinanceCalendarStatusFilter;
  categoryFilter: readonly string[];
  costCenterFilter: readonly string[];
  today: Date;
  searchActive: boolean;
  matchesSearch: (transaction: T) => boolean;
}

/**
 * O calendário navega por meses e, por isso, nunca pode herdar o recorte de
 * período da lista. Os demais filtros da tela continuam válidos.
 */
export function selectFinanceCalendarTransactions<T extends FinanceCalendarTransactionSource>({
  periodTransactions,
  allTransactions,
  subTab,
  status,
  categoryFilter,
  costCenterFilter,
  today,
  searchActive,
  matchesSearch,
}: SelectFinanceCalendarTransactionsOptions<T>): T[] {
  const source = allTransactions ?? periodTransactions;
  const visibleByDirection = source.filter((transaction) => {
    if (!matchesFinanceAccountsSubTab(transaction.transaction_type, subTab)) return false;
    // As despesas de cartão são representadas pela fatura agregada.
    return !(transaction.transaction_type === 'saida' && transaction.credit_card_bill_date);
  });

  if (searchActive) return visibleByDirection.filter(matchesSearch);

  const byStatusAndCategory = visibleByDirection.filter((transaction) => {
    if (status === 'pagas' && !transaction.is_paid) return false;
    if (status === 'pendentes' && transaction.is_paid) return false;
    if (status === 'vencidas') {
      if (
        transaction.is_paid
        || !transaction.due_date
        || !isBefore(parseCalendarDate(transaction.due_date), today)
      ) return false;
    }
    return categoryFilter.length === 0 || categoryFilter.includes(transaction.category ?? '');
  });

  return filterByCostCenters(byStatusAndCategory, [...costCenterFilter]);
}

export function buildFinanceCalendarDays(month: Date): Date[] {
  const first = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const last = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let cursor = first; cursor <= last; cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)) {
    days.push(cursor);
  }
  return days;
}
