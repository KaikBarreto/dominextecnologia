/**
 * Estado derivado de uma assinatura recorrente a partir das cobranças que ela
 * gerou. Datas são dias civis `YYYY-MM-DD`; não passam por Date local/fuso.
 *
 * Fonte da verdade:
 * - cobrança OVERDUE em aberto mantém a assinatura vencida;
 * - sem cobrança vencida em aberto, uma assinatura viva volta a active;
 * - o próximo vencimento é a cobrança aberta mais antiga;
 * - se o próximo ciclo ainda não foi materializado, avança a grade recorrente.
 */

export interface SubscriptionChargeState {
  status?: string | null;
  due_date?: string | null;
}

export interface TenantSubscriptionStateInput {
  currentStatus: string;
  currentNextDueDate?: string | null;
  cycle: string;
  charges: SubscriptionChargeState[];
  paymentDueDate?: string | null;
  today: string;
}

export interface TenantSubscriptionStateResult {
  status: string;
  nextDueDate: string | null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const OPEN_STATUSES = new Set([
  'PENDING',
  'PENDING_CREATION',
  'AWAITING_RISK_ANALYSIS',
  'AWAITING_PAYMENT',
  'OVERDUE',
]);

function validIsoDay(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function formatUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(base: string, days: number): string {
  const [year, month, day] = base.split('-').map(Number);
  return formatUtcDay(new Date(Date.UTC(year, month - 1, day + days)));
}

/** Soma meses sempre desde a âncora, preservando o dia com clamp de fim de mês. */
function addMonthsFromAnchor(base: string, months: number): string {
  const [year, month, day] = base.split('-').map(Number);
  const targetMonthIndex = (year * 12) + (month - 1) + months;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return formatUtcDay(new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))));
}

/**
 * Próximo ponto da grade depois de `baseDueDate`, nunca anterior a `minimumDate`.
 * Retorna null para ciclo/data inválidos em vez de inventar um vencimento.
 */
export function nextRecurringDueDate(
  baseDueDate: string | null | undefined,
  cycle: string,
  minimumDate: string,
): string | null {
  if (!validIsoDay(baseDueDate) || !validIsoDay(minimumDate)) return null;

  const normalizedCycle = String(cycle ?? '').toUpperCase();
  const dayStep = normalizedCycle === 'WEEKLY'
    ? 7
    : normalizedCycle === 'BIWEEKLY'
    ? 14
    : null;
  const monthStep = normalizedCycle === 'MONTHLY'
    ? 1
    : normalizedCycle === 'QUARTERLY'
    ? 3
    : normalizedCycle === 'SEMIANNUALLY'
    ? 6
    : normalizedCycle === 'YEARLY'
    ? 12
    : null;

  if (dayStep == null && monthStep == null) return null;

  // 240 ciclos cobre mais de 19 anos mesmo na cadência semanal. O limite evita
  // laço infinito se um dado inesperado escapar das validações acima.
  for (let occurrence = 1; occurrence <= 240; occurrence += 1) {
    const candidate = dayStep != null
      ? addDays(baseDueDate, dayStep * occurrence)
      : addMonthsFromAnchor(baseDueDate, (monthStep as number) * occurrence);
    if (candidate >= minimumDate) return candidate;
  }
  return null;
}

export function resolveTenantSubscriptionState(
  input: TenantSubscriptionStateInput,
): TenantSubscriptionStateResult {
  const openCharges = input.charges
    .filter((charge) => OPEN_STATUSES.has(String(charge.status ?? '').trim().toUpperCase()))
    .filter((charge) => validIsoDay(charge.due_date))
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));

  const hasOverdue = openCharges.some(
    (charge) => String(charge.status ?? '').trim().toUpperCase() === 'OVERDUE',
  );

  // Cancelada/pausada/pending têm semântica própria e nunca são reativadas por
  // uma baixa atrasada. Só alternamos os dois estados financeiros vivos.
  const currentStatus = String(input.currentStatus ?? '').toLowerCase();
  const status = currentStatus === 'active' || currentStatus === 'overdue'
    ? (hasOverdue ? 'overdue' : 'active')
    : currentStatus;

  const openDueDate = openCharges[0]?.due_date ?? null;
  if (openDueDate) return { status, nextDueDate: openDueDate };

  const currentNext = validIsoDay(input.currentNextDueDate)
    ? input.currentNextDueDate
    : null;
  const paidDue = validIsoDay(input.paymentDueDate) ? input.paymentDueDate : null;

  // Evento antigo fora de ordem: se o espelho local já conhece um vencimento
  // posterior ao ciclo pago e ele ainda não passou, preserva-o.
  if (
    currentNext && currentNext >= input.today &&
    (!paidDue || currentNext > paidDue)
  ) {
    return { status, nextDueDate: currentNext };
  }

  const anchor = paidDue ?? currentNext;
  return {
    status,
    nextDueDate: nextRecurringDueDate(anchor, input.cycle, input.today) ?? currentNext,
  };
}
