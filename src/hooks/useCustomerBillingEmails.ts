import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserCompany } from "@/hooks/useUserCompany";

type CustomerBillingEmailRpcError = {
  code?: string | null;
  details?: string | null;
};

export function mapCustomerBillingEmailSettingsError(error: unknown): Error {
  const rpcError = (
    error && typeof error === "object" ? error : {}
  ) as CustomerBillingEmailRpcError;
  const details = String(rpcError.details ?? "");

  if (
    details.includes("customer_email_settings_permission_denied") ||
    rpcError.code === "42501"
  ) {
    return new Error(
      "Seu perfil não permite alterar as notificações de cobrança.",
    );
  }

  if (details.includes("customer_email_monthly_quota_unavailable")) {
    return new Error(
      "Seu plano não possui franquia de e-mails para ativar este recurso.",
    );
  }

  if (details.includes("customer_email_billing_module_required")) {
    return new Error(
      "Contrate o módulo Cobranças para ativar estes avisos por e-mail.",
    );
  }

  if (details.includes("customer_email_template_invalid")) {
    return new Error("Escolha um modelo de e-mail válido.");
  }

  if (details.includes("customer_email_content_invalid")) {
    return new Error(
      "Revise os textos personalizados e use somente as variáveis disponíveis.",
    );
  }

  if (rpcError.code === "23514" || rpcError.code === "22001") {
    return new Error(
      "Revise o remetente, o e-mail de resposta e os dias de lembrete.",
    );
  }

  return new Error(
    "Não foi possível salvar as notificações por e-mail. Tente novamente.",
  );
}

export interface CustomerBillingEmailSettings {
  company_id: string;
  enabled: boolean;
  charge_created_enabled: boolean;
  due_reminder_enabled: boolean;
  charge_overdue_enabled: boolean;
  charge_paid_enabled: boolean;
  charge_refunded_enabled: boolean;
  reminder_days_before: number[];
  sender_name: string | null;
  reply_to_email: string | null;
  template_style: CustomerBillingEmailTemplate;
  content_overrides: CustomerBillingEmailContentOverrides;
  monthly_limit: number;
  monthly_used: number;
}

export type CustomerBillingEmailTemplate =
  "classic_light" | "brand_light" | "premium_dark" | "bento_gray";

export type CustomerBillingEmailEvent =
  | "charge_created"
  | "charge_due_reminder"
  | "charge_overdue"
  | "charge_paid"
  | "charge_refunded";

export type CustomerBillingEmailContentField =
  "subject" | "eyebrow" | "title" | "intro";

export type CustomerBillingEmailContentOverrides = Partial<
  Record<
    CustomerBillingEmailEvent,
    Partial<Record<CustomerBillingEmailContentField, string>>
  >
>;

export function validateCustomerBillingEmailContentOverrides(
  value: CustomerBillingEmailContentOverrides,
): string | null {
  for (const fields of Object.values(value)) {
    if (!fields) continue;
    for (const text of Object.values(fields)) {
      if (typeof text !== "string") continue;
      const withoutAllowedVariables = text.replace(
        /\{\{(cliente|empresa|valor|vencimento)\}\}/g,
        "",
      );
      if (/\{\{|\}\}/.test(withoutAllowedVariables)) {
        return "Use somente as variáveis Cliente, Empresa, Valor e Vencimento.";
      }
      if (!text.trim()) {
        return "Os campos personalizados não podem ficar vazios.";
      }
    }
  }
  return null;
}

export type CustomerBillingEmailSettingsPatch = Pick<
  CustomerBillingEmailSettings,
  | "enabled"
  | "charge_created_enabled"
  | "due_reminder_enabled"
  | "charge_overdue_enabled"
  | "charge_paid_enabled"
  | "charge_refunded_enabled"
  | "reminder_days_before"
  | "sender_name"
  | "reply_to_email"
  | "template_style"
  | "content_overrides"
>;

export function useCustomerBillingEmails(options?: { enabled?: boolean }) {
  const { companyId, isLoading: companyLoading } = useUserCompany();
  const queryClient = useQueryClient();
  const queryKey = ["customer-billing-emails", companyId] as const;

  const query = useQuery({
    queryKey,
    enabled: (options?.enabled ?? true) && !!companyId,
    queryFn: async (): Promise<CustomerBillingEmailSettings | null> => {
      const { data, error } = await supabase.rpc(
        "get_customer_email_settings_summary",
      );
      if (error) throw error;
      return (data?.[0] ?? null) as CustomerBillingEmailSettings | null;
    },
  });

  const update = useMutation({
    mutationFn: async (patch: CustomerBillingEmailSettingsPatch) => {
      if (!companyId) throw new Error("Contexto da empresa indisponível.");
      const { error } = await supabase.rpc("update_customer_email_settings", {
        p_enabled: patch.enabled,
        p_charge_created_enabled: patch.charge_created_enabled,
        p_due_reminder_enabled: patch.due_reminder_enabled,
        p_charge_overdue_enabled: patch.charge_overdue_enabled,
        p_charge_paid_enabled: patch.charge_paid_enabled,
        p_charge_refunded_enabled: patch.charge_refunded_enabled,
        p_reminder_days_before: patch.reminder_days_before,
        p_sender_name: patch.sender_name?.trim() || "",
        p_reply_to_email: patch.reply_to_email?.trim().toLowerCase() || "",
        p_template_style: patch.template_style,
        p_content_overrides: patch.content_overrides,
      });
      if (error) throw mapCustomerBillingEmailSettingsError(error);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    settings: query.data ?? null,
    isLoading: companyLoading || query.isLoading,
    isError: query.isError,
    error: query.error,
    update,
  };
}
