// deno-lint-ignore-file no-explicit-any no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import {
  type CustomerBillingEmailEvent,
  type CustomerBillingEmailTemplate,
  renderCustomerBillingEmail,
  sanitizeCustomerEmailSenderName,
} from "../_shared/customer-billing-email.ts";
import { timingSafeEqual } from "../_shared/timing-safe.ts";

type ClaimedDelivery = {
  delivery_id: string;
  event_type: CustomerBillingEmailEvent;
  recipient_email: string;
  sender_name: string | null;
  reply_to_email: string | null;
  template_style: CustomerBillingEmailTemplate;
  content_overrides: unknown;
  company_name: string;
  company_header_name: string | null;
  company_logo_url: string | null;
  company_document: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_address: string | null;
  company_address_number: string | null;
  company_neighborhood: string | null;
  company_complement: string | null;
  company_city: string | null;
  company_state: string | null;
  company_zip_code: string | null;
  company_primary_color: string | null;
  white_label_enabled: boolean;
  customer_name: string | null;
  charge_value: number | string;
  billing_type: string | null;
  charge_description: string | null;
  due_date: string | null;
  payment_date: string | null;
  public_short_code: string | null;
  invoice_url: string | null;
  boleto_url: string | null;
  pix_copy_paste: string | null;
  attempts: number;
};

type ResendResponse = {
  id?: string;
  name?: string;
  message?: string;
  statusCode?: number;
};

function fromAddress(
  senderName: string,
  configuredAddress: string,
): string | null {
  const address = configuredAddress.trim().toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) return null;
  return `"${sanitizeCustomerEmailSenderName(senderName).replaceAll(
    '"',
    "",
  )}" <${address}>`;
}

function retryDelaySeconds(
  status: number,
  attempts: number,
  retryAfter: string | null,
): number {
  const retryable =
    status === 0 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500;
  if (!retryable) return 0;

  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(3_600, Math.max(10, Math.ceil(retryAfterSeconds)));
  }
  return Math.min(3_600, 30 * 2 ** Math.max(0, attempts - 1));
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const headers = {
    ...getCorsHeaders(req),
    "Content-Type": "application/json",
  };

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido." }), {
      status: 405,
      headers,
    });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  const presented =
    req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!cronSecret || !presented || !timingSafeEqual(presented, cronSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const configuredFromAddress = Deno.env.get("RESEND_FROM_EMAIL");
  if (!supabaseUrl || !serviceKey || !resendApiKey || !configuredFromAddress) {
    console.error(
      "[process-customer-email-deliveries] configuração de envio ausente",
    );
    return new Response(
      JSON.stringify({ error: "Serviço de e-mail não configurado." }),
      {
        status: 503,
        headers,
      },
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const completeDelivery = async (
    delivery: ClaimedDelivery,
    result: {
      success: boolean;
      providerMessageId?: string | null;
      providerStatus?: number | null;
      errorCode?: string | null;
      retryAfterSeconds?: number;
    },
  ) => {
    const retryAfterSeconds = result.retryAfterSeconds ?? 0;
    const { error } = await admin.rpc("complete_customer_email_delivery", {
      p_delivery_id: delivery.delivery_id,
      p_success: result.success,
      p_provider_message_id: result.providerMessageId ?? null,
      p_provider_status: result.providerStatus ?? null,
      p_error_code: result.errorCode ?? null,
      p_retryable: retryAfterSeconds > 0,
      p_retry_after_seconds: retryAfterSeconds,
    });
    if (error) throw new Error(`complete_failed:${error.message}`);
  };

  const { data, error: claimError } = await admin.rpc(
    "claim_customer_email_deliveries",
    {
      p_limit: 25,
      p_orphan_minutes: 10,
    },
  );
  if (claimError) {
    console.error("[process-customer-email-deliveries] claim failed", {
      error: claimError.message,
    });
    return new Response(
      JSON.stringify({
        error: "Não foi possível processar a fila de e-mails.",
      }),
      {
        status: 500,
        headers,
      },
    );
  }

  const deliveries = (data ?? []) as ClaimedDelivery[];
  let sent = 0;
  let retried = 0;
  let failed = 0;

  for (let offset = 0; offset < deliveries.length; offset += 5) {
    const batch = deliveries.slice(offset, offset + 5);
    await Promise.all(
      batch.map(async (delivery) => {
        const from = fromAddress(
          delivery.sender_name || delivery.company_name,
          configuredFromAddress,
        );
        if (!from) {
          await completeDelivery(delivery, {
            success: false,
            providerStatus: 503,
            errorCode: "invalid_resend_from_email",
          });
          failed += 1;
          return;
        }

        const checkoutUrl = delivery.public_short_code
          ? `https://www.dominex.app/pagar/${encodeURIComponent(
              delivery.public_short_code,
            )}`
          : null;
        const rendered = renderCustomerBillingEmail({
          eventType: delivery.event_type,
          templateStyle: delivery.template_style,
          companyName: delivery.company_name,
          companyHeaderName: delivery.company_header_name,
          companyLogoUrl: delivery.company_logo_url,
          companyDocument: delivery.company_document,
          companyPhone: delivery.company_phone,
          companyEmail: delivery.company_email,
          companyAddress: delivery.company_address,
          companyAddressNumber: delivery.company_address_number,
          companyNeighborhood: delivery.company_neighborhood,
          companyComplement: delivery.company_complement,
          companyCity: delivery.company_city,
          companyState: delivery.company_state,
          companyZipCode: delivery.company_zip_code,
          companyPrimaryColor: delivery.company_primary_color,
          whiteLabelEnabled: delivery.white_label_enabled,
          customerName: delivery.customer_name,
          value: Number(delivery.charge_value),
          billingType: delivery.billing_type,
          description: delivery.charge_description,
          dueDate: delivery.due_date,
          paymentDate: delivery.payment_date,
          checkoutUrl,
          invoiceUrl: delivery.invoice_url,
          boletoUrl: delivery.boleto_url,
          pixCopyPaste: delivery.pix_copy_paste,
          contentOverrides: delivery.content_overrides,
        });

        try {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
              "Idempotency-Key": delivery.delivery_id,
            },
            body: JSON.stringify({
              from,
              to: [delivery.recipient_email],
              reply_to: delivery.reply_to_email || undefined,
              subject: rendered.subject,
              html: rendered.html,
              text: rendered.text,
              tags: [
                { name: "category", value: "customer_billing" },
                { name: "event", value: delivery.event_type },
              ],
            }),
          });

          let provider: ResendResponse = {};
          try {
            provider = await response.json();
          } catch {
            // O status HTTP continua sendo suficiente para classificar a tentativa.
          }

          if (response.ok && provider.id) {
            await completeDelivery(delivery, {
              success: true,
              providerMessageId: provider.id,
              providerStatus: response.status,
            });
            sent += 1;
            return;
          }

          const retryAfter = retryDelaySeconds(
            response.status,
            delivery.attempts,
            response.headers.get("retry-after"),
          );
          await completeDelivery(delivery, {
            success: false,
            providerStatus: response.status,
            errorCode: `resend_http_${response.status || 0}`,
            retryAfterSeconds: retryAfter,
          });
          if (retryAfter > 0) retried += 1;
          else failed += 1;
        } catch (error: unknown) {
          const retryAfter = retryDelaySeconds(0, delivery.attempts, null);
          try {
            await completeDelivery(delivery, {
              success: false,
              errorCode: "resend_network_error",
              retryAfterSeconds: retryAfter,
            });
          } catch (completeError: unknown) {
            console.error(
              "[process-customer-email-deliveries] complete failure",
              {
                deliveryId: delivery.delivery_id,
                error:
                  completeError instanceof Error
                    ? completeError.message
                    : "unknown",
              },
            );
          }
          retried += 1;
        }
      }),
    );
  }

  return new Response(
    JSON.stringify({ claimed: deliveries.length, sent, retried, failed }),
    {
      status: 200,
      headers,
    },
  );
});
