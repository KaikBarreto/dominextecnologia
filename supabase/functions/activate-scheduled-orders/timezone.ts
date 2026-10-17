export interface CompanyClock {
  date: string;
  time: string;
  timezone: string;
}

function safeTimezone(timezone: string | null | undefined): string | null {
  const candidate = timezone?.trim();
  if (!candidate) return null;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return null;
  }
}

/**
 * Resolve o relogio civil da empresa sem depender do timezone do processo da edge.
 * `scheduled_date`/`scheduled_time` sao DATE/TIME sem fuso, entao a comparacao
 * precisa usar exatamente este relogio, e nao `toISOString()` (UTC).
 */
export function companyClock(
  now: Date,
  timezone: string | null | undefined,
): CompanyClock | null {
  const resolvedTimezone = safeTimezone(timezone);
  if (!resolvedTimezone) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolvedTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}:${value("second")}`,
    timezone: resolvedTimezone,
  };
}
