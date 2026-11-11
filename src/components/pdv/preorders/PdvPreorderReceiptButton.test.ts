import { describe, expect, it } from "vitest";
import { budgetFilename } from "./PdvPreorderReceiptButton";

describe("budgetFilename", () => {
  it("gera nome amigável com número e cliente", () => {
    expect(budgetFilename(1042, "Cliente exemplo")).toBe(
      "Orçamento 1042 - Cliente exemplo",
    );
  });

  it("não deixa separador sobrando quando não há cliente", () => {
    expect(budgetFilename(1042, null)).toBe("Orçamento 1042");
  });
});
