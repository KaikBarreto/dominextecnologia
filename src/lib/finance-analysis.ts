/**
 * Análise financeira: comparação entre períodos e desempenho por cliente.
 *
 * Nasceu de três pedidos do BPO financeiro (18/10/2026):
 *   - "Receita x Despesa, dá pra ver nos últimos 3 meses, até no último ano,
 *      ou ano x ano, trimestre x trimestre, deixar o usuário escolher"
 *   - "Ranking de clientes top 5 ou top 10, clientes com maiores faturamentos"
 *   - "Margem por cliente, porque o seu cliente top 1 faturamento pode nem ser
 *      o top 5 melhor margem porque o custo dele pode ser alto"
 *
 * ⚠️ Usa EXATAMENTE os mesmos cortes de `finance-report-overview.ts` (que por
 * sua vez replica o DRE). Se os cortes divergirem, a aba Análise vai contar
 * uma história diferente da Visão Geral sobre os mesmos lançamentos, e o
 * cliente vai (com razão) parar de confiar nos dois.
 */

import {
  getDreAmount,
  getDreEffectiveDate,
  isDreExcludedGroup,
  isFutureCashDate,
  isPartialReceiptChild,
  isPayrollAdvance,
  type DreRegime,
} from './dre-regime';
import { ADJUSTMENT_CATEGORY } from './finance-constants';
import type { FinancialTransaction } from '@/types/database';

export type AnalysisPeriodMode = 'mes' | 'trimestre' | 'ano';

export interface AnalysisPeriodRow {
  /** Chave ordenável: `2026-09`, `2026-T3`, `2026`. */
  key: string;
  label: string;
  revenue: number;
  expense: number;
  result: number;
}

export interface AnalysisCustomerRow {
  customerId: string;
  name: string;
  revenue: number;
  /** Despesa atribuída a este cliente (lançamento com o cliente preenchido). */
  expense: number;
  result: number;
  /** result / revenue * 100. `null` quando o cliente não teve faturamento. */
  margin: number | null;
}

export interface FinanceAnalysisData {
  periods: AnalysisPeriodRow[];
  customers: AnalysisCustomerRow[];
  /**
   * Despesa que NÃO pôde ser atribuída a cliente nenhum (aluguel, folha,
   * energia). A tela precisa mostrar: sem isso, a soma das margens por cliente
   * não bate com o resultado da empresa e parece erro de conta.
   */
  unattributedExpense: number;
  /** Faturamento total do período, base do percentual de cada cliente. */
  totalRevenue: number;
}

export interface BuildFinanceAnalysisInput {
  transactions: readonly FinancialTransaction[];
  regime: DreRegime;
  /** YYYY-MM-DD no fuso da empresa. */
  today: string;
  periodMode: AnalysisPeriodMode;
  /** Quantos períodos para trás, contando o atual. */
  periodCount: number;
  categoryDreGroups?: ReadonlyMap<string, string | null | undefined>;
  dreStartDate?: string | null;
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function toCents(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100);
}

function fromCents(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

/** `2026-09-14` → chave e rótulo do período escolhido. */
function periodOf(iso: string, mode: AnalysisPeriodMode): { key: string; label: string } | null {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return null;
  const ano = m[1];
  const mes = Number(m[2]);
  if (mode === 'ano') return { key: ano, label: ano };
  if (mode === 'trimestre') {
    const t = Math.ceil(mes / 3);
    return { key: `${ano}-T${t}`, label: `${t}º tri ${ano.slice(2)}` };
  }
  return { key: `${ano}-${m[2]}`, label: `${MESES_CURTOS[mes - 1]}/${ano.slice(2)}` };
}

/** Os N períodos que devem aparecer, mesmo os sem movimento (buraco mente). */
function periodWindow(today: string, mode: AnalysisPeriodMode, count: number): Array<{ key: string; label: string }> {
  const m = /^(\d{4})-(\d{2})/.exec(today);
  if (!m) return [];
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const janela: Array<{ key: string; label: string }> = [];

  for (let i = count - 1; i >= 0; i -= 1) {
    if (mode === 'ano') {
      const a = ano - i;
      janela.push({ key: String(a), label: String(a) });
    } else if (mode === 'trimestre') {
      const triAtual = Math.ceil(mes / 3);
      const total = ano * 4 + (triAtual - 1) - i;
      const a = Math.floor(total / 4);
      const t = (total % 4) + 1;
      janela.push({ key: `${a}-T${t}`, label: `${t}º tri ${String(a).slice(2)}` });
    } else {
      const total = ano * 12 + (mes - 1) - i;
      const a = Math.floor(total / 12);
      const mm = (total % 12) + 1;
      janela.push({ key: `${a}-${String(mm).padStart(2, '0')}`, label: `${MESES_CURTOS[mm - 1]}/${String(a).slice(2)}` });
    }
  }
  return janela;
}

export function buildFinanceAnalysis(input: BuildFinanceAnalysisInput): FinanceAnalysisData {
  const { transactions, regime, today, periodMode, periodCount } = input;
  const categoryDreGroups = input.categoryDreGroups ?? new Map();
  const dreStartDate = input.dreStartDate ?? null;

  const parentsWithPartialReceipt = new Set<string>();
  for (const t of transactions) {
    if (isPartialReceiptChild(t) && t.parent_transaction_id) {
      parentsWithPartialReceipt.add(t.parent_transaction_id);
    }
  }

  const janela = periodWindow(today, periodMode, periodCount);
  const chavesValidas = new Set(janela.map((p) => p.key));

  const porPeriodo = new Map<string, { revenueCents: number; expenseCents: number }>();
  for (const p of janela) porPeriodo.set(p.key, { revenueCents: 0, expenseCents: 0 });

  const porCliente = new Map<string, { name: string; revenueCents: number; expenseCents: number }>();
  let unattributedExpenseCents = 0;
  let totalRevenueCents = 0;

  for (const t of transactions) {
    // Os MESMOS cortes da Visão Geral e do DRE. Não divergir.
    if ((t as { cancelled_at?: string | null }).cancelled_at) continue;
    if (t.transfer_pair_id) continue;
    if (isDreExcludedGroup(categoryDreGroups.get(t.category ?? ''))) continue;
    if (t.category === 'Pagamento de Fatura' || t.category === ADJUSTMENT_CATEGORY) continue;
    if (regime === 'caixa' && !t.is_paid) continue;
    if (regime === 'competencia' && (isPartialReceiptChild(t) || isPayrollAdvance(t))) continue;

    const effectiveDate = getDreEffectiveDate(t, regime);
    if (!effectiveDate) continue;
    if (isFutureCashDate(effectiveDate, regime, today)) continue;
    if (dreStartDate && effectiveDate.slice(0, 10) < dreStartDate) continue;

    const periodo = periodOf(effectiveDate.slice(0, 10), periodMode);
    if (!periodo || !chavesValidas.has(periodo.key)) continue;

    const amount = getDreAmount(t, regime, parentsWithPartialReceipt.has(t.id));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const cents = toCents(amount);

    const linha = porPeriodo.get(periodo.key)!;
    const ehReceita = t.transaction_type === 'entrada';
    if (ehReceita) linha.revenueCents += cents;
    else linha.expenseCents += cents;

    // ── por cliente ──
    const clienteId = t.customer_id ?? null;
    if (ehReceita) totalRevenueCents += cents;

    if (!clienteId) {
      // Despesa de estrutura (aluguel, folha, energia) não pertence a cliente
      // nenhum. Receita sem cliente simplesmente não entra no ranking.
      if (!ehReceita) unattributedExpenseCents += cents;
      continue;
    }

    const nome = (t as { customer?: { name?: string } }).customer?.name ?? 'Cliente';
    const atual = porCliente.get(clienteId) ?? { name: nome, revenueCents: 0, expenseCents: 0 };
    if (nome && nome !== 'Cliente') atual.name = nome;
    if (ehReceita) atual.revenueCents += cents;
    else atual.expenseCents += cents;
    porCliente.set(clienteId, atual);
  }

  const periods: AnalysisPeriodRow[] = janela.map((p) => {
    const linha = porPeriodo.get(p.key)!;
    return {
      key: p.key,
      label: p.label,
      revenue: fromCents(linha.revenueCents),
      expense: fromCents(linha.expenseCents),
      result: fromCents(linha.revenueCents - linha.expenseCents),
    };
  });

  const customers: AnalysisCustomerRow[] = [...porCliente.entries()]
    .map(([customerId, v]) => {
      const resultCents = v.revenueCents - v.expenseCents;
      return {
        customerId,
        name: v.name,
        revenue: fromCents(v.revenueCents),
        expense: fromCents(v.expenseCents),
        result: fromCents(resultCents),
        // Cliente que só gerou despesa não tem margem definida: dividir por
        // zero daria Infinity, e mostrar 0% esconderia o prejuízo.
        margin: v.revenueCents > 0 ? Number(((resultCents / v.revenueCents) * 100).toFixed(1)) : null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return {
    periods,
    customers,
    unattributedExpense: fromCents(unattributedExpenseCents),
    totalRevenue: fromCents(totalRevenueCents),
  };
}
