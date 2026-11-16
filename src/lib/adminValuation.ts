export function parseValuationNumber(
  value: string,
  min = -1e9,
  max = 1e9,
): number | null {
  const text = value.trim();
  if (!/^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return null;
  const number = Number(text.replace(",", "."));
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}

export function projectValuation(
  mrr: number,
  growth: number,
  churn: number,
  margin: number,
) {
  return Array.from({ length: 13 }, (_, month) => {
    const monthlyRevenue = mrr *
      ((1 + growth / 100) * (1 - churn / 100)) ** month;
    return {
      month: month === 0 ? "Hoje" : `M${month}`,
      mrr: monthlyRevenue,
      result: monthlyRevenue * margin / 100,
    };
  });
}
