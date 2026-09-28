import type { FinancialTransaction } from '@/types/database';

interface PatrimonyAccount {
  id: string;
  type: string;
}

interface PatrimonyCardBill {
  status: string;
  total_amount?: number;
  amount_paid?: number;
}

export interface OperationalPatrimonyInput {
  accounts: PatrimonyAccount[];
  balances: Record<string, number>;
  transactions: FinancialTransaction[];
  cardBills: PatrimonyCardBill[];
  stockSaleValue: number;
}

export interface OperationalPatrimony {
  cashBalance: number;
  bankBalance: number;
  receivables: number;
  payables: number;
  cardDebt: number;
  stockValue: number;
  assets: number;
  liabilities: number;
  result: number;
}

const toCents = (value: unknown): number =>
  Math.round((Number(value) || 0) * 100);

const fromCents = (value: number): number => value / 100;

function remainingTransactionCents(transaction: FinancialTransaction): number {
  const amount = toCents(transaction.amount);
  const received = transaction.transaction_type === 'entrada'
    ? Math.max(0, toCents(transaction.amount_received))
    : 0;
  return Math.max(0, amount - received);
}

/**
 * Foto patrimonial GERENCIAL da operação, no mesmo conceito do EcoSistema:
 * dinheiro + bancos + a receber + estoque a preço de venda − a pagar.
 *
 * Não é balanço contábil: não contempla imobilizado, depreciação, tributos a
 * recuperar, capital social ou demais contas patrimoniais.
 */
export function calculateOperationalPatrimony({
  accounts,
  balances,
  transactions,
  cardBills,
  stockSaleValue,
}: OperationalPatrimonyInput): OperationalPatrimony {
  let cashCents = 0;
  let bankCents = 0;
  for (const account of accounts) {
    const balance = toCents(balances[account.id]);
    if (account.type === 'caixa') cashCents += balance;
    if (account.type === 'banco') bankCents += balance;
  }

  let receivableCents = 0;
  let payableCents = 0;
  for (const transaction of transactions) {
    if (transaction.is_paid || transaction.cancelled_at || transaction.transfer_pair_id) continue;
    // A compra no cartão vira uma única dívida na fatura abaixo. Contá-la aqui
    // também duplicaria o passivo.
    if (transaction.transaction_type === 'saida' && transaction.credit_card_bill_date) continue;

    const remaining = remainingTransactionCents(transaction);
    if (transaction.transaction_type === 'entrada') receivableCents += remaining;
    else payableCents += remaining;
  }

  const cardDebtCents = cardBills.reduce((total, bill) => {
    if (bill.status === 'paid') return total;
    const remaining = Math.max(0, toCents(bill.total_amount) - toCents(bill.amount_paid));
    return total + remaining;
  }, 0);
  payableCents += cardDebtCents;

  const stockCents = Math.max(0, toCents(stockSaleValue));
  const bankAssetCents = Math.max(0, bankCents);
  const bankLiabilityCents = Math.abs(Math.min(0, bankCents));
  const assetsCents = cashCents + bankAssetCents + receivableCents + stockCents;
  const liabilitiesCents = payableCents + bankLiabilityCents;

  return {
    cashBalance: fromCents(cashCents),
    bankBalance: fromCents(bankCents),
    receivables: fromCents(receivableCents),
    payables: fromCents(payableCents),
    cardDebt: fromCents(cardDebtCents),
    stockValue: fromCents(stockCents),
    assets: fromCents(assetsCents),
    liabilities: fromCents(liabilitiesCents),
    result: fromCents(assetsCents - liabilitiesCents),
  };
}
