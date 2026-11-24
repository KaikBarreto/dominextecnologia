// Reconcilia um pagamento órfão da assinatura com prova exata Pix (E2E/QR).
// Operação interna, fail-closed por CRON_SECRET. Nunca casa por valor/horário.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { asaas, AsaasApiError } from "../_shared/asaas-client.ts";
import { applyWrite } from "../_shared/db-write.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const PAID_STATUSES = new Set(["RECEIVED", "CONFIRMED"]);
const ACTIVE_AUTH_STATUSES = new Set(["ACTIVE", "ACTIVATED", "CONFIRMED"]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const expectedSecret = (Deno.env.get("CRON_SECRET") || "").trim();
    const providedSecret = (req.headers.get("x-cron-secret") || "").trim();
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return json({ error: "Não autorizado." }, 401);
    }

    const input = await req.json().catch(() => ({}));
    const paymentId = text(input?.payment_id);
    const companyId = text(input?.company_id);
    const emergencyExpiration = text(input?.emergency_expiration);
    if (!paymentId?.startsWith("pay_") || !companyId) {
      return json({
        error: "payment_id e company_id válidos são obrigatórios.",
      }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const [{ data: company, error: companyError }, payment] = await Promise.all(
      [
        supabase
          .from("companies")
          .select(
            "id, name, subscription_value, billing_cycle, subscription_expires_at, ltv, asaas_subscription_id",
          )
          .eq("id", companyId)
          .maybeSingle(),
        asaas.get(`/payments/${encodeURIComponent(paymentId)}`),
      ],
    );
    if (companyError || !company) {
      return json({ error: "Empresa não encontrada." }, 404);
    }
    if (!PAID_STATUSES.has(String(payment?.status || "").toUpperCase())) {
      return json({ error: "O pagamento não está recebido/confirmado." }, 409);
    }
    if (
      Math.abs(
        Number(payment.value || 0) - Number(company.subscription_value || 0),
      ) > 0.02
    ) {
      return json(
        { error: "O valor pago diverge da mensalidade vigente." },
        409,
      );
    }

    const transactionId = text(payment.pixTransaction) ||
      text(payment.pixTransaction?.id);
    const transaction = transactionId
      ? await asaas.get(
        `/pix/transactions/${encodeURIComponent(transactionId)}`,
      )
      : null;
    const paymentE2e = text(transaction?.endToEndIdentifier) ||
      text(payment.endToEndIdentifier);
    const paymentQr = text(payment.pixQrCodeId) ||
      text(transaction?.pixQrCodeId) ||
      text(transaction?.conciliationIdentifier);
    if (!paymentE2e && !paymentQr) {
      return json({
        error: "Pagamento sem chave Pix exata para reconciliação.",
      }, 409);
    }

    const { data: legacyRows, error: legacyError } = await supabase
      .from("subscription_payments")
      .select("id, asaas_payment_id, status, amount, created_at")
      .eq("company_id", companyId)
      .eq("billing_type", "PIX")
      .order("created_at", { ascending: false })
      .limit(30);
    if (legacyError) throw legacyError;

    const candidates = (legacyRows ?? []).filter((row: any) =>
      typeof row.asaas_payment_id === "string" &&
      !row.asaas_payment_id.startsWith("pay_") &&
      !row.asaas_payment_id.startsWith("sub_")
    );
    const inspected: Array<{ row: any; authorization: any; exact: boolean }> =
      [];
    for (const row of candidates) {
      try {
        const authorization = await asaas.get(
          `/pix/automatic/authorizations/${
            encodeURIComponent(row.asaas_payment_id)
          }`,
        );
        const authE2e = text(authorization?.endToEndIdentifier);
        const authQr = text(
          authorization?.immediateQrCode?.conciliationIdentifier,
        );
        inspected.push({
          row,
          authorization,
          exact: (!!paymentE2e && authE2e === paymentE2e) ||
            (!!paymentQr && authQr === paymentQr),
        });
      } catch {
        // Autorização removida/inacessível não é candidata ao vínculo.
      }
    }
    const exactMatches = inspected.filter((candidate) => candidate.exact);
    if (exactMatches.length !== 1) {
      return json({
        error: exactMatches.length === 0
          ? "Nenhuma autorização possui a mesma chave Pix do pagamento."
          : "Mais de uma autorização possui a mesma chave Pix; reconciliação abortada.",
        inspected: inspected.length,
        exact_matches: exactMatches.length,
      }, 409);
    }

    const matched = exactMatches[0];
    const authorizationId = String(matched.authorization.id);
    const authorizationStatus = String(matched.authorization.status || "")
      .toUpperCase();
    if (!ACTIVE_AUTH_STATUSES.has(authorizationStatus)) {
      return json(
        { error: "A autorização correlacionada não está ativa." },
        409,
      );
    }
    if (
      Math.abs(
        Number(matched.authorization.value || 0) - Number(payment.value || 0),
      ) > 0.02
    ) {
      return json(
        { error: "O valor da autorização diverge do pagamento." },
        409,
      );
    }

    const { data: existingAttempt, error: existingAttemptError } =
      await supabase
        .from("subscription_checkout_attempts")
        .select("id")
        .eq("asaas_payment_id", paymentId)
        .maybeSingle();
    if (existingAttemptError) throw existingAttemptError;
    let attemptId = existingAttempt?.id ?? null;
    if (!attemptId) {
      const attemptUuid = crypto.randomUUID();
      const { data: inserted, error: insertError } = await supabase
        .from("subscription_checkout_attempts")
        .insert({
          id: attemptUuid,
          company_id: companyId,
          purpose: "repair",
          payment_mode: "pix_automatic",
          billing_cycle: company.billing_cycle === "yearly"
            ? "yearly"
            : "monthly",
          amount: Number(payment.value),
          due_date: payment.dueDate,
          checkout_status: "ACTIVE",
          authorization_status: authorizationStatus,
          gateway_correlation_ref: text(matched.authorization.contractId) ||
            attemptUuid.replaceAll("-", ""),
          asaas_authorization_id: authorizationId,
          asaas_subscription_id: text(matched.authorization.subscriptionId),
          asaas_payment_id: paymentId,
          pix_conciliation_identifier: text(
            matched.authorization.immediateQrCode?.conciliationIdentifier,
          ),
          pix_end_to_end_identifier: text(
            matched.authorization.endToEndIdentifier,
          ),
          pix_qr_code_id: paymentQr,
        })
        .select("id")
        .single();
      if (insertError || !inserted?.id) {
        throw insertError ?? new Error("tentativa não inserida");
      }
      attemptId = inserted.id;
    }

    await applyWrite(
      "vínculo da recorrência Pix reparada",
      supabase
        .from("companies")
        .update({
          asaas_subscription_id: text(matched.authorization.subscriptionId) ||
            authorizationId,
          payment_method: "pix",
        })
        .eq("id", companyId),
    );

    const webhookToken = (Deno.env.get("ASAAS_WEBHOOK_TOKEN") || "").trim();
    if (!webhookToken) throw new Error("ASAAS_WEBHOOK_TOKEN indisponível");
    const webhookResponse = await fetch(
      `${
        (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "")
      }/functions/v1/asaas-webhook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "asaas-access-token": webhookToken,
        },
        body: JSON.stringify({ event: "PAYMENT_RECEIVED", payment }),
      },
    );
    const webhookResult = await webhookResponse.json().catch(() => ({}));
    if (!webhookResponse.ok || webhookResult?.matched === false) {
      throw new Error("Webhook canônico não confirmou a reconciliação");
    }

    // A edição emergencial de acesso não pode virar parte do período comprado.
    // Só corrige quando o valor anterior casa EXATAMENTE com o informado pelo admin.
    let emergencyExpirationCorrected = false;
    const paidAt = text(payment.paymentDate) || text(payment.confirmedDate) ||
      text(payment.dateCreated);
    if (
      emergencyExpiration && paidAt &&
      company.subscription_expires_at === emergencyExpiration
    ) {
      const { data: targetExpiration, error: expirationError } = await supabase
        .rpc(
          "compute_next_expiration",
          {
            p_current: paidAt,
            p_cycle: company.billing_cycle === "yearly" ? "yearly" : "monthly",
          },
        );
      if (expirationError || !targetExpiration) throw expirationError;
      await applyWrite(
        "correção da âncora emergencial da assinatura",
        supabase
          .from("companies")
          .update({ subscription_expires_at: targetExpiration })
          .eq("id", companyId),
      );
      emergencyExpirationCorrected = true;
    }

    let cancelledDuplicates = 0;
    for (const row of candidates) {
      const candidateId = String(row.asaas_payment_id || "");
      const inspectedCandidate = inspected.find((candidate) =>
        candidate.row.id === row.id
      );
      const status = String(inspectedCandidate?.authorization?.status || "")
        .toUpperCase();
      if (!candidateId || candidateId === authorizationId) continue;
      try {
        if (
          !["CANCELLED", "CANCELED", "REFUSED", "EXPIRED"].includes(status)
        ) {
          await asaas.delete(
            `/pix/automatic/authorizations/${encodeURIComponent(candidateId)}`,
          );
          cancelledDuplicates += 1;
        }
        await applyWrite(
          "reflexo local da autorização Pix duplicada",
          supabase
            .from("subscription_payments")
            .update({ status: "CANCELLED" })
            .eq("id", row.id),
        );
      } catch (cancelError) {
        if (
          cancelError instanceof AsaasApiError && cancelError.status === 404
        ) {
          await applyWrite(
            "reflexo local da autorização Pix já removida",
            supabase
              .from("subscription_payments")
              .update({ status: "CANCELLED" })
              .eq("id", row.id),
          );
          continue;
        }
        console.error(
          "[reconcile-payment] autorização duplicada não cancelada",
          {
            authorization_id: candidateId,
            error: cancelError instanceof Error ? cancelError.message : "falha",
          },
        );
      }
    }

    await applyWrite(
      "encerramento do alerta de pagamento órfão",
      supabase
        .from("admin_notifications")
        .update({ is_read: true })
        .eq("type", "unmatched_asaas_payment")
        .eq("data->>payment_id", paymentId),
    );

    const [
      { data: repairedCompany },
      { data: repairedPayment },
      { count: companyPayments },
    ] = await Promise.all([
      supabase
        .from("companies")
        .select(
          "ltv, subscription_status, subscription_expires_at, asaas_subscription_id",
        )
        .eq("id", companyId)
        .single(),
      supabase
        .from("subscription_payments")
        .select("id, status, amount, ltv_credited_at")
        .eq("asaas_payment_id", paymentId)
        .single(),
      supabase
        .from("company_payments")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("asaas_payment_id", paymentId),
    ]);

    return json({
      success: true,
      payment_id: paymentId,
      checkout_attempt_id: attemptId,
      authorization_id: authorizationId,
      exact_match: paymentE2e ? "end_to_end" : "conciliation_identifier",
      company: repairedCompany,
      payment: repairedPayment,
      company_payments_count: companyPayments ?? 0,
      emergency_expiration_corrected: emergencyExpirationCorrected,
      duplicate_authorizations_cancelled: cancelledDuplicates,
    });
  } catch (error) {
    console.error("admin-asaas-reconcile-payment error:", error);
    return json({
      error: "Não foi possível reconciliar o pagamento com segurança.",
    }, 500);
  }
});
