export interface FinancialSummaryTransaction {
  transaction_type: string;
  amount: number;
  is_paid: boolean;
  transfer_pair_id: string | null;
  pdv_financial_role?: string | null;
  amount_received?: number | null;
}

/** A lista mostra raízes, mas o pagamento monetário de fornecedor é uma filha. */
export function selectFinancialOverviewSources<T extends {
  id: string; parent_transaction_id?: string | null; pdv_financial_role?: string | null;
}>(rows: readonly T[]): T[] {
  return rows.filter(row => !row.parent_transaction_id || row.pdv_financial_role === 'pdv_supplier_payment');
}

/** Principal de aquisição informa pendência; dinheiro pertence ao pagamento. */
export function summarizeFinancialTransactions(rows: readonly FinancialSummaryTransaction[]) {
  let entradas = 0, saidas = 0, pagar = 0, receber = 0;
  for (const row of rows) {
    if (row.transfer_pair_id) continue;
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
      if (row.is_paid) entradas += amount; else receber += amount;
    } else {
      if (row.is_paid) saidas += amount; else pagar += amount;
    }
  }
  return { totalEntradas: entradas / 100, totalSaidas: saidas / 100, saldo: (entradas - saidas) / 100,
    aPagar: pagar / 100, aReceber: receber / 100 };
}
