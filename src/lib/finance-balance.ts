/**
 * Cálculo de saldo corrente das Movimentações Financeiras.
 *
 * Vive num módulo PURO (sem React, sem Supabase) de propósito: é aritmética de
 * dinheiro do cliente, então precisa ser testável de forma isolada e provável
 * linha a linha contra o banco. `FinanceMovimentacoes` só consome.
 */

/** Forma mínima de uma transação pro cálculo de saldo. */
export interface BalanceWalkTxn {
  id: string;
  transaction_type: string;
  amount: number | string;
  transaction_date: string;
  is_paid?: boolean | null;
  account_id?: string | null;
  credit_card_bill_date?: string | null;
  created_at?: string | null;
}

export interface BalanceWalkResult {
  /** id da transação → saldo DEPOIS dela. */
  balanceById: Map<string, number>;
  /** dateKey 'YYYY-MM-DD' → saldo ao FIM daquele dia. */
  dayClosingBalance: Map<string, number>;
}

/**
 * Caminhada retroativa de saldo — serve tanto pro extrato de UMA conta
 * (`accountId` preenchido, âncora = saldo daquela conta) quanto pro
 * consolidado da Visão Geral (`accountId` undefined, âncora = soma dos saldos
 * de todas as contas caixa/banco). Devolve, na MESMA passada, o saldo APÓS
 * cada movimentação e o saldo de FECHAMENTO de cada dia.
 *
 * Universo de linhas que mexem em saldo de caixa/banco (corte ESTRUTURAL,
 * nunca por `category`, que é texto livre):
 *  - `is_paid === true` (só o realizado mexe em saldo);
 *  - `account_id` presente e pertencente a uma conta caixa/banco (cartão não
 *    tem "saldo de conta", tem fatura);
 *  - sem `credit_card_bill_date` (compra de cartão não é movimento de caixa;
 *    a perna que REALMENTE sai do caixa é o pagamento da fatura, que nasce com
 *    `credit_card_bill_date = NULL` de propósito).
 *
 * Ordenação: `transaction_date` desc, desempate `created_at` desc e, por
 * último, `id` desc. O desempate por `id` NÃO é decorativo: lançamentos
 * gerados na MESMA operação (ex.: o par CMV materiais + mão de obra que nasce
 * ao fechar um orçamento) gravam `created_at` idêntico até o microssegundo, e
 * sem um terceiro critério a ordem vira a que o Postgres devolveu naquela
 * chamada — o mesmo extrato mostraria saldos intermediários diferentes a cada
 * refresh. Com `id` a caminhada é determinística. Caminha-se
 * do presente pro passado porque a única âncora confiável é o saldo ATUAL
 * (derivado no banco); reconstruir pra frente a partir do saldo inicial
 * divergiria de qualquer linha que o app não enxergue.
 *
 * `dayClosingBalance`: percorrendo do mais recente pro mais antigo, o PRIMEIRO
 * item de cada dia encontrado é, cronologicamente, o ÚLTIMO movimento daquele
 * dia — exatamente o saldo de fechamento. Independe da ordem de exibição e da
 * paginação da tela.
 */
export function walkAccountBalance(
  txns: BalanceWalkTxn[],
  anchor: number,
  accountId: string | undefined,
  cashBankAccountIds: Set<string>,
): BalanceWalkResult {
  const source = txns
    .filter((t) => {
      if (!t.is_paid) return false;
      if (!t.account_id || !cashBankAccountIds.has(t.account_id)) return false;
      if (accountId && t.account_id !== accountId) return false;
      if (t.credit_card_bill_date) return false;
      return true;
    })
    .sort((a, b) => {
      const dateCmp = String(b.transaction_date).localeCompare(String(a.transaction_date));
      if (dateCmp !== 0) return dateCmp;
      const createdCmp = String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
      if (createdCmp !== 0) return createdCmp;
      // Último desempate: sem ele, linhas com `created_at` idêntico ficam na
      // ordem arbitrária em que o banco devolveu — saldo intermediário instável.
      return String(b.id).localeCompare(String(a.id));
    });

  const balanceById = new Map<string, number>();
  const dayClosingBalance = new Map<string, number>();
  let running = anchor;
  for (const t of source) {
    // Saldo APÓS esta movimentação = saldo corrente acumulado.
    balanceById.set(t.id, running);
    // Mesma data que a LINHA exibe (fatura quando é parcela de cartão), senão
    // o divisor de dia brigaria com a data mostrada logo abaixo dele.
    const dateKey = String(t.credit_card_bill_date ?? t.transaction_date);
    if (!dayClosingBalance.has(dateKey)) dayClosingBalance.set(dateKey, running);
    // Recua: o saldo ANTES dela (= saldo após a próxima mais antiga) desfaz o efeito.
    running -= t.transaction_type === 'entrada' ? Number(t.amount) : -Number(t.amount);
  }
  return { balanceById, dayClosingBalance };
}
