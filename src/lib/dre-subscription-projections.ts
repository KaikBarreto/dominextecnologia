/**
 * Motor puro das projeções de assinaturas no DRE.
 *
 * A projeção é somente uma lente de leitura: nunca cria cobrança nem lançamento
 * financeiro. Cada ciclo tem uma chave determinística `assinatura:data`. Quando
 * a cobrança daquele ciclo já existe, ela deixa de ser previsão. Assinaturas
 * ligadas a contrato também respeitam a parcela/recebível já materializada pelo
 * próprio contrato, que existe antes da cobrança online.
 */

export interface DreProjectionSubscription {
  id: string;
  value: number | string;
  cycle: string;
  next_due_date: string | null;
  status: string;
  description: string | null;
  category: string | null;
  cost_center_id: string | null;
  customer_id: string | null;
  source_type: string | null;
  source_id: string | null;
  max_payments?: number | null;
}

export interface DreProjectionCharge {
  id: string;
  subscription_id: string | null;
  due_date: string | null;
}

export interface DreProjectionTransaction {
  contract_id?: string | null;
  due_date?: string | null;
  transaction_date?: string | null;
  transaction_type?: string | null;
  cancelled_at?: string | null;
}

export interface DreSubscriptionProjection {
  key: string;
  subscriptionId: string;
  cycleDate: string;
  amount: number;
  description: string;
  category: string | null;
  costCenterId: string | null;
  customerId: string | null;
}

interface BuildProjectionInput {
  subscriptions: DreProjectionSubscription[];
  charges: DreProjectionCharge[];
  transactions: DreProjectionTransaction[];
  /** Bordas em YYYY-MM-DD. `rangeEnd` é obrigatório porque recorrência contínua não tem fim. */
  rangeStart?: string | null;
  rangeEnd?: string | null;
  /** Hoje no fuso da empresa, em YYYY-MM-DD. Projeção nunca volta no passado. */
  today: string;
}

export function shouldLoadDreSubscriptionProjections(input: {
  hasChargeModule: boolean;
  regime: 'caixa' | 'competencia';
  includeProjections: boolean;
  rangeEnd?: string | null;
}): boolean {
  return (
    input.hasChargeModule &&
    input.regime === 'competencia' &&
    input.includeProjections &&
    !!input.rangeEnd
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CYCLES_PER_SUBSCRIPTION = 10_000;

function parseDateOnly(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

function formatUtcDate(date: Date): string {
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function addDaysFromAnchor(anchor: { year: number; month: number; day: number }, days: number): string {
  return formatUtcDate(new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day) + days * DAY_MS));
}

/**
 * Soma meses sempre a partir da âncora original. Isso evita a deriva
 * 31/jan → 28/fev → 28/mar; o segundo ciclo volta corretamente para 31/mar.
 */
function addMonthsFromAnchor(anchor: { year: number; month: number; day: number }, months: number): string {
  const monthIndex = anchor.month - 1 + months;
  const targetYear = anchor.year + Math.floor(monthIndex / 12);
  const targetMonthIndex = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  return formatUtcDate(new Date(Date.UTC(targetYear, targetMonthIndex, Math.min(anchor.day, lastDay))));
}

function cycleDate(anchor: { year: number; month: number; day: number }, cycle: string, index: number): string | null {
  switch (cycle.toUpperCase()) {
    case 'WEEKLY': return addDaysFromAnchor(anchor, index * 7);
    case 'BIWEEKLY': return addDaysFromAnchor(anchor, index * 14);
    case 'MONTHLY': return addMonthsFromAnchor(anchor, index);
    case 'QUARTERLY': return addMonthsFromAnchor(anchor, index * 3);
    case 'SEMIANNUALLY': return addMonthsFromAnchor(anchor, index * 6);
    case 'YEARLY': return addMonthsFromAnchor(anchor, index * 12);
    default: return null;
  }
}

export function subscriptionCycleKey(subscriptionId: string, dueDate: string): string {
  return `${subscriptionId}:${dueDate}`;
}

export function buildDreSubscriptionProjections({
  subscriptions,
  charges,
  transactions,
  rangeStart,
  rangeEnd,
  today,
}: BuildProjectionInput): DreSubscriptionProjection[] {
  // Sem uma data final, uma assinatura contínua teria infinitos ciclos.
  if (!rangeEnd || !parseDateOnly(rangeEnd) || !parseDateOnly(today)) return [];

  const projectionStart = rangeStart && rangeStart > today ? rangeStart : today;
  if (projectionStart > rangeEnd) return [];

  const materializedCycles = new Set<string>();
  const materializedCountBySubscription = new Map<string, number>();
  charges.forEach((charge) => {
    if (charge.subscription_id && charge.due_date) {
      materializedCycles.add(subscriptionCycleKey(charge.subscription_id, charge.due_date));
      materializedCountBySubscription.set(
        charge.subscription_id,
        (materializedCountBySubscription.get(charge.subscription_id) ?? 0) + 1,
      );
    }
  });

  // Contratos já criam suas parcelas no Financeiro. A assinatura serve como
  // meio de cobrança e não pode transformar a mesma parcela em nova previsão.
  const contractReceivableDates = new Set<string>();
  transactions.forEach((transaction) => {
    if (
      transaction.transaction_type !== 'entrada' ||
      transaction.cancelled_at ||
      !transaction.contract_id
    ) return;
    const date = transaction.due_date || transaction.transaction_date;
    if (date) contractReceivableDates.add(`${transaction.contract_id}:${date}`);
  });

  const projections: DreSubscriptionProjection[] = [];

  subscriptions.forEach((subscription) => {
    if (subscription.status.toLowerCase() !== 'active' || !subscription.next_due_date) return;
    const anchor = parseDateOnly(subscription.next_due_date);
    const amount = Number(subscription.value);
    if (!anchor || !Number.isFinite(amount) || amount <= 0) return;

    const alreadyMaterialized = materializedCountBySubscription.get(subscription.id) ?? 0;
    const cycleLimit = subscription.max_payments && subscription.max_payments > 0
      ? Math.min(Math.max(subscription.max_payments - alreadyMaterialized, 0), MAX_CYCLES_PER_SUBSCRIPTION)
      : MAX_CYCLES_PER_SUBSCRIPTION;
    for (let index = 0; index < cycleLimit; index += 1) {
      const date = cycleDate(anchor, subscription.cycle, index);
      if (!date || date > rangeEnd) break;
      if (date < projectionStart) continue;

      const key = subscriptionCycleKey(subscription.id, date);
      if (materializedCycles.has(key)) continue;
      if (
        subscription.source_type === 'contract' &&
        subscription.source_id &&
        contractReceivableDates.has(`${subscription.source_id}:${date}`)
      ) continue;

      projections.push({
        key,
        subscriptionId: subscription.id,
        cycleDate: date,
        amount,
        description: subscription.description?.trim() || 'Assinatura recorrente',
        category: subscription.category,
        costCenterId: subscription.cost_center_id,
        customerId: subscription.customer_id,
      });
    }
  });

  return projections.sort((a, b) => a.cycleDate.localeCompare(b.cycleDate) || a.key.localeCompare(b.key));
}
