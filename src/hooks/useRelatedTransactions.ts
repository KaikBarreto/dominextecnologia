import { supabase } from '@/integrations/supabase/client';
import type { FinancialTransaction } from '@/types/database';

/**
 * Find all related transactions for a given transaction id.
 * Related = all transactions that share the same "root" (parent_transaction_id chain).
 * Also returns the linked quote (if the root is referenced by a quote).
 */
export async function findRelatedTransactions(transactionId: string): Promise<{
  root: FinancialTransaction | null;
  related: FinancialTransaction[]; // excludes the requested transaction itself
  linkedQuote: { id: string; quote_number: number } | null;
}> {
  // 1. fetch the transaction
  const { data: txn } = await supabase
    .from('financial_transactions')
    .select('*')
    .eq('id', transactionId)
    .maybeSingle();

  if (!txn) return { root: null, related: [], linkedQuote: null };

  // 2. find the root: walk up parent_transaction_id (max 5 levels)
  let rootId = (txn as any).parent_transaction_id || txn.id;
  let safetyCounter = 5;
  while (safetyCounter > 0) {
    const { data: parent } = await supabase
      .from('financial_transactions')
      .select('id, parent_transaction_id')
      .eq('id', rootId)
      .maybeSingle();
    if (!parent || !(parent as any).parent_transaction_id) break;
    rootId = (parent as any).parent_transaction_id;
    safetyCounter--;
  }

  // 3. fetch root + all children of root
  const { data: rootTxn } = await supabase
    .from('financial_transactions')
    .select('*')
    .eq('id', rootId)
    .maybeSingle();

  const { data: children } = await supabase
    .from('financial_transactions')
    .select('*')
    .eq('parent_transaction_id', rootId);

  const all: FinancialTransaction[] = [];
  if (rootTxn) all.push(rootTxn as FinancialTransaction);
  (children || []).forEach((c) => all.push(c as FinancialTransaction));

  // 3b. installment siblings — transactions that share the same installment_group_id
  const installmentGroupId = (txn as any).installment_group_id;
  if (installmentGroupId) {
    const { data: siblings } = await supabase
      .from('financial_transactions')
      .select('*')
      .eq('installment_group_id', installmentGroupId);
    (siblings || []).forEach((s) => {
      if (!all.find((a) => a.id === s.id)) all.push(s as FinancialTransaction);
    });
  }

  // 4. linked quote
  let linkedQuote: { id: string; quote_number: number } | null = null;
  const { data: quote } = await supabase
    .from('quotes')
    .select('id, quote_number')
    .eq('financial_transaction_id', rootId)
    .maybeSingle();
  if (quote) linkedQuote = quote as any;

  // exclude the requested txn from "related" list
  const related = all.filter((t) => t.id !== transactionId);

  return {
    root: rootTxn as FinancialTransaction | null,
    related,
    linkedQuote,
  };
}

/**
 * Pagamento de fatura de cartão é um PAR de lançamentos: a saída na conta que
 * pagou e a entrada no cartão (a perna que devolve o limite). Excluir só um lado
 * deixa o outro órfão, a fatura presa em `paid` e o limite liberado indevidamente.
 *
 * A tela de Movimentações tem DOIS caminhos de exclusão e os dois têm que
 * respeitar o par:
 *   1. exclusão de UMA linha (menu de contexto) → `deleteTransactionCascade` (aqui);
 *   2. exclusão em LOTE dos selecionados → `useFinancial.deleteTransaction`.
 * O caminho (2) já tratava o par; o (1) apagava cru e corrompia o estado — foi o
 * bug provado em produção (a perna de `entrada` no cartão sobrevivia órfã).
 *
 * A RPC recebe QUALQUER uma das duas pernas, apaga as duas e recalcula
 * amount_paid/status/paid_at da fatura numa transação só.
 *
 * Retorna `true` quando estornou (o caller precisa PARAR — o delete manual não
 * pode rodar em cima do que a RPC já apagou).
 * Retorna `false` quando não é pagamento de fatura, ou é pagamento ANTIGO sem
 * `transfer_pair_id` (uma perna só, de antes da RPC): esses seguem pelo caminho
 * cru de hoje, a RPC recusa esse formato.
 */
async function revertCreditCardBillPaymentIfNeeded(transactionId: string): Promise<boolean> {
  const { data: txn } = await supabase
    .from('financial_transactions')
    .select('category, transfer_pair_id')
    .eq('id', transactionId)
    .maybeSingle();

  if (txn?.category !== 'Pagamento de Fatura' || !txn.transfer_pair_id) return false;

  const { error } = await supabase.rpc('revert_credit_card_bill_payment', {
    p_transaction_id: transactionId,
  });
  // Erro da RPC já vem em PT-BR (SQLSTATE P0001). Só propaga — quem monta o toast
  // é o TransactionListPanel, via getRpcErrorMessage.
  if (error) throw error;
  return true;
}

/**
 * Cascade delete: deletes the root + all children + clears quote link.
 * If onlyThis = true, deletes only the given id (and children if it IS the root).
 */
export async function deleteTransactionCascade(
  transactionId: string,
  deleteAllRelated: boolean,
): Promise<void> {
  // Guard no TOPO, antes de qualquer delete: cobre os DOIS ramos abaixo
  // (deleteAllRelated false e true). Pagamento de fatura não tem parcelas nem
  // filhos, então o par é sempre o escopo inteiro da exclusão.
  if (await revertCreditCardBillPaymentIfNeeded(transactionId)) return;

  if (!deleteAllRelated) {
    // Just delete this one. Children get parent set to null automatically.
    const { error } = await supabase.from('financial_transactions').delete().eq('id', transactionId);
    if (error) throw error;

    // If this was a root referenced by a quote, clear the link
    await supabase
      .from('quotes')
      .update({ financial_transaction_id: null, financial_generated_at: null, status: 'enviado' } as any)
      .eq('financial_transaction_id', transactionId);
    return;
  }

  // Delete-all: find root, delete all children, then root, clear quote
  const { root, related, linkedQuote } = await findRelatedTransactions(transactionId);
  const ids = new Set<string>([transactionId, ...related.map((r) => r.id)]);
  if (root) ids.add(root.id);

  const { error } = await supabase
    .from('financial_transactions')
    .delete()
    .in('id', Array.from(ids));
  if (error) throw error;

  if (linkedQuote) {
    await supabase
      .from('quotes')
      .update({ financial_transaction_id: null, financial_generated_at: null, status: 'enviado' } as any)
      .eq('id', linkedQuote.id);
  }
}

/**
 * Cascade unmark-as-paid: reverts is_paid for the root + (optionally) all children.
 * Children that represent CMV/fees become orphaned reversions — also unmark them.
 */
export async function unmarkTransactionCascade(
  transactionId: string,
  unmarkAllRelated: boolean,
): Promise<void> {
  if (!unmarkAllRelated) {
    const { error } = await supabase
      .from('financial_transactions')
      .update({ is_paid: false, paid_date: null } as any)
      .eq('id', transactionId);
    if (error) throw error;
    return;
  }

  const { root, related } = await findRelatedTransactions(transactionId);
  const ids = new Set<string>([transactionId, ...related.map((r) => r.id)]);
  if (root) ids.add(root.id);

  const { error } = await supabase
    .from('financial_transactions')
    .update({ is_paid: false, paid_date: null } as any)
    .in('id', Array.from(ids));
  if (error) throw error;
}
