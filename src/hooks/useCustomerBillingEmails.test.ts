import { describe, expect, it } from "vitest";
import {
  mapCustomerBillingEmailSettingsError,
  validateCustomerBillingEmailContentOverrides,
} from "./useCustomerBillingEmails";

describe("mapCustomerBillingEmailSettingsError", () => {
  it("mapeia permissão sem expor detalhes internos", () => {
    const error = mapCustomerBillingEmailSettingsError({
      code: "42501",
      details: "code=customer_email_settings_permission_denied",
      message: "public.customer_email_settings secret",
    });
    expect(error.message).toBe(
      "Seu perfil não permite alterar as notificações de cobrança.",
    );
    expect(error.message).not.toMatch(/public\.|secret|42501/);
  });

  it("explica a indisponibilidade de franquia", () => {
    const error = mapCustomerBillingEmailSettingsError({
      code: "23514",
      details: "code=customer_email_monthly_quota_unavailable",
    });
    expect(error.message).toBe(
      "Seu plano não possui franquia de e-mails para ativar este recurso.",
    );
  });

  it("explica quando o módulo Cobranças não está contratado", () => {
    const error = mapCustomerBillingEmailSettingsError({
      code: "23514",
      details: "code=customer_email_billing_module_required",
    });
    expect(error.message).toBe(
      "Contrate o módulo Cobranças para ativar estes avisos por e-mail.",
    );
  });

  it("orienta quando o modelo visual não é válido", () => {
    const error = mapCustomerBillingEmailSettingsError({
      code: "23514",
      details: "code=customer_email_template_invalid",
    });
    expect(error.message).toBe("Escolha um modelo de e-mail válido.");
  });

  it("orienta quando o conteúdo personalizado não é válido", () => {
    const error = mapCustomerBillingEmailSettingsError({
      code: "23514",
      details: "code=customer_email_content_invalid",
    });
    expect(error.message).toBe(
      "Revise os textos personalizados e use somente as variáveis disponíveis.",
    );
  });

  it("usa fallback seguro para erros desconhecidos", () => {
    const error = mapCustomerBillingEmailSettingsError({
      code: "XX000",
      message: "constraint customer_email_settings_internal",
    });
    expect(error.message).toBe(
      "Não foi possível salvar as notificações por e-mail. Tente novamente.",
    );
    expect(error.message).not.toMatch(/constraint|customer_email|XX000/);
  });
});

describe("validateCustomerBillingEmailContentOverrides", () => {
  it("aceita as variáveis publicadas pelo editor", () => {
    expect(
      validateCustomerBillingEmailContentOverrides({
        charge_created: { title: "Olá, {{cliente}} — {{valor}}" },
      }),
    ).toBeNull();
  });

  it("rejeita variável desconhecida antes de chamar o banco", () => {
    expect(
      validateCustomerBillingEmailContentOverrides({
        charge_created: { title: "Olá, {{senha}}" },
      }),
    ).toContain("somente as variáveis");
  });
});
