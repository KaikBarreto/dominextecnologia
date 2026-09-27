/** Forma mínima de uma movimentação para decidir sua visibilidade na lista. */
export interface MovementVisibilityTxn {
  account_id?: string | null;
  credit_card_bill_date?: string | null;
}

/**
 * Compras no cartão ficam escondidas da Visão Geral quando a preferência do
 * usuário está desligada, pois não são movimento de caixa. A exceção é um
 * filtro explícito pela própria conta do cartão: nesse contexto o usuário
 * pediu justamente o extrato daquela conta, então esconder as linhas faria o
 * filtro devolver uma lista vazia.
 *
 * O corte continua estrutural (`credit_card_bill_date`), sem inferir cartão
 * por nome, categoria ou objeto embutido na transação.
 */
export function filterFinancialMovementVisibility<T extends MovementVisibilityTxn>(
  transactions: readonly T[],
  hideCardPurchasesUnlessAccountFiltered: boolean,
  accountFilter: readonly string[],
): T[] {
  if (!hideCardPurchasesUnlessAccountFiltered) return [...transactions];

  return transactions.filter((transaction) => {
    if (!transaction.credit_card_bill_date) return true;
    return !!transaction.account_id && accountFilter.includes(transaction.account_id);
  });
}
