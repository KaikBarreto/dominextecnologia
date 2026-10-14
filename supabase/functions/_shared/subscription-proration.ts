export type SubscriptionBillingCycle = "monthly" | "yearly";

export interface UpgradeProrationInput {
  now: Date;
  periodEnd: Date;
  currentCycle: SubscriptionBillingCycle;
  targetCycle: SubscriptionBillingCycle;
  currentMonthlyValue: number;
  targetMonthlyValue: number;
}

export interface UpgradeProrationQuote {
  periodStart: Date;
  periodEnd: Date;
  nextRenewalAt: Date;
  remainingRatio: number;
  sourcePeriodValue: number;
  targetPeriodValue: number;
  creditAmount: number;
  amountDue: number;
  resetsBillingAnchor: boolean;
}

export function roundSubscriptionMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function subscriptionPeriodValue(
  monthlyValue: number,
  cycle: SubscriptionBillingCycle,
): number {
  return cycle === "yearly"
    ? roundSubscriptionMoney(monthlyValue * 12 * 0.8)
    : roundSubscriptionMoney(monthlyValue);
}

export function shiftSubscriptionCycle(
  date: Date,
  cycle: SubscriptionBillingCycle,
  direction: -1 | 1,
): Date {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  if (cycle === "yearly") result.setUTCFullYear(result.getUTCFullYear() + direction);
  else result.setUTCMonth(result.getUTCMonth() + direction);
  const lastDayOfTargetMonth = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return result;
}

export function calculateUpgradeProration(input: UpgradeProrationInput): UpgradeProrationQuote {
  const periodStart = shiftSubscriptionCycle(input.periodEnd, input.currentCycle, -1);
  const durationMs = Math.max(1, input.periodEnd.getTime() - periodStart.getTime());
  const remainingMs = Math.max(0, input.periodEnd.getTime() - input.now.getTime());
  const remainingRatio = Math.min(1, Math.max(0, remainingMs / durationMs));
  const sourcePeriodValue = subscriptionPeriodValue(input.currentMonthlyValue, input.currentCycle);
  const targetPeriodValue = subscriptionPeriodValue(input.targetMonthlyValue, input.targetCycle);
  const resetsBillingAnchor = input.currentCycle === "monthly" && input.targetCycle === "yearly";
  const creditAmount = roundSubscriptionMoney(sourcePeriodValue * remainingRatio);
  const rawAmountDue = resetsBillingAnchor
    ? targetPeriodValue - creditAmount
    : (targetPeriodValue - sourcePeriodValue) * remainingRatio;

  return {
    periodStart,
    periodEnd: new Date(input.periodEnd),
    nextRenewalAt: resetsBillingAnchor
      ? shiftSubscriptionCycle(input.now, input.targetCycle, 1)
      : new Date(input.periodEnd),
    remainingRatio,
    sourcePeriodValue,
    targetPeriodValue,
    creditAmount,
    amountDue: roundSubscriptionMoney(Math.max(0, rawAmountDue)),
    resetsBillingAnchor,
  };
}
