export interface FinancialAccountPriorityItem {
  is_paid?: boolean | null;
  due_date?: string | null;
  paid_date?: string | null;
  transaction_date?: string | null;
}

export type FinancialAccountPriority = 0 | 1 | 2;

/**
 * Prioridade operacional da lista de contas:
 * 0. vencida e ainda em aberto;
 * 1. pendente (inclusive sem vencimento ou com vencimento hoje);
 * 2. paga/recebida.
 *
 * `today` deve vir no formato YYYY-MM-DD e no fuso da empresa. Comparar o dia
 * ISO evita que o fuso do navegador transforme uma conta de hoje em vencida.
 */
export function getFinancialAccountPriority(
  item: FinancialAccountPriorityItem,
  today: string,
): FinancialAccountPriority {
  if (item.is_paid) return 2;

  const dueDate = normalizeDay(item.due_date);
  return dueDate && dueDate < today ? 0 : 1;
}

/**
 * Ordena sem alterar o array recebido. Dentro dos grupos em aberto, vence
 * primeiro quem tem a data mais próxima/antiga. Entre as contas já realizadas,
 * as baixas mais recentes ficam antes das antigas, mas sempre depois de todas
 * as vencidas e pendentes.
 */
export function sortFinancialAccountsByPriority<T extends FinancialAccountPriorityItem>(
  items: readonly T[],
  today: string,
): T[] {
  return [...items].sort((a, b) => {
    const aPriority = getFinancialAccountPriority(a, today);
    const bPriority = getFinancialAccountPriority(b, today);

    if (aPriority !== bPriority) return aPriority - bPriority;

    if (aPriority === 2) {
      const aPaidDate = normalizeDay(a.paid_date) ?? normalizeDay(a.due_date) ?? normalizeDay(a.transaction_date);
      const bPaidDate = normalizeDay(b.paid_date) ?? normalizeDay(b.due_date) ?? normalizeDay(b.transaction_date);
      return compareOptionalDays(aPaidDate, bPaidDate, 'desc');
    }

    return compareOptionalDays(normalizeDay(a.due_date), normalizeDay(b.due_date), 'asc');
  });
}

function normalizeDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;

  const parsed = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return null;
  return day;
}

function compareOptionalDays(
  a: string | null,
  b: string | null,
  direction: 'asc' | 'desc',
): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return direction === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
}
