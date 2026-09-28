/**
 * Motor puro do DFC gerencial pelo metodo direto.
 *
 * O modulo nao consulta Supabase e nao conhece tenant. Quem chama deve entregar
 * apenas as movimentacoes do tenant autorizado e enriquecer cada uma com o
 * `dfc_group` da categoria correspondente.
 *
 * Regras de caixa:
 * - somente movimentacoes realizadas (`is_paid === true`) e com `paid_date`;
 * - transferencias internas (`transfer_pair_id`) nao alteram o caixa consolidado;
 * - pagamento de fatura e excecao: entra pela perna de saida da conta pagadora;
 * - compras no cartao nao entram diretamente, evitando duplicar o pagamento;
 * - entradas sao positivas e saidas negativas;
 * - toda aritmetica e feita em centavos inteiros.
 */

export const DFC_GROUP_KEYS = ['operacional', 'investimento', 'financiamento'] as const;

export type DfcGroupKey = (typeof DFC_GROUP_KEYS)[number];

/**
 * Categorias ainda nao classificadas entram no fluxo operacional.
 *
 * Este fallback e deliberadamente explicito e nao depende do nome da categoria.
 * Assim, uma categoria chamada "Investimento" continua operacional ate receber
 * `dfc_group = 'investimento'` no cadastro.
 */
export const DFC_UNCLASSIFIED_FALLBACK: DfcGroupKey = 'operacional';

export const DFC_GROUP_LABELS: Record<DfcGroupKey, string> = {
  operacional: 'Atividades operacionais',
  investimento: 'Atividades de investimento',
  financiamento: 'Atividades de financiamento',
};

export const DFC_UNCATEGORIZED_LABEL = 'Sem categoria';

export interface DfcTransaction {
  id: string;
  transaction_type: 'entrada' | 'saida';
  amount: number | string;
  is_paid?: boolean | null;
  paid_date?: string | null;
  transfer_pair_id?: string | null;
  cancelled_at?: string | null;
  category?: string | null;
  credit_card_bill_date?: string | null;
  bill_id?: string | null;
  /** Campo enriquecido a partir de `financial_categories.dfc_group`. */
  dfc_group?: DfcGroupKey | string | null;
}

export interface DfcRange {
  /** Data inclusiva no formato YYYY-MM-DD. Sem `from`, não há acumulado anterior. */
  from?: string;
  /** Data inclusiva no formato YYYY-MM-DD. Sem `to`, nao ha limite superior. */
  to?: string;
}

export interface DfcCategoryLine<T extends DfcTransaction = DfcTransaction> {
  name: string;
  /** Entradas positivas e saidas negativas, em unidade monetaria. */
  total: number;
  /** Drilldown das movimentacoes realizadas desta linha. */
  transactions: T[];
}

export interface DfcGroupLine<T extends DfcTransaction = DfcTransaction> {
  key: DfcGroupKey;
  label: string;
  /** Entradas positivas e saidas negativas, em unidade monetaria. */
  total: number;
  categories: DfcCategoryLine<T>[];
}

export interface DfcResult<T extends DfcTransaction = DfcTransaction> {
  /** Saldo-base das contas + acumulado realizado anterior a `range.from`. */
  openingBalance: number;
  /** Soma dos tres fluxos dentro do periodo. */
  netChange: number;
  /** `openingBalance + netChange`. */
  closingBalance: number;
  groups: DfcGroupLine<T>[];
}

interface MutableCategory<T extends DfcTransaction> {
  totalCents: number;
  transactions: T[];
}

interface PreparedTransaction {
  paidDate: string;
  signedCents: number;
}

function normalizeIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;

  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) {
    return null;
  }
  return iso;
}

function normalizeRange(range?: DfcRange): { from?: string; to?: string } {
  const from = range?.from === undefined ? undefined : normalizeIsoDate(range.from);
  const to = range?.to === undefined ? undefined : normalizeIsoDate(range.to);

  if (range?.from !== undefined && !from) {
    throw new TypeError('Data inicial do DFC invalida. Use YYYY-MM-DD.');
  }
  if (range?.to !== undefined && !to) {
    throw new TypeError('Data final do DFC invalida. Use YYYY-MM-DD.');
  }
  if (from && to && from > to) {
    throw new RangeError('A data inicial do DFC nao pode ser posterior a data final.');
  }

  return { from, to };
}

function amountToCents(amount: number | string): number | null {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return null;
  // `amount` representa magnitude no modelo financeiro; o sentido vem de
  // `transaction_type`. O abs tambem impede que um dado legado negativo em uma
  // saida inverta o sinal e vire entrada no DFC.
  return Math.round((Math.abs(parsed) + Number.EPSILON) * 100);
}

function prepareTransaction(transaction: DfcTransaction): PreparedTransaction | null {
  if (transaction.is_paid !== true) return null;
  if (transaction.cancelled_at) return null;

  // Compra no cartão é competência, não movimento de caixa. O caixa se move
  // quando a fatura é paga — inclusive parcialmente — pela perna de saída da
  // conta pagadora. Contar a compra quitada e o pagamento duplicaria a saída.
  if (transaction.credit_card_bill_date) return null;

  // Transferência comum continua neutra. Pagamento de fatura também nasce em
  // par, mas só a perna de SAÍDA é caixa real; a entrada no cartão apenas
  // recompõe limite. `bill_id` torna a exceção estrutural, não só por texto.
  if (transaction.transfer_pair_id) {
    const isCardBillCashOut = transaction.transaction_type === 'saida'
      && transaction.category === 'Pagamento de Fatura'
      && !!transaction.bill_id;
    if (!isCardBillCashOut) return null;
  }

  const paidDate = normalizeIsoDate(transaction.paid_date);
  if (!paidDate) return null;

  const amountCents = amountToCents(transaction.amount);
  if (amountCents === null) return null;

  const signedCents = transaction.transaction_type === 'entrada' ? amountCents : -amountCents;
  return { paidDate, signedCents };
}

function resolveGroup(value: string | null | undefined): DfcGroupKey {
  if ((DFC_GROUP_KEYS as readonly string[]).includes(value ?? '')) {
    return value as DfcGroupKey;
  }
  return DFC_UNCLASSIFIED_FALLBACK;
}

function resolveCategoryName(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized || DFC_UNCATEGORIZED_LABEL;
}

function centsToMoney(cents: number): number {
  return cents / 100;
}

/**
 * Calcula o DFC direto a partir de um conjunto que pode conter todo o historico.
 *
 * Sem `range.from`, nao existe periodo anterior e o saldo inicial contem apenas
 * o saldo-base informado. Sem limites, todo o realizado entra na variacao do
 * periodo. Movimentacoes futuras a `range.to` nao entram nem no fechamento.
 */
export function calculateDfc<T extends DfcTransaction>(
  transactions: readonly T[] | null | undefined,
  range?: DfcRange,
  /** Soma dos saldos iniciais das contas de caixa/banco, sem cartões. */
  baseBalance = 0,
): DfcResult<T> {
  const normalizedRange = normalizeRange(range);
  const categoryMaps = new Map<DfcGroupKey, Map<string, MutableCategory<T>>>();
  const groupTotals = new Map<DfcGroupKey, number>();

  for (const key of DFC_GROUP_KEYS) {
    categoryMaps.set(key, new Map());
    groupTotals.set(key, 0);
  }

  const normalizedBaseBalance = amountToCents(baseBalance) ?? 0;
  let openingCents = baseBalance < 0 ? -normalizedBaseBalance : normalizedBaseBalance;

  for (const rawTransaction of transactions ?? []) {
    const prepared = prepareTransaction(rawTransaction);
    if (!prepared) continue;

    if (normalizedRange.from && prepared.paidDate < normalizedRange.from) {
      openingCents += prepared.signedCents;
      continue;
    }
    if (normalizedRange.to && prepared.paidDate > normalizedRange.to) continue;

    const group = resolveGroup(rawTransaction.dfc_group);
    const categoryName = resolveCategoryName(rawTransaction.category);
    const categories = categoryMaps.get(group)!;
    let category = categories.get(categoryName);

    if (!category) {
      category = { totalCents: 0, transactions: [] };
      categories.set(categoryName, category);
    }

    category.totalCents += prepared.signedCents;
    category.transactions.push(rawTransaction);
    groupTotals.set(group, groupTotals.get(group)! + prepared.signedCents);
  }

  const groups: DfcGroupLine<T>[] = DFC_GROUP_KEYS.map((key) => ({
    key,
    label: DFC_GROUP_LABELS[key],
    total: centsToMoney(groupTotals.get(key)!),
    categories: Array.from(categoryMaps.get(key)!, ([name, category]) => ({
      name,
      total: centsToMoney(category.totalCents),
      transactions: category.transactions,
    })),
  }));

  const netChangeCents = DFC_GROUP_KEYS.reduce(
    (total, key) => total + groupTotals.get(key)!,
    0,
  );

  return {
    openingBalance: centsToMoney(openingCents),
    netChange: centsToMoney(netChangeCents),
    closingBalance: centsToMoney(openingCents + netChangeCents),
    groups,
  };
}
