export interface InstallmentPlanItem {
  number: number;
  value: number;
  dueDate: string;
}

export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

interface CivilDate {
  year: number;
  month: number;
  day: number;
}

export function parseCivilDate(value: string): CivilDate | null {
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

export function formatCivilDate(date: CivilDate): string {
  return `${String(date.year).padStart(4, "0")}-${
    String(date.month).padStart(2, "0")
  }-${String(date.day).padStart(2, "0")}`;
}

/** Dia civil do instante no fuso da empresa, com fallback canônico do app. */
export function todayInTimeZone(
  timeZone: string | null | undefined,
  now = new Date(),
): string {
  const candidate = typeof timeZone === "string" && timeZone.trim()
    ? timeZone.trim()
    : DEFAULT_TIME_ZONE;
  const format = (zone: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values = Object.fromEntries(
      parts.filter((part) => part.type !== "literal").map((part) => [
        part.type,
        part.value,
      ]),
    );
    return `${values.year}-${values.month}-${values.day}`;
  };
  try {
    return format(candidate);
  } catch {
    return format(DEFAULT_TIME_ZONE);
  }
}

/** Soma meses preservando o dia original e limita ao último dia do mês. */
export function addCivilMonths(firstDueDate: string, months: number): string {
  const first = parseCivilDate(firstDueDate);
  if (!first) throw new Error("invalid_first_due_date");
  const monthIndex = first.month - 1 + months;
  const targetYear = first.year + Math.floor(monthIndex / 12);
  const targetMonthIndex = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0))
    .getUTCDate();
  return formatCivilDate({
    year: targetYear,
    month: targetMonthIndex + 1,
    day: Math.min(first.day, lastDay),
  });
}

/**
 * Divide em centavos: as N-1 primeiras parcelas são iguais e a última recebe
 * o resíduo. A soma sempre volta exatamente ao total informado.
 */
export function buildInstallmentPlan(
  totalValue: number,
  installmentCount: number,
  firstDueDate: string,
): InstallmentPlanItem[] {
  if (
    !Number.isInteger(installmentCount) || installmentCount < 2 ||
    installmentCount > 12
  ) {
    throw new Error("invalid_installment_count");
  }
  if (!parseCivilDate(firstDueDate)) throw new Error("invalid_first_due_date");
  const totalCents = Math.round(totalValue * 100);
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new Error("invalid_total_value");
  }
  const regularCents = Math.floor(totalCents / installmentCount);
  return Array.from({ length: installmentCount }, (_, index) => {
    const number = index + 1;
    const cents = number === installmentCount
      ? totalCents - regularCents * (installmentCount - 1)
      : regularCents;
    return {
      number,
      value: cents / 100,
      dueDate: addCivilMonths(firstDueDate, index),
    };
  });
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source).sort().map((key) => [key, canonicalize(source[key])]),
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
