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
//   - assinatura padrão (cartão / PIX boleto)  → DELETE /v3/subscriptions/{id}
//   - autorização de PIX Automático recorrente → DELETE /v3/pix/automatic/authorizations/{id}
//
// ⚠️ COMO DISTINGUIR (não "simplifique" isto de volta pra `startsWith("aut_")`):
// só a ASSINATURA tem prefixo estável (`sub_`). O id de uma AUTORIZAÇÃO de Pix
// Automático NÃO é `aut_*` — a Asaas devolve UUID. Provado em 2026-09-19 na
// autorização real `01cf93fd-6634-43c4-894b-5bfeef52c1dc` (revogada em produção).
// Com a heurística antiga, um Pix Automático caía em DELETE /subscriptions/<uuid>
// → 404 → catch engolia → o ponteiro era APAGADO e o consentimento ficava vivo
// na Asaas debitando, sem nada no nosso banco apontando pra ele.
// Por isso: identificação POSITIVA de `sub_`, e tentativa nos DOIS endpoints.
//
// ⚠️ O PONTEIRO SÓ É APAGADO QUANDO A ASAAS CONFIRMA que a recorrência morreu
// (DELETE ok, ou 404 nos dois endpoints = não existe mais nada lá). Se a chamada
// falhar por outro motivo, mantemos `asaas_subscription_id` e devolvemos erro:
// é melhor o gestor ver a falha e tentar de novo do que perdermos a referência
// do consentimento que ainda pode debitar.
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

/** Marcador de build — usado pra conferir QUAL versão está no ar (header x-dmx-fn). */
const FN_MARKER = "cancel-asaas-subscription@2026-09-19.1";

/** Tipo de recorrência viva na Asaas por trás de companies.asaas_subscription_id. */
type RecurrenceKind = "subscription" | "pix_auto";

/**
 * Endpoints de cancelamento a tentar, NA ORDEM, para um dado id.
 *
 * `sub_` é a ÚNICA identificação positiva confiável (assinatura). Tudo que não é
 * `sub_` é tratado como autorização de Pix Automático PRIMEIRO — inclui o UUID
 * que a Asaas realmente devolve e o `aut_*` que a doc antiga sugeria. O segundo
 * endpoint fica como rede: um 404 no primeiro não pode nos fazer desistir.
 */
function endpointsFor(id: string): Array<{ kind: RecurrenceKind; path: string }> {
  const enc = encodeURIComponent(id);
  const subscription = { kind: "subscription" as const, path: `/subscriptions/${enc}` };
  const pixAuto = { kind: "pix_auto" as const, path: `/pix/automatic/authorizations/${enc}` };
  return id.startsWith("sub_") ? [subscription, pixAuto] : [pixAuto, subscription];
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = { ...getCorsHeaders(req), "x-dmx-fn": FN_MARKER };

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

    /**
     * Registra a solicitação de cancelamento. Sempre grava um pedido — inclusive
     * quando a Asaas falha (status "failed"), senão a tentativa que deu errado
     * some da auditoria e ninguém descobre o consentimento pendurado.
     * O supabase-js NÃO lança em erro: sem checar `{ error }` a falha sumia.
     */
    const recordRequest = async (status: "completed" | "failed", notes?: string) => {
      const { error: insertError } = await supabase
        .from("subscription_cancellation_requests")
        .insert({
          company_id,
          requested_by: auth.userId ?? null,
          reason,
          reason_details,
          status,
          admin_notes: notes ?? null,
        });
      if (insertError) {
        console.error(
          `[cancel-asaas-subscription] falha ao registrar pedido de cancelamento da empresa ${company_id}:`,
          insertError,
        );
      }
    };

    if (!subscriptionId) {
      await recordRequest("completed", "Sem recorrência ativa no momento do pedido.");
      // Sem recorrência ativa: nada a cancelar na Asaas. Acesso permanece intacto.
      return new Response(
        JSON.stringify({
          success: true,
          message: "Nenhuma assinatura recorrente ativa para cancelar.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- GATEWAY PRIMEIRO: encerra a recorrência na Asaas ---
    // PIX Automático é cancelado revogando a AUTORIZAÇÃO recorrente, não via
    // /subscriptions. Como o id não identifica o meio com segurança (ver cabeçalho),
    // tentamos os dois endpoints: 404 significa "não é deste tipo / já não existe".
    let killedKind: RecurrenceKind | null = null;
    let gatewayError: unknown = null;

    for (const endpoint of endpointsFor(subscriptionId)) {
      try {
        await asaas.delete(endpoint.path);
        killedKind = endpoint.kind;
        break;
      } catch (e) {
        // Chave ausente: aborta sem fingir sucesso (não sabemos nada do gateway).
        if (e instanceof AsaasConfigError) throw e;
        if (e instanceof AsaasApiError && e.status === 404) {
          // Id não existe NESTE endpoint. Tenta o outro antes de concluir qualquer coisa.
          continue;
        }
        // Erro real (400/5xx/rede): guarda e ainda assim tenta o outro endpoint.
        gatewayError = e;
        console.error(
          `[cancel-asaas-subscription] falha em DELETE ${endpoint.path} (empresa ${company_id}):`,
          e,
        );
      }
    }

    // 404 nos DOIS endpoints e nenhum erro real = a Asaas não conhece mais este id.
    // Nada pode debitar: é seguro soltar o ponteiro.
    const goneAtGateway = killedKind === null && gatewayError === null;

    if (killedKind === null && !goneAtGateway) {
      // A Asaas NÃO confirmou o encerramento. Mantemos asaas_subscription_id —
      // apagar aqui é exatamente o que transformaria um erro recuperável num
      // consentimento órfão (vivo lá, invisível aqui).
      const detail = gatewayError instanceof AsaasApiError && gatewayError.message
        ? ` Motivo informado pela Asaas: ${gatewayError.message}`
        : "";
      await recordRequest(
        "failed",
        `Falha ao encerrar a recorrência ${subscriptionId} na Asaas.${detail}`,
      );
      const status = gatewayError instanceof AsaasApiError &&
          gatewayError.status >= 400 && gatewayError.status < 600
        ? gatewayError.status
        : 502;
      return new Response(
        JSON.stringify({
          error:
            "Não foi possível encerrar a assinatura recorrente na Asaas, então ela NÃO foi cancelada. " +
            "A cobrança automática ainda pode acontecer. Tente novamente em instantes.",
        }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await recordRequest(
      "completed",
      killedKind
        ? `Recorrência ${subscriptionId} encerrada na Asaas (${killedKind}).`
        : `Recorrência ${subscriptionId} já não existia na Asaas.`,
    );

    // BANCO DEPOIS: desliga a renovação automática no nosso lado.
    // NÃO mexe em subscription_status nem subscription_expires_at: o acesso já pago é preservado.
    const { error: clearError } = await supabase
      .from("companies")
      .update({ asaas_subscription_id: null })
      .eq("id", company_id);

    if (clearError) {
      // A recorrência JÁ está morta na Asaas (nada debita), mas o nosso registro
      // continua apontando pra ela. Erro de um lado só, e auto-curável: um novo
      // cancelamento cai em 404/404 → goneAtGateway → limpa. Reportamos como aviso.
      console.error(
        `[cancel-asaas-subscription] recorrência encerrada na Asaas, mas falhou ao limpar ` +
          `companies.asaas_subscription_id da empresa ${company_id}:`,
        clearError,
      );
      return new Response(
        JSON.stringify({
          success: true,
          message:
            "Assinatura recorrente cancelada na operadora. O acesso permanece até o fim do período já pago.",
          warning: "O cadastro da empresa ainda mostra a recorrência; atualize em instantes.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
