const VALID_BRAZIL_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export function phoneDigits(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

/** Valida telefone brasileiro com DDD: fixo (10) ou celular (11, nono dígito). */
export function isValidBrazilianPhone(value: unknown): boolean {
  const digits = phoneDigits(value);
  if (digits.length !== 10 && digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  if (!VALID_BRAZIL_DDDS.has(Number(digits.slice(0, 2)))) return false;
  const subscriber = digits.slice(2);
  return digits.length === 11 ? subscriber.startsWith('9') : /^[2-5]/.test(subscriber);
}
