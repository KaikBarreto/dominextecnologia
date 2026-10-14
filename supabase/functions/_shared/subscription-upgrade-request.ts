import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  calculateUpgradeProration,
  roundSubscriptionMoney,
  type SubscriptionBillingCycle,
} from "./subscription-proration.ts";

type SupabaseClientInstance = ReturnType<typeof createClient>;

export interface UpgradeRequestCompanySnapshot {
  id: string;
  subscription_plan: string | null;
  subscription_value: number | null;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  billing_cycle: string | null;
  max_users: number | null;
  extra_users: number | null;
  nfse_tier?: number | null;
  whatsapp_tier?: number | null;
}

export interface CreateUpgradeRequestInput {
  company: UpgradeRequestCompanySnapshot;
  requestedBy: string | null;
  sourceMonthlyValue: number;
  targetMonthlyValue: number;
  targetModules: string[];
  targetMaxUsers: number;
  targetExtraUsers: number;
  targetLabel: string;
  fingerprintScope: string;
  targetNfseTier?: number | null;
  targetWhatsappTier?: number | null;
  now?: Date;
}

export interface CreatedUpgradeRequest {
  requestId: string;
  checkoutUrl: string;
  amountDue: number;
  creditAmount: number;
  remainingRatio: number;
  nextRenewalAt: string;
}

/**
 * Cria/reutiliza uma cotação paga para expansão de entitlement dentro do ciclo.
 * Retorna null quando não há período ativo a ratear ou o ajuste ficou abaixo do
 * piso de R$ 5; nesses casos o chamador decide o comportamento de cortesia/trial.
 */
export async function createUpgradeRequest(
  supabase: SupabaseClientInstance,
  input: CreateUpgradeRequestInput,
): Promise<CreatedUpgradeRequest | null> {
  const now = input.now ?? new Date();
  const periodEnd = input.company.subscription_expires_at
    ? new Date(input.company.subscription_expires_at)
    : null;
  if (
    input.company.subscription_status !== "active" ||
    !periodEnd ||
    !Number.isFinite(periodEnd.getTime()) ||
    periodEnd.getTime() <= now.getTime()
  ) {
    return null;
  }

  const currentCycle: SubscriptionBillingCycle = input.company.billing_cycle === "yearly"
    ? "yearly"
    : "monthly";
  const quote = calculateUpgradeProration({
    now,
    periodEnd,
    currentCycle,
    targetCycle: currentCycle,
    currentMonthlyValue: input.sourceMonthlyValue,
    targetMonthlyValue: input.targetMonthlyValue,
  });
  if (quote.amountDue < 5) return null;

  const targetModules = [...new Set(input.targetModules)].sort();
  const fingerprint = [
    input.fingerprintScope,
    input.company.subscription_plan ?? "",
    currentCycle,
    input.sourceMonthlyValue.toFixed(2),
    input.targetMonthlyValue.toFixed(2),
    input.targetNfseTier ?? "",
    input.targetWhatsappTier ?? "",
    periodEnd.toISOString(),
  ].join("|");

  const { error: expirationError } = await supabase
    .from("subscription_change_requests")
    .update({ status: "expired" })
    .eq("company_id", input.company.id)
    .eq("request_fingerprint", fingerprint)
    .eq("status", "pending")
    .lte("expires_at", now.toISOString());
  if (expirationError) throw new Error("Não foi possível renovar a cotação do upgrade.");

  const { data: existing, error: existingError } = await supabase
    .from("subscription_change_requests")
    .select("id")
    .eq("company_id", input.company.id)
    .eq("request_fingerprint", fingerprint)
    .in("status", ["pending", "payment_pending"])
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error("Não foi possível consultar a cotação do upgrade.");

  let requestId = existing?.id ?? null;
  if (!requestId) {
    const { data: created, error: createError } = await supabase
      .from("subscription_change_requests")
      .insert({
        company_id: input.company.id,
        requested_by: input.requestedBy,
        source_plan_code: input.company.subscription_plan,
        target_plan_code: input.company.subscription_plan ?? "personalizado",
        target_label: input.targetLabel,
        source_billing_cycle: currentCycle,
        target_billing_cycle: currentCycle,
        source_subscription_value: roundSubscriptionMoney(Number(input.company.subscription_value) || 0),
        source_monthly_value: roundSubscriptionMoney(input.sourceMonthlyValue),
        target_monthly_value: roundSubscriptionMoney(input.targetMonthlyValue),
        source_period_value: quote.sourcePeriodValue,
        target_period_value: quote.targetPeriodValue,
        credit_amount: quote.creditAmount,
        amount_due: quote.amountDue,
        remaining_ratio: Number(quote.remainingRatio.toFixed(8)),
        period_started_at: quote.periodStart.toISOString(),
        period_ends_at: periodEnd.toISOString(),
        next_renewal_at: quote.nextRenewalAt.toISOString(),
        resets_billing_anchor: false,
        target_modules: targetModules,
        target_max_users: Math.max(1, Number(input.targetMaxUsers) || 1),
        target_extra_users: Math.max(0, Number(input.targetExtraUsers) || 0),
        source_nfse_tier: input.targetNfseTier == null ? null : Number(input.company.nfse_tier) || 1,
        target_nfse_tier: input.targetNfseTier ?? null,
        source_whatsapp_tier: input.targetWhatsappTier == null
          ? null
          : Number(input.company.whatsapp_tier) || 1,
        target_whatsapp_tier: input.targetWhatsappTier ?? null,
        request_fingerprint: fingerprint,
        expires_at: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (createError || !created) {
      const { data: raced } = await supabase
        .from("subscription_change_requests")
        .select("id")
        .eq("company_id", input.company.id)
        .eq("request_fingerprint", fingerprint)
        .in("status", ["pending", "payment_pending"])
        .maybeSingle();
      if (!raced) throw new Error("Não foi possível criar a cotação do upgrade.");
      requestId = raced.id;
    } else {
      requestId = created.id;
    }
  }

  return {
    requestId,
    checkoutUrl: `/checkout?mode=upgrade&change=${requestId}`,
    amountDue: quote.amountDue,
    creditAmount: quote.creditAmount,
    remainingRatio: Number(quote.remainingRatio.toFixed(8)),
    nextRenewalAt: quote.nextRenewalAt.toISOString(),
  };
}
