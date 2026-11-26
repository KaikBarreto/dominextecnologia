import { isReceiptFee } from '@/lib/financial-transaction-display';

export interface FinancialSummaryTransaction {
  transaction_type: string;
  amount: number;
  is_paid: boolean;
  transfer_pair_id: string | null;
  pdv_financial_role?: string | null;
  amount_received?: number | null;
  parent_transaction_id?: string | null;
  category?: string | null;
  cancelled_at?: string | null;
}

/** Saldo contratual em aberto, em centavos; recebimentos não diminuem o valor original. */
export function financialOutstandingAmount(row: {
  amount: number | string; is_paid?: boolean; transaction_type: string;
  amount_received?: number | string | null; pdv_financial_role?: string | null;
}) {
  if (row.is_paid) return 0;
  const total = Math.round(Number(row.amount) * 100);
  const received = row.transaction_type === 'entrada' || row.pdv_financial_role === 'pdv_supplier_obligation'
    ? Math.round(Number(row.amount_received ?? 0) * 100) : 0;
  return Math.max(0, total - received) / 100;
}

/** Dinheiro realizado pertence às baixas filhas quando a dívida foi recebida em partes. */
export function selectFinancialCashSources<T extends {
  transaction_type: string; amount_received?: number | null; parent_transaction_id?: string | null;
  pdv_financial_role?: string | null; cancelled_at?: string | null;
}>(rows: readonly T[]): T[] {
  return rows.filter(row => !row.cancelled_at && row.pdv_financial_role !== 'pdv_supplier_obligation'
    && !(row.transaction_type === 'entrada' && !row.parent_transaction_id && !row.pdv_financial_role && Number(row.amount_received ?? 0) > 0));
}

/** A lista mostra raízes, mas o pagamento monetário de fornecedor é uma filha. */
export function selectFinancialOverviewSources<T extends {
  id: string; parent_transaction_id?: string | null; pdv_financial_role?: string | null; category?: string | null; transaction_type?: string; description?: string | null; is_paid?: boolean;
}>(rows: readonly T[]): T[] {
  return rows.filter(row => !row.parent_transaction_id || row.pdv_financial_role === 'pdv_supplier_payment'
    || (row.transaction_type === 'entrada' && row.category === 'Recebimento parcial')
    || isReceiptFee({ ...row, transaction_type: row.transaction_type ?? '' }));
}

/** Principal de aquisição informa pendência; dinheiro pertence ao pagamento. */
export function summarizeFinancialTransactions(rows: readonly FinancialSummaryTransaction[]) {
  let entradas = 0, saidas = 0, pagar = 0, receber = 0;
  for (const row of rows) {
    if (row.transfer_pair_id || row.cancelled_at) continue;
    if (!Number.isFinite(row.amount)) throw new Error('Não foi possível conferir os valores do resumo financeiro.');
    const amount = Math.round(row.amount * 100);
    if (row.pdv_financial_role === 'pdv_supplier_obligation') {
      if (row.transaction_type !== 'saida' || !Number.isFinite(row.amount_received)
        || row.amount_received! < 0 || row.amount_received! > row.amount) {
        throw new Error('Não foi possível conferir o saldo em aberto das compras.');
      }
      pagar += Math.max(0, amount - Math.round(row.amount_received! * 100));
      continue;
    }
    if (row.transaction_type === 'entrada') {
      if (row.is_paid) {
        if (selectFinancialCashSources([row]).length) entradas += amount;
      } else receber += Math.round(financialOutstandingAmount(row) * 100);
    } else {
      if (row.is_paid) saidas += amount; else pagar += amount;
    }
  }
  return { totalEntradas: entradas / 100, totalSaidas: saidas / 100, saldo: (entradas - saidas) / 100,
    aPagar: pagar / 100, aReceber: receber / 100 };
}
