import { anticipationMovements } from "./asaas-anticipation-ledger.ts";
import { normalizeAsaasPayload } from "./asaas-normalizer.ts";
import { RetryableWebhookError } from "./asaas-webhook-renewal.ts";

/** Só espelha dinheiro; venda, renovação e LTV continuam no processador canônico. */
export async function recordWebhookLedger(
  supabase: any,
  body: Record<string, any>,
  beforeCommercial = false,
): Promise<void> {
  if (
    ["RECEIVABLE_ANTICIPATION_CREDITED", "RECEIVABLE_ANTICIPATION_DEBITED"]
      .includes(body.event)
  ) {
    try {
      const movements = await anticipationMovements(body);
      for (let i = 0; i < movements.length; i += 30) {
        const { data, error } = await supabase.rpc(
          "record_admin_asaas_ledger",
          { p_entries: movements.slice(i, i + 30), p_source: "sync" },
        );
        if (error || data?.ok !== true) {
          throw new Error("Falha ao persistir antecipação");
        }
      }
      return;
    } catch (error) {
      throw new RetryableWebhookError(
        "Conciliação da antecipação incompleta",
        error,
      );
    }
  }
  const entries = normalizeAsaasPayload(body).filter((entry) =>
    !beforeCommercial || !entry.asaas_event_type.endsWith("_FEE")
  ).map((entry) => ({
    ...entry,
    description: body.transfer?.description || body.bill?.description ||
      body.payment?.description ||
      (entry.direction === "credit"
        ? "Recebimento Asaas"
        : entry.asaas_event_type.endsWith("_FEE")
        ? "Tarifa Asaas"
        : "Pagamento Asaas"),
    raw_payload: {
      ...body,
      payment: body.payment
        ? {
          ...body.payment,
          status: body.event === "PAYMENT_RECEIVED"
            ? "RECEIVED"
            : body.event === "PAYMENT_CONFIRMED"
            ? "CONFIRMED"
            : body.payment.status,
        }
        : null,
    },
  }));
  if (!entries.length) return;
  const { data, error } = await supabase.rpc("record_admin_asaas_ledger", {
    p_entries: entries,
    p_source: "webhook",
  });
  if (error || data?.ok !== true) {
    throw new RetryableWebhookError(
      "Falha ao persistir movimentos do webhook",
      error,
    );
  }
}
