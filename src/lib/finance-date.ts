/**
 * Utilitários de data para o módulo Financeiro.
 *
 * Por que existe:
 * - Despesas de cartão de crédito têm uma sutileza: a "data da parcela"
 *   (`due_date`/`transaction_date` da linha individual) NÃO é a data
 *   em que o usuário precisa pagar. O que ele paga é a FATURA INTEIRA,
 *   que vence numa única data por mês. Filtrar telas como "Movimentações"
 *   ou "Contas a Pagar" pelo `due_date` da parcela faz com que parcelas
 *   apareçam no mês errado (ex: parcela `1/N` da compra de abril aparece
 *   em abril, mas ela só vai pesar no bolso do cliente em maio — quando
 *   vence a fatura).
 *
 * Solução: para qualquer transação de cartão (`credit_card_bill_date`
 * preenchido), preferimos a data da fatura ao filtrar/agrupar por período.
 */

type TxnLike = {
  credit_card_bill_date?: string | null;
  due_date?: string | null;
  transaction_date?: string | null;
  is_paid?: boolean;
};

/**
 * Escopo do filtro temporal:
 * - 'pagar': telas de Contas a Pagar/Receber. Fallback é `due_date` (vencimento).
 * - 'caixa': telas de fluxo (Movimentações, Visão Geral, DRE). Fallback é `transaction_date`.
 * - 'caixa-misto': como 'caixa', mas para itens NÃO pagos prefere `due_date` antes do
 *   `transaction_date`. Usado pelo resumo da Visão Geral, onde itens não pagos
 *   compõem "a pagar/a receber" — alinhado ao que o cliente espera ver naquele mês.
 */
export type FinanceDateScope = 'pagar' | 'caixa' | 'caixa-misto';

/**
 * Retorna a "data efetiva" para fins de filtro/agrupamento por período.
 * Devolve uma string `YYYY-MM-DD` (ou ISO completo, herdando o formato salvo)
 * ou `null` se não houver data utilizável.
 */
export function getEffectiveTransactionDate(
  txn: TxnLike,
  scope: FinanceDateScope = 'caixa'
): string | null {
  if (txn.credit_card_bill_date) return txn.credit_card_bill_date;

  if (scope === 'pagar') {
    return txn.due_date ?? txn.transaction_date ?? null;
  }

  if (scope === 'caixa-misto') {
    // Itens pagos: data real da movimentação. Itens em aberto: vencimento esperado.
    const primary = txn.is_paid ? txn.transaction_date : txn.due_date;
    return primary ?? txn.transaction_date ?? null;
  }

  return txn.transaction_date ?? null;
}

/**
 * Parseia uma string de data como horário local (meio-dia) pra evitar
 * o shift de fuso quando recebe `YYYY-MM-DD`. Strings com hora completa
 * passam pelo `Date` direto.
 */
function parseDateForCompare(raw: string): Date {
  return raw.length === 10 ? new Date(raw + 'T12:00:00') : new Date(raw);
}

/**
 * Compara a data efetiva da transação contra um intervalo `[from, to]`.
 * Retorna `true` se a transação cai dentro do range (ou se o range é vazio).
 *
 * Use isso em vez de `filterByDate` genérico sempre que o filtro for sobre
 * transações financeiras — assim cartões respeitam a fatura.
 */
export function isTransactionInDateRange(
  txn: TxnLike,
  range: { from?: Date; to?: Date },
  scope: FinanceDateScope = 'caixa'
): boolean {
  if (!range.from && !range.to) return true;
  const raw = getEffectiveTransactionDate(txn, scope);
  if (!raw) return false;
  const d = parseDateForCompare(String(raw));
  if (isNaN(d.getTime())) return false;
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}
