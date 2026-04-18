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
 * Cascade delete: deletes the root + all children + clears quote link.
 * If onlyThis = true, deletes only the given id (and children if it IS the root).
 */
export async function deleteTransactionCascade(
  transactionId: string,
  deleteAllRelated: boolean,
): Promise<void> {
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
