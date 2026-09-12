// Vocabulário de `financial_accounts.type` visto em produção: `banco | caixa | cartao`.

export interface AccountLike {
  type: string;
  is_active?: boolean | null;
}

/**
 * Contas elegíveis para RECEBER dinheiro (conta bancária/caixa de destino de
 * uma receita). Cartão de crédito é conta de SAÍDA — é a fatura que a empresa
 * paga, nunca um lugar onde entra dinheiro de cliente. Se aparecer aqui, dá
 * pra escolher por engano e o saldo bancário fica como se o valor tivesse
 * caído dentro do cartão.
 */
export function filterAccountsForReceivable<T extends AccountLike>(
  accounts: T[] | null | undefined,
  options?: {
    /**
     * Quando `true`, mantém contas de cartão na lista. Use em formulário que
     * alterna entre receita e despesa: em DESPESA o cartão é destino legítimo
     * (é a fatura que a empresa paga), em RECEITA nunca é.
     */
    includeCard?: boolean;
  },
): T[] {
  const includeCard = options?.includeCard === true;
  return (accounts || []).filter(
    (a) => a.is_active !== false && (includeCard || a.type !== 'cartao'),
  );
}
