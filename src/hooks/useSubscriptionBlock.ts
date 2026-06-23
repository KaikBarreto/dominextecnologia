import type { ReactNode } from "react";
import { createElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInDays, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { TrialExpired } from "@/components/TrialExpired";
import { SubscriptionExpired } from "@/components/SubscriptionExpired";

/**
 * Decisão ÚNICA de bloqueio por assinatura do tenant. Fonte da verdade tanto do
 * `SubscriptionGate` (montado no AppLayout) quanto de telas que vivem FORA do
 * layout e precisam bloquear o usuário autenticado de um tenant inadimplente /
 * desativado (ex.: `/os-tecnico/:id` no modo técnico logado).
 *
 * Regras (espelham o EcoSistema):
 * - Admin Auctus (super_admin/vendedores) NÃO tem assinatura de tenant — nunca bloqueia.
 * - Empresa DESATIVADA (`subscription_status === 'inactive'`) → bloqueia NA HORA,
 *   sem carência, independente de vencimento (incidente ENGETEC).
 * - Trial/nunca-comprou → bloqueia ao vencer (daysOverdue > 0).
 * - Assinatura paga → carência de 1 dia (daysOverdue > 1).
 *
 * Retorna `{ blocked, screen }`. `screen` é a tela cheia de ativação/renovação
 * (que empurra pro `/checkout`); `null` quando não há bloqueio.
 */
export function useSubscriptionBlock(): { blocked: boolean; screen: ReactNode | null } {
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

  // Admin Auctus ou sem empresa carregada → nunca bloqueia.
  if (isAdminUser || !company) {
    return { blocked: false, screen: null };
  }

  const isDeactivated = company.subscription_status === "inactive";
  const isTesting = company.subscription_status === "testing";
  // Nunca comprou: ex-trial cujo status virou inactive zerando valor/plano.
  const neverPurchased = !company.subscription_value && !company.subscription_plan;

  // Empresa DESATIVADA: trava imediata, sem carência e sem depender de data.
  // Vem ANTES do early-return por falta de `subscription_expires_at`, pra que
  // uma empresa inactive com `expires_at` null também bloqueie.
  if (isDeactivated) {
    // As telas formatam a data com parseISO — passamos a data real quando existe,
    // senão "hoje" (string ISO) pra não quebrar o format() com null.
    const safeDate = company.subscription_expires_at ?? new Date().toISOString();
    const screen = neverPurchased
      ? createElement(TrialExpired, { expirationDate: safeDate })
      : createElement(SubscriptionExpired, { expirationDate: safeDate });
    return { blocked: true, screen };
  }

  // Sem data de expiração e ainda ativa → não há vencimento pra avaliar.
  if (!company.subscription_expires_at) {
    return { blocked: false, screen: null };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expirationDate = parseISO(company.subscription_expires_at);
  expirationDate.setHours(0, 0, 0, 0);
  const daysOverdue = differenceInDays(today, expirationDate);

  // Teste/nunca-comprou: precisa ATIVAR (bloqueia ao vencer).
  if ((isTesting || neverPurchased) && daysOverdue > 0) {
    return {
      blocked: true,
      screen: createElement(TrialExpired, { expirationDate: company.subscription_expires_at }),
    };
  }

  // Já tinha plano/valor: precisa RENOVAR (carência de 1 dia).
  if (!isTesting && !neverPurchased && daysOverdue > 1) {
    return {
      blocked: true,
      screen: createElement(SubscriptionExpired, { expirationDate: company.subscription_expires_at }),
    };
  }

  return { blocked: false, screen: null };
}
