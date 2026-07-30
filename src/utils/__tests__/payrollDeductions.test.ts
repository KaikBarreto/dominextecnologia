import { describe, it, expect } from "vitest";
import { calculatePayrollDeductions, type PayrollInput } from "@/utils/payrollDeductions";

const base = (over: Partial<PayrollInput> = {}): PayrollInput => ({
  grossBase: 3000,
  salary: 3000,
  dependentsCount: 0,
  vtEnabled: false,
  vtMonthlyValue: 0,
  competenceYear: 2025,
  ...over,
});

describe("calculatePayrollDeductions", () => {
  it("INSS progressivo: salário 1518 → 113,85 (só a 1ª faixa)", () => {
    const r = calculatePayrollDeductions(base({ grossBase: 1518, salary: 1518 }));
    expect(r.inss).toBeCloseTo(113.85, 2);
  });

  it("INSS progressivo: salário 3000 → soma das 3 primeiras faixas (253,41)", () => {
    const r = calculatePayrollDeductions(base({ grossBase: 3000 }));
    expect(r.inss).toBeCloseTo(253.41, 2);
  });

  it("INSS trava no teto: acima de 8.157,41 → contribuição máxima ~951,63", () => {
    const r = calculatePayrollDeductions(base({ grossBase: 12000, salary: 12000 }));
    expect(r.inss).toBeCloseTo(951.63, 2);
  });

  it("IRRF: salário 3000 sem dependentes com desconto simplificado → isento", () => {
    const r = calculatePayrollDeductions(base({ grossBase: 3000 }));
    expect(r.irrf).toBe(0);
  });

  it("IRRF: salário 4000 sem dependentes → 77,83 (faixa 15%)", () => {
    const r = calculatePayrollDeductions(base({ grossBase: 4000, salary: 4000 }));
    expect(r.irrf).toBeCloseTo(77.83, 2);
  });

  it("VT: desconto trava em 6% do salário (min entre 6% e valor real)", () => {
    const comValorAlto = calculatePayrollDeductions(base({ vtEnabled: true, vtMonthlyValue: 300 }));
    expect(comValorAlto.vt).toBeCloseTo(180, 2);
    const comValorBaixo = calculatePayrollDeductions(base({ vtEnabled: true, vtMonthlyValue: 150 }));
    expect(comValorBaixo.vt).toBeCloseTo(150, 2);
  });

  it("VT desligado → zero", () => {
    const r = calculatePayrollDeductions(base({ vtEnabled: false, vtMonthlyValue: 300 }));
    expect(r.vt).toBe(0);
  });

  it("totalDescontosLegais = inss + irrf + vt", () => {
    const r = calculatePayrollDeductions(base({ grossBase: 4000, salary: 4000, vtEnabled: true, vtMonthlyValue: 100 }));
    expect(r.totalDescontosLegais).toBeCloseTo(r.inss + r.irrf + r.vt, 2);
  });
});
