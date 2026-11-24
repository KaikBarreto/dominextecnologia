export const FINANCE_PDV_COVERAGE_NOTE = 'As vendas da loja ainda precisam ser conciliadas com compras, materiais usados em serviços e pagamentos parciais. Confira os relatórios do PDV e os lançamentos antes de tratar estes totais como resultado consolidado da empresa.';

export function hasPdvFinancialSources(transactions: ReadonlyArray<{ id: string; origin?: string | null; pdv_financial_role?: string | null }>) {
  return transactions.some(transaction => transaction.origin === 'pdv' || !!transaction.pdv_financial_role);
}
