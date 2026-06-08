// check-asaas-payment
// --------------------
// Consulta o status de uma cobrança na Asaas e retorna { is_paid, status }.
// Atualiza o status local em subscription_payments (status/paid_at) para refletir
// o estado atual — mas NÃO executa renovação/ativação nem lança lançamentos
// financeiros (isso é responsabilidade do webhook / activate-subscription, fora
// do escopo deste briefing). Serve ao polling do checkout enquanto o pagamento
// não confirma.
//
// Trata tanto pagamentos pay_* quanto IDs de autorização do Pix Automático
// (aut_* / formato sem prefixo pay_/sub_).
//
// Auth: checkout autenticado (verify_jwt = true). Server-side: usuário só consulta
// pagamentos da PRÓPRIA empresa, OU é super_admin. Como a request traz payment_id
// (não company_id), resolvemos a empresa pela linha em subscription_payments e
// autorizamos contra ela.
//
// Adaptado do EcoSistema (supabase/functions/check-asaas-payment/index.ts),
// removida a lógica de renovação/financeiro (escopo de outro briefing).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { asaas, AsaasConfigError, AsaasApiError } from "../_shared/asaas-client.ts";
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

    let payment_id: string | undefined;
    try {
      const body = await req.json();
      payment_id = body.payment_id;
    } catch {
      throw new ValidationError("Corpo da requisição inválido.");
    }
    if (!payment_id) throw new ValidationError("payment_id é obrigatório.");

    // Resolve a empresa dona deste pagamento (autoriza same-tenant OU super_admin).
    const { data: ownerPayment } = await supabase
      .from("subscription_payments")
      .select("company_id")
      .eq("asaas_payment_id", payment_id)
      .maybeSingle();

    // --- Auth: própria empresa OU super_admin ---
    const auth = await authorizeAsaasCompany(
      supabase,
      req.headers.get("Authorization"),
      ownerPayment?.company_id ?? null,
    );
    if (!auth.ok) {
      return new Response(
        JSON.stringify({ error: auth.message }),
        { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // Pagamento desconhecido: só super_admin pode sondar (evita oracle cross-tenant).
    if (!ownerPayment && !auth.isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Você não tem permissão para esta empresa." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // IDs de autorização do Pix Automático não começam com pay_ nem sub_.
    const isPixAutomaticAuth = !payment_id.startsWith("pay_") && !payment_id.startsWith("sub_");

    let asaasStatus: string;
    let invoiceUrl: string | null = null;

    if (isPixAutomaticAuth) {
      try {
        const authData = await asaas.get(`/pix/automatic/authorizations/${payment_id}`);
        const isPaid = authData.status === "ACTIVATED" || authData.status === "CONFIRMED";
        asaasStatus = isPaid ? "CONFIRMED" : (authData.status || "PENDING");
      } catch (e) {
        // Pix Automático depende de webhook; se a consulta falhar, devolve PENDING.
        console.error("Falha ao consultar autorização Pix Automático:", (e as Error).message);
        return new Response(
          JSON.stringify({ status: "PENDING", is_paid: false, invoice_url: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else {
      const payment = await asaas.get(`/payments/${payment_id}`);
      asaasStatus = payment.status;
      invoiceUrl = payment.invoiceUrl ?? null;
    }

    const isPaid = asaasStatus === "RECEIVED" || asaasStatus === "CONFIRMED";

    // Atualiza o status local (sem renovar assinatura — isso é do webhook).
    const { data: localPayment } = await supabase
      .from("subscription_payments")
      .select("id, status")
      .eq("asaas_payment_id", payment_id)
      .maybeSingle();

    if (localPayment && localPayment.status !== asaasStatus) {
      await supabase
        .from("subscription_payments")
        .update({
          status: asaasStatus,
          paid_at: isPaid ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("asaas_payment_id", payment_id);
    }

    return new Response(
      JSON.stringify({ status: asaasStatus, is_paid: isPaid, invoice_url: invoiceUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("check-asaas-payment error:", error);
    let status = 500;
    let message = "Erro ao verificar pagamento.";
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
