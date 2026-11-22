import type { PdvSalesDimension, PdvSalesRow } from "@/hooks/usePdvReportsV2";

export const SALES_DIMENSION_LABELS: Record<PdvSalesDimension, string> = {
  product: "Produtos",
  customer: "Clientes",
  salesperson: "Vendedores",
  hour: "Horários",
};

export const SALES_NAME_HEADER: Record<PdvSalesDimension, string> = {
  product: "Produto",
  customer: "Cliente",
  salesperson: "Vendedor",
  hour: "Horário",
};

/** "8" vira "08h às 09h"; demais dimensões usam o nome que vem do servidor. */
export function salesRowLabel(row: PdvSalesRow, dimension: PdvSalesDimension): string {
  if (dimension !== "hour") return row.label;
  const hour = Number(row.key);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return row.label;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hour)}h às ${pad((hour + 1) % 24)}h`;
}
