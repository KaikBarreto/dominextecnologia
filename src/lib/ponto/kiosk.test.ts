import { describe, expect, it } from "vitest";
import { canUseManualKioskSearch } from "./kiosk";

describe("canUseManualKioskSearch", () => {
  it("mantem a busca manual liberada por padrao", () => {
    expect(canUseManualKioskSearch(false, null)).toBe(true);
    expect(canUseManualKioskSearch(false, "not_recognized")).toBe(true);
    expect(canUseManualKioskSearch(false, "ambiguous")).toBe(true);
  });

  it("esconde a busca quando a empresa exige biometria e a leitura funciona", () => {
    expect(canUseManualKioskSearch(true, null)).toBe(false);
    expect(canUseManualKioskSearch(true, "matching")).toBe(false);
    expect(canUseManualKioskSearch(true, "not_recognized")).toBe(false);
    expect(canUseManualKioskSearch(true, "ambiguous")).toBe(false);
  });

  it("libera contingencia manual em falha tecnica mesmo no modo obrigatorio", () => {
    expect(canUseManualKioskSearch(true, "unavailable")).toBe(true);
  });
});
