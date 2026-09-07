// cancel-single-asaas-payment
// ---------------------------
// Cancela UMA cobrança específica da assinatura SaaS na Asaas, pelo id dela
// (`payment_id`). Nasceu do gap do checkout: escolher PIX/boleto já GERA a
// cobrança na Asaas; se o cliente clica em "Voltar" e escolhe outra forma, a
// cobrança anterior ficava pendente e órfã pra sempre.
//
// NÃO confundir com `cancel-pending-asaas-payments`: aquela recebe company_id e
// varre TODAS as PENDING/OVERDUE do cliente (acompanha o cancelamento da
// recorrência). Aqui é cirúrgico: um id, uma cobrança.
//
// Contrato:
//   POST { payment_id: "pay_..." | "<id da autorização Pix Automático>" }
//   200 { status: "cancelada" | "ja_cancelada" | "nao_encontrada", message }
//   409 { status: "ja_paga", message, error }      <- NUNCA cancela cobrança paga
//   400 { status: "invalida", message, error }
//   401/403 { status: "nao_autorizado", message, error }
//
// Auth (verify_jwt = true, default): reusa `authorizeAsaasCompany` (_shared/asaas-auth.ts),
// o mesmo gate das demais edges de assinatura — própria empresa OU super_admin.
// Como a request traz o id da COBRANÇA (e não company_id), a empresa dona é
// resolvida SERVER-SIDE em duas frentes, e as duas precisam bater:
//   1) posse local: subscription_payments.asaas_payment_id (ou, no Pix Automático,
//      companies.asaas_subscription_id) → company_id → authorizeAsaasCompany;
//   2) posse na Asaas: a cobrança precisa pertencer ao customer daquela empresa
//      (payment.customer == companies.asaas_customer_id) ou carregar o company_id
//      no externalReference. Sem isso, um usuário logado cancelaria cobrança de
//      outro tenant só chutando o id.
// Cobrança desconhecida (sem linha local) só é sondável por super_admin — senão a
// função vira oráculo cross-tenant (mesmo cuidado do check-asaas-payment).
//
// Idempotência: já cancelada/removida ou inexistente = sucesso silencioso; já paga
// = recusa explícita (409). A checagem de estado é feita NA ASAAS (fonte da
// verdade) imediatamente antes do DELETE, e a própria Asaas recusa remover
// cobrança recebida — o que fecha a corrida com o webhook.
//
// Endpoints Asaas usados (OpenAPI oficial, docs.asaas.com/reference/excluir-cobranca):
//   GET    /v3/payments/{id}                        -> PaymentGetResponseDTO { status, deleted, customer, externalReference }
//   DELETE /v3/payments/{id}                        -> PaymentDeleteResponseDTO { deleted, id }
//   GET    /v3/pix/automatic/authorizations/{id}    -> { status, customerId }
//   DELETE /v3/pix/automatic/authorizations/{id}    -> cancela a autorização

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { asaas, AsaasConfigError, AsaasApiError } from "../_shared/asaas-client.ts";
import { authorizeAsaasCompany } from "../_shared/asaas-auth.ts";

/** Marcador de build — usado pra conferir QUAL versão está no ar (header x-dmx-fn). */
const FN_MARKER = "cancel-single-asaas-payment@2026-09-07.1";

class ValidationError extends Error {}

/** Status da Asaas que significam "tem dinheiro envolvido" — jamais cancelar. */
const PAID_STATUSES = new Set([
  "RECEIVED",
  "CONFIRMED",
  "RECEIVED_IN_CASH",
  "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS",
  "REFUNDED",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
  "DUNNING_REQUESTED",
  "DUNNING_RECEIVED",
]);

/** Autorização de Pix Automático já autorizada pelo pagador. */
const ACTIVE_AUTH_STATUSES = new Set(["ACTIVE", "ACTIVATED", "CONFIRMED"]);
/** Autorização já encerrada — cancelar de novo é no-op. */
const CLOSED_AUTH_STATUSES = new Set(["CANCELLED", "CANCELED", "REFUSED", "EXPIRED"]);

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = { ...getCorsHeaders(req), "x-dmx-fn": FN_MARKER };

  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let payment_id: string | undefined;
    try {
      const body = await req.json();
      payment_id = typeof body?.payment_id === "string" ? body.payment_id.trim() : undefined;
    } catch {
      throw new ValidationError("Corpo da requisição inválido.");
    }
    if (!payment_id) throw new ValidationError("payment_id é obrigatório.");
    if (payment_id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(payment_id)) {
      throw new ValidationError("Identificador de cobrança inválido.");
    }

    // ---- 1) Posse LOCAL: quem é a empresa dona deste id? ----
    const { data: localRows } = await supabase
      .from("subscription_payments")
      .select("id, company_id, status")
      .eq("asaas_payment_id", payment_id)
      .order("created_at", { ascending: false })
      .limit(1);
    const localRow = localRows?.[0] ?? null;

    // Pix Automático/assinatura: o id que o checkout devolve é o da AUTORIZAÇÃO,
    // gravado em companies.asaas_subscription_id (a linha local pode ter o pay_*).
    let ownerCompanyId: string | null = localRow?.company_id ?? null;
    if (!ownerCompanyId) {
      const { data: subCompany } = await supabase
        .from("companies")
        .select("id")
        .eq("asaas_subscription_id", payment_id)
        .maybeSingle();
      ownerCompanyId = subCompany?.id ?? null;
    }

    // ---- 2) Auth: própria empresa OU super_admin (mesmo gate das outras edges) ----
    const auth = await authorizeAsaasCompany(
      supabase,
      req.headers.get("Authorization"),
      ownerCompanyId,
    );
    if (!auth.ok) {
      return json(auth.status ?? 401, {
        status: "nao_autorizado",
        message: auth.message,
        error: auth.message,
      });
    }
    // Id desconhecido: só super_admin pode sondar (senão vira oráculo cross-tenant).
    if (!ownerCompanyId && !auth.isSuperAdmin) {
      const msg = "Você não tem permissão para esta cobrança.";
      return json(403, { status: "nao_autorizado", message: msg, error: msg });
    }

    // Customer Asaas da empresa dona — usado na 2ª checagem de posse (na Asaas).
    let ownerCustomerId: string | null = null;
    if (ownerCompanyId) {
      const { data: company } = await supabase
        .from("companies")
        .select("asaas_customer_id")
        .eq("id", ownerCompanyId)
        .maybeSingle();
      ownerCustomerId = company?.asaas_customer_id ?? null;
    }

    /** Marca o reflexo local como cancelado — só se ainda estava em aberto. */
    const reflectLocalCancelled = async () => {
      await supabase
        .from("subscription_payments")
        .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
        .eq("asaas_payment_id", payment_id)
        .in("status", ["PENDING", "OVERDUE"]);
    };

    /** Recusa por posse: o id existe na Asaas mas não é desta empresa. */
    const refuseForeign = () => {
      console.error(
        `[posse] cobrança ${payment_id} não pertence à empresa ${ownerCompanyId} ` +
          `(customer esperado=${ownerCustomerId}). Recusado.`,
      );
      const msg = "Você não tem permissão para esta cobrança.";
      return json(403, { status: "nao_autorizado", message: msg, error: msg });
    };

    const isPayment = payment_id.startsWith("pay_");

    // =================================================================
    // A) Cobrança avulsa (PIX / boleto / cartão): pay_*
    // =================================================================
    if (isPayment) {
      let payment: {
        status?: string;
        deleted?: boolean;
        customer?: string;
        externalReference?: string | null;
      } | null = null;

      try {
        payment = await asaas.get(`/payments/${payment_id}`);
      } catch (e) {
        if (e instanceof AsaasConfigError) throw e;
        if (e instanceof AsaasApiError && e.status === 404) {
          // Não existe (ou já foi removida a ponto de sumir): nada a cancelar.
          await reflectLocalCancelled();
          return json(200, {
            status: "nao_encontrada",
            message: "Cobrança não encontrada. Nada a cancelar.",
          });
        }
        throw e;
      }

      if (!payment) {
        await reflectLocalCancelled();
        return json(200, {
          status: "nao_encontrada",
          message: "Cobrança não encontrada. Nada a cancelar.",
        });
      }

      // ---- Posse NA ASAAS (2ª barreira, independente do banco local) ----
      if (!auth.isSuperAdmin) {
        const belongsToCustomer = !!ownerCustomerId && payment.customer === ownerCustomerId;
        const belongsByReference = !!ownerCompanyId && payment.externalReference === ownerCompanyId;
        if (!belongsToCustomer && !belongsByReference) return refuseForeign();
      }

      // ---- Idempotência: já removida ----
      if (payment.deleted === true) {
        await reflectLocalCancelled();
        return json(200, {
          status: "ja_cancelada",
          message: "Esta cobrança já estava cancelada.",
        });
      }

      // ---- Recusa explícita: já paga (corrida com o webhook fecha aqui) ----
      if (payment.status && PAID_STATUSES.has(payment.status)) {
        const msg = "Esta cobrança já foi paga e não pode ser cancelada.";
        return json(409, { status: "ja_paga", message: msg, error: msg });
      }

      try {
        await asaas.delete(`/payments/${payment_id}`);
      } catch (e) {
        if (e instanceof AsaasConfigError) throw e;
        // A Asaas recusa remover cobrança recebida. Reconsulta pra responder o
        // motivo REAL (pagou no meio do caminho x erro genérico).
        try {
          const after = await asaas.get(`/payments/${payment_id}`);
          if (after?.deleted === true) {
            await reflectLocalCancelled();
            return json(200, {
              status: "ja_cancelada",
              message: "Esta cobrança já estava cancelada.",
            });
          }
          if (after?.status && PAID_STATUSES.has(after.status)) {
            const msg = "Esta cobrança já foi paga e não pode ser cancelada.";
            return json(409, { status: "ja_paga", message: msg, error: msg });
          }
        } catch (_reread) {
          /* ignora: cai no erro genérico abaixo */
        }
        throw e;
      }

      await reflectLocalCancelled();
      return json(200, {
        status: "cancelada",
        message: "Cobrança anterior cancelada.",
      });
    }

    // =================================================================
    // B) Autorização de Pix Automático (id sem prefixo pay_)
    // =================================================================
    let authorization: { status?: string; customerId?: string } | null = null;
    try {
      authorization = await asaas.get(`/pix/automatic/authorizations/${payment_id}`);
    } catch (e) {
      if (e instanceof AsaasConfigError) throw e;
      if (e instanceof AsaasApiError && e.status === 404) {
        await reflectLocalCancelled();
        return json(200, {
          status: "nao_encontrada",
          message: "Cobrança não encontrada. Nada a cancelar.",
        });
      }
      throw e;
    }

    if (!auth.isSuperAdmin) {
      const belongs = !!ownerCustomerId && authorization?.customerId === ownerCustomerId;
      if (!belongs) return refuseForeign();
    }

    const authStatus = String(authorization?.status ?? "").toUpperCase();
    if (CLOSED_AUTH_STATUSES.has(authStatus)) {
      await reflectLocalCancelled();
      return json(200, {
        status: "ja_cancelada",
        message: "Esta cobrança já estava cancelada.",
      });
    }
    if (ACTIVE_AUTH_STATUSES.has(authStatus)) {
      // Autorização já aceita pelo pagador = pagamento em curso. Não mexe.
      const msg = "Esta cobrança já foi autorizada e não pode ser cancelada.";
      return json(409, { status: "ja_paga", message: msg, error: msg });
    }

    await asaas.delete(`/pix/automatic/authorizations/${payment_id}`);
    await reflectLocalCancelled();
    return json(200, {
      status: "cancelada",
      message: "Cobrança anterior cancelada.",
    });
  } catch (error: unknown) {
    console.error("cancel-single-asaas-payment error:", error);
    let status = 500;
    let message = "Não foi possível cancelar a cobrança anterior.";
    let code = "erro";
    if (error instanceof AsaasConfigError) {
      status = 503;
      message = error.message;
      code = "indisponivel";
    } else if (error instanceof ValidationError) {
      status = 400;
      message = error.message;
      code = "invalida";
    } else if (error instanceof AsaasApiError) {
      // Detalhe cru da Asaas fica no log; o cliente recebe PT-BR genérico.
      status = 502;
      code = "erro";
    }
    return new Response(
      JSON.stringify({ status: code, message, error: message }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
