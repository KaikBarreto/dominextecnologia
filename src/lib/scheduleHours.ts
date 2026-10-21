/**
 * Faixa de horas que a grade da agenda (semana e dia) precisa desenhar.
 *
 * A grade era fixa em 07:00–20:00 nos dois calendários. O card é posicionado por
 * `((hora - primeiraHora) + min/60) * SLOT_HEIGHT`, então uma OS às 06:00 caía em
 * offset NEGATIVO (acima da grade) e uma às 22:00 caía abaixo do último slot —
 * nos dois casos, fora da área desenhada. A OS existia, estava correta no banco,
 * e simplesmente não tinha pixel onde aparecer.
 *
 * Aqui a faixa passa a ser elástica: mantém 07:00–20:00 como piso/teto confortável
 * (pra grade não encolher num dia vazio) e ESTICA pra caber o que realmente existe
 * no período visível, inclusive a duração — OS das 20:00 com 2h estende até as 21h.
 */

export const DEFAULT_FIRST_HOUR = 7;
export const DEFAULT_LAST_HOUR = 20;
const DEFAULT_DURATION_MINUTES = 120;

export interface HourRangeEntry {
  scheduled_time?: string | null;
  duration_minutes?: number | null;
}

export function buildHourRange(entries: HourRangeEntry[]): number[] {
  let first = DEFAULT_FIRST_HOUR;
  let last = DEFAULT_LAST_HOUR;

  for (const entry of entries ?? []) {
    if (!entry?.scheduled_time) continue;
    const [rawHour, rawMinute] = String(entry.scheduled_time).split(':');
    const hour = Number(rawHour);
    if (!Number.isFinite(hour)) continue;

    const startHour = Math.max(0, Math.min(23, Math.floor(hour)));
    if (startHour < first) first = startHour;

    const minute = Number.isFinite(Number(rawMinute)) ? Number(rawMinute) : 0;
    const duration = Number(entry.duration_minutes) > 0
      ? Number(entry.duration_minutes)
      : DEFAULT_DURATION_MINUTES;
    // `- 1` pra uma OS que termina exatamente no começo da hora cheia não exigir
    // uma linha a mais de grade (09:00 + 60min termina às 10:00 e cabe na de 09h).
    const endHour = Math.min(23, Math.floor((startHour * 60 + minute + duration - 1) / 60));
    if (endHour > last) last = endHour;
  }

  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}
