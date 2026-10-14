// create-asaas-payment
// ---------------------
// Cria uma cobrança Asaas para a assinatura SaaS de uma empresa (tenant):
//  - PIX AUTOMÁTICO recorrente (pix_recurring=true) via POST /v3/pix/automatic/authorizations
//    (com fallback para subscription PIX se Pix Automático não estiver disponível);
//  - Assinatura RECORRENTE no cartão via POST /v3/subscriptions;
//  - PIX avulso / BOLETO via POST /v3/payments.
//
// Grava em subscription_payments (status PENDING) e em companies.asaas_subscription_id
// (sub_*/aut_*) nas recorrências. Idempotência: reusa cobrança PENDING < 30min do
// mesmo tipo/valor. externalReference = company_id.
//
// Auth: checkout autenticado (o PRÓPRIO tenant paga sua assinatura) ou painel
// master (verify_jwt = true). Server-side: usuário só age sobre a PRÓPRIA empresa,
// OU é super_admin. Escrita em subscription_payments via service_role (RLS bloqueia
// tenant escrevendo direto).
//
// Adaptado do EcoSistema (supabase/functions/create-asaas-payment/index.ts).
// Divergências de schema: Dominex usa `cnpj` em companies; subscription_payments
// tem `billing_cycle` e `type` (primeira_venda/renovacao) — gravamos ambos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import {
  asaas,
  buildQuery,
  AsaasConfigError,
  AsaasApiError,
  assertAsaasConfigured,
} from "../_shared/asaas-client.ts";
import { authorizeAsaasCompany } from "../_shared/asaas-auth.ts";
import { applyWrite, tryWriteReturning, WriteWarnings } from "../_shared/db-write.ts";
import { resolveChargeTerms, type ChargeTerms } from "./billing-rules.ts";

// A edge usa service_role sem schema gerado no runtime; manter o mesmo tipo
// inferido por createClient() evita acoplar esta função aos tipos do frontend.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceSupabaseClient = ReturnType<typeof createClient<any>>;

class ValidationError extends Error {}

interface CreatePaymentRequest {
  company_id: string;
  billing_type: "PIX" | "CREDIT_CARD" | "BOLETO";
  amount: number;
  description?: string;
  cpf_cnpj?: string;
  pix_recurring?: boolean;
  billing_cycle?: "monthly" | "yearly";
  // Primeira venda: code do plano que o cliente SELECIONOU no checkout. Usado
  // pra validar o `amount` contra o preço desse plano (e não contra o plano
  // antigo guardado na empresa). Ausente em renovação.
  plan_code?: string;
  purpose?: "renewal" | "upgrade";
  change_request_id?: string;
  // Upgrade com o cartão já tokenizado da assinatura. O browser envia apenas
  // esta intenção; o token real é lido do Vault exclusivamente pela edge.
  use_saved_card?: boolean;
  // Cartão
  card_holder_name?: string;
  card_holder_email?: string;
  card_number?: string;
  card_expiry_month?: string;
  card_expiry_year?: string;
  card_ccv?: string;
  card_holder_cpf?: string;
  card_holder_phone?: string;
  card_holder_postal_code?: string;
  card_holder_address_number?: string;
}

interface UpgradeChangeRequest {
  id: string;
  status: "pending" | "payment_pending" | "applied" | "expired" | "cancelled" | "failed" | "reversed";
  expires_at: string;
  amount_due: number;
  target_billing_cycle: "monthly" | "yearly";
  resets_billing_anchor: boolean;
}

function resolveClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-real-ip")?.trim() || null;
}

function cardNumberDigits(body: CreatePaymentRequest): string {
  return body.card_number?.replace(/\D/g, "") ?? "";
}

function detectCardBrand(number: string): string {
  if (/^4/.test(number)) return "Visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(number)) return "Mastercard";
  if (/^3[47]/.test(number)) return "American Express";
  if (/^(636368|438935|504175|451416|636297|5067|4576|4011)/.test(number)) return "Elo";
  if (/^(606282|3841)/.test(number)) return "Hipercard";
  return "Cartão";
}

function buildCreditCard(body: CreatePaymentRequest) {
  return {
    holderName: body.card_holder_name,
    number: cardNumberDigits(body),
    expiryMonth: body.card_expiry_month,
    expiryYear: body.card_expiry_year,
    ccv: body.card_ccv,
  };
}

function buildCreditCardHolderInfo(body: CreatePaymentRequest) {
  return {
    name: body.card_holder_name,
    email: body.card_holder_email || "",
    cpfCnpj: body.card_holder_cpf?.replace(/\D/g, ""),
    phone: body.card_holder_phone?.replace(/\D/g, ""),
    postalCode: body.card_holder_postal_code?.replace(/\D/g, ""),
    addressNumber: body.card_holder_address_number,
  };
}

interface TokenizedCard {
  token: string;
  last4: string;
  brand: string;
}

interface PixAutomaticAuthorization {
  id: string;
  status?: string;
  encodedImage?: string;
  payload?: string;
  immediateQrCode?: { expirationDate?: string };
}

async function tokenizeCard(
  customerId: string,
  body: CreatePaymentRequest,
  remoteIp: string | null,
): Promise<TokenizedCard | null> {
  const number = cardNumberDigits(body);
  if (!number || !remoteIp) return null;

  try {
    const tokenized = await asaas.post(`/creditCard/tokenizeCreditCard`, {
      customer: customerId,
      creditCard: buildCreditCard(body),
      creditCardHolderInfo: buildCreditCardHolderInfo(body),
      remoteIp,
    });
    const token = typeof tokenized?.creditCardToken === "string"
      ? tokenized.creditCardToken
      : typeof tokenized?.token === "string"
      ? tokenized.token
      : "";
    if (!token) return null;
    const returnedNumber = String(tokenized?.creditCardNumber ?? "").replace(/\D/g, "");
    return {
      token,
      last4: (returnedNumber || number).slice(-4),
      brand: String(tokenized?.creditCardBrand || tokenized?.brand || detectCardBrand(number)),
    };
  } catch (error) {
    // Tokenização pode depender de habilitação comercial na conta Asaas. O
    // checkout antigo continua funcional com os dados brutos nesta tentativa.
    console.warn(
      "[create-asaas-payment] Cartão aceito para tentativa atual, mas não foi possível tokenizá-lo para upgrades futuros:",
      error instanceof Error ? error.message : "falha não identificada",
    );
    return null;
  }
}

async function readSavedCardToken(
  supabase: ServiceSupabaseClient,
  companyId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("vault_read_subscription_card_token", {
    p_company_id: companyId,
  });
  if (error || typeof data !== "string" || !data.trim()) {
    console.error(
      `[create-asaas-payment] Token do cartão da empresa ${companyId} indisponível no Vault.`,
      error?.message ?? "segredo vazio",
    );
    throw new ValidationError(
      "Não foi possível usar o cartão cadastrado. Escolha outra forma de pagamento ou informe o cartão novamente.",
    );
  }
  return data;
}

async function persistSavedCardToken(
  supabase: ServiceSupabaseClient,
  companyId: string,
  card: TokenizedCard,
): Promise<void> {
  try {
    const { data, error } = await supabase.rpc("vault_upsert_subscription_card_token", {
      p_company_id: companyId,
      p_token: card.token,
    });
    if (error || data !== true) throw error ?? new Error("Vault não confirmou a gravação");

    const { error: metadataError } = await supabase
      .from("companies")
      .update({
        subscription_card_last4: card.last4,
        subscription_card_brand: card.brand,
        subscription_card_updated_at: new Date().toISOString(),
      })
      .eq("id", companyId);
    if (metadataError) throw metadataError;
  } catch (error) {
    // A cobrança/assinatura já foi criada no gateway. Não induzimos retry e
    // duplicidade por uma falha secundária ao guardar o cartão para o futuro.
    console.error(
      `[create-asaas-payment] Cobrança criada, mas o cartão da empresa ${companyId} não foi salvo para upgrades futuros:`,
      error instanceof Error ? error.message : "falha não identificada",
    );
  }
}

/**
 * Grava em `companies` o vínculo da recorrência recém-criada na Asaas.
 *
 * ⚠️ O supabase-js NÃO lança em erro: sem checar `{ error }`, uma falha de escrita
 * aqui deixava a recorrência VIVA na Asaas (cobrando) e INVISÍVEL pra nós — o mesmo
 * defeito do consentimento órfão que o cancelamento tinha. Não dá pra desfazer com
 * segurança no meio do checkout, então o mínimo é gritar no log com o id, que é o
 * que torna o caso recuperável à mão.
 */
async function linkRecurrenceToCompany(
  supabase: ServiceSupabaseClient,
  companyId: string,
  recurrenceId: string,
  paymentMethod: "pix" | "credit_card",
): Promise<void> {
  const { error } = await supabase
    .from("companies")
    .update({ asaas_subscription_id: recurrenceId, payment_method: paymentMethod })
    .eq("id", companyId);
  if (error) {
    console.error(
      `[create-asaas-payment] RECORRÊNCIA ÓRFÃ: ${recurrenceId} foi criada na Asaas para a ` +
        `empresa ${companyId}, mas companies.asaas_subscription_id NÃO foi gravado. ` +
        `Ela vai cobrar sem nada apontando pra ela daqui:`,
      error,
    );
  }
}

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

    // Falha cedo e claro se a chave não estiver setada.
    assertAsaasConfigured();

    // ===== POLÍTICA DE FALHA DE ESCRITA (incidente "supabase-js não lança", 2026-09-19) =====
    // O `supabase-js` devolve `{ error }` em vez de lançar. Nesta função a fronteira
    // é UMA SÓ e é a mais cara do sistema: a CRIAÇÃO DA COBRANÇA NA ASAAS.
    //
    //   ANTES de criar a cobrança → applyWrite (fatal). Nada foi cobrado; o usuário
    //     repete e o pior que acontece é refazer a mesma escrita.
    //
    //   DEPOIS de criar a cobrança → tryWriteReturning (aviso). A cobrança JÁ existe
    //     no gateway (no cartão, já foi capturada). Devolver erro faria o cliente
    //     tentar de novo e gerar uma SEGUNDA cobrança — cobrar duas vezes é pior que
    //     ficar sem a linha local, que o webhook ainda materializa quando o
    //     PAYMENT_* chegar. Por isso a falha vira `warnings` + linha de recuperação.
    const warnings = new WriteWarnings();

    const body: CreatePaymentRequest = await req.json();
    const {
      company_id,
      billing_type,
      amount,
      description,
      cpf_cnpj,
      pix_recurring,
      billing_cycle: requestedBillingCycle,
      plan_code,
      purpose,
      change_request_id,
      use_saved_card,
    } = body;

    if (!company_id) throw new ValidationError("company_id é obrigatório.");
    if (!billing_type) throw new ValidationError("Forma de pagamento é obrigatória.");
    if (!amount || amount <= 0) throw new ValidationError("Valor da cobrança inválido.");
    if (use_saved_card && (purpose !== "upgrade" || billing_type !== "CREDIT_CARD")) {
      throw new ValidationError("O cartão cadastrado só pode ser usado para pagar um upgrade.");
    }

    const clientIp = resolveClientIp(req);

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

    // A busca idempotente pode acontecer cedo, mas a reutilização só ocorre
    // DEPOIS da reconciliação server-side abaixo. Uma cobrança antiga nunca pode
    // pular a validação do valor/ciclo atualmente autorizado para a empresa.
    const { data: existingPending } = await supabase
      .from("subscription_payments")
      .select("id, asaas_payment_id, created_at, billing_type, invoice_url, pix_qr_code, pix_copy_paste, pix_expiration_date, due_date, status, amount, subscription_change_request_id")
      .eq("company_id", company_id)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(1);

    // --- Empresa ---
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("*")
      .eq("id", company_id)
      .single();
    if (companyError || !company) throw new ValidationError("Empresa não encontrada.");

    // ===================================================================
    // VALIDAÇÃO SERVER-SIDE DO VALOR — FAIL-CLOSED (reconcilia com a EMPRESA)
    // -------------------------------------------------------------------
    // Incidente: cliente pagou R$197 (preço do 'start') num plano 'avancado'
    // (R$447). A causa foi um guarda LENIENTE que aceitava o `amount` se ele
    // batesse com QUALQUER base candidata — inclusive o preço do plan_code enviado
    // pelo front, que podia ser um plano MAIS BARATO. Então R$197 (start) passava
    // mesmo com a empresa gravada como avancado/447.
    //
    // Nova regra (fonte ÚNICA da verdade = a EMPRESA):
    //   O valor esperado vem do VALOR EFETIVO da empresa (custom_price ativo, senão
    //   subscription_value), que por sua vez reflete companies.subscription_plan.
    //   O `plan_code` do front NÃO é aceito como base de preço a menos que seja o
    //   MESMO plano já gravado na empresa. Se o cliente quer TROCAR de plano
    //   (fluxo legítimo sem trava), a empresa precisa ter sido ATUALIZADA para o
    //   novo plano ANTES de cobrar — então subscription_plan/subscription_value já
    //   refletem a escolha e a reconciliação bate naturalmente.
    //
    // Fail-closed: sem base efetiva computável, REJEITA (não deixa passar).
    // Tolerância: só centavos de arredondamento (max(2% do esperado, R$ 0,02)),
    // nunca a diferença entre planos.
    let chargeTerms: ChargeTerms;
    let upgradeRequest: UpgradeChangeRequest | null = null;

    if (purpose === "upgrade") {
      if (!change_request_id) {
        throw new ValidationError("Cotação do upgrade não informada.");
      }
      const { data: requestRow, error: requestError } = await supabase
        .from("subscription_change_requests")
        .select("*")
        .eq("id", change_request_id)
        .eq("company_id", company_id)
        .maybeSingle();
      if (requestError || !requestRow) {
        throw new ValidationError("Cotação do upgrade não encontrada.");
      }
      if (!["pending", "payment_pending"].includes(requestRow.status)) {
        throw new ValidationError(
          requestRow.status === "applied"
            ? "Este upgrade já foi concluído."
            : "Esta cotação de upgrade não está mais disponível.",
        );
      }
      if (requestRow.status === "pending" && new Date(requestRow.expires_at).getTime() <= Date.now()) {
        await applyWrite(
          "expiração da cotação de upgrade",
          supabase
            .from("subscription_change_requests")
            .update({ status: "expired" })
            .eq("id", requestRow.id)
            .eq("status", "pending"),
        );
        throw new ValidationError("Esta cotação expirou. Volte ao plano e calcule o upgrade novamente.");
      }
      const expected = Number(requestRow.amount_due) || 0;
      if (!(expected > 0) || Math.abs(amount - expected) > 0.02) {
        throw new ValidationError("O valor do upgrade mudou. Recarregue a página e tente novamente.");
      }
      if (
        billing_type === "CREDIT_CARD" &&
        requestRow.resets_billing_anchor === true &&
        requestRow.target_billing_cycle === "yearly"
      ) {
        throw new ValidationError("A mudança para o ciclo anual deve ser paga à vista por Pix ou boleto.");
      }
      upgradeRequest = requestRow as UpgradeChangeRequest;
      const upgradeCycle = requestRow.target_billing_cycle === "yearly" ? "yearly" : "monthly";
      chargeTerms = {
        billingCycle: upgradeCycle,
        asaasCycle: upgradeCycle === "yearly" ? "YEARLY" : "MONTHLY",
        pixAutomaticFrequency: upgradeCycle === "yearly" ? "ANNUALLY" : "MONTHLY",
        expectedAmount: expected,
        gatewayAmount: expected,
      };
    } else {
      // Valor efetivo mensal da empresa = fonte da verdade.
      const cp = Number(company.custom_price) || 0;
      const cpMonths = Number(company.custom_price_months) || 0;
      const cpMade = Number(company.custom_price_payments_made) || 0;
      const hasActiveCustomPrice = cp > 0 && cpMonths > 0 && cpMade < cpMonths;
      const pendingRenewalValue = purpose === "renewal"
        ? Number(company.pending_subscription_value) || 0
        : 0;
      // Se há downgrade agendado, a PRIMEIRA renovação seguinte já cobra o
      // valor menor. Entitlements continuam atuais até o webhook confirmar esse
      // pagamento e aplicar os campos pending_*.
      const effectiveCompanyValue = pendingRenewalValue > 0
        ? pendingRenewalValue
        : hasActiveCustomPrice
        ? cp
        : Number(company.subscription_value) || 0;

      // Base mensal de reconciliação = valor efetivo da empresa. Pode ser
      // rebaseada abaixo quando o cliente troca de plano na primeira venda.
      let monthlyBase = effectiveCompanyValue;

      // Coerência do plano quando o front envia `plan_code`:
      //
      //  a) plan_code == plano da empresa → segue (base = valor efetivo da empresa).
      //  b) plan_code != plano da empresa:
      //     - PRIMEIRA VENDA (testing/pending_payment) SEM preço promocional travado
      //       (custom_price ativo) → pode ser uma TROCA DE PLANO no checkout aberto.
      //       SÓ permitimos UPGRADE (preço do novo plano >= valor efetivo atual):
      //       migramos a empresa pro plano escolhido AGORA (server-side), usando o
      //       preço de CATÁLOGO como base — empresa e cobrança ficam iguais. NÃO
      //       confiamos no `amount`: a base vem do catálogo.
      //     - DOWNGRADE (plano mais barato que o valor atual) → REJEITA. Foi
      //       exatamente o vetor do incidente: link travado em 'avancado' (R$447) e o
      //       cliente pagava R$197 ('start'). Enquanto não há flag de "plano travado"
      //       server-side, a defesa é NUNCA baixar o valor automaticamente aqui. Um
      //       downgrade legítimo na 1ª venda passa por link/painel novo, não por aqui.
      //     - Qualquer outro caso (renovação, custom_price ativo, personalizado) →
      //       REJEITA. Trocar plano com promoção travada ou em renovação passa pelo
      //       painel/downgrade agendado, não por aqui.
      const isFirstSaleStatus = company.subscription_status === "testing" ||
        company.subscription_status === "Testando" ||
        company.subscription_status === "trial" ||
        company.subscription_status === "pending_payment";
      if (plan_code && company.subscription_plan && plan_code !== company.subscription_plan) {
        const swapContextOk = isFirstSaleStatus && !hasActiveCustomPrice && plan_code !== "personalizado";
        // Preço de catálogo do plano escolhido (necessário pra decidir upgrade x downgrade).
        const { data: newPlanRow } = swapContextOk
          ? await supabase
              .from("subscription_plans")
              .select("price, max_users")
              .eq("code", plan_code)
              .eq("is_active", true)
              .maybeSingle()
          : { data: null };
        const newPlanPrice = Number(newPlanRow?.price) || 0;
        // Só é troca válida se for UPGRADE (>= valor atual da empresa). Downgrade
        // automático é o vetor do incidente → bloqueado.
        const isUpgrade = newPlanPrice > 0 && newPlanPrice >= effectiveCompanyValue;
        if (!swapContextOk || !isUpgrade) {
          console.error(
            `[valor] troca de plano não permitida: plan_code=${plan_code} (R$${newPlanPrice}) vs ` +
              `company.subscription_plan=${company.subscription_plan} (R$${effectiveCompanyValue}) ` +
              `(company=${company_id}, status=${company.subscription_status}, customPrice=${hasActiveCustomPrice}, ` +
              `contextOk=${swapContextOk}, isUpgrade=${isUpgrade}).`,
          );
          throw new ValidationError(
            "O plano cobrado não corresponde ao plano da sua conta. Recarregue a página e tente novamente.",
          );
        }
        const planUpdate: Record<string, unknown> = {
          subscription_plan: plan_code,
          subscription_value: newPlanPrice,
        };
        if (Number(newPlanRow?.max_users) > 0) planUpdate.max_users = Number(newPlanRow!.max_users);
        const { error: swapErr } = await supabase
          .from("companies")
          .update(planUpdate)
          .eq("id", company_id);
        if (swapErr) {
          console.error(`[valor] falha ao migrar empresa pro plano ${plan_code} (company=${company_id}):`, swapErr.message);
          throw new ValidationError("Não foi possível confirmar o plano. Tente novamente.");
        }
        // Reflete localmente + rebaseia a reconciliação no preço do NOVO plano.
        company.subscription_plan = plan_code;
        company.subscription_value = newPlanPrice;
        monthlyBase = newPlanPrice;
        console.log(`[valor] empresa ${company_id} migrada pro plano '${plan_code}' (R$ ${newPlanPrice}) na primeira venda.`);
      }

      // Fail-closed se não há base efetiva pra reconciliar.
      if (!(monthlyBase > 0)) {
        console.error(
          `[valor] sem base efetiva pra reconciliar (company=${company_id}, ` +
            `subscription_value=${company.subscription_value}, custom_price=${company.custom_price}). Rejeitando (fail-closed).`,
        );
        throw new ValidationError(
          "Não foi possível confirmar o valor da assinatura. Fale com o suporte.",
        );
      }

      // Esperado por método/ciclo (regra B9):
      //  - Cartão: SEMPRE mensal (base).
      //  - PIX/boleto anual à vista: round(base × 12 × 0,8) (−20%).
      //  - PIX/boleto mensal: base.
      const reconciledBillingCycle = purpose === "renewal" && company.pending_billing_cycle
        ? company.pending_billing_cycle
        : requestedBillingCycle;
      chargeTerms = resolveChargeTerms(
        billing_type,
        reconciledBillingCycle,
        monthlyBase,
        amount,
      );
      const expected = chargeTerms.expectedAmount;

      // Tolerância só pra centavos de arredondamento — nunca "outro plano".
      const tolerance = Math.max(expected * 0.02, 0.02);
      if (Math.abs(amount - expected) > tolerance) {
        console.error(
          `[valor] divergência: amount=${amount} esperado=${expected} base=${monthlyBase} ` +
            `(método=${billing_type}, ciclo=${chargeTerms.billingCycle}, plan_code=${plan_code ?? "-"}, ` +
            `plano=${company.subscription_plan}, customPrice=${hasActiveCustomPrice})`,
        );
        throw new ValidationError("Valor de cobrança inválido.");
      }
    }

    // A partir daqui, payload e persistência usam somente o ciclo normalizado.
    // Em especial, CREDIT_CARD nunca propaga `yearly` controlado pelo cliente.
    const asaasCycle = chargeTerms.asaasCycle;
    const cycleForDb = chargeTerms.billingCycle;

    // ========== IDEMPOTÊNCIA: reusar cobrança PENDING < 30min ==========
    // Só chegamos aqui depois de `amount` ter sido reconciliado com a fonte da
    // verdade. Isso impede que uma cobrança pendente antiga/mais barata seja
    // reaproveitada para renovar ou elevar uma assinatura atual.
    if (existingPending && existingPending.length > 0) {
      const existing = existingPending[0];
      const minutesAgo = (Date.now() - new Date(existing.created_at).getTime()) / 1000 / 60;

      // Pix Automático grava aut_* (não pay_*); detecta mudança de modo recorrente.
      const existingIsPixAutomatic = existing.billing_type?.toUpperCase() === "PIX" &&
        existing.asaas_payment_id && !existing.asaas_payment_id.startsWith("pay_");
      const requestingPixAutomatic = billing_type === "PIX" && pix_recurring === true;
      const recurringMismatch = billing_type === "PIX" && (existingIsPixAutomatic !== requestingPixAutomatic);
      const amountMismatch = Math.abs(Number(existing.amount) - chargeTerms.expectedAmount) > 0.02;
      const changeRequestMismatch = (existing.subscription_change_request_id ?? null) !==
        (change_request_id ?? null);

      if (minutesAgo < 30 && existing.billing_type?.toUpperCase() === billing_type && !recurringMismatch && !amountMismatch && !changeRequestMismatch) {
        // Para boleto, busca linha digitável e bankSlipUrl atuais.
        let bankSlipUrl: string | null = null;
        let identificationField: string | null = null;
        if (billing_type === "BOLETO" && existing.asaas_payment_id) {
          try {
            const idFieldData = await asaas.get(`/payments/${existing.asaas_payment_id}/identificationField`);
            identificationField = idFieldData.identificationField ?? null;
            bankSlipUrl = idFieldData.bankSlipUrl ?? null;
            if (!bankSlipUrl) {
              const paymentInfo = await asaas.get(`/payments/${existing.asaas_payment_id}`);
              bankSlipUrl = paymentInfo.bankSlipUrl ?? null;
            }
          } catch (e) {
            console.error("Erro ao buscar dados do boleto existente:", e);
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            payment_id: existing.asaas_payment_id,
            status: existing.status,
            invoice_url: existing.invoice_url,
            bank_slip_url: bankSlipUrl,
            identification_field: identificationField,
            pix_qr_code: existing.pix_qr_code,
            pix_copy_paste: existing.pix_copy_paste,
            pix_expiration_date: existing.pix_expiration_date,
            due_date: existing.due_date,
            local_payment_id: existing.id,
            reused_existing: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Mudança de modo recorrente → invalida a antiga pra não ser reusada.
      if (recurringMismatch && minutesAgo < 30) {
        await applyWrite(
          "invalidação da cobrança anterior (subscription_payments CANCELLED)",
          supabase
            .from("subscription_payments")
            .update({ status: "CANCELLED" })
            .eq("id", existing.id),
        );
      }
    }

    // --- CPF/CNPJ: da request, senão da empresa ---
    const providedCpfCnpj = cpf_cnpj?.replace(/\D/g, "") || "";
    const companyCpfCnpj = company.cnpj?.replace(/\D/g, "") || "";
    let validCpfCnpj: string | undefined;
    if (providedCpfCnpj.length === 11 || providedCpfCnpj.length === 14) {
      validCpfCnpj = providedCpfCnpj;
    } else if (companyCpfCnpj.length === 11 || companyCpfCnpj.length === 14) {
      validCpfCnpj = companyCpfCnpj;
    }
    if (!validCpfCnpj) throw new ValidationError("CPF ou CNPJ é obrigatório para gerar cobranças.");

    // --- Get or create Asaas customer ---
    // Interruptor de notificação por empresa (companies.billing_notifications_enabled).
    // Fail-safe: false/null/undefined (inclusive coluna ausente) → notificationDisabled: true,
    // que é o comportamento histórico de TODA a base (a Asaas não manda e-mail de cobrança).
    // Só a empresa com a flag LIGADA recebe e-mail/boleto da Asaas.
    const notificationDisabled = !company.billing_notifications_enabled;
    // E-mail do financeiro entra como ADICIONAL — o e-mail do cadastro continua o principal.
    const billingEmail = (company.billing_email || "").trim();

    let asaasCustomerId = company.asaas_customer_id;
    if (!asaasCustomerId) {
      try {
        const created = await asaas.post(`/customers`, {
          name: company.name,
          email: company.email || undefined,
          cpfCnpj: validCpfCnpj,
          notificationDisabled,
          ...(billingEmail ? { additionalEmails: billingEmail } : {}),
        });
        asaasCustomerId = created.id;
      } catch (e) {
        // Se já cadastrado, busca por CPF/CNPJ.
        if (e instanceof AsaasApiError && /já cadastrad/i.test(e.message)) {
          const searchData = await asaas.get(`/customers`, buildQuery({ cpfCnpj: validCpfCnpj }));
          if (searchData?.data?.length > 0) {
            asaasCustomerId = searchData.data[0].id;
          } else {
            throw new ValidationError("Não foi possível localizar ou criar o cliente na Asaas.");
          }
        } else {
          throw e;
        }
      }
      // FATAL: sem gravar o customer, a PRÓXIMA cobrança não o encontra e cria OUTRO
      // cliente na Asaas com o mesmo CPF/CNPJ — duplicando o cadastro do gateway, que
      // é o que depois embaralha cobrança, notificação e conciliação. Nenhuma cobrança
      // foi criada ainda neste ponto: falhar é barato, repetir é seguro.
      await applyWrite(
        "vínculo do cliente na Asaas (companies.asaas_customer_id)",
        supabase.from("companies").update({ asaas_customer_id: asaasCustomerId }).eq("id", company_id),
      );
    } else {
      // Garante CPF/CNPJ atualizado no customer existente.
      try {
        // ATENÇÃO: este PUT roda a CADA cobrança. Enquanto era `true` fixo, ele desfazia
        // qualquer ajuste de notificação feito à mão no painel da Asaas. Agora ele passa a
        // refletir o interruptor da empresa — que é `false` para todo mundo por default.
        await asaas.put(`/customers/${asaasCustomerId}`, {
          cpfCnpj: validCpfCnpj,
          notificationDisabled,
          ...(billingEmail ? { additionalEmails: billingEmail } : {}),
        });
      } catch (e) {
        if (e instanceof AsaasApiError && /já cadastrad/i.test(e.message)) {
          const searchData = await asaas.get(`/customers`, buildQuery({ cpfCnpj: validCpfCnpj }));
          if (searchData?.data?.length > 0) {
            asaasCustomerId = searchData.data[0].id;
            // FATAL pelo mesmo motivo do ramo acima: o id reconciliado precisa ficar
            // gravado, senão a próxima cobrança repete a busca e pode duplicar.
            await applyWrite(
              "vínculo do cliente na Asaas (companies.asaas_customer_id, reconciliado)",
              supabase.from("companies").update({ asaas_customer_id: asaasCustomerId }).eq("id", company_id),
            );
          }
        } else {
          throw e;
        }
      }
    }

    // Determina se é primeira venda ou renovação (grava em subscription_payments.type).
    const isFirstSale = company.subscription_status === "testing" ||
      company.subscription_status === "Testando" ||
      company.subscription_status === "trial";
    const paymentType = upgradeRequest ? "upgrade" : isFirstSale ? "primeira_venda" : "renovacao";

    // --- Vencimento ---
    const subscriptionExpiresAt = upgradeRequest
      ? new Date()
      : company.subscription_expires_at
      ? new Date(company.subscription_expires_at)
      : new Date();
    const dueDate = new Date(subscriptionExpiresAt);
    if (dueDate < new Date()) {
      dueDate.setTime(Date.now());
      dueDate.setDate(dueDate.getDate() + 1);
    }
    const dueDateStr = dueDate.toISOString().split("T")[0];

    // "Hoje" em America/Sao_Paulo (UTC-3 fixo Dominex). Usado SÓ no cartão: como o
    // cartão é informado no ato do checkout, a 1ª cobrança deve ser debitada HOJE —
    // se mandarmos nextDueDate no futuro, a Asaas AGENDA em vez de debitar na hora
    // (incidente CLIMATIZE). PIX/boleto mantêm o dueDateStr (janela de pagamento).
    const todayBRT = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()); // "YYYY-MM-DD"

    // --- Helper: cancela subscriptions ativas existentes (evita duplicidade) ---
    const cancelExistingSubscriptions = async (customerId: string) => {
      // NÃO "simplifique" removendo esta guarda. Empresa em MODO E-MAIL (flag ligada) tem uma
      // subscription criada FORA do checkout (forma de pagamento UNDEFINED, "o cliente escolhe")
      // que é justamente o que gera a fatura mensal enviada por e-mail. Se o cliente abrir o
      // checkout uma única vez, este helper apagaria essa subscription e a cobrança por e-mail
      // pararia de sair, sem ninguém perceber. Comparação ESTRITA com true: null/undefined
      // (coluna ausente / flag desligada) NUNCA pula o cancelamento — o padrão da base continua
      // sendo cancelar as ativas antes de criar a nova.
      if (company.billing_notifications_enabled === true) {
        console.log(
          `[create-asaas-payment] Empresa ${company_id} em modo e-mail (billing_notifications_enabled=true): ` +
            `NÃO cancelando subscriptions ativas do customer ${customerId} para preservar a cobrança mensal automática.`,
        );
        return;
      }
      try {
        const existing = await asaas.get(`/subscriptions`, buildQuery({ customer: customerId, status: "ACTIVE" }));
        const activeSubs = existing?.data || [];
        for (const sub of activeSubs) {
          try {
            await asaas.delete(`/subscriptions/${sub.id}`);
          } catch (e) {
            console.error(`Falha ao cancelar subscription ${sub.id}:`, e);
          }
        }
      } catch (e) {
        console.error("Erro ao verificar/cancelar subscriptions existentes:", e);
      }
    };

    // ===================================================================
    // MODO E-MAIL: recorrência NOVA é recusada (evita cobrança em dobro)
    // -------------------------------------------------------------------
    // Empresa com billing_notifications_enabled = true já tem UMA assinatura viva na
    // Asaas (criada fora do checkout, forma "o cliente escolhe") que gera a fatura
    // mensal enviada por e-mail. O helper cancelExistingSubscriptions é no-op pra ela
    // — de propósito, pra não matar essa assinatura. A consequência é que, se
    // deixássemos o checkout seguir, ele CRIARIA uma segunda assinatura ativa no mesmo
    // customer: duas cobranças por mês num cliente pagante. Então recusamos aqui,
    // ANTES de qualquer chamada que crie recorrência (PIX automático e cartão).
    //
    // Cobrança AVULSA continua liberada (PIX não-recorrente e BOLETO caem em
    // POST /payments, cobrança única, não criam assinatura): serve pro cliente
    // antecipar um pagamento sem bagunçar a mensalidade.
    //
    // Comparação ESTRITA: null/undefined (flag desligada/coluna ausente) não bloqueia
    // nada — o checkout da base inteira segue exatamente como hoje.
    if (company.billing_notifications_enabled === true) {
      const creatingRecurring = !upgradeRequest && (
        (billing_type === "PIX" && pix_recurring === true) ||
        (billing_type === "CREDIT_CARD" && !!body.card_number)
      );
      if (creatingRecurring) {
        console.log(
          `[create-asaas-payment] Empresa ${company_id} em modo e-mail: recusando criação de ` +
            `recorrência (billing_type=${billing_type}) para não duplicar a assinatura mensal.`,
        );
        throw new ValidationError(
          "A cobrança desta empresa é enviada automaticamente por e-mail todo mês. " +
            "Para mudar a forma de pagamento, fale com o suporte.",
        );
      }
    }

    // ===================================================================
    // UPGRADE: cobranca UNICA. Nunca cria/cancela recorrencia aqui.
    // A recorrencia existente so muda de valor depois que o webhook aplica
    // o upgrade. O externalReference carrega a request para recuperacao mesmo
    // se a gravacao local falhar depois da cobranca nascer no gateway.
    // ===================================================================
    if (upgradeRequest) {
      const externalReference = `upgrade:${upgradeRequest.id}:${company_id}`;
      let newlyTokenizedCard: TokenizedCard | null = null;
      const paymentPayload: Record<string, unknown> = {
        customer: asaasCustomerId,
        billingType: billing_type,
        value: upgradeRequest.amount_due,
        dueDate: billing_type === "CREDIT_CARD" ? todayBRT : dueDateStr,
        description: description || `Upgrade Dominex - ${company.name}`,
        externalReference,
      };

      if (billing_type === "CREDIT_CARD") {
        if (use_saved_card) {
          const hasCardRecurrence = company.payment_method === "credit_card" &&
            typeof company.asaas_subscription_id === "string" &&
            company.asaas_subscription_id.startsWith("sub_") &&
            /^\d{4}$/.test(company.subscription_card_last4 ?? "");
          if (!hasCardRecurrence) {
            throw new ValidationError(
              "Este cartão não está mais disponível. Escolha outra forma de pagamento.",
            );
          }
          if (!clientIp) {
            throw new ValidationError(
              "Não foi possível validar a origem do pagamento. Tente novamente ou escolha outra forma.",
            );
          }
          paymentPayload.creditCardToken = await readSavedCardToken(supabase, company_id);
          paymentPayload.remoteIp = clientIp;
        } else {
          if (!body.card_number) throw new ValidationError("Dados do cartão não informados.");
          newlyTokenizedCard = await tokenizeCard(asaasCustomerId!, body, clientIp);
          if (newlyTokenizedCard) {
            paymentPayload.creditCardToken = newlyTokenizedCard.token;
            paymentPayload.remoteIp = clientIp;
          } else {
            paymentPayload.creditCard = buildCreditCard(body);
            paymentPayload.creditCardHolderInfo = buildCreditCardHolderInfo(body);
            if (clientIp) paymentPayload.remoteIp = clientIp;
          }
        }
      } else {
        paymentPayload.interest = { value: 1, type: "PERCENTAGE" };
        paymentPayload.fine = { value: 2, type: "PERCENTAGE" };
      }

      const payment = await asaas.post(`/payments`, paymentPayload);
      if (newlyTokenizedCard) {
        await persistSavedCardToken(supabase, company_id, newlyTokenizedCard);
      }
      let pixQrCode: string | null = null;
      let pixCopyPaste: string | null = null;
      let pixExpirationDate: string | null = null;
      let identificationField: string | null = null;

      if (billing_type === "PIX") {
        try {
          const pixData = await asaas.get(`/payments/${payment.id}/pixQrCode`);
          pixQrCode = pixData.encodedImage ?? null;
          pixCopyPaste = pixData.payload ?? null;
          const expiration = new Date();
          expiration.setHours(expiration.getHours() + 24);
          pixExpirationDate = expiration.toISOString();
        } catch (error) {
          console.error("[upgrade] erro ao buscar QR Code:", error);
        }
      }

      if (billing_type === "BOLETO") {
        try {
          const boletoData = await asaas.get(`/payments/${payment.id}/identificationField`);
          identificationField = boletoData.identificationField ?? null;
        } catch (error) {
          console.error("[upgrade] erro ao buscar linha digitável:", error);
        }
      }

      const savedPayment = await tryWriteReturning<{ id: string }>(
        "registro local da cobrança de upgrade (subscription_payments)",
        supabase
          .from("subscription_payments")
          .insert({
            company_id,
            asaas_payment_id: payment.id,
            asaas_customer_id: asaasCustomerId,
            amount: Number(upgradeRequest.amount_due),
            status: payment.status || "PENDING",
            payment_method: billing_type.toLowerCase(),
            billing_type,
            billing_cycle: upgradeRequest.target_billing_cycle,
            type: "upgrade",
            pix_qr_code: pixQrCode,
            pix_copy_paste: pixCopyPaste,
            pix_expiration_date: pixExpirationDate,
            invoice_url: payment.invoiceUrl,
            due_date: billing_type === "CREDIT_CARD" ? todayBRT : dueDateStr,
            subscription_change_request_id: upgradeRequest.id,
          })
          .select()
          .single(),
        {
          warnings,
          recovery: {
            company_id,
            change_request_id: upgradeRequest.id,
            asaas_payment_id: payment.id,
            amount: upgradeRequest.amount_due,
          },
        },
      );

      await tryWriteReturning<{ id: string }>(
        "vínculo da cotação com a cobrança de upgrade",
        supabase
          .from("subscription_change_requests")
          .update({ status: "payment_pending", asaas_payment_id: payment.id })
          .eq("id", upgradeRequest.id)
          .in("status", ["pending", "payment_pending"])
          .select("id")
          .single(),
        {
          warnings,
          recovery: {
            company_id,
            change_request_id: upgradeRequest.id,
            asaas_payment_id: payment.id,
          },
        },
      );

      return new Response(
        JSON.stringify({
          success: true,
          payment_id: payment.id,
          status: payment.status || "PENDING",
          invoice_url: payment.invoiceUrl,
          bank_slip_url: payment.bankSlipUrl,
          identification_field: identificationField,
          pix_qr_code: pixQrCode,
          pix_copy_paste: pixCopyPaste,
          pix_expiration_date: pixExpirationDate,
          due_date: billing_type === "CREDIT_CARD" ? todayBRT : dueDateStr,
          local_payment_id: savedPayment?.id,
          ...warnings.toBody(),
          change_request_id: upgradeRequest.id,
          is_recurring: false,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ===================================================================
    // PIX AUTOMÁTICO recorrente
    // ===================================================================
    if (billing_type === "PIX" && pix_recurring) {
      const asaasFrequency = chargeTerms.pixAutomaticFrequency;
      await cancelExistingSubscriptions(asaasCustomerId!);

      const contractId = `DMX-${company_id.substring(0, 8)}-${Date.now().toString(36)}`.substring(0, 35);
      const authorizationPayload = {
        frequency: asaasFrequency,
        contractId,
        startDate: dueDateStr,
        customerId: asaasCustomerId,
        value: amount,
        description: `Dominex - ${company.name}`.substring(0, 35),
        immediateQrCode: {
          expirationSeconds: 86400,
          originalValue: amount,
        },
      };

      let authData: PixAutomaticAuthorization;
      try {
        authData = await asaas.post(`/pix/automatic/authorizations`, authorizationPayload);
      } catch (e) {
        // ---- Fallback: subscription PIX padrão ----
        console.log("Pix Automático indisponível, usando subscription PIX padrão:", (e as Error).message);
        const subscriptionData = await asaas.post(`/subscriptions`, {
          customer: asaasCustomerId,
          billingType: "PIX",
          cycle: asaasCycle,
          value: amount,
          nextDueDate: dueDateStr,
          description: description || `Assinatura Dominex - ${company.name}`,
          externalReference: company_id,
        });

        await linkRecurrenceToCompany(supabase, company_id, subscriptionData.id, "pix");

        // Busca primeiro payment real (pay_*) da subscription pro QR Code.
        let firstPaymentId: string | null = null;
        let pixQrCode: string | null = null;
        let pixCopyPaste: string | null = null;
        let pixExpirationDate: string | null = null;
        try {
          const paymentsData = await asaas.get(`/subscriptions/${subscriptionData.id}/payments`);
          if (paymentsData?.data?.length > 0) {
            firstPaymentId = paymentsData.data[0].id;
            const pixData = await asaas.get(`/payments/${firstPaymentId}/pixQrCode`);
            pixQrCode = pixData.encodedImage ?? null;
            pixCopyPaste = pixData.payload ?? null;
            const exp = new Date();
            exp.setHours(exp.getHours() + 24);
            pixExpirationDate = exp.toISOString();
          }
        } catch (err) {
          console.error("Erro ao buscar QR Code do fallback PIX:", err);
        }

        // NÃO-FATAL: a cobrança JÁ existe na Asaas. Sem esta linha o `local_payment_id`
        // volta vazio e o webhook precisa materializar a linha quando o PAYMENT_*
        // chegar. Falhar alto aqui faria o cliente tentar de novo e gerar uma
        // SEGUNDA cobrança — cobrar duas vezes é pior que reconciliar depois.
        const savedPayment = await tryWriteReturning<{ id: string }>(
          "registro local da cobrança PIX de fallback (subscription_payments)",
          supabase
            .from("subscription_payments")
            .insert({
              company_id,
              asaas_payment_id: firstPaymentId,
              asaas_customer_id: asaasCustomerId,
              amount,
              status: "PENDING",
              payment_method: "pix",
              billing_type: "PIX",
              billing_cycle: cycleForDb,
              type: paymentType,
              pix_qr_code: pixQrCode,
              pix_copy_paste: pixCopyPaste,
              pix_expiration_date: pixExpirationDate,
              invoice_url: subscriptionData.invoiceUrl,
              due_date: dueDateStr,
            })
            .select()
            .single(),
          {
            warnings,
            recovery: {
              company_id,
              asaas_payment_id: firstPaymentId ?? "-",
              asaas_subscription_id: subscriptionData.id,
              amount,
              billing_type: "PIX",
            },
          },
        );

        return new Response(
          JSON.stringify({
            success: true,
            payment_id: firstPaymentId,
            status: "PENDING",
            invoice_url: subscriptionData.invoiceUrl,
            pix_qr_code: pixQrCode,
            pix_copy_paste: pixCopyPaste,
            pix_expiration_date: pixExpirationDate,
            due_date: dueDateStr,
            local_payment_id: savedPayment?.id,
            ...warnings.toBody(),
            subscription_id: subscriptionData.id,
            is_recurring: true,
            pix_automatic: false,
            fallback: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // ---- Pix Automático criado ----
      const pixQrCode = authData.encodedImage || null;
      const pixCopyPaste = authData.payload || null;
      const pixExpirationDate = authData.immediateQrCode?.expirationDate
        ? new Date(authData.immediateQrCode.expirationDate).toISOString()
        : (() => { const d = new Date(); d.setHours(d.getHours() + 24); return d.toISOString(); })();

      // Grava o id da AUTORIZAÇÃO de Pix Automático. ⚠️ É UUID, não `aut_*` (provado
      // em 2026-09-19 na autorização real 01cf93fd-6634-43c4-894b-5bfeef52c1dc).
      // Quem lê esta coluna deve identificar `sub_` positivamente e tratar todo o
      // resto como autorização — ver cancel-asaas-subscription.
      await linkRecurrenceToCompany(supabase, company_id, authData.id, "pix");

      // Busca primeiro payment real (pay_*) da authorization — o webhook chega com pay_*.
      let realFirstPaymentId: string | null = null;
      try {
        const subPayments = await asaas.get(`/payments`, buildQuery({ subscription: authData.id, limit: 1, order: "ASC" }));
        if (subPayments?.data?.length > 0) realFirstPaymentId = subPayments.data[0].id;
      } catch (e) {
        console.log(`[pix-auto] sem payment ainda para auth ${authData.id}:`, (e as Error).message);
      }

      const savedAsaasPaymentId = realFirstPaymentId || authData.id;
      // NÃO-FATAL: a cobrança JÁ existe na Asaas. Sem esta linha o `local_payment_id`
      // volta vazio e o webhook precisa materializar a linha quando o PAYMENT_*
      // chegar. Falhar alto aqui faria o cliente tentar de novo e gerar uma
      // SEGUNDA cobrança — cobrar duas vezes é pior que reconciliar depois.
      const savedPayment = await tryWriteReturning<{ id: string }>(
        "registro local da cobrança do Pix Automático (subscription_payments)",
        supabase
          .from("subscription_payments")
          .insert({
            company_id,
            asaas_payment_id: savedAsaasPaymentId,
            asaas_customer_id: asaasCustomerId,
            amount,
            status: "PENDING",
            payment_method: "pix",
            billing_type: "PIX",
            billing_cycle: cycleForDb,
            type: paymentType,
            pix_qr_code: pixQrCode,
            pix_copy_paste: pixCopyPaste,
            pix_expiration_date: pixExpirationDate,
            due_date: dueDateStr,
          })
          .select()
          .single(),
        {
          warnings,
          recovery: {
            company_id,
            asaas_payment_id: savedAsaasPaymentId,
            asaas_authorization_id: authData.id,
            amount,
            billing_type: "PIX",
          },
        },
      );

      return new Response(
        JSON.stringify({
          success: true,
          payment_id: authData.id,
          status: authData.status || "PENDING",
          pix_qr_code: pixQrCode,
          pix_copy_paste: pixCopyPaste,
          pix_expiration_date: pixExpirationDate,
          due_date: dueDateStr,
          local_payment_id: savedPayment?.id,
          ...warnings.toBody(),
          authorization_id: authData.id,
          is_recurring: true,
          pix_automatic: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ===================================================================
    // CARTÃO DE CRÉDITO recorrente (subscription)
    // ===================================================================
    if (billing_type === "CREDIT_CARD" && body.card_number) {
      await cancelExistingSubscriptions(asaasCustomerId!);

      // B9: cartão é SEMPRE mensal recorrente, sem desconto anual e sem
      // parcelamento. `resolveChargeTerms` normaliza o ciclo e usa como valor do
      // gateway a base mensal da empresa reconciliada acima, nunca um cálculo a
      // partir de `billing_cycle`/`amount` controlados pelo cliente.
      const monthlyCardValue = chargeTerms.gatewayAmount;

      // nextDueDate = HOJE (BRT): o cartão foi informado agora, então a 1ª cobrança
      // deve ser debitada IMEDIATAMENTE. Com dueDateStr (+N dias) a Asaas agendava a
      // cobrança pro futuro em vez de processar o cartão na hora (incidente CLIMATIZE).
      const newlyTokenizedCard = await tokenizeCard(asaasCustomerId!, body, clientIp);
      const subscriptionPayload: Record<string, unknown> = {
        customer: asaasCustomerId,
        billingType: "CREDIT_CARD",
        cycle: "MONTHLY",
        value: monthlyCardValue,
        nextDueDate: todayBRT,
        description: description || `Assinatura Dominex - ${company.name}`,
        externalReference: company_id,
      };
      if (newlyTokenizedCard) {
        subscriptionPayload.creditCardToken = newlyTokenizedCard.token;
        subscriptionPayload.remoteIp = clientIp;
      } else {
        subscriptionPayload.creditCard = buildCreditCard(body);
        subscriptionPayload.creditCardHolderInfo = buildCreditCardHolderInfo(body);
        if (clientIp) subscriptionPayload.remoteIp = clientIp;
      }
      const subscriptionData = await asaas.post(`/subscriptions`, subscriptionPayload);

      await linkRecurrenceToCompany(supabase, company_id, subscriptionData.id, "credit_card");
      if (newlyTokenizedCard) {
        await persistSavedCardToken(supabase, company_id, newlyTokenizedCard);
      }

      // sub_* não é payment.id — webhook PAYMENT_CREATED preenche pay_* depois e
      // PAYMENT_CONFIRMED/RECEIVED é quem confirma de fato (ativa a empresa + credita LTV
      // via credit_ltv_once_for_payment). subscription.status === "ACTIVE" significa apenas
      // que a assinatura recorrente foi criada no Asaas — NÃO que a 1ª cobrança foi paga.
      // Gravar CONFIRMED aqui criava "Pago" falso (linha CONFIRMED com asaas_payment_id/
      // paid_at/ltv_credited_at nulos, empresa seguia pending_payment, LTV=0 — incidente
      // CLIMATIZE). Por isso o cartão SEMPRE entra PENDING; o webhook reconcilia esta linha
      // (PAYMENT_CREATED linka o pay_* nela; PAYMENT_CONFIRMED dá UPDATE pra CONFIRMED).
      const firstPaymentStatus = "PENDING";

      // NÃO-FATAL: a cobrança JÁ existe na Asaas. Sem esta linha o `local_payment_id`
      // volta vazio e o webhook precisa materializar a linha quando o PAYMENT_*
      // chegar. Falhar alto aqui faria o cliente tentar de novo e gerar uma
      // SEGUNDA cobrança — cobrar duas vezes é pior que reconciliar depois.
      const savedPayment = await tryWriteReturning<{ id: string }>(
        "registro local da cobrança no cartão (subscription_payments)",
        supabase
          .from("subscription_payments")
          .insert({
            company_id,
            asaas_payment_id: null,
            asaas_customer_id: asaasCustomerId,
            // No cartão a cobrança é mensal: gravamos o valor mensal e o ciclo
            // "monthly" pra refletir o que a Asaas vai cobrar de fato.
            amount: monthlyCardValue,
            status: firstPaymentStatus,
            payment_method: "credit_card",
            billing_type,
            billing_cycle: "monthly",
            type: paymentType,
            invoice_url: subscriptionData.invoiceUrl,
            // Cartão debita HOJE (BRT), igual ao nextDueDate enviado à Asaas.
            due_date: todayBRT,
          })
          .select()
          .single(),
        {
          warnings,
          recovery: {
            company_id,
            asaas_subscription_id: subscriptionData.id,
            amount: monthlyCardValue,
            billing_type,
          },
        },
      );

      return new Response(
        JSON.stringify({
          success: true,
          payment_id: null,
          status: firstPaymentStatus,
          invoice_url: subscriptionData.invoiceUrl,
          due_date: todayBRT,
          local_payment_id: savedPayment?.id,
          ...warnings.toBody(),
          subscription_id: subscriptionData.id,
          is_recurring: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ===================================================================
    // PIX avulso e BOLETO (cobrança única)
    // ===================================================================
    const payment = await asaas.post(`/payments`, {
      customer: asaasCustomerId,
      billingType: billing_type,
      value: amount,
      dueDate: dueDateStr,
      description: description || `Assinatura Dominex - ${company.name}`,
      externalReference: company_id,
      interest: { value: 1, type: "PERCENTAGE" }, // juros 1% (decisão Asaas)
      fine: { value: 2, type: "PERCENTAGE" },      // multa 2% (decisão Asaas)
    });

    let pixQrCode: string | null = null;
    let pixCopyPaste: string | null = null;
    let pixExpirationDate: string | null = null;
    if (billing_type === "PIX") {
      try {
        const pixData = await asaas.get(`/payments/${payment.id}/pixQrCode`);
        pixQrCode = pixData.encodedImage ?? null;
        pixCopyPaste = pixData.payload ?? null;
        const exp = new Date();
        exp.setHours(exp.getHours() + 24);
        pixExpirationDate = exp.toISOString();
      } catch (e) {
        console.error("Erro ao buscar QR Code PIX:", e);
      }
    }

    let identificationField: string | null = null;
    if (billing_type === "BOLETO") {
      try {
        const idFieldData = await asaas.get(`/payments/${payment.id}/identificationField`);
        identificationField = idFieldData.identificationField ?? null;
      } catch (e) {
        console.error("Erro ao buscar linha digitável do boleto:", e);
      }
    }

    // NÃO-FATAL: a cobrança JÁ existe na Asaas. Sem esta linha o `local_payment_id`
    // volta vazio e o webhook precisa materializar a linha quando o PAYMENT_*
    // chegar. Falhar alto aqui faria o cliente tentar de novo e gerar uma
    // SEGUNDA cobrança — cobrar duas vezes é pior que reconciliar depois.
    const savedPayment = await tryWriteReturning<{ id: string }>(
      "registro local da cobrança avulsa (subscription_payments)",
      supabase
        .from("subscription_payments")
        .insert({
          company_id,
          asaas_payment_id: payment.id,
          asaas_customer_id: asaasCustomerId,
          amount,
          status: payment.status || "PENDING",
          payment_method: billing_type.toLowerCase(),
          billing_type,
          billing_cycle: cycleForDb,
          type: paymentType,
          pix_qr_code: pixQrCode,
          pix_copy_paste: pixCopyPaste,
          pix_expiration_date: pixExpirationDate,
          invoice_url: payment.invoiceUrl,
          due_date: dueDateStr,
        })
        .select()
        .single(),
      {
        warnings,
        recovery: {
          company_id,
          asaas_payment_id: payment.id,
          amount,
          billing_type,
        },
      },
    );

    return new Response(
      JSON.stringify({
        success: true,
        payment_id: payment.id,
        status: payment.status,
        invoice_url: payment.invoiceUrl,
        bank_slip_url: payment.bankSlipUrl,
        identification_field: identificationField,
        pix_qr_code: pixQrCode,
        pix_copy_paste: pixCopyPaste,
        pix_expiration_date: pixExpirationDate,
        due_date: dueDateStr,
        local_payment_id: savedPayment?.id,
        ...warnings.toBody(),
        is_recurring: false,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("create-asaas-payment error:", error);
    let status = 500;
    let message = "Erro ao gerar cobrança.";
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
