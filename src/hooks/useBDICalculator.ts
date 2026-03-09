import { useMemo } from 'react';

export interface BDIItemInput {
  totalCost: number;
  profitRate?: number; // override opcional por item
}

export interface BDIInput {
  taxRate: number;
  adminRate: number;
  profitRate: number;
  items: BDIItemInput[];
  distanceKm: number;
  kmCost: number;
  cardDiscountRate?: number; // % (ex: 6)
  cardInstallments?: number; // ex: 10
}

export interface BDIResult {
  bdiFactor: number;
  displacementCost: number;
  totalCost: number;
  finalPrice: number;
  cashPrice: number;
  installmentValue: number;
  weightedProfitRate: number;
}

function clampBDI(bdi: number) {
  // evita divisão por zero e cenários inválidos
  return Number.isFinite(bdi) ? Math.max(0.01, bdi) : 0.01;
}

export function calculateBDI(input: BDIInput): BDIResult {
  const {
    taxRate,
    adminRate,
    profitRate,
    items,
    distanceKm,
    kmCost,
    cardDiscountRate = 6,
    cardInstallments = 10,
  } = input;

  // 1) BDI: (100 - (taxa_imposto + taxa_adm_indireta + lucro)) / 100
  const rawBdi = (100 - (taxRate + adminRate + profitRate)) / 100;
  const bdiFactor = clampBDI(rawBdi);

  // 3) Custo deslocamento: km × custo_por_km
  const displacementCost = Math.max(0, (distanceKm || 0) * (kmCost || 0));

  const itemsCost = (items ?? []).reduce((sum, it) => sum + (it.totalCost || 0), 0);

  // 4) Custo total: (custo_servico × quantidade) + custo_deslocamento_total
  const totalCost = Math.max(0, itemsCost + displacementCost);

  // 5) Preço final: custo_total_orcamento / BDI
  const finalPrice = totalCost / bdiFactor;

  // 6) Valor à vista: preco_final × 0.94 (6% desconto)
  const cashPrice = finalPrice * (1 - (cardDiscountRate || 0) / 100);

  // 7) Parcela cartão: preco_final / 10
  const installments = Math.max(1, Math.floor(cardInstallments || 10));
  const installmentValue = finalPrice / installments;

  // 8) Lucro ponderado: soma(lucro_item × proporcao_item_no_total)
  const weightedProfitRate = (() => {
    const denom = itemsCost > 0 ? itemsCost : 0;
    if (!denom) return profitRate;
    const weighted = (items ?? []).reduce((acc, it) => {
      const pr = it.profitRate ?? profitRate;
      const proportion = (it.totalCost || 0) / denom;
      return acc + pr * proportion;
    }, 0);
    return Number.isFinite(weighted) ? weighted : profitRate;
  })();

  return {
    bdiFactor,
    displacementCost,
    totalCost,
    finalPrice,
    cashPrice,
    installmentValue,
    weightedProfitRate,
  };
}

export function useBDICalculator(input: BDIInput) {
  return useMemo(() => calculateBDI(input), [
    input.taxRate,
    input.adminRate,
    input.profitRate,
    input.distanceKm,
    input.kmCost,
    input.cardDiscountRate,
    input.cardInstallments,
    // itens (dep simples)
    JSON.stringify(input.items ?? []),
  ]);
}
