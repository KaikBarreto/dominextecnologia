/**
 * Motor de cálculo dos DESCONTOS DO EMPREGADO (lado do trabalhador) para o holerite CLT:
 * INSS (progressivo), IRRF e vale-transporte. NÃO calcula encargos patronais (isso é o
 * employeeCostProvisions.ts). Módulo puro, sem React.
 *
 * Valores são estimativas com base nas tabelas da competência — confirmar com o contador.
 */
import { getPayrollTables } from "@/utils/payrollTables";

export interface PayrollInput {
  grossBase: number;
  salary: number;
  dependentsCount: number;
  vtEnabled: boolean;
  vtMonthlyValue: number;
  competenceYear: number;
  competenceMonth?: number;
}

export interface PayrollResult {
  inss: number;
  irrf: number;
  vt: number;
  baseINSS: number;
  baseIRRF: number;
  inssEffectiveRate: number;
  inssMarginalRate: number;
  irrfBeforeReduction: number;
  irrfReduction: number;
  irrfDeductionType: "legal" | "simplified";
  irrfDeductionAmount: number;
  totalDescontosLegais: number;
}

const roundMoney = (value: number) => Math.round((value + Math.sign(value) * 1e-9) * 100) / 100;

export function calculatePayrollDeductions(input: PayrollInput): PayrollResult {
  const t = getPayrollTables(input.competenceYear, input.competenceMonth ?? 12);

  const teto = t.inss[t.inss.length - 1].ate;
  const baseINSS = Math.min(Math.max(0, input.grossBase), teto);
  let inss = 0;
  let prev = 0;
  for (const faixa of t.inss) {
    const topo = Math.min(baseINSS, faixa.ate);
    if (topo > prev) {
      inss += (topo - prev) * faixa.aliquota;
      prev = topo;
    }
    if (baseINSS <= faixa.ate) break;
  }

  const inssRounded = roundMoney(inss);
  const legalDeductions = roundMoney(
    inssRounded + Math.max(0, input.dependentsCount) * t.irrf.deducaoDependente,
  );
  const simplifiedDeduction = t.irrf.descontoSimplificado;
  const irrfDeductionType = legalDeductions >= simplifiedDeduction ? "legal" : "simplified";
  const irrfDeductionAmount = Math.max(legalDeductions, simplifiedDeduction);
  const baseIRRF = roundMoney(Math.max(0, input.grossBase - irrfDeductionAmount));
  const faixaIrrf = t.irrf.faixas.find((f) => baseIRRF <= f.ate) ?? t.irrf.faixas[t.irrf.faixas.length - 1];
  const irrfBeforeReduction = roundMoney(
    Math.max(0, baseIRRF * faixaIrrf.aliquota - faixaIrrf.deduzir),
  );

  let irrfReduction = 0;
  const reduction = t.irrf.reducao;
  if (reduction && input.grossBase <= reduction.reducaoParcialAte) {
    const legalReduction = input.grossBase <= reduction.isencaoTotalAte
      ? reduction.reducaoMaxima
      : Math.max(0, reduction.parcelaFixa - reduction.fatorRenda * input.grossBase);
    irrfReduction = roundMoney(Math.min(irrfBeforeReduction, legalReduction));
  }
  const irrf = roundMoney(Math.max(0, irrfBeforeReduction - irrfReduction));

  const vt = input.vtEnabled
    ? Math.min(Math.max(0, input.salary) * 0.06, Math.max(0, input.vtMonthlyValue))
    : 0;
  const inssMarginalRate = baseINSS > 0
    ? t.inss.find((faixa) => baseINSS <= faixa.ate)?.aliquota ?? t.inss[t.inss.length - 1].aliquota
    : 0;

  return {
    inss: inssRounded,
    irrf,
    vt: roundMoney(vt),
    baseINSS,
    baseIRRF,
    inssEffectiveRate: baseINSS > 0 ? inssRounded / baseINSS : 0,
    inssMarginalRate,
    irrfBeforeReduction,
    irrfReduction,
    irrfDeductionType,
    irrfDeductionAmount,
    totalDescontosLegais: roundMoney(inssRounded + irrf + vt),
  };
}
