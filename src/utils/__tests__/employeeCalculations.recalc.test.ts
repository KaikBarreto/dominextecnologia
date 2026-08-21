import { describe, it, expect } from "vitest";
import { recalculateBalances, type EmployeeMovement } from "@/utils/employeeCalculations";

// Fábrica de movimento com created_at incremental (ASC estável).
let seq = 0;
const mv = (over: Partial<EmployeeMovement>): EmployeeMovement => {
  seq += 1;
  const day = String(seq).padStart(2, "0");
  return {
    id: `m${seq}`,
    employee_id: "emp-1",
    type: "vale",
    amount: 0,
    balance_after: 0,
    description: null,
    payment_method: null,
    payment_details: null,
    created_by: null,
    created_at: `2025-01-${day}T12:00:00.000Z`,
    ...over,
  };
};

describe("recalculateBalances (semântica ABSOLUTA, espelho EcoSistema)", () => {
  it("pagamento ZERA o saldo (settlement, ignora amount) — sem resíduo", () => {
    const salary = 2200;
    const movs = [
      mv({ type: "vale", amount: 300 }),
      mv({ type: "vale", amount: 200 }),
      // Dominex grava pagamento com amount POSITIVo (toPay) e balance_after:0.
      mv({ type: "pagamento", amount: 1700, balance_after: 0, description: "Pagamento de salário" }),
    ];

    const out = recalculateBalances(movs, salary);
    const pagamento = out.find((m) => m.type === "pagamento")!;
    // Bug antigo: balance += amount → 2200-300-200+1700 = 3400 (resíduo inflado).
    expect(pagamento.balance_after).toBe(0);
  });

  it('ajuste "Reset para salário base" ancora no salário ABSOLUTO — sem empilhar resíduo', () => {
    const salary = 2200;
    const movs = [
      mv({ type: "vale", amount: 300 }),
      mv({ type: "pagamento", amount: 1900, balance_after: 0, description: "Pagamento de salário" }),
      // amount do reset É o próprio salário base (absoluto).
      mv({ type: "ajuste", amount: 2200, balance_after: 2200, description: "Reset para salário base" }),
    ];

    const out = recalculateBalances(movs, salary);
    const reset = out.find((m) => m.type === "ajuste")!;
    expect(reset.balance_after).toBe(2200);
  });

  it("cenário completo: vales + pagamento + reset + vales → saldo final correto", () => {
    const salary = 2200;
    const movs = [
      mv({ type: "vale", amount: 300 }), // 2200 - 300 = 1900
      mv({ type: "vale", amount: 100 }), // 1900 - 100 = 1800
      mv({ type: "pagamento", amount: 1800, balance_after: 0, description: "Pagamento de salário" }), // 0
      mv({ type: "ajuste", amount: 2200, balance_after: 2200, description: "Reset para salário base" }), // 2200
      mv({ type: "vale", amount: 500 }), // 2200 - 500 = 1700
      mv({ type: "vale", amount: 200 }), // 1700 - 200 = 1500
    ];

    const out = recalculateBalances(movs, salary);
    const finais = out.map((m) => m.balance_after);
    expect(finais).toEqual([1900, 1800, 0, 2200, 1700, 1500]);
  });

  it("bonus e recebimento somam; vale/falta subtraem em módulo", () => {
    const salary = 1000;
    const movs = [
      mv({ type: "vale", amount: 200 }),        // 800
      mv({ type: "bonus", amount: 150 }),       // 950
      mv({ type: "recebimento", amount: 50 }),  // 1000
      mv({ type: "falta", amount: 100 }),       // 900
      mv({ type: "vale", amount: -80 }),        // -Math.abs → 820 (robusto a sinal negativo)
    ];

    const out = recalculateBalances(movs, salary);
    expect(out.map((m) => m.balance_after)).toEqual([800, 950, 1000, 900, 820]);
  });

  it("delete: ao remover um vale, os balance_after seguintes recalculam sem resíduo", () => {
    const salary = 2200;
    const all = [
      mv({ id: "a", type: "vale", amount: 300 }),
      mv({ id: "b", type: "vale", amount: 200 }),
      mv({ id: "c", type: "pagamento", amount: 1700, balance_after: 0, description: "Pagamento de salário" }),
      mv({ id: "d", type: "ajuste", amount: 2200, balance_after: 2200, description: "Reset para salário base" }),
      mv({ id: "e", type: "vale", amount: 400 }),
    ];

    // Simula o delete do vale "b": filtra e recalcula (igual ao hook).
    const kept = all.filter((m) => m.id !== "b");
    const recalculated = recalculateBalances(kept, salary);
    const byId = Object.fromEntries(recalculated.map((m) => [m.id, m.balance_after]));

    expect(byId["a"]).toBe(1900); // 2200 - 300
    expect(byId["c"]).toBe(0);    // pagamento zera
    expect(byId["d"]).toBe(2200); // reset absoluto
    expect(byId["e"]).toBe(1800); // 2200 - 400
  });
});
