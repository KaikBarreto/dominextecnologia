import { useQuery } from "@tanstack/react-query";
import { differenceInDays, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { TrialExpired } from "@/components/TrialExpired";
import { SubscriptionExpired } from "@/components/SubscriptionExpired";

/**
 * Gate de assinatura — espelha o comportamento do EcoSistema (ProtectedRoute):
 * quando o teste/assinatura da empresa vence, troca o conteúdo do app pela tela
 * cheia de ativação/renovação, que empurra o cliente pro `/checkout`.
 *
 * Decisões:
 * - Admin Auctus (super_admin/vendedores) NÃO tem assinatura de tenant — passa direto.
 * - Renderizado DENTRO do AppLayout, então a rota `/checkout` (fora do layout)
 *   nunca é bloqueada — evita loop "gate ↔ checkout".
 * - Carência: trial/nunca-comprou bloqueia ao vencer (daysOverdue > 0);
 *   assinatura paga tem 1 dia de carência (daysOverdue > 1).
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { profile, isAdminUser } = useAuth();
  const companyId = profile?.company_id;

  const { data: company } = useQuery({
    queryKey: ["subscription-gate-status", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("companies")
        .select("subscription_expires_at, subscription_status, subscription_value, subscription_plan")
        .eq("id", companyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && !isAdminUser,
    staleTime: 60 * 1000,
  });

  // Admin, sem empresa, ou sem data de expiração → não bloqueia.
  if (isAdminUser || !company?.subscription_expires_at) {
    return <>{children}</>;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expirationDate = parseISO(company.subscription_expires_at);
  expirationDate.setHours(0, 0, 0, 0);
  const daysOverdue = differenceInDays(today, expirationDate);

  const isTesting = company.subscription_status === "testing";
  // Nunca comprou: ex-trial cujo status virou inactive zerando valor/plano.
  const neverPurchased = !company.subscription_value && !company.subscription_plan;

  // Teste/nunca-comprou: precisa ATIVAR (bloqueia ao vencer).
  if ((isTesting || neverPurchased) && daysOverdue > 0) {
    return <TrialExpired expirationDate={company.subscription_expires_at} />;
  }

  // Já tinha plano/valor: precisa RENOVAR (carência de 1 dia).
  if (!isTesting && !neverPurchased && daysOverdue > 1) {
    return <SubscriptionExpired expirationDate={company.subscription_expires_at} />;
  }

  return <>{children}</>;
}
