// cancel-asaas-subscription
// --------------------------
// Cancela a RECORRÊNCIA de assinatura SaaS Auctus na Asaas e desliga a renovação
// automática no nosso lado (companies.asaas_subscription_id = NULL).
//
// ⚠️ ACESSO PRESERVADO: cancelar a recorrência NÃO corta o acesso na hora.
// O cliente mantém acesso até o fim do período já pago (companies.subscription_expires_at),
// exatamente como o EcoSistema faz. Esta função NÃO mexe em subscription_status nem em
// subscription_expires_at — só para a renovação. O gate de acesso do app continua olhando
// subscription_expires_at (ver useCompanyModules), então quem pagou até dia X usa até dia X.
//
// Dois tipos de recorrência podem estar em companies.asaas_subscription_id:
//   - sub_*  → assinatura padrão (cartão / PIX boleto)  → DELETE /v3/subscriptions/{id}
//   - aut_*  → autorização de PIX Automático recorrente  → DELETE /v3/pix/automatic/authorizations/{id}
// (O EcoSistema só tratava sub_*; aqui cobrimos os dois, pois create-asaas-payment grava ambos.)
//
// Auth (verify_jwt=true): chamada TANTO pelo cliente (cancelando a PRÓPRIA assinatura na
// tela da empresa) QUANTO pelo painel master Auctus (cancelando qualquer empresa).
// Regra server-side: usuário só age sobre a PRÓPRIA empresa OU é super_admin.
// Frontend só esconde botão; segurança é aqui.
//
// Também registra a solicitação em subscription_cancellation_requests (reason do payload).

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

    const body = await req.json().catch(() => ({}));
    const company_id: string | undefined = body?.company_id;
    // Motivo do cancelamento (cliente ou admin). reason é NOT NULL na tabela.
    const reason: string = (typeof body?.reason === "string" && body.reason.trim())
      ? body.reason.trim()
      : "Cancelamento solicitado";
    const reason_details: string | null =
      typeof body?.reason_details === "string" && body.reason_details.trim()
        ? body.reason_details.trim()
        : null;

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
      .select("asaas_subscription_id, name")
      .eq("id", company_id)
      .single();

    if (companyError || !company) throw new ValidationError("Empresa não encontrada.");

    const subscriptionId: string | null = company.asaas_subscription_id ?? null;

    // Registra a solicitação de cancelamento (idempotente do ponto de vista de auditoria:
    // sempre grava um pedido, independente de já haver recorrência ativa).
    await supabase.from("subscription_cancellation_requests").insert({
      company_id,
      requested_by: auth.userId ?? null,
      reason,
      reason_details,
      status: "completed",
    });

    if (!subscriptionId) {
      // Sem recorrência ativa: nada a cancelar na Asaas. Acesso permanece intacto.
      return new Response(
        JSON.stringify({
          success: true,
          message: "Nenhuma assinatura recorrente ativa para cancelar.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Cancela a recorrência na Asaas conforme o prefixo do id ---
    // PIX Automático (aut_*) é cancelado revogando a AUTORIZAÇÃO recorrente, não via
    // /subscriptions. Espelha o endpoint de criação (/pix/automatic/authorizations).
    const isPixAutomatic = subscriptionId.startsWith("aut_");
    const asaasPath = isPixAutomatic
      ? `/pix/automatic/authorizations/${subscriptionId}`
      : `/subscriptions/${subscriptionId}`;

    try {
      await asaas.delete(asaasPath);
    } catch (e) {
      // A recorrência pode já estar cancelada/expirada na Asaas. Mesmo assim limpamos o
      // nosso lado — o objetivo é garantir que NÃO haverá renovação automática.
      // AsaasConfigError (chave ausente) é o único caso em que abortamos: não fingimos sucesso.
      if (e instanceof AsaasConfigError) throw e;
      console.error(`Falha ao cancelar recorrência ${subscriptionId} na Asaas (seguindo com limpeza local):`, e);
    }

    // Desliga a renovação automática no nosso lado.
    // NÃO mexe em subscription_status nem subscription_expires_at: o acesso já pago é preservado.
    await supabase
      .from("companies")
      .update({ asaas_subscription_id: null })
      .eq("id", company_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Assinatura recorrente cancelada. O acesso permanece até o fim do período já pago.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("cancel-asaas-subscription error:", error);
    let status = 500;
    let message = "Erro ao cancelar a assinatura.";
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
