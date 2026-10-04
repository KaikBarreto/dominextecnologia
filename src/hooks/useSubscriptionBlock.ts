import type { ReactNode } from "react";
import { createElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { TrialExpired } from "@/components/TrialExpired";
import { SubscriptionExpired } from "@/components/SubscriptionExpired";

export const SUBSCRIPTION_GRACE_DAYS = 1;
export const SUBSCRIPTION_REVALIDATE_MS = 60 * 1000;

export type SubscriptionAccessStatus =
  | "checking"
  | "allowed"
  | "trial_expired"
  | "subscription_expired"
  | "payment_required"
  | "unavailable";

export interface SubscriptionCompanyStatus {
  subscription_expires_at: string | null;
  subscription_status: string;
  subscription_value: number | null;
  subscription_plan: string | null;
  payment_lock_bypass: boolean;
}

export interface SubscriptionAccessDecision {
  status: Exclude<SubscriptionAccessStatus, "checking">;
  expirationDate?: string;
}

export interface SubscriptionBlockResult {
  blocked: boolean;
  screen: ReactNode | null;
  status: SubscriptionAccessStatus;
  retry: () => void;
}

function utcCalendarDay(value: Date): number | null {
  if (Number.isNaN(value.getTime())) return null;
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function daysOverdue(expirationValue: string, now: Date): number | null {
  const expirationDay = utcCalendarDay(new Date(expirationValue));
  const today = utcCalendarDay(now);
  if (expirationDay === null || today === null) return null;
  return Math.floor((today - expirationDay) / 86_400_000);
}

/**
 * Regra pura que espelha `tenant_subscription_allows_access` no banco.
 * Datas são comparadas por dia UTC para que navegador e Postgres tomem a mesma
 * decisão, independentemente do fuso do dispositivo.
 */
export function decideSubscriptionAccess(
  company: SubscriptionCompanyStatus,
  now = new Date(),
): SubscriptionAccessDecision {
  const status = company.subscription_status;
  const expirationDate = company.subscription_expires_at ?? undefined;

  if (status === "inactive") {
    const neverPurchased = !company.subscription_value && !company.subscription_plan;
    return {
      status: neverPurchased ? "trial_expired" : "subscription_expired",
      expirationDate,
    };
  }

  if (status === "pending_payment") {
    return company.payment_lock_bypass
      ? { status: "allowed" }
      : { status: "payment_required" };
  }

  if (status === "testing") {
    if (!expirationDate) return { status: "trial_expired" };
    const overdue = daysOverdue(expirationDate, now);
    if (overdue === null) return { status: "unavailable" };
    return overdue > 0
      ? { status: "trial_expired", expirationDate }
      : { status: "allowed" };
  }

  // Status desconhecido falha fechado. Somente `active` representa uma
  // assinatura paga válida; ausência de vencimento em active é plano sem termo.
  if (status !== "active") return { status: "unavailable" };
  if (!expirationDate) return { status: "allowed" };

  const overdue = daysOverdue(expirationDate, now);
  if (overdue === null) return { status: "unavailable" };
  return overdue > SUBSCRIPTION_GRACE_DAYS
    ? { status: "subscription_expired", expirationDate }
    : { status: "allowed" };
}

/**
 * Fonte única do bloqueio por assinatura no frontend. A consulta revalida a
 * cada minuto e falha fechado no primeiro carregamento e em qualquer erro.
 * Admin Auctus e visitantes anônimos não estão sujeitos à assinatura do tenant;
 * usuário autenticado sem company_id é estado inválido e falha fechado.
 */
export function useSubscriptionBlock(): SubscriptionBlockResult {
  const { user, loading, profile, isAdminUser } = useAuth();
  const companyId = profile?.company_id;
  const shouldCheck = !!user && !!companyId && !isAdminUser;

  const { data: company, error, isPending, refetch } = useQuery({
    queryKey: ["subscription-gate-status", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error: queryError } = await supabase
        .from("companies")
        .select(
          "subscription_expires_at, subscription_status, subscription_value, subscription_plan, payment_lock_bypass",
        )
        .eq("id", companyId)
        .single();
      if (queryError) throw queryError;
      return data as SubscriptionCompanyStatus;
    },
    enabled: shouldCheck,
    staleTime: 30 * 1000,
    refetchInterval: SUBSCRIPTION_REVALIDATE_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: "always",
    retry: 1,
  });

  const retry = () => {
    void refetch();
  };

  if (loading) {
    return { blocked: true, screen: null, status: "checking", retry };
  }

  if (!user || isAdminUser) {
    return { blocked: false, screen: null, status: "allowed", retry };
  }

  if (!companyId) {
    return { blocked: true, screen: null, status: "unavailable", retry };
  }

  if (isPending) {
    return { blocked: true, screen: null, status: "checking", retry };
  }

  if (error || !company) {
    return { blocked: true, screen: null, status: "unavailable", retry };
  }

  const decision = decideSubscriptionAccess(company);
  if (decision.status === "allowed") {
    return { blocked: false, screen: null, status: "allowed", retry };
  }

  const safeDate = decision.expirationDate ?? new Date().toISOString();
  const screen = decision.status === "trial_expired"
    ? createElement(TrialExpired, { expirationDate: safeDate })
    : decision.status === "subscription_expired"
      ? createElement(SubscriptionExpired, { expirationDate: safeDate })
      : null;

  return { blocked: true, screen, status: decision.status, retry };
}
