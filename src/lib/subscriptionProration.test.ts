import { describe, expect, it } from "vitest";
import {
  calculateUpgradeProration,
  subscriptionPeriodValue,
} from "../../supabase/functions/_shared/subscription-proration";

describe("subscription proration", () => {
  it("cobra metade da diferença num upgrade mensal no meio do ciclo", () => {
    const quote = calculateUpgradeProration({
      now: new Date("2026-04-16T00:00:00.000Z"),
      periodEnd: new Date("2026-05-01T00:00:00.000Z"),
      currentCycle: "monthly",
      targetCycle: "monthly",
      currentMonthlyValue: 197,
      targetMonthlyValue: 547,
    });

    expect(quote.remainingRatio).toBe(0.5);
    expect(quote.creditAmount).toBe(98.5);
    expect(quote.amountDue).toBe(175);
    expect(quote.nextRenewalAt.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(quote.resetsBillingAnchor).toBe(false);
  });

  it("usa o preço anual com desconto e credita o saldo mensal na mudança para anual", () => {
    const quote = calculateUpgradeProration({
      now: new Date("2026-04-16T00:00:00.000Z"),
      periodEnd: new Date("2026-05-01T00:00:00.000Z"),
      currentCycle: "monthly",
      targetCycle: "yearly",
      currentMonthlyValue: 197,
      targetMonthlyValue: 547,
    });

    expect(quote.targetPeriodValue).toBe(5251.2);
    expect(quote.creditAmount).toBe(98.5);
    expect(quote.amountDue).toBe(5152.7);
    expect(quote.resetsBillingAnchor).toBe(true);
    expect(quote.nextRenewalAt.toISOString()).toBe("2027-04-16T00:00:00.000Z");
  });

  it("cobra a diferença anual proporcional mantendo a data de renovação", () => {
    const quote = calculateUpgradeProration({
      now: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2027-01-01T00:00:00.000Z"),
      currentCycle: "yearly",
      targetCycle: "yearly",
      currentMonthlyValue: 197,
      targetMonthlyValue: 547,
    });

    const exactRatio = 184 / 365;
    expect(quote.remainingRatio).toBe(exactRatio);
    expect(quote.amountDue).toBe(Math.round(3360 * exactRatio * 100) / 100);
    expect(quote.nextRenewalAt.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("considera o número real de dias do mês e limita período vencido a zero", () => {
    const january = calculateUpgradeProration({
      now: new Date("2026-01-16T00:00:00.000Z"),
      periodEnd: new Date("2026-02-01T00:00:00.000Z"),
      currentCycle: "monthly",
      targetCycle: "monthly",
      currentMonthlyValue: 100,
      targetMonthlyValue: 200,
    });
    const expired = calculateUpgradeProration({
      now: new Date("2026-02-02T00:00:00.000Z"),
      periodEnd: new Date("2026-02-01T00:00:00.000Z"),
      currentCycle: "monthly",
      targetCycle: "monthly",
      currentMonthlyValue: 100,
      targetMonthlyValue: 200,
    });

    expect(january.remainingRatio).toBe(16 / 31);
    expect(january.amountDue).toBe(51.61);
    expect(expired.remainingRatio).toBe(0);
    expect(expired.amountDue).toBe(0);
    expect(subscriptionPeriodValue(197, "yearly")).toBe(1891.2);
  });

  it("não transborda ciclos que vencem no último dia do mês", () => {
    const quote = calculateUpgradeProration({
      now: new Date("2026-03-15T00:00:00.000Z"),
      periodEnd: new Date("2026-03-31T00:00:00.000Z"),
      currentCycle: "monthly",
      targetCycle: "monthly",
      currentMonthlyValue: 100,
      targetMonthlyValue: 200,
    });

    expect(quote.periodStart.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
});
