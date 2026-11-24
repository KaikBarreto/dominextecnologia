import { describe, it, expect } from "vitest";
import { calculatePayrollDeductions, type PayrollInput } from "@/utils/payrollDeductions";

const base = (over: Partial<PayrollInput> = {}): PayrollInput => ({
  grossBase: 3000,
  salary: 3000,
  dependentsCount: 0,
  vtEnabled: false,
  vtMonthlyValue: 0,
  competenceYear: 2025,
  competenceMonth: 5,
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

  it("IRRF desde maio/2025: usa o desconto simplificado vigente", () => {
    const r = calculatePayrollDeductions(base({ grossBase: 4000, salary: 4000 }));
    expect(r.irrf).toBeCloseTo(114.76, 2);
    expect(r.irrfDeductionType).toBe("simplified");
    expect(r.irrfDeductionAmount).toBe(607.2);
  });

  it("IRRF jan-abr/2025 usa a tabela anterior por competência", () => {
    const r = calculatePayrollDeductions(base({ grossBase: 4000, salary: 4000, competenceMonth: 4 }));
    expect(r.irrf).toBeCloseTo(133.84, 2);
  });

  it("INSS 2026 usa as faixas oficiais e trava no teto de 8.475,55", () => {
    const r = calculatePayrollDeductions(base({
      grossBase: 12000,
      salary: 12000,
      competenceYear: 2026,
      competenceMonth: 1,
    }));
    expect(r.baseINSS).toBe(8475.55);
    expect(r.inss).toBe(988.09);
  });

  it("IRRF 2026 zera o imposto para renda de até 5000", () => {
    const r = calculatePayrollDeductions(base({
      grossBase: 5000,
      salary: 5000,
      competenceYear: 2026,
      competenceMonth: 1,
    }));
    expect(r.irrfBeforeReduction).toBe(312.89);
    expect(r.irrfReduction).toBe(312.89);
    expect(r.irrf).toBe(0);
  });

  it("bloqueia competência futura em vez de reutilizar tabela antiga", () => {
    expect(() => calculatePayrollDeductions(base({
      competenceYear: 2027,
      competenceMonth: 1,
    }))).toThrow("Não há tabela oficial de folha cadastrada para 01/2027");
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
