export const PDV_MONEY_MAX_CENTS = 9_000_000_000_000_000;

export interface PdvMoneyAmount {
  cents: number;
  decimal: string;
}

export function pdvMoneyDecimalFromCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > PDV_MONEY_MAX_CENTS) throw new Error('Valor monetário inválido.');
  const whole = Math.floor(cents / 100);
  return `${whole}.${String(cents % 100).padStart(2, '0')}`;
}

export function pdvMoneyInputFromCents(cents: number): string {
  return pdvMoneyDecimalFromCents(cents).replace('.', ',');
}

export function formatPdvMoneyCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function parsePdvMoneyText(
  input: string,
  limits: { minCents?: number; maxCents?: number } = {},
): PdvMoneyAmount | null {
  const text = input.trim();
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(text);
  if (!match) return null;

  const whole = match[1].replace(/^0+(?=\d)/, '');
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const rawCents = BigInt(whole) * 100n + BigInt(fraction || '0');
  if (rawCents > BigInt(PDV_MONEY_MAX_CENTS)) return null;

  const cents = Number(rawCents);
  const minCents = limits.minCents ?? 0;
  const maxCents = limits.maxCents ?? PDV_MONEY_MAX_CENTS;
  if (!Number.isSafeInteger(minCents) || !Number.isSafeInteger(maxCents) || minCents < 0 || maxCents < minCents) return null;
  if (cents < minCents || cents > maxCents) return null;
  return { cents, decimal: pdvMoneyDecimalFromCents(cents) };
}

export function pdvMoneyCentsFromNumber(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  return parsePdvMoneyText(String(value))?.cents ?? null;
}
