import type { FinancialTransaction } from '@/types/database';
import type { DateRange } from '@/components/ui/DateRangeFilter';
import { ADJUSTMENT_CATEGORY } from '@/lib/finance-constants';
import {
  classifyDreCategory,
  getDreAmount,
  getDreEffectiveDate,
  isFutureCashDate,
  isDreExcludedGroup,
  isInDreRange,
  isPartialReceiptChild,
  isPayrollAdvance,
  type DreRegime,
} from '@/lib/dre-regime';
import { buildCostCenterBreakdown } from '@/lib/cost-center-breakdown';

type ReportTransaction = FinancialTransaction & { customer?: unknown };

export interface FinanceReportCategoryRow {
  name: string;
  value: number;
}

export interface FinanceReportMonthRow {
  key: string;
  revenue: number;
  expense: number;
}

export interface FinanceReportCostCenterRow {
  id: string | null;
  revenue: number;
  expense: number;
  result: number;
}

export interface FinanceReportOverviewData {
  totals: {
    grossRevenue: number;
    expenses: number;
    taxes: number;
    netRevenue: number;
    grossProfit: number;
    result: number;
    margin: number;
  };
  monthly: FinanceReportMonthRow[];
  revenueCategories: FinanceReportCategoryRow[];
  expenseCategories: FinanceReportCategoryRow[];
  costCenters: FinanceReportCostCenterRow[];
  movementCount: number;
}

interface BuildFinanceReportOverviewInput {
  transactions: ReportTransaction[];
  range?: DateRange;
  regime: DreRegime;
  today: string;
  /** Corte histórico configurado para o DRE da empresa (YYYY-MM-DD). */
  dreStartDate?: string | null;
  categoryDreGroups?: ReadonlyMap<string, string | null>;
  costCenterOrder?: string[];
  /**
   * `subcategoria → nome da categoria pai`. É por NOME porque é o nome que o
   * lançamento guarda (`financial_transactions.category` é `text`, não é FK).
   */
  categoryParents?: ReadonlyMap<string, string>;
  /**
   * Soma as fatias de subcategoria dentro da categoria pai nas listas de
   * categoria (só na APRESENTAÇÃO). A classificação do DRE continua sendo
   * feita pela categoria do lançamento: subcategoria `opex` de um pai `cmv`
   * continua contando como `opex` nos totais, como no DRE.
   */
  groupCategories?: boolean;
}

function toCents(value: number | string | null | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100);
}

function fromCents(value: number): number {
  return value / 100;
}

/**
 * Consolida a Visão Geral dos relatórios com a mesma régua contábil do DRE.
 *
 * A função é pura: o componente entrega somente dados já isolados por RLS. O
 * filtro de período/regime acontece uma vez e o mesmo conjunto alimenta KPIs,
 * evolução, categorias e centros de custo, evitando totais contraditórios.
 */
export function buildFinanceReportOverview({
  transactions,
  range,
  regime,
  today,
  dreStartDate,
  categoryDreGroups = new Map(),
  costCenterOrder,
  categoryParents,
  groupCategories = false,
}: BuildFinanceReportOverviewInput): FinanceReportOverviewData {
  const parentsWithPartialReceipt = new Set<string>();
  for (const transaction of transactions) {
    if (isPartialReceiptChild(transaction) && transaction.parent_transaction_id) {
      parentsWithPartialReceipt.add(transaction.parent_transaction_id);
    }
  }

  const visible: ReportTransaction[] = [];
  for (const transaction of transactions) {
    if ((transaction as ReportTransaction & { cancelled_at?: string | null }).cancelled_at) continue;
    if (transaction.transfer_pair_id) continue;
    if (isDreExcludedGroup(categoryDreGroups.get(transaction.category ?? ''))) continue;
    if (transaction.category === 'Pagamento de Fatura' || transaction.category === ADJUSTMENT_CATEGORY) continue;
    if (regime === 'caixa' && !transaction.is_paid) continue;
    if (regime === 'competencia' && (isPartialReceiptChild(transaction) || isPayrollAdvance(transaction))) continue;

    const effectiveDate = getDreEffectiveDate(transaction, regime);
    if (isFutureCashDate(effectiveDate, regime, today) || !isInDreRange(effectiveDate, range)) continue;
    if (dreStartDate && (!effectiveDate || effectiveDate.slice(0, 10) < dreStartDate)) continue;

    const amount = getDreAmount(transaction, regime, parentsWithPartialReceipt.has(transaction.id));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    visible.push(amount === Number(transaction.amount) ? transaction : { ...transaction, amount });
  }

  let grossRevenueCents = 0;
  let taxesCents = 0;
  let costOfServicesCents = 0;
  let operatingExpensesCents = 0;
  const monthly = new Map<string, { revenueCents: number; expenseCents: number }>();
  const revenueCategories = new Map<string, number>();
  const expenseCategories = new Map<string, number>();

  // Rótulo que vai para as listas de categoria. Somar a filha dentro do pai
  // preserva o total: cada lançamento continua entrando em exatamente uma
  // chave.
  const displayNameOf = (category: string): string => (
    groupCategories ? (categoryParents?.get(category) ?? category) : category
  );

  for (const transaction of visible) {
    const cents = toCents(transaction.amount);
    const category = transaction.category?.trim() || 'Sem categoria';
    const displayCategory = displayNameOf(category);
    const effectiveDate = getDreEffectiveDate(transaction, regime);
    const monthKey = effectiveDate && /^\d{4}-\d{2}/.test(effectiveDate)
      ? effectiveDate.slice(0, 7)
      : null;

    if (transaction.transaction_type === 'entrada') {
      grossRevenueCents += cents;
      revenueCategories.set(displayCategory, (revenueCategories.get(displayCategory) ?? 0) + cents);
      if (monthKey) {
        const row = monthly.get(monthKey) ?? { revenueCents: 0, expenseCents: 0 };
        row.revenueCents += cents;
        monthly.set(monthKey, row);
      }
      continue;
    }

    expenseCategories.set(displayCategory, (expenseCategories.get(displayCategory) ?? 0) + cents);
    const group = classifyDreCategory(category, categoryDreGroups.get(category));
    if (group === 'impostos') taxesCents += cents;
    else if (group === 'cmv') costOfServicesCents += cents;
    else operatingExpensesCents += cents;

    if (monthKey) {
      const row = monthly.get(monthKey) ?? { revenueCents: 0, expenseCents: 0 };
      row.expenseCents += cents;
      monthly.set(monthKey, row);
    }
  }

  const expensesCents = taxesCents + costOfServicesCents + operatingExpensesCents;
  const netRevenueCents = grossRevenueCents - taxesCents;
  const grossProfitCents = netRevenueCents - costOfServicesCents;
  const resultCents = grossProfitCents - operatingExpensesCents;
  const costCenterBreakdown = buildCostCenterBreakdown(visible, costCenterOrder);
  const categoryRows = (values: Map<string, number>): FinanceReportCategoryRow[] =>
    Array.from(values, ([name, value]) => ({ name, value: fromCents(value) }))
      .sort((a, b) => b.value - a.value);

  return {
    totals: {
      grossRevenue: fromCents(grossRevenueCents),
      expenses: fromCents(expensesCents),
      taxes: fromCents(taxesCents),
      netRevenue: fromCents(netRevenueCents),
      grossProfit: fromCents(grossProfitCents),
      result: fromCents(resultCents),
      /**
       * Margem LÍQUIDA: resultado ÷ faturamento.
       *
       * ⚠️ Até 18/10/2026 isto era `grossProfit / grossRevenue` (margem
       * BRUTA). Numa empresa de serviço, que quase nunca cadastra CMV, o lucro
       * bruto é igual à receita líquida, então a "margem" virava apenas
       * "100% menos o percentual de imposto" e não dizia nada. O BPO financeiro
       * pegou com um caso real: R$ 5.000 de receita, R$ 1.000 de imposto,
       * R$ 2.500 de aluguel e R$ 125 de alimentação mostravam 80%, quando o
       * número que interessa é 1.375 / 5.000 = 27,5%.
       */
      margin: grossRevenueCents > 0 ? (resultCents / grossRevenueCents) * 100 : 0,
    },
    monthly: Array.from(monthly, ([key, value]) => ({
      key,
      revenue: fromCents(value.revenueCents),
      expense: fromCents(value.expenseCents),
    })).sort((a, b) => a.key.localeCompare(b.key)),
    revenueCategories: categoryRows(revenueCategories),
    expenseCategories: categoryRows(expenseCategories),
    costCenters: costCenterBreakdown.rows,
    movementCount: visible.length,
  };
}
