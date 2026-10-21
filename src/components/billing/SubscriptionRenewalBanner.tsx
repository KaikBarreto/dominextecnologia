import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  SUBSCRIPTION_GRACE_DAYS,
  type SubscriptionCompanyStatus,
} from "@/hooks/useSubscriptionBlock";

function utcCalendarDay(value: Date): number | null {
  if (Number.isNaN(value.getTime())) return null;
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

export function SubscriptionRenewalBanner() {
  const navigate = useNavigate();
  const { profile, isAdminUser } = useAuth();
  const companyId = profile?.company_id;

  const { data: company } = useQuery({
    queryKey: ["subscription-gate-status", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("companies")
        .select(
          "subscription_expires_at, subscription_status, subscription_value, subscription_plan, payment_lock_bypass, ltv",
        )
        .eq("id", companyId)
        .single();
      if (error) throw error;
      return data as SubscriptionCompanyStatus;
    },
    enabled: !!companyId && !isAdminUser,
    staleTime: 30 * 1000,
  });

  const isTrial = company?.subscription_status === "testing";
  const isPaidSubscription = company?.subscription_status === "active";
  if ((!isTrial && !isPaidSubscription) || !company.subscription_expires_at) {
    return null;
  }

  const today = utcCalendarDay(new Date());
  const expirationDay = utcCalendarDay(new Date(company.subscription_expires_at));
  if (today === null || expirationDay === null) return null;

  const daysOverdue = Math.floor((today - expirationDay) / 86_400_000);
  const shouldShow = isTrial
    ? daysOverdue === 0
    : daysOverdue > 0 && daysOverdue <= SUBSCRIPTION_GRACE_DAYS;
  if (!shouldShow) return null;

  const title = isTrial ? "Seu teste termina hoje." : "Assinatura vencida.";
  const description = isTrial
    ? "Ative seu plano agora para continuar usando o sistema sem interrupção."
    : "Renove agora para evitar o bloqueio do sistema.";
  const actionLabel = isTrial ? "Ativar agora" : "Renovar agora";
  const actionPath = isTrial ? "/assinatura" : "/checkout?mode=renewal";

  return (
    <div
      role="alert"
      className="hidden min-h-12 shrink-0 items-center justify-center gap-4 bg-red-600 px-4 py-2.5 text-white xl:flex"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
        <p className="truncate text-sm">
          <span className="font-bold">{title}</span>{" "}
          {description}
        </p>
      </div>
      <Button
        size="sm"
        onClick={() => navigate(actionPath)}
        className="h-8 shrink-0 bg-white px-3 text-xs font-bold text-red-700 hover:bg-red-50 hover:text-red-800"
      >
        {actionLabel}
        <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
      </Button>
    </div>
  );
}
