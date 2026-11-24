/** Datas civis do gateway pertencem ao calendário brasileiro. Timestamps com
 * offset preservam o instante informado; datas inválidas não viram âncora.
 */
export function parseSubscriptionGatewayPaidAt(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const input = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(input);
  const civilDate = input.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(civilDate)) return null;
  const civilCheck = new Date(`${civilDate}T12:00:00Z`);
  if (!Number.isFinite(civilCheck.getTime()) || civilCheck.toISOString().slice(0, 10) !== civilDate) return null;
  const normalized = dateOnly ? `${input}T00:00:00-03:00`
    : /(?:Z|[+-]\d{2}:?\d{2})$/i.test(input) ? input
    : `${input.replace(' ', 'T')}-03:00`;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
