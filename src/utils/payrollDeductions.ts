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
}

export interface PayrollResult {
  inss: number;
  irrf: number;
  vt: number;
  baseINSS: number;
  baseIRRF: number;
  totalDescontosLegais: number;
}

export function calculatePayrollDeductions(input: PayrollInput): PayrollResult {
  const t = getPayrollTables(input.competenceYear);

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

  const abatimento = Math.max(
    input.dependentsCount * t.irrf.deducaoDependente,
    t.irrf.descontoSimplificado,
  );
  const baseIRRF = Math.max(0, input.grossBase - inss - abatimento);
  const faixaIrrf = t.irrf.faixas.find((f) => baseIRRF <= f.ate) ?? t.irrf.faixas[t.irrf.faixas.length - 1];
  const irrf = Math.max(0, baseIRRF * faixaIrrf.aliquota - faixaIrrf.deduzir);

  const vt = input.vtEnabled ? Math.min(input.salary * 0.06, input.vtMonthlyValue) : 0;

  return {
    inss: Math.round(inss * 100) / 100,
    irrf: Math.round(irrf * 100) / 100,
    vt: Math.round(vt * 100) / 100,
    baseINSS,
    baseIRRF,
    totalDescontosLegais: Math.round((inss + irrf + vt) * 100) / 100,
  };
}
