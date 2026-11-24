import { CASH_EXPORT_GROUPS, CASH_EXPORT_PAYMENT_ORDER, CASH_EXPORT_PAYMENT_OPTIONS } from './labels';
import type {
  CashExportEntry,
  CashExportFilters,
  CashExportMovementGroup,
  CashExportPayload,
  CashExportSession,
} from './types';

const KIND_GROUP: Record<string, CashExportMovementGroup> = {
  sale_payment: 'sales',
  sale_without_payment: 'sales',
  cash_receipt: 'cash_movements',
  cash_payment: 'cash_movements',
  supply: 'supplies',
  withdrawal: 'withdrawals',
  refund: 'refunds',
  reversal: 'refunds',
  closing_return: 'closing_adjustments',
  shortage: 'closing_adjustments',
  surplus: 'closing_adjustments',
};

export const ALL_CASH_EXPORT_GROUPS: CashExportMovementGroup[] = CASH_EXPORT_GROUPS.map((group) => group.id);

export function cashExportGroupOf(kind: string): CashExportMovementGroup | null {
  return KIND_GROUP[kind] ?? null;
}

/**
 * Filtra as entradas de um caixa.
 * - A abertura nunca é movimentação (vai no cabeçalho do caixa).
 * - Forma de pagamento: só restringe quando o usuário desmarcou alguma das formas
 *   oferecidas (`availablePaymentMethods`). Restringindo, entradas sem forma saem.
 * - Se a entrada primária de uma venda sai pelo filtro mas outra forma da mesma venda
 *   fica, os itens passam para a primeira entrada restante (itens nunca somem nem duplicam).
 */
export function filterCashExportEntries(
  entries: CashExportEntry[],
  filters: CashExportFilters,
  availablePaymentMethods: readonly string[],
): CashExportEntry[] {
  const groups = new Set(filters.groups);
  const selected = new Set(filters.paymentMethods);
  const restrictsPayment = availablePaymentMethods.some((method) => !selected.has(method));

  const kept = entries.filter((entry) => {
    const group = cashExportGroupOf(entry.kind);
    if (!group || !groups.has(group)) return false;
    if (!filters.includeCancelled && entry.isCancelled) return false;
    if (restrictsPayment && (!entry.paymentMethod || !selected.has(entry.paymentMethod))) return false;
    return true;
  });

  const itemsByOrder = new Map<string, CashExportEntry>();
  for (const entry of entries) {
    if (entry.orderId && entry.isOrderPrimary && entry.items.length > 0) itemsByOrder.set(entry.orderId, entry);
  }
  const primaryKept = new Set(kept.filter((entry) => entry.orderId && entry.isOrderPrimary).map((entry) => entry.orderId));
  const promoted = new Set<string>();
  return kept.map((entry) => {
    const orderId = entry.orderId;
    if (!orderId || primaryKept.has(orderId) || promoted.has(orderId)) return entry;
    const source = itemsByOrder.get(orderId);
    if (!source) return entry;
    promoted.add(orderId);
    return { ...entry, isOrderPrimary: true, items: source.items };
  });
}

export function filterCashExportSession(
  session: CashExportSession,
  filters: CashExportFilters,
  availablePaymentMethods: readonly string[],
): CashExportSession {
  return { ...session, entries: filterCashExportEntries(session.entries, filters, availablePaymentMethods) };
}

export function filterCashExportPayload(
  payload: CashExportPayload,
  filters: CashExportFilters,
  offeredPaymentMethods: readonly string[] = CASH_EXPORT_PAYMENT_OPTIONS,
): CashExportPayload {
  return {
    ...payload,
    sessions: payload.sessions.map((session) => filterCashExportSession(session, filters, offeredPaymentMethods)),
  };
}

export function countCashExportMovements(payload: CashExportPayload): number {
  return payload.sessions.reduce((sum, session) => sum + session.entries.length, 0);
}

export interface CashExportPaymentSummary {
  paymentMethod: string | null;
  entries: number;
  in: number;
  out: number;
  net: number;
}

export interface CashExportSessionSummary {
  movements: number;
  totalIn: number;
  totalOut: number;
  net: number;
  salesCount: number;
  cancelledSalesCount: number;
  byPaymentMethod: CashExportPaymentSummary[];
}

const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * Totais calculados SOMENTE a partir das entradas já filtradas. Canceladas não somam.
 * Ajuste de fechamento (sobra, falta, retorno ao cofre) também não: ele aparece na
 * lista e já está em Contado/Diferença do cabeçalho. Somado aqui, um caixa que vendeu
 * R$ 56 mostrava R$ 80 de entradas.
 */
export function summarizeCashExportEntries(entries: CashExportEntry[]): CashExportSessionSummary {
  let totalIn = 0;
  let totalOut = 0;
  const sales = new Set<string>();
  const cancelled = new Set<string>();
  const byMethod = new Map<string, CashExportPaymentSummary>();

  for (const entry of entries) {
    if (entry.isCancelled) {
      if (entry.orderId) cancelled.add(entry.orderId);
      continue;
    }
    if (entry.isClosingAdjustment) continue;
    if (entry.direction === 'in') totalIn += entry.amount;
    else totalOut += entry.amount;
    if (entry.orderId && cashExportGroupOf(entry.kind) === 'sales') sales.add(entry.orderId);

    const key = entry.paymentMethod ?? '';
    const bucket = byMethod.get(key) ?? { paymentMethod: entry.paymentMethod, entries: 0, in: 0, out: 0, net: 0 };
    bucket.entries += 1;
    if (entry.direction === 'in') bucket.in += entry.amount;
    else bucket.out += entry.amount;
    bucket.net = bucket.in - bucket.out;
    byMethod.set(key, bucket);
  }

  const order = (method: string | null) => {
    if (!method) return 999;
    const index = (CASH_EXPORT_PAYMENT_ORDER as readonly string[]).indexOf(method);
    return index === -1 ? 500 : index;
  };
  const byPaymentMethod = [...byMethod.values()]
    .map((bucket) => ({ ...bucket, in: cents(bucket.in), out: cents(bucket.out), net: cents(bucket.net) }))
    .sort((a, b) => order(a.paymentMethod) - order(b.paymentMethod));

  return {
    movements: entries.length,
    totalIn: cents(totalIn),
    totalOut: cents(totalOut),
    net: cents(totalIn - totalOut),
    salesCount: sales.size,
    cancelledSalesCount: cancelled.size,
    byPaymentMethod,
  };
}

/** Soma os totais por forma de pagamento de vários caixas. */
export function mergePaymentSummaries(summaries: CashExportSessionSummary[]): CashExportPaymentSummary[] {
  const merged = new Map<string, CashExportPaymentSummary>();
  for (const summary of summaries) {
    for (const row of summary.byPaymentMethod) {
      const key = row.paymentMethod ?? '';
      const bucket = merged.get(key) ?? { paymentMethod: row.paymentMethod, entries: 0, in: 0, out: 0, net: 0 };
      bucket.entries += row.entries;
      bucket.in = cents(bucket.in + row.in);
      bucket.out = cents(bucket.out + row.out);
      bucket.net = cents(bucket.in - bucket.out);
      merged.set(key, bucket);
    }
  }
  return summarizeOrder([...merged.values()]);
}

function summarizeOrder(rows: CashExportPaymentSummary[]): CashExportPaymentSummary[] {
  const rank = (method: string | null) => {
    if (!method) return 999;
    const index = (CASH_EXPORT_PAYMENT_ORDER as readonly string[]).indexOf(method);
    return index === -1 ? 500 : index;
  };
  return rows.sort((a, b) => rank(a.paymentMethod) - rank(b.paymentMethod));
}
