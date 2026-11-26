/** Valor de recebimento em centavos: aceita decimal com ponto ou vírgula e agrupamento PT-BR. */
export function parseReceiptAmount(input: string): number {
  const text = input.trim();
  if (!text) return 0;
  const normalized = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(text)
    ? text.replace(/\./g, '').replace(',', '.')
    : /^\d+(?:[.,]\d{1,2})?$/.test(text) ? text.replace(',', '.') : '';
  const value = normalized ? Number(normalized) : NaN;
  return Number.isSafeInteger(Math.round(value * 100)) ? value : NaN;
}
