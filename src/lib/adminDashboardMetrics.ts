export interface AdminDashboardCompanyLike {
  created_at?: string | null;
  subscription_status?: string | null;
}

export interface AdminDashboardTransactionLike {
  amount?: number | string | null;
  category?: string | null;
  description?: string | null;
  transaction_date?: string | null;
  type?: string | null;
}

export interface AdminDashboardPeriodMetrics {
  income: number;
  salesCount: number;
  renewalCount: number;
}

function normalized(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('pt-BR');
}

export function isAdminDashboardDateInRange(
  value: string | null | undefined,
  startDate: Date,
  endDate: Date,
): boolean {
  if (!value) return false;
  // Colunas DATE chegam como YYYY-MM-DD. Meio-dia local evita deslocar o
  // lançamento para o dia anterior quando o navegador está fora de UTC.
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= startDate && date <= endDate;
}

/**
 * Métricas do período com a mesma fonte usada no financeiro admin.
 * Venda aceita o código legado `sale` e o atual `first_sale`, como na EcoSistema.
 */
export function calculateAdminDashboardPeriodMetrics(
  transactions: AdminDashboardTransactionLike[],
  startDate: Date,
  endDate: Date,
): AdminDashboardPeriodMetrics {
  return transactions.reduce<AdminDashboardPeriodMetrics>(
    (totals, transaction) => {
      if (
        normalized(transaction.type) !== 'income' ||
        !isAdminDashboardDateInRange(transaction.transaction_date, startDate, endDate)
      ) {
        return totals;
      }

      totals.income += Number(transaction.amount) || 0;
      const category = normalized(transaction.category);

      if (category === 'sale' || category === 'first_sale') {
        totals.salesCount += 1;
      }

      if (category === 'renewal' || category === 'renovacao') {
        totals.renewalCount += 1;
      } else if (category === 'receita_sistema_antigo') {
        const bundledRenewals = transaction.description?.match(/\((\d+)\s*renovaç/i)?.[1];
        totals.renewalCount += bundledRenewals ? Number.parseInt(bundledRenewals, 10) : 1;
      }

      return totals;
    },
    { income: 0, salesCount: 0, renewalCount: 0 },
  );
}

export function filterAdminDashboardCompaniesByCreatedAt<T extends AdminDashboardCompanyLike>(
  companies: T[],
  startDate: Date,
  endDate: Date,
): T[] {
  return companies.filter((company) =>
    isAdminDashboardDateInRange(company.created_at, startDate, endDate),
  );
}
