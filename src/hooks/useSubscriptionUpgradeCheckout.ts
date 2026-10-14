import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SubscriptionUpgradeQuote {
  id: string;
  company_id: string;
  status: "pending" | "payment_pending" | "applied" | "expired" | "cancelled" | "failed" | "reversed";
  source_plan_code: string | null;
  target_plan_code: string;
  target_label: string | null;
  source_billing_cycle: "monthly" | "yearly";
  target_billing_cycle: "monthly" | "yearly";
  source_monthly_value: number;
  target_monthly_value: number;
  source_period_value: number;
  target_period_value: number;
  credit_amount: number;
  amount_due: number;
  remaining_ratio: number;
  period_ends_at: string;
  next_renewal_at: string;
  resets_billing_anchor: boolean;
  target_modules: string[];
  target_max_users: number;
  target_extra_users: number;
  expires_at: string;
}

function normalizeQuote(row: Record<string, unknown>): SubscriptionUpgradeQuote {
  return {
    ...(row as unknown as SubscriptionUpgradeQuote),
    source_monthly_value: Number(row.source_monthly_value),
    target_monthly_value: Number(row.target_monthly_value),
    source_period_value: Number(row.source_period_value),
    target_period_value: Number(row.target_period_value),
    credit_amount: Number(row.credit_amount),
    amount_due: Number(row.amount_due),
    remaining_ratio: Number(row.remaining_ratio),
    target_max_users: Number(row.target_max_users),
    target_extra_users: Number(row.target_extra_users),
    target_modules: Array.isArray(row.target_modules)
      ? row.target_modules.filter((value): value is string => typeof value === "string")
      : [],
  };
}

export function useSubscriptionUpgradeCheckout(changeRequestId: string | null) {
  const query = useQuery({
    queryKey: ["subscription-upgrade-checkout", changeRequestId],
    enabled: !!changeRequestId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_change_requests")
        .select("*")
        .eq("id", changeRequestId!)
        .single();
      if (error) throw error;
      return normalizeQuote(data as unknown as Record<string, unknown>);
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const getStatus = useCallback(async () => {
    if (!changeRequestId) return null;
    const { data, error } = await supabase
      .from("subscription_change_requests")
      .select("status, next_renewal_at")
      .eq("id", changeRequestId)
      .single();
    if (error) throw error;
    return data;
  }, [changeRequestId]);

  return { ...query, getStatus };
}
