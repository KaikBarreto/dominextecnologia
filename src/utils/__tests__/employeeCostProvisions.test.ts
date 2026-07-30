import { describe, it, expect } from "vitest";
import {
  calculateEmployeeCost,
  defaultCostInput,
  type EmployeeCostInput,
} from "@/utils/employeeCostProvisions";

const base = (over: Partial<EmployeeCostInput> = {}): EmployeeCostInput => ({
  ...defaultCostInput,
  baseSalary: 3000,
  ...over,
});

describe("calculateEmployeeCost", () => {
  it("Simples, salário 3000, sem adicional: fator ~1,33 e INSS zero (bate com a planilha)", () => {
    const r = calculateEmployeeCost(base({ regime: "simples" }));
    expect(r.encargosDoMes.inssPatronal).toBe(0);
    expect(r.fgts).toBeCloseTo(240, 2);
    expect(r.decimoTerceiro).toBeCloseTo(250, 2);
    expect(r.ferias).toBeCloseTo(333.333, 2);
    expect(r.fgtsSobre13Fer).toBeCloseTo(46.6667, 2);
    expect(r.multaRescisoria).toBeCloseTo(114.6667, 2);
    expect(r.totalMensal).toBeCloseTo(3984.6667, 2);
    expect(r.custoPercentual).toBeCloseTo(1.3282, 3);
  });

  it("Lucro Real, salário 3000, INSS 28,8% (inclui 13º/férias na base): fator ~1,67", () => {
    const r = calculateEmployeeCost(base({ regime: "lucro_real", inssPatronalPercent: 28.8 }));
    expect(r.encargosDoMes.inssPatronal).toBeCloseTo(1032, 2);
    expect(r.totalMensal).toBeCloseTo(5016.6667, 2);
    expect(r.custoPercentual).toBeCloseTo(1.6722, 3);
  });

  it("Periculosidade 30% entra na base de todas as provisões", () => {
    const r = calculateEmployeeCost(base({ regime: "simples", adicionalTipo: "periculosidade", periculosidadePercent: 30 }));
    expect(r.adicional).toBeCloseTo(900, 2);
    expect(r.fgts).toBeCloseTo((3000 + 900) * 0.08, 2);
  });

  it("Insalubridade grau 40% usa salário mínimo, não a base", () => {
    const r = calculateEmployeeCost(base({ regime: "simples", adicionalTipo: "insalubridade", insalubridadeGrau: 40, salarioMinimo: 1518 }));
    expect(r.adicional).toBeCloseTo(1518 * 0.4, 2);
  });

  it("Adicional 'nenhum' zera peric/insalub", () => {
    const r = calculateEmployeeCost(base({ adicionalTipo: "nenhum", periculosidadePercent: 30 }));
    expect(r.adicional).toBe(0);
  });

  it("INSS patronal editável reflete no total (RAT menor, 26,8%)", () => {
    const r = calculateEmployeeCost(base({ regime: "lucro_real", inssPatronalPercent: 26.8 }));
    expect(r.encargosDoMes.inssPatronal).toBeCloseTo((3000 + 250 + (3000 / 12) * (4 / 3)) * 0.268, 2);
  });

  it("guardarPorMes + encargosDoMes + base + extras somam o totalMensal", () => {
    const r = calculateEmployeeCost(base({ regime: "lucro_real", refeicao: 200, treinamentosAnual: 1200 }));
    const guardar = r.guardarPorMes.ferias + r.guardarPorMes.decimoTerceiro + r.guardarPorMes.multaRescisoria;
    const encargos = r.encargosDoMes.fgts + r.encargosDoMes.fgtsSobre13Fer + r.encargosDoMes.inssPatronal;
    const extras = 200 + 1200 / 12;
    expect(guardar + encargos + r.baseEncargos + extras).toBeCloseTo(r.totalMensal, 2);
  });

  it("monthlyHours 0 não divide por zero", () => {
    const r = calculateEmployeeCost(base({ monthlyHours: 0 }));
    expect(r.horaHomem).toBe(0);
  });
});
