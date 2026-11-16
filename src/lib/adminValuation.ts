// Arithmetic mean uses only named company columns with numeric values; workbook summary columns are excluded.
export const ARR_MARKET_REFERENCE = {
  date: "2026-10-31",
  median: 4.97,
  mean: 6.57,
  companies: 62,
  sourceUrl: "https://www.saas-capital.com/the-saas-capital-index/",
  dataUrl:
    "https://www.saas-capital.com/wp-content/uploads/2026/11/SaaS-Capital-Index-Downloadable-Data-2026-10-31.xlsx",
} as const;

// ARR scenarios are management assumptions around the market median, not sample percentiles.
export const DEFAULT_VALUATION_MULTIPLES = {
  arr: ["3", "5", "7"],
  profit: ["0,8", "1,2", "1,6"],
  // Base 1x annualized receipts is exactly 12x the selected monthly revenue.
  monthly: ["0,8", "1", "1,2"],
};

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
