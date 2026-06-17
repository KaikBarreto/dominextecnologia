// asaas-webhook
// -------------
// Endpoint PÚBLICO chamado pela Asaas (produção) a cada evento de cobrança/recorrência.
// É o portão de ATIVAÇÃO da assinatura SaaS Auctus de cada tenant (company).
//
// Segurança (regra-lei Dominex #6 — FAIL-CLOSED):
//  - O header `asaas-access-token` precisa bater (comparação timing-safe) com o
//    secret ASAAS_WEBHOOK_TOKEN. Se o secret NÃO estiver setado → 401 SEMPRE.
//    NÃO há bypass de retrocompatibilidade (o EcoSistema tinha; aqui não).
//
// Idempotência (defense-in-depth):
//  - credit_ltv_once_for_payment(p_asaas_payment_id, p_company_id, p_amount):
//    RPC que credita LTV 1x por asaas_payment_id. TRUE = creditou agora (winner);
//    FALSE = já creditado (no-op total). Funciona como mutex entre webhook e
//    confirm-sale-payment.
//  - admin_financial_transactions.asaas_transaction_id UNIQUE → UPSERT ON CONFLICT
//    DO NOTHING garante 1 lançamento financeiro por transação.
//
// Resolução de company (cascata): asaas_subscription_id → externalReference
//  (=company_id) → asaas_customer_id → CPF/CNPJ (companies.cnpj). Sem match num
//  pagamento confirmado, registramos como ÓRFÃO (ledger_asaas pending_categorization
//  + admin_notifications), nunca silencioso.
//
// Eventos tratados:
//  - PAYMENT_RECEIVED / PAYMENT_CONFIRMED               → ativação/renovação (ÚNICO caminho de dinheiro)
//  - PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED    → só CONFIRMA a recorrência (NÃO move dinheiro)
//  - PAYMENT_CREATED                                    → linka pay_* à subscription_payments
//  - PAYMENT_OVERDUE                                    → desativa só 1ª venda sem pagamento (ver nota past_due)
//  - PAYMENT_REFUNDED / PAYMENT_CHARGEBACK_*            → registra estorno + alerta admin
//  - RECEIVABLE_ANTICIPATION_* (CREDITED/DEBITED)       → taxa de antecipação como despesa SEPARADA (re-consulta o fee real)
//
// Downgrade agendado: na renovação confirmada (gated pelo mutex), se companies tem
//  pending_plan_code, aplicamos plano/ciclo/max_users/módulos alvo e limpamos pending_*.
//
// Cliente Supabase: service_role (RLS bloqueia tenant; aqui é fluxo de sistema).
// Responde 200 rápido em todos os caminhos pra Asaas não re-enfileirar.
//
// Adaptado do EcoSistema (asaas-webhook/index.ts). Divergências de schema:
//  - companies NÃO tem base_subscription_value, crm_lead_id, referral_discount_balance.
//  - NFS-e fora de escopo (sem nfse_* em admin_financial_transactions aqui).
//  - subscription_plans usa included_modules (jsonb); company_modules usa activated_at + quantity.
//  - Vencimento via RPC compute_next_expiration (BRT-aware no banco), NÃO helper TS.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AsaasConfigError,
  listAnticipationsByPayment,
} from "../_shared/asaas-client.ts";

// CORS permissivo: a Asaas chama server-to-server (sem Origin), então NÃO usamos
// o allowlist de origem do _shared/cors.ts aqui. asaas-access-token liberado no header.
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, asaas-access-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Comparação timing-safe de tokens (constante no tempo, evita timing attack). */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Tamanhos diferentes => compara contra o próprio pra não vazar timing, retorna false.
  if (ab.length !== bb.length) {
    let diff = 1;
    const max = Math.max(ab.length, bb.length);
    for (let i = 0; i < max; i++) {
      diff |= (ab[i % ab.length] ?? 0) ^ (bb[i % bb.length] ?? 0);
    }
    return diff === 0 && false;
  }
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/**
 * Detecta se este é o PRIMEIRO pagamento da company (primeira venda) vs renovação.
 * Sinais: ausência de company_payments do tipo venda/renovação + salesperson_sales +
 * admin_financial_transactions de first_sale/sale + LTV zero.
 */
async function detectIsFirstSale(supabase: any, companyId: string, ltv: number): Promise<boolean> {
  const { data: prevPayments } = await supabase
    .from("company_payments")
    .select("id")
    .eq("company_id", companyId)
    .in("type", ["primeira_venda", "renovacao"])
    .limit(1);

  const { data: existingSale } = await supabase
    .from("salesperson_sales")
    .select("id")
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();

  const { data: existingSaleTx } = await supabase
    .from("admin_financial_transactions")
    .select("id")
    .eq("reference_id", companyId)
    .in("category", ["sale", "first_sale"])
    .eq("type", "income")
    .limit(1);

  const hasAnySaleRecord =
    (prevPayments?.length ?? 0) > 0 ||
    !!existingSale ||
    (existingSaleTx?.length ?? 0) > 0;

  return !hasAnySaleRecord && (Number(ltv) || 0) === 0;
}

/**
 * Sincroniza company_modules com os módulos do plano da company.
 * Lê subscription_plans.included_modules (jsonb array de module_code) pelo
 * companies.subscription_plan e faz UPSERT em company_modules (sem apagar extras
 * já comprados — só garante que os do plano existam). Idempotente.
 */
async function activatePlanModules(supabase: any, companyId: string, planCode: string | null) {
  if (!planCode) return;
  try {
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("included_modules")
      .eq("code", planCode)
      .maybeSingle();

    const included: unknown = plan?.included_modules;
    const moduleCodes: string[] = Array.isArray(included)
      ? included.filter((m): m is string => typeof m === "string")
      : [];

    if (moduleCodes.length === 0) {
      // included_modules vazio/ausente: nada a ativar pelo plano (atual default dos planos Dominex).
      return;
    }

    // Quais já existem pra essa company (evita duplicar / resetar quantity de extras).
    const { data: existing } = await supabase
      .from("company_modules")
      .select("module_code")
      .eq("company_id", companyId);
    const existingSet = new Set((existing ?? []).map((m: any) => m.module_code));

    const toInsert = moduleCodes
      .filter((code) => !existingSet.has(code))
      .map((code) => ({
        company_id: companyId,
        module_code: code,
        quantity: 1,
        activated_at: new Date().toISOString(),
      }));

    if (toInsert.length > 0) {
      const { error } = await supabase.from("company_modules").insert(toInsert);
      if (error) console.error("[modules] insert falhou (não-fatal):", error.message);
      else console.log(`[modules] ativados ${toInsert.length} módulo(s) do plano '${planCode}' para ${companyId}`);
    }
  } catch (e) {
    console.error("[modules] erro inesperado (engolido):", (e as Error).message);
  }
}

/**
 * Sincroniza company_modules EXATAMENTE para o conjunto `targetCodes` (downgrade).
 * Diferente de activatePlanModules (aditivo), AQUI removemos módulos que não estão
 * mais no plano-alvo — é o efeito real do downgrade. Idempotente: se já estiver
 * sincronizado, vira no-op. Best-effort (erros logados, não-fatais) pra não travar
 * o caminho de pagamento já gated pelo mutex.
 */
async function syncCompanyModulesExact(supabase: any, companyId: string, targetCodes: string[]) {
  try {
    const target = new Set(targetCodes);
    const { data: existing } = await supabase
      .from("company_modules")
      .select("module_code")
      .eq("company_id", companyId);
    const existingSet = new Set((existing ?? []).map((m: any) => m.module_code));

    // Remove os que sobraram (não estão no alvo).
    const toRemove = [...existingSet].filter((code) => !target.has(code as string)) as string[];
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("company_modules")
        .delete()
        .eq("company_id", companyId)
        .in("module_code", toRemove);
      if (error) console.error("[modules-sync] delete falhou (não-fatal):", error.message);
      else console.log(`[modules-sync] removidos [${toRemove.join(", ")}] de ${companyId}`);
    }

    // Insere os que faltam.
    const toInsert = targetCodes
      .filter((code) => !existingSet.has(code))
      .map((code) => ({
        company_id: companyId,
        module_code: code,
        quantity: 1,
        activated_at: new Date().toISOString(),
      }));
    if (toInsert.length > 0) {
      const { error } = await supabase.from("company_modules").insert(toInsert);
      if (error) console.error("[modules-sync] insert falhou (não-fatal):", error.message);
      else console.log(`[modules-sync] adicionados [${toInsert.map((m) => m.module_code).join(", ")}] em ${companyId}`);
    }
  } catch (e) {
    console.error("[modules-sync] erro inesperado (engolido):", (e as Error).message);
  }
}

/**
 * Notifica admin (admin_financial_transactions como rastro) quando um estorno/chargeback
 * chega. Aqui registramos como despesa pra refletir no consolidado e deixamos o status
 * do pagamento como REFUNDED/CHARGEBACK. Idempotente via asaas_transaction_id UNIQUE.
 */
async function recordRefundOrChargeback(
  supabase: any,
  payment: any,
  companyId: string | null,
  companyName: string,
  kind: "refund" | "chargeback",
) {
  try {
    const amount = Number(payment.value || 0);
    if (amount <= 0) return;
    const label = kind === "refund" ? "Estorno" : "Chargeback";
    // INSERT idempotente. O índice único de asaas_transaction_id é PARCIAL
    // (WHERE asaas_transaction_id IS NOT NULL); o PostgREST não emite o predicado no
    // onConflict, então UPSERT errava em SILÊNCIO e o estorno/chargeback não era gravado.
    // Fazemos INSERT direto e tratamos 23505 (unique_violation) como sucesso/idempotente.
    // asaas_transaction_id aqui é SEMPRE `${payment.id}_${kind}` (nunca null).
    const txId = `${payment.id}_${kind}`;
    const { error } = await supabase
      .from("admin_financial_transactions")
      .insert({
        type: "expense",
        category: kind === "refund" ? "refund" : "chargeback",
        amount,
        description: `${label} Asaas - ${companyName} (${payment.id})`,
        reference_id: companyId,
        reference_type: kind === "refund" ? "subscription_refund" : "subscription_chargeback",
        asaas_transaction_id: txId,
        transaction_date: new Date().toISOString(),
      });
    if (error && error.code !== "23505") {
      console.error(`[${kind}] insert falhou (${txId}):`, error.message);
    }
    console.log(`[${kind}] registrado para ${companyName}: R$ ${amount} (${payment.id})`);
  } catch (e) {
    console.error(`[${kind}] erro (engolido):`, (e as Error).message);
  }
}

/**
 * Caminho central de ATIVAÇÃO/RENOVAÇÃO a partir de um pagamento confirmado.
 * Recebe a company já resolvida e o objeto payment (ou um pseudo-payment do Pix Automático).
 * Idempotente: usa credit_ltv_once_for_payment como mutex + UPSERT ON CONFLICT nos lançamentos.
 */
async function processConfirmedPayment(
  supabase: any,
  company: any,
  opts: {
    asaasPaymentId: string;     // ID usado para idempotência (pay_* normalmente; aut_* no Pix Automático)
    amount: number;
    billingType: string;        // PIX / CREDIT_CARD / BOLETO
    netValue?: number | null;   // valor líquido (pra calcular tarifa)
    customerId?: string | null; // asaas_customer_id do pagamento
    matchedBy: string;          // diagnóstico: como a company foi encontrada
  },
): Promise<{ processed: boolean; type?: string; reason?: string }> {
  const companyId = company.id;
  const paymentAmount = Number(opts.amount || 0);

  if (paymentAmount <= 0) {
    return { processed: false, reason: "valor inválido" };
  }

  // ===== GATING DE IDEMPOTÊNCIA (FURO 1) =====
  // A Asaas envia PAYMENT_RECEIVED **e** PAYMENT_CONFIRMED pro MESMO pay_*. Sem portão,
  // a EXTENSÃO de subscription_expires_at rodaria 2x (cliente ganharia mês grátis).
  // credit_ltv_once_for_payment é o MUTEX: TRUE = 1ª vez (winner), FALSE = já processado.
  // A RPC dedup por CICLO (mesma company + amount + due_date), então RECEIVED/CONFIRMED
  // do mesmo pagamento reivindicam a MESMA linha → só 1 ganha. TUDO que NÃO é
  // naturalmente idempotente (extensão de vencimento via compute_next_expiration,
  // company_payments, salesperson_sales) fica ABAIXO deste portão. Se FALSE → no-op
  // total e resposta 200. Garantia: o vencimento estende NO MÁXIMO 1x por asaas_payment_id.
  const { data: ltvClaimed, error: ltvError } = await supabase.rpc("credit_ltv_once_for_payment", {
    p_asaas_payment_id: opts.asaasPaymentId,
    p_company_id: companyId,
    p_amount: paymentAmount,
  });
  if (ltvError) {
    console.error(`[process] credit_ltv_once_for_payment falhou:`, ltvError.message);
    // Sem mutex confiável, abortamos pra não duplicar. Asaas re-tenta o webhook.
    return { processed: false, reason: "erro no mutex de LTV" };
  }
  if (!ltvClaimed) {
    // FALSE = já processado (outra confirmação do mesmo ciclo já creditou). PULA TODOS
    // os efeitos colaterais — em especial a extensão de subscription_expires_at.
    console.log(`[process] ${opts.asaasPaymentId} já processado (LTV já creditado). No-op.`);
    return { processed: false, reason: "já processado" };
  }
  // A partir daqui somos o WINNER: extensão de vencimento + lançamentos rodam 1x só.

  // Tipo: primeira venda vs renovação.
  const isFirstSale = await detectIsFirstSale(supabase, companyId, company.ltv);
  const paymentType = isFirstSale ? "primeira_venda" : "renovacao";
  // "sale" e "renewal" existem em admin_financial_categories (labels "Vendas"/"Renovações").
  // NÃO usar "first_sale" aqui: foi consolidado em "sale" e a UI exibiria o name cru.
  const financialCategory = isFirstSale ? "sale" : "renewal";
  const financialDescription = isFirstSale
    ? `Primeira Venda - ${company.name} (Asaas ${opts.asaasPaymentId}) [${opts.matchedBy}]`
    : `Renovação - ${company.name} (Asaas ${opts.asaasPaymentId}) [${opts.matchedBy}]`;

  // Vencimento via RPC compute_next_expiration (BRT-aware no banco).
  const billingCycle = company.billing_cycle === "yearly" ? "yearly" : "monthly";
  const baseExpiration = company.subscription_expires_at ?? new Date().toISOString();
  const { data: nextExpiration, error: expError } = await supabase.rpc("compute_next_expiration", {
    p_current: baseExpiration,
    p_cycle: billingCycle,
  });
  if (expError) {
    console.error(`[process] compute_next_expiration falhou:`, expError.message);
  }
  const newExpiration: string = nextExpiration ?? baseExpiration;

  // Update da company: status active + nova expiração + pending value + custom price.
  const companyUpdate: Record<string, any> = {
    subscription_status: "active",
    subscription_expires_at: newExpiration,
  };

  if (company.pending_subscription_value !== null && company.pending_subscription_value !== undefined) {
    companyUpdate.subscription_value = company.pending_subscription_value;
    companyUpdate.pending_subscription_value = null;
  }

  // Preço promocional temporário (custom_price por N meses) — só progride se NÃO permanente.
  if (
    company.custom_price !== null &&
    company.custom_price !== undefined &&
    company.custom_price_months !== null &&
    company.custom_price_months !== undefined &&
    !company.custom_price_permanent
  ) {
    const paymentsMade = (company.custom_price_payments_made || 0) + 1;
    companyUpdate.custom_price_payments_made = paymentsMade;
    if (paymentsMade >= company.custom_price_months) {
      // Fim do período promocional → volta ao subscription_value (Dominex não tem base_subscription_value).
      companyUpdate.custom_price = null;
      companyUpdate.custom_price_months = null;
      companyUpdate.custom_price_payments_made = 0;
    }
  }

  // ===== DOWNGRADE AGENDADO (MUDANÇA C) — gated pelo mutex (só roda no winner) =====
  // Quando o cliente agenda um downgrade no painel, o alvo fica em pending_plan_code/
  // pending_billing_cycle/pending_max_users/pending_modules (e o valor já vem por
  // pending_subscription_value, aplicado acima). O downgrade só EFETIVA na próxima
  // renovação confirmada — exatamente AQUI, abaixo do portão de idempotência.
  // pendingModuleCodes (quando o downgrade aplica) define o conjunto-alvo de módulos.
  let pendingModuleCodes: string[] | null = null;
  const hasPendingDowngrade =
    company.pending_plan_code !== null && company.pending_plan_code !== undefined;

  if (hasPendingDowngrade) {
    companyUpdate.subscription_plan = company.pending_plan_code;
    if (company.pending_billing_cycle !== null && company.pending_billing_cycle !== undefined) {
      companyUpdate.billing_cycle = company.pending_billing_cycle;
    }
    if (company.pending_max_users !== null && company.pending_max_users !== undefined) {
      companyUpdate.max_users = company.pending_max_users;
    }

    // Conjunto-alvo de módulos: pending_modules explícito, senão os included do novo plano.
    if (Array.isArray(company.pending_modules)) {
      pendingModuleCodes = company.pending_modules.filter(
        (m: unknown): m is string => typeof m === "string",
      );
    } else {
      const { data: targetPlan } = await supabase
        .from("subscription_plans")
        .select("included_modules")
        .eq("code", company.pending_plan_code)
        .maybeSingle();
      const inc: unknown = targetPlan?.included_modules;
      pendingModuleCodes = Array.isArray(inc)
        ? inc.filter((m): m is string => typeof m === "string")
        : [];
    }

    // Limpa TODOS os pending_* nesta mesma atualização (downgrade consumido).
    companyUpdate.pending_plan_code = null;
    companyUpdate.pending_billing_cycle = null;
    companyUpdate.pending_max_users = null;
    companyUpdate.pending_modules = null;
    companyUpdate.pending_subscription_value = null; // garante limpeza mesmo se valor não veio acima
  }

  await supabase.from("companies").update(companyUpdate).eq("id", companyId);

  if (hasPendingDowngrade) {
    // Sincroniza company_modules EXATAMENTE pro conjunto-alvo do downgrade:
    // remove os que não fazem mais parte e insere os que faltam. Reduz acesso
    // de verdade (diferente de activatePlanModules, que só adiciona).
    await syncCompanyModulesExact(supabase, companyId, pendingModuleCodes ?? []);
    console.log(
      `[downgrade] aplicado p/ ${company.name}: plano '${company.pending_plan_code}', ` +
        `módulos [${(pendingModuleCodes ?? []).join(", ")}]`,
    );
  } else {
    // Sem downgrade pendente: mantém o comportamento aditivo (não remove extras pagos).
    await activatePlanModules(supabase, companyId, company.subscription_plan ?? null);
  }

  // company_payments — coluna canônica asaas_payment_id pra idempotência futura.
  await supabase.from("company_payments").insert({
    company_id: companyId,
    amount: paymentAmount,
    type: paymentType,
    payment_method: (opts.billingType || "PIX").toLowerCase(),
    notes: `Pagamento via Asaas - ${opts.asaasPaymentId}`,
    payment_date: new Date().toISOString(),
    origin: company.origin || null,
    asaas_payment_id: opts.asaasPaymentId,
  });

  // admin_financial_transactions (receita) — INSERT idempotente.
  // O índice único é PARCIAL (WHERE asaas_transaction_id IS NOT NULL); o PostgREST não
  // emite o predicado no onConflict, então UPSERT errava em SILÊNCIO e a receita não era
  // gravada. Fazemos INSERT direto e tratamos 23505 (unique_violation no índice parcial)
  // como sucesso/idempotente. asaas_transaction_id aqui é SEMPRE o pay_* (nunca null).
  {
    const { error: incomeErr } = await supabase.from("admin_financial_transactions").insert({
      type: "income",
      category: financialCategory,
      amount: paymentAmount,
      description: financialDescription,
      reference_id: companyId,
      reference_type: "subscription_payment",
      asaas_transaction_id: opts.asaasPaymentId,
      transaction_date: new Date().toISOString(),
    });
    if (incomeErr && incomeErr.code !== "23505") {
      console.error(`[process] insert receita falhou (${opts.asaasPaymentId}):`, incomeErr.message);
    }
  }

  // Tarifa Asaas (só quando netValue real veio e é menor que o bruto).
  const netValue = Number(opts.netValue ?? 0);
  if (netValue > 0 && netValue < paymentAmount) {
    const asaasFee = Math.round((paymentAmount - netValue) * 100) / 100;
    // INSERT idempotente (mesmo motivo do índice parcial acima). 23505 = já existe → ok.
    const feeTxId = `${opts.asaasPaymentId}_fee`;
    const { error: feeErr } = await supabase.from("admin_financial_transactions").insert({
      type: "expense",
      category: "asaas_fee",
      amount: asaasFee,
      description: `Tarifa Asaas - ${company.name} (${opts.billingType || "PIX"})`,
      reference_id: companyId,
      reference_type: "asaas_fee",
      asaas_transaction_id: feeTxId,
      transaction_date: new Date().toISOString(),
    });
    if (feeErr && feeErr.code !== "23505") {
      console.error(`[process] insert tarifa falhou (${feeTxId}):`, feeErr.message);
    }
  }

  // subscription_payments — garante rastro (UPSERT por asaas_payment_id UNIQUE).
  await supabase.from("subscription_payments").upsert(
    {
      company_id: companyId,
      asaas_payment_id: opts.asaasPaymentId,
      asaas_customer_id: opts.customerId ?? company.asaas_customer_id ?? null,
      amount: paymentAmount,
      status: "CONFIRMED",
      billing_type: opts.billingType || "PIX",
      billing_cycle: billingCycle,
      type: paymentType,
      payment_method: (opts.billingType || "PIX").toLowerCase(),
      due_date: new Date().toISOString().split("T")[0],
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "asaas_payment_id" },
  );

  // salesperson_sales — SÓ na primeira venda e SÓ se houver vendedor.
  // FONTE DA VERDADE DA COMISSÃO (FURO 2): a comissão é criada EXCLUSIVAMENTE aqui no
  // webhook (gatilho confiável de pagamento). O confirm-sale-payment NÃO cria comissão
  // — assim não há duplicação. Este bloco já está GATED pelo mutex: processConfirmedPayment
  // retorna cedo (linha do `if (!ltvClaimed) return`) quando o pagamento já foi processado,
  // então a comissão também roda no máximo 1x por pagamento.
  if (isFirstSale && company.salesperson_id) {
    const { data: existingSale } = await supabase
      .from("salesperson_sales")
      .select("id")
      .eq("company_id", companyId)
      .limit(1)
      .maybeSingle();

    if (!existingSale) {
      // REGRA DE COMISSÃO SDR/CLOSER — espelha calculateCommission de
      // src/hooks/useSalespersonData.ts (fonte da verdade no painel master).
      //   - mensal: total = base * 0.50
      //   - anual:  total = base * 0.20
      //   - COM SDR → 50/50 (closer metade, sdr metade)
      //   - SEM SDR → 100% closer
      // Base de comissão = subscription_value mensal (mesmo "valor da venda" que o
      // closer informa no diálogo Registrar Venda). NÃO multiplicamos por 12 no anual
      // — o diálogo usa o valor informado direto, então mantemos paridade.
      //
      // SDR: companies.sdr_id é capturado na ORIGEM (link de teste/venda ou form do
      // painel master). Se a empresa tem sdr_id → comissão dividida 50/50; senão,
      // 100% closer. O closer é SEMPRE company.salesperson_id.
      const isYearly = company.billing_cycle === "yearly";
      const totalRate = isYearly ? 0.20 : 0.50;
      const commissionBase = Number(company.subscription_value || paymentAmount);
      const total = Math.round(commissionBase * totalRate * 100) / 100;

      const sdrId: string | null = company.sdr_id ?? null;
      let closerCommission: number;
      let sdrCommission: number;
      if (sdrId) {
        // 50/50 centavo-safe: closer leva metade arredondada, SDR leva o resto
        // (total - metade) pra não perder/ganhar 1 centavo na divisão ímpar.
        closerCommission = Math.round((total / 2) * 100) / 100;
        sdrCommission = Math.round((total - closerCommission) * 100) / 100;
      } else {
        closerCommission = total;
        sdrCommission = 0;
      }

      await supabase.from("salesperson_sales").insert({
        salesperson_id: company.salesperson_id, // closer
        sdr_id: sdrId,
        company_id: companyId,
        customer_name: company.name,
        customer_origin: company.origin,
        amount: commissionBase,
        paid_amount: company.subscription_value ?? paymentAmount,
        commission_amount: total,
        closer_commission: closerCommission,
        sdr_commission: sdrCommission,
        billing_cycle: isYearly ? "annual" : "monthly",
      });
      console.log(
        `[salesperson] venda registrada p/ ${company.name}: comissão total R$ ${total} ` +
          (sdrId
            ? `(50/50 → closer R$ ${closerCommission} / sdr R$ ${sdrCommission})`
            : `(100% closer R$ ${closerCommission})`),
      );
    }
  }

  console.log(
    `[process] ${paymentType} aplicada p/ ${company.name} (${opts.matchedBy}): R$ ${paymentAmount}, ` +
      `nova expiração ${newExpiration}`,
  );
  return { processed: true, type: paymentType };
}

/** Colunas da company necessárias em todo caminho de ativação. */
const COMPANY_COLS =
  "id, name, cnpj, subscription_status, subscription_plan, subscription_value, subscription_expires_at, " +
  "billing_cycle, ltv, origin, salesperson_id, sdr_id, asaas_customer_id, asaas_subscription_id, " +
  "pending_subscription_value, pending_plan_code, pending_billing_cycle, pending_modules, pending_max_users, " +
  "custom_price, custom_price_months, custom_price_payments_made, " +
  "custom_price_permanent";

/** Mantém só dígitos (normaliza CPF/CNPJ pra comparação tolerante a máscara). */
function digitsOnly(v: unknown): string {
  return typeof v === "string" ? v.replace(/\D/g, "") : "";
}

/**
 * Resolve a company por cascata:
 *   1) asaas_subscription_id → 2) externalReference (=company_id) →
 *   3) asaas_customer_id → 4) CPF/CNPJ (companies.cnpj normalizado).
 * O passo 4 (FM1) cobre pagamentos onde a Asaas não preencheu subscription/
 * externalReference e a company ainda não tem asaas_customer_id linkado (ex.:
 * cobrança avulsa/manual reconciliada pelo documento). Em match por CPF/CNPJ,
 * faz backfill best-effort do asaas_customer_id quando vazio.
 */
async function resolveCompany(
  supabase: any,
  payment: any,
): Promise<{ company: any; matchedBy: string } | null> {
  // 1) por subscription/authorization id
  if (payment.subscription) {
    const { data } = await supabase
      .from("companies")
      .select(COMPANY_COLS)
      .eq("asaas_subscription_id", payment.subscription)
      .maybeSingle();
    if (data) return { company: data, matchedBy: "asaas_subscription_id" };
  }
  // 2) por externalReference (= company_id)
  if (payment.externalReference) {
    const { data } = await supabase
      .from("companies")
      .select(COMPANY_COLS)
      .eq("id", payment.externalReference)
      .maybeSingle();
    if (data) return { company: data, matchedBy: "externalReference" };
  }
  // 3) por asaas_customer_id
  if (payment.customer) {
    const { data } = await supabase
      .from("companies")
      .select(COMPANY_COLS)
      .eq("asaas_customer_id", payment.customer)
      .maybeSingle();
    if (data) return { company: data, matchedBy: "asaas_customer_id" };
  }
  // 4) por CPF/CNPJ (fallback FM1). cpfCnpj pode vir no payment ou no customer embutido.
  const docDigits = digitsOnly(
    payment.cpfCnpj ?? payment.customerCpfCnpj ?? payment.customer?.cpfCnpj,
  );
  if (docDigits.length >= 11) {
    // companies.cnpj pode estar mascarado no banco → normaliza ambos os lados.
    // Sem coluna gerada de dígitos, casamos via regexp_replace no PostgREST.
    const { data: candidates } = await supabase
      .from("companies")
      .select(COMPANY_COLS)
      .not("cnpj", "is", null);
    const match = (candidates ?? []).find(
      (c: any) => digitsOnly(c.cnpj) === docDigits,
    );
    if (match) {
      // Backfill best-effort do customer (só se a company ainda não tem e veio cus_*).
      const incomingCustomer: string | null =
        typeof payment.customer === "string" ? payment.customer : null;
      if (!match.asaas_customer_id && incomingCustomer) {
        await supabase
          .from("companies")
          .update({ asaas_customer_id: incomingCustomer })
          .eq("id", match.id);
        match.asaas_customer_id = incomingCustomer; // reflete pro caller
        console.log(`[resolve] backfill asaas_customer_id=${incomingCustomer} em ${match.name} (match por CPF/CNPJ)`);
      }
      return { company: match, matchedBy: "cpf_cnpj" };
    }
  }
  return null;
}

/**
 * Registra um pagamento ÓRFÃO (sem company resolvida) pra categorização manual.
 * Proíbe órfão silencioso (FM1): grava no ledger_asaas + alerta o admin. Idempotente:
 *   - ledger_asaas.asaas_transaction_id é UNIQUE → ON CONFLICT DO NOTHING.
 *   - admin_notifications: checa antes pra não duplicar pro mesmo payment.id.
 */
async function recordUnmatchedPayment(supabase: any, payment: any): Promise<void> {
  const paymentId: string = payment.id;
  const amount = Number(payment.value || 0);
  const customer: string | null =
    typeof payment.customer === "string" ? payment.customer : null;
  const cpfCnpj =
    payment.cpfCnpj ?? payment.customerCpfCnpj ?? payment.customer?.cpfCnpj ?? null;
  const occurredAt =
    payment.confirmedDate || payment.paymentDate || payment.dateCreated || new Date().toISOString();

  try {
    // 1) Ledger pendente de categorização (company_id NULL). ON CONFLICT DO NOTHING via upsert.
    await supabase.from("ledger_asaas").upsert(
      {
        asaas_transaction_id: paymentId,
        asaas_payment_id: paymentId,
        direction: "credit",
        amount: amount >= 0 ? amount : 0,
        occurred_at: occurredAt,
        status: "pending_categorization",
        source: "webhook",
        company_id: null,
        description: `Pagamento Asaas não vinculado a empresa (${paymentId})`,
        raw_payload: payment,
      },
      { onConflict: "asaas_transaction_id", ignoreDuplicates: true },
    );
  } catch (e) {
    console.error("[unmatched] ledger_asaas falhou (não-fatal):", (e as Error).message);
  }

  try {
    // 2) Alerta ao admin — idempotente: só insere se não existe notificação pro mesmo payment.id.
    const { data: existingNotif } = await supabase
      .from("admin_notifications")
      .select("id")
      .eq("type", "unmatched_asaas_payment")
      .eq("data->>payment_id", paymentId)
      .limit(1)
      .maybeSingle();

    if (!existingNotif) {
      await supabase.from("admin_notifications").insert({
        type: "unmatched_asaas_payment",
        title: "Pagamento Asaas sem empresa vinculada",
        message:
          `Recebemos um pagamento de R$ ${amount.toFixed(2)} (${paymentId}) que não foi ` +
          `associado a nenhuma empresa. Vincule manualmente na conciliação financeira.`,
        data: {
          payment_id: paymentId,
          amount,
          customer,
          cpfCnpj,
        },
      });
      console.log(`[unmatched] alerta criado p/ pagamento órfão ${paymentId} (R$ ${amount})`);
    } else {
      console.log(`[unmatched] alerta já existente p/ ${paymentId} — não duplicado.`);
    }
  } catch (e) {
    console.error("[unmatched] admin_notifications falhou (não-fatal):", (e as Error).message);
  }
}

/**
 * Lança a TAXA DE ANTECIPAÇÃO Asaas como despesa SEPARADA (category=asaas_anticipation_fee),
 * distinta da tarifa comum (asaas_fee). Disparado pelos eventos RECEIVABLE_ANTICIPATION_*.
 *
 * FONTE DA VERDADE: re-consulta a API (GET /anticipations?payment=pay_*) pra obter o `fee`
 * REAL — NÃO confiamos no payload do webhook (formato/wrapper não garantido pela doc).
 * Isso elimina o timing frágil: a taxa de antecipação só existe num 2º momento (após o
 * PAYMENT_RECEIVED), e o fee correto vive no objeto da antecipação, não no payment.
 *
 * Idempotência: asaas_transaction_id = `${pay_*}_anticipation_fee` (UNIQUE parcial).
 * 23505 = já existe = ok. ESTA CHAVE é a MESMA usada pelo lançamento retroativo manual,
 * então se a automação chegar depois ela bate em 23505 e NÃO duplica.
 *
 * Só lança quando a antecipação está efetivamente concretizada (status CREDITED/DEBITED):
 * PENDING/SCHEDULED ainda não cobraram a taxa; DENIED/CANCELLED nunca cobram.
 */
async function recordAnticipationFee(
  supabase: any,
  paymentId: string,
  anticipationStatus: string,
): Promise<{ recorded: boolean; reason?: string; fee?: number }> {
  // Só vale a pena lançar quando a antecipação saiu do limbo. Em CREDITED a taxa já
  // foi descontada do líquido creditado; DEBITED idem (caso de débito posterior).
  const concretized = anticipationStatus === "CREDITED" || anticipationStatus === "DEBITED";
  if (!concretized) {
    return { recorded: false, reason: `status ${anticipationStatus} (sem cobrança ainda)` };
  }

  // Re-consulta o Asaas pra pegar o fee REAL da antecipação dessa cobrança.
  let anticipations;
  try {
    anticipations = await listAnticipationsByPayment(paymentId);
  } catch (e) {
    if (e instanceof AsaasConfigError) {
      console.error(`[anticipation] Asaas não configurado — não foi possível ler o fee de ${paymentId}.`);
      return { recorded: false, reason: "asaas não configurado" };
    }
    console.error(`[anticipation] falha ao consultar antecipações de ${paymentId}:`, (e as Error).message);
    return { recorded: false, reason: "consulta à Asaas falhou" };
  }

  // Soma os fees das antecipações concretizadas dessa cobrança (normalmente 1).
  const relevant = anticipations.filter(
    (a) => a.status === "CREDITED" || a.status === "DEBITED",
  );
  const totalFee =
    Math.round(relevant.reduce((acc, a) => acc + Number(a.fee || 0), 0) * 100) / 100;

  if (totalFee <= 0) {
    return { recorded: false, reason: "fee de antecipação zero ou ausente" };
  }

  // Resolve a company pela cobrança (mesma empresa do pagamento antecipado).
  const { data: payRow } = await supabase
    .from("subscription_payments")
    .select("company_id, billing_type")
    .eq("asaas_payment_id", paymentId)
    .maybeSingle();

  const companyId: string | null = payRow?.company_id ?? null;
  let companyName = "empresa não identificada";
  if (companyId) {
    const { data: comp } = await supabase
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .maybeSingle();
    companyName = comp?.name ?? companyName;
  }
  const billingType = (payRow?.billing_type || "PIX").toString().toUpperCase();

  const antFeeTxId = `${paymentId}_anticipation_fee`;
  const { error: feeErr } = await supabase.from("admin_financial_transactions").insert({
    type: "expense",
    category: "asaas_anticipation_fee",
    amount: totalFee,
    description: `Taxa de Antecipação Asaas - ${companyName} (${billingType})`,
    reference_id: companyId,
    reference_type: "asaas_anticipation_fee",
    asaas_transaction_id: antFeeTxId,
    transaction_date: new Date().toISOString(),
  });
  if (feeErr && feeErr.code !== "23505") {
    console.error(`[anticipation] insert taxa de antecipação falhou (${antFeeTxId}):`, feeErr.message);
    return { recorded: false, reason: "insert falhou" };
  }
  console.log(
    `[anticipation] taxa de antecipação R$ ${totalFee.toFixed(2)} lançada p/ ${companyName} (${antFeeTxId})` +
      (feeErr?.code === "23505" ? " [já existia — idempotente]" : ""),
  );
  return { recorded: true, fee: totalFee };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ===== FAIL-CLOSED: valida token do webhook (regra-lei Dominex #6) =====
  const expectedToken = (Deno.env.get("ASAAS_WEBHOOK_TOKEN") || "").trim();
  if (!expectedToken) {
    // Sem secret configurado, o endpoint NÃO confia em ninguém. Sem bypass.
    console.error("[webhook-auth] ASAAS_WEBHOOK_TOKEN não configurado — recusando (fail-closed).");
    return json({ error: "Webhook não configurado." }, 401);
  }
  const providedToken = (req.headers.get("asaas-access-token") || "").trim();
  if (!providedToken || !timingSafeEqual(providedToken, expectedToken)) {
    console.error(
      `[webhook-auth] token inválido — provided.len=${providedToken.length}, expected.len=${expectedToken.length}`,
    );
    return json({ error: "Unauthorized webhook" }, 401);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body = await req.json();
    const event: string = body?.event ?? "";
    const payment = body?.payment ?? null;
    console.log(`[webhook] evento ${event} recebido`);

    // ==========================================================
    // PIX AUTOMÁTICO — autorização CRIADA (apenas informativo)
    // O dinheiro/ativação chega depois SOMENTE nos PAYMENT_RECEIVED/CONFIRMED
    // (o ACTIVATED apenas confirma a recorrência, não move dinheiro — ver abaixo).
    // Aqui NÃO há processamento financeiro: nada de processConfirmedPayment,
    // nada de crédito de LTV. Só confirmamos o recebimento (200) pra não ficar
    // silenciosamente ignorado — paridade com o EcoSistema.
    // ==========================================================
    if (event === "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED") {
      const authorization = body.pixAutomatic || body.authorization || body;
      const authId: string | undefined =
        authorization?.id || authorization?.authorizationId;
      console.log(
        `[pix-auto] autorização CRIADA (informativo) authId=${authId ?? "n/d"} — sem processamento financeiro`,
      );
      return json({ received: true, informational: true });
    }

    // ==========================================================
    // PIX AUTOMÁTICO — autorização ATIVADA (apenas confirma a recorrência)
    // ----------------------------------------------------------
    // FM2-b (idempotência): este evento NÃO move dinheiro. Ele só sinaliza que
    // o cliente autorizou o débito automático Pix. O dinheiro/renovação SEMPRE
    // chega depois via PAYMENT_RECEIVED/PAYMENT_CONFIRMED com o pay_* REAL — a
    // empresa tem asaas_subscription_id=aut_* (e asaas_customer_id), então esses
    // eventos resolvem a company pela cascata (subscription → customer).
    //
    // Por que NÃO processamos aqui: o handler antigo usava o authId (aut_*) como
    // fallback de asaas_payment_id e chamava processConfirmedPayment. Isso CEGAVA
    // o mutex credit_ltv_once_for_payment (que casa por asaas_payment_id): o aut_*
    // creditava LTV/estendia vencimento, e quando o pay_* real chegava ele creditava
    // DE NOVO (chave diferente) → renovação dupla. Agora: log + 200, ZERO efeito
    // financeiro, e NUNCA gravamos aut_* em subscription_payments.asaas_payment_id.
    // A 1ª ativação da assinatura acontece no 1º PAYMENT_RECEIVED desse aut_*.
    // ==========================================================
    if (event === "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED") {
      const authorization = body.pixAutomatic || body.authorization || body;
      const authId: string | undefined =
        authorization?.id || authorization?.authorizationId;

      if (!authId) {
        return json({ received: true, ignored: "sem authorizationId" });
      }

      const { data: companyByAuth } = await supabase
        .from("companies")
        .select("id, name")
        .eq("asaas_subscription_id", authId)
        .maybeSingle();

      console.log(
        `[pix-auto] autorização ATIVADA (confirmação de recorrência) authId=${authId} ` +
          `company=${companyByAuth?.name ?? "n/d"} — SEM processamento financeiro ` +
          `(dinheiro vem nos PAYMENT_RECEIVED/CONFIRMED com pay_* real)`,
      );
      return json({ received: true, authorization_confirmed: true, matched: !!companyByAuth });
    }

    // ==========================================================
    // ANTECIPAÇÃO DE RECEBÍVEL — taxa de antecipação como despesa SEPARADA
    // ----------------------------------------------------------
    // O Asaas tem uma FILA DE WEBHOOK PRÓPRIA pra antecipações ("Receivable
    // anticipation events"), que precisa estar HABILITADA na conta. Eventos:
    // RECEIVABLE_ANTICIPATION_{PENDING,SCHEDULED,CREDITED,DEBITED,DENIED,CANCELLED,OVERDUE}.
    //
    // A taxa de antecipação NÃO chega no PAYMENT_RECEIVED (o netValue de lá só reflete
    // a tarifa comum). Ela é cobrada num 2º momento, aqui. Para não depender do formato
    // do payload (wrapper não documentado), re-consultamos a API pelo pay_* e pegamos o
    // `fee` REAL. Lançamento idempotente por `${pay_*}_anticipation_fee`.
    // ==========================================================
    if (event.startsWith("RECEIVABLE_ANTICIPATION_")) {
      const ant = body.anticipation || body.receivableAnticipation || body.payment || {};
      const antStatus = String(ant.status || event.replace("RECEIVABLE_ANTICIPATION_", "") || "").toUpperCase();
      // O pay_* da cobrança antecipada (antecipação de parcelamento não tem payment → ignoramos).
      const antPaymentId: string | null =
        (typeof ant.payment === "string" && ant.payment) ? ant.payment : null;

      if (!antPaymentId) {
        console.log(`[anticipation] ${event} sem pay_* (provável antecipação de parcelamento) — ack sem lançamento.`);
        return json({ received: true, anticipation: true, skipped: "sem payment" });
      }

      const result = await recordAnticipationFee(supabase, antPaymentId, antStatus);
      return json({ received: true, anticipation: true, ...result });
    }

    // ==========================================================
    // Eventos que precisam de objeto payment
    // ==========================================================
    if (!payment || !payment.id) {
      console.log(`[webhook] evento ${event} sem payment — ignorado`);
      return json({ received: true, ignored: "sem payment" });
    }

    const status = String(payment.status || "").toUpperCase();
    const isBeingPaid = status === "RECEIVED" || status === "CONFIRMED";

    // ---------- PAYMENT_CREATED: linka pay_* à subscription_payments ----------
    if (event === "PAYMENT_CREATED") {
      // Cartão recorrente grava subscription_payments com asaas_payment_id NULL; quando
      // o pay_* nasce, vinculamos pelo subscription para o webhook de pagamento achar depois.
      if (payment.subscription) {
        const { data: company } = await supabase
          .from("companies")
          .select("id")
          .eq("asaas_subscription_id", payment.subscription)
          .maybeSingle();
        if (company) {
          const { data: linkable } = await supabase
            .from("subscription_payments")
            .select("id")
            .eq("company_id", company.id)
            .is("asaas_payment_id", null)
            .in("status", ["PENDING", "CONFIRMED"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (linkable) {
            await supabase
              .from("subscription_payments")
              .update({ asaas_payment_id: payment.id, updated_at: new Date().toISOString() })
              .eq("id", linkable.id);
            console.log(`[payment_created] linkado ${payment.id} ao subscription_payment ${linkable.id}`);
          }
        }
      }
      return json({ received: true, linked: true });
    }

    // ---------- PAYMENT_REFUNDED / PAYMENT_CHARGEBACK_* ----------
    if (event === "PAYMENT_REFUNDED" || event.startsWith("PAYMENT_CHARGEBACK")) {
      const resolved = await resolveCompany(supabase, payment);
      const kind = event === "PAYMENT_REFUNDED" ? "refund" : "chargeback";
      await recordRefundOrChargeback(
        supabase,
        payment,
        resolved?.company?.id ?? null,
        resolved?.company?.name ?? "empresa não identificada",
        kind,
      );
      // Atualiza status do pagamento local (sem desativar automaticamente — decisão manual do admin).
      await supabase
        .from("subscription_payments")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("asaas_payment_id", payment.id);
      return json({ received: true, recorded: kind });
    }

    // ---------- PAYMENT_OVERDUE ----------
    // NOTA (divergência sinalizada): Dominex NÃO tem status 'past_due' em uso
    // (só active/testing/inactive). Em vez de inventar um valor novo, seguimos o
    // padrão do EcoSistema: marca subscription_payments=OVERDUE e SÓ desativa a
    // company (inactive) quando for 1ª venda nunca paga (LTV=0 e sem company_payments).
    // Renovação vencida NÃO derruba o cliente automaticamente.
    if (event === "PAYMENT_OVERDUE") {
      await supabase
        .from("subscription_payments")
        .update({ status: "OVERDUE", updated_at: new Date().toISOString() })
        .eq("asaas_payment_id", payment.id);

      const resolved = await resolveCompany(supabase, payment);
      if (resolved?.company && resolved.company.subscription_status === "active") {
        const { data: confirmed } = await supabase
          .from("company_payments")
          .select("id")
          .eq("company_id", resolved.company.id)
          .in("type", ["primeira_venda", "renovacao"])
          .limit(1);
        const neverPaid = (!confirmed || confirmed.length === 0) && (Number(resolved.company.ltv) || 0) === 0;
        if (neverPaid) {
          await supabase
            .from("companies")
            .update({ subscription_status: "inactive" })
            .eq("id", resolved.company.id);
          console.log(`[overdue] ${resolved.company.name} desativada (1ª venda nunca paga).`);
        }
      }
      return json({ received: true, overdue: true });
    }

    // ---------- PAYMENT_RECEIVED / PAYMENT_CONFIRMED ----------
    if ((event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") && isBeingPaid) {
      const resolved = await resolveCompany(supabase, payment);
      if (!resolved?.company) {
        // PROIBIDO órfão silencioso (FM1): registra no ledger + alerta admin (idempotente).
        console.log(`[payment] sem company para ${payment.id} (cascata falhou). Registrando como órfão.`);
        await recordUnmatchedPayment(supabase, payment);
        return json({ received: true, matched: false, unmatched_recorded: true });
      }

      const result = await processConfirmedPayment(supabase, resolved.company, {
        asaasPaymentId: payment.id,
        amount: Number(payment.value || 0),
        billingType: payment.billingType || "PIX",
        netValue: payment.netValue != null ? Number(payment.netValue) : null,
        customerId: payment.customer ?? null,
        matchedBy: resolved.matchedBy,
      });
      return json({ received: true, ...result });
    }

    // ---------- Demais eventos: ack silencioso ----------
    console.log(`[webhook] evento ${event} (status ${status}) sem ação. Ack.`);
    return json({ received: true, handled: false });
  } catch (error) {
    console.error("[webhook] erro inesperado:", (error as Error).message);
    // Responde 200 mesmo em erro pra Asaas não re-enfileirar infinitamente um payload ruim.
    // (Idempotência protege contra reprocessamento caso a Asaas re-tente.)
    return json({ received: true, error: (error as Error).message });
  }
});
