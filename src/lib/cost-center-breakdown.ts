/**
 * Motor puro da quebra por CENTRO DE CUSTO.
 *
 * Existe por um motivo só: **a soma tem que fechar**. A quebra por centro é
 * lida ao lado dos totais da DRE; se a soma dos centros mais o balde "sem
 * centro" não bater com a receita/despesa total do mesmo período e do mesmo
 * regime, o cliente perde a confiança no relatório inteiro e ninguém percebe o
 * erro (a diferença aparece como "uns centavos" e é atribuída a arredondamento).
 *
 * Duas decisões que garantem isso:
 *
 * 1. **Um conjunto só.** Quem chama passa exatamente a mesma lista JÁ filtrada e
 *    JÁ cortada pelo regime que alimenta os totais de cima. Este módulo nunca
 *    filtra por data, regime ou `is_paid` — não conhece nenhuma dessas regras.
 * 2. **Aritmética em centavos inteiros.** Cada lançamento vira `round(amount *
 *    100)` UMA vez; a partir daí tudo é soma de inteiros. Somar `number` em
 *    ponto flutuante (0,1 + 0,2) faz a soma dos baldes divergir do total no
 *    último bit — invisível na tela, fatal numa conferência.
 *
 * Tudo aqui é puro: sem React, sem Supabase, sem data.
 */

/**
 * Sentinela do balde "Sem centro de custo" nos filtros multisseleção.
 *
 * Sem um balde explícito, filtrar por centro esconderia silenciosamente todo
 * lançamento sem centro — o usuário veria uma lista menor sem entender por quê.
 * Mesmo valor usado pelo `CostCenterSelect` pro "nenhum" (Radix proíbe `value=""`).
 */
export const NO_COST_CENTER = '__none__';

export interface CostCenterTxnLike {
  transaction_type: string;
  amount: number | string;
  cost_center_id?: string | null;
}

/** Linha da quebra. `id === null` é o balde "Sem centro de custo". */
export interface CostCenterBreakdownRow {
  id: string | null;
  /** Receita do período, em centavos inteiros. */
  revenueCents: number;
  /** Despesa do período, em centavos inteiros (positiva). */
  expenseCents: number;
  /** Receita em unidade monetária. */
  revenue: number;
  /** Despesa em unidade monetária (positiva). */
  expense: number;
  /** Receita menos despesa. */
  result: number;
}

export interface CostCenterBreakdown {
  /** Uma linha por centro presente no conjunto + o balde sem centro (se houver). */
  rows: CostCenterBreakdownRow[];
  totals: {
    revenueCents: number;
    expenseCents: number;
    revenue: number;
    expense: number;
    result: number;
  };
}

function toCents(amount: number | string): number {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function centsToMoney(cents: number): number {
  return cents / 100;
}

/**
 * Agrupa receita e despesa por `cost_center_id`.
 *
 * @param txns  Conjunto JÁ filtrado/cortado pelo chamador (ver nota do módulo).
 * @param order Ids na ordem em que devem sair (ex.: ordem alfabética dos centros
 *              cadastrados). Centros presentes no conjunto mas fora de `order`
 *              entram depois, na ordem de aparição. O balde sem centro é sempre
 *              o último.
 */
export function buildCostCenterBreakdown(
  txns: CostCenterTxnLike[] | null | undefined,
  order?: string[],
): CostCenterBreakdown {
  const revenue = new Map<string | null, number>();
  const expense = new Map<string | null, number>();
  const seen: (string | null)[] = [];

  const touch = (key: string | null) => {
    if (!revenue.has(key)) {
      revenue.set(key, 0);
      expense.set(key, 0);
      seen.push(key);
    }
  };

  let totalRevenueCents = 0;
  let totalExpenseCents = 0;

  for (const t of txns ?? []) {
    // String vazia (vinda de um form que nunca normalizou) conta como "sem
    // centro" — senão viraria um balde fantasma com rótulo em branco.
    const raw = t.cost_center_id;
    const key = raw && String(raw).trim() !== '' ? String(raw) : null;
    touch(key);
    const cents = toCents(t.amount);
    if (t.transaction_type === 'entrada') {
      revenue.set(key, (revenue.get(key) ?? 0) + cents);
      totalRevenueCents += cents;
    } else {
      expense.set(key, (expense.get(key) ?? 0) + cents);
      totalExpenseCents += cents;
    }
  }

  const withCenter = seen.filter((k): k is string => k !== null);
  const ordered: string[] = [];
  for (const id of order ?? []) {
    if (revenue.has(id) && !ordered.includes(id)) ordered.push(id);
  }
  for (const id of withCenter) {
    if (!ordered.includes(id)) ordered.push(id);
  }

  const keys: (string | null)[] = [...ordered];
  if (seen.includes(null)) keys.push(null);

  const rows: CostCenterBreakdownRow[] = keys.map((id) => {
    const revenueCents = revenue.get(id) ?? 0;
    const expenseCents = expense.get(id) ?? 0;
    return {
      id,
      revenueCents,
      expenseCents,
      revenue: centsToMoney(revenueCents),
      expense: centsToMoney(expenseCents),
      result: centsToMoney(revenueCents - expenseCents),
    };
  });

  return {
    rows,
    totals: {
      revenueCents: totalRevenueCents,
      expenseCents: totalExpenseCents,
      revenue: centsToMoney(totalRevenueCents),
      expense: centsToMoney(totalExpenseCents),
      result: centsToMoney(totalRevenueCents - totalExpenseCents),
    },
  };
}

/**
 * Aplica o filtro multisseleção de centro de custo.
 *
 * Semântica do repo: `selected` vazio = TODOS (filtro inativo). O balde
 * `NO_COST_CENTER` casa com lançamento sem centro.
 */
export function filterByCostCenters<T extends { cost_center_id?: string | null }>(
  txns: T[],
  selected: string[],
): T[] {
  if (!selected || selected.length === 0) return txns;
  const wantsNone = selected.includes(NO_COST_CENTER);
  const ids = new Set(selected.filter((s) => s !== NO_COST_CENTER));
  return txns.filter((t) => {
    const raw = t.cost_center_id;
    const id = raw && String(raw).trim() !== '' ? String(raw) : null;
    if (id === null) return wantsNone;
    return ids.has(id);
  });
}
