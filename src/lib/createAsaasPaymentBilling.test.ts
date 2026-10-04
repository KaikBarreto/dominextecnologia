import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveChargeTerms } from "../../supabase/functions/create-asaas-payment/billing-rules";

describe("create-asaas-payment — formação segura da cobrança", () => {
  it("normaliza yearly malicioso no cartão sem dividir o preço mensal por 12", () => {
    const terms = resolveChargeTerms("CREDIT_CARD", "yearly", 447, 447);

    expect(terms).toEqual({
      billingCycle: "monthly",
      asaasCycle: "MONTHLY",
      pixAutomaticFrequency: "MONTHLY",
      expectedAmount: 447,
      gatewayAmount: 447,
    });
    expect(terms.gatewayAmount).not.toBe(447 / 12);
  });

  it.each(["PIX", "BOLETO"] as const)(
    "preserva %s anual à vista com 20%% de desconto",
    (billingType) => {
      const annualAmount = Math.round(447 * 12 * 0.8);
      const terms = resolveChargeTerms(billingType, "yearly", 447, annualAmount);

      expect(terms.billingCycle).toBe("yearly");
      expect(terms.asaasCycle).toBe("YEARLY");
      expect(terms.pixAutomaticFrequency).toBe("ANNUALLY");
      expect(terms.expectedAmount).toBe(annualAmount);
      expect(terms.gatewayAmount).toBe(annualAmount);
    },
  );

  it("liga o value do payload de cartão ao valor mensal reconciliado", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/create-asaas-payment/index.ts"),
      "utf8",
    );

    expect(source).toContain("const monthlyCardValue = chargeTerms.gatewayAmount;");
    expect(source).toMatch(/billingType:\s*"CREDIT_CARD",[\s\S]*?cycle:\s*"MONTHLY",[\s\S]*?value:\s*monthlyCardValue,/);
    expect(source).not.toMatch(/amount\s*\/\s*12/);
  });
});
