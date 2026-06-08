// cancel-pending-asaas-payments
// ------------------------------
// Remove as cobranças de assinatura SaaS Auctus que ficaram em aberto (PENDING/OVERDUE)
// na Asaas para o cliente (customer) de uma empresa, e marca o reflexo local em
// subscription_payments.status = 'CANCELLED'.
//
// Uso típico: acompanha o cancelamento da recorrência (cancel-asaas-subscription) — depois
// de parar a renovação, limpamos boletos/PIX em aberto que ainda apontariam pro cliente.
// Só toca cobranças DE ASSINATURA (subscription != null OU descrição "assinatura"/"dominex"),
// nunca cobranças avulsas eventuais do mesmo customer.
//
// Auth (verify_jwt=true): chamada TANTO pelo cliente (PRÓPRIA empresa) QUANTO pelo painel
// master Auctus (qualquer empresa). Regra server-side: usuário só age sobre a PRÓPRIA empresa
// OU é super_admin. Frontend só esconde botão; segurança é aqui.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { asaas, buildQuery, AsaasConfigError, AsaasApiError } from "../_shared/asaas-client.ts";
import { authorizeAsaasCompany } from "../_shared/asaas-auth.ts";

class ValidationError extends Error {}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));
    const company_id: string | undefined = body?.company_id;
    if (!company_id) throw new ValidationError("company_id é obrigatório.");

    // --- Auth: própria empresa OU super_admin ---
    const auth = await authorizeAsaasCompany(
      supabase,
      req.headers.get("Authorization"),
      company_id,
    );
    if (!auth.ok) {
      return new Response(
        JSON.stringify({ error: auth.message }),
        { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("asaas_customer_id, name")
      .eq("id", company_id)
      .single();

    if (companyError || !company) throw new ValidationError("Empresa não encontrada.");

    const customerId: string | null = company.asaas_customer_id ?? null;
    if (!customerId) {
      // Sem customer Asaas vinculado: nada a limpar.
      return new Response(
        JSON.stringify({
          success: true,
          message: "Empresa sem cliente de pagamento vinculado. Nada a cancelar.",
          deleted: 0,
          failed: 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const statuses = ["PENDING", "OVERDUE"];
    let deleted = 0;
    let failed = 0;

    for (const status of statuses) {
      const data = await asaas.get(
        `/payments`,
        buildQuery({ customer: customerId, status, limit: 100 }),
      );
      const payments = data?.data || [];

      for (const payment of payments) {
        if (!payment?.id) continue;

        // Só cobranças DE ASSINATURA: vinculadas a subscription, ou cuja descrição
        // identifica claramente a assinatura SaaS. Não mexemos em cobranças avulsas.
        const description = String(payment.description || "").toLowerCase();
        const isSubscription =
          payment.subscription != null ||
          description.includes("assinatura") ||
          description.includes("dominex");

        if (!isSubscription) continue;

        // Deleta TODAS as PENDING/OVERDUE de assinatura (inclusive vencimentos futuros):
        // a renovação foi cancelada, cobrar depois seria indevido.
        try {
          await asaas.delete(`/payments/${payment.id}`);
        } catch (e) {
          if (e instanceof AsaasConfigError) throw e;
          console.error(`Falha ao deletar cobrança ${payment.id} na Asaas:`, e);
          failed += 1;
          continue;
        }

        // Reflexo local: marca o pagamento como cancelado (só se ainda estava em aberto).
        await supabase
          .from("subscription_payments")
          .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
          .eq("asaas_payment_id", payment.id)
          .in("status", ["PENDING", "OVERDUE"]);

        deleted += 1;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: deleted > 0
          ? "Cobranças em aberto da assinatura canceladas."
          : "Nenhuma cobrança em aberto da assinatura para cancelar.",
        deleted,
        failed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("cancel-pending-asaas-payments error:", error);
    let status = 500;
    let message = "Erro ao cancelar as cobranças em aberto.";
    if (error instanceof AsaasConfigError) {
      status = 503;
      message = error.message;
    } else if (error instanceof ValidationError) {
      status = 400;
      message = error.message;
    } else if (error instanceof AsaasApiError) {
      status = 400;
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
