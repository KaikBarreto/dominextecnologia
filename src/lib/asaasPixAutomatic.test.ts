import { describe, expect, it } from "vitest";
import {
  ASAAS_MASTER_REQUIRED_WEBHOOK_EVENTS,
  buildPixAutomaticAuthorizationPayload,
  isPaidAsaasPaymentStatus,
  paymentPixCorrelationCandidates,
  pixAutomaticCheckoutStatus,
  pixAutomaticCorrelation,
} from "../../supabase/functions/_shared/asaas-pix-automatic";

describe("Pix Automático da assinatura Dominex", () => {
  it("cria recorrência explicitamente em modo SUBSCRIPTION", () => {
    const payload = buildPixAutomaticAuthorizationPayload({
      frequency: "MONTHLY",
      contractId: "intent123",
      startDate: "2026-11-17",
      customerId: "cus_test",
      value: 297,
      description: "Dominex - Empresa de teste",
    });

    expect(payload.paymentCreationMode).toBe("SUBSCRIPTION");
    expect(payload.contractId).toBe("intent123");
    expect(payload.immediateQrCode.originalValue).toBe(297);
  });

  it("separa os identificadores de autorização, assinatura e conciliação", () => {
    expect(pixAutomaticCorrelation({
      id: "authorization-uuid",
      status: "ACTIVE",
      subscriptionId: "sub_test",
      contractId: "intent123",
      endToEndIdentifier: "E2E-test",
      immediateQrCode: {
        conciliationIdentifier: "qr-test",
        payload: "pix-copia-e-cola",
      },
    })).toEqual({
      authorizationId: "authorization-uuid",
      subscriptionId: "sub_test",
      contractId: "intent123",
      conciliationIdentifier: "qr-test",
      endToEndIdentifier: "E2E-test",
      qrCode: null,
      copyPaste: "pix-copia-e-cola",
      authorizationStatus: "ACTIVE",
    });
  });

  it("autorização ativa não é tratada como pagamento", () => {
    expect(pixAutomaticCheckoutStatus("ACTIVATED")).toBe("ACTIVE");
    expect(isPaidAsaasPaymentStatus("ACTIVE")).toBe(false);
    expect(isPaidAsaasPaymentStatus("ACTIVATED")).toBe(false);
    expect(isPaidAsaasPaymentStatus("RECEIVED")).toBe(true);
    expect(isPaidAsaasPaymentStatus("CONFIRMED")).toBe(true);
  });

  it("extrai chaves exatas do pagamento sem inferir por valor ou horário", () => {
    expect(paymentPixCorrelationCandidates({
      pixQrCodeId: "qr-test",
      pixTransaction: { endToEndIdentifier: "E2E-test" },
      value: 297,
    })).toEqual(["qr-test", "E2E-test"]);
  });

  it("audita todos os eventos necessários de autorização e instrução recorrente", () => {
    expect(ASAAS_MASTER_REQUIRED_WEBHOOK_EVENTS).toEqual(
      expect.arrayContaining([
        "PAYMENT_RECEIVED",
        "PAYMENT_CONFIRMED",
        "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED",
        "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",
        "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED",
        "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED",
        "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED",
        "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CREATED",
        "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_SCHEDULED",
        "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED",
        "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CANCELLED",
      ]),
    );
  });
});
