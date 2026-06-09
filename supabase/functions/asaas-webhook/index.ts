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
//  (=company_id) → asaas_customer_id.
//
// Eventos tratados:
//  - PAYMENT_RECEIVED / PAYMENT_CONFIRMED               → ativação/renovação
//  - PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED    → ativação/renovação (Pix Automático)
//  - PAYMENT_CREATED                                    → linka pay_* à subscription_payments
//  - PAYMENT_OVERDUE                                    → desativa só 1ª venda sem pagamento (ver nota past_due)
//  - PAYMENT_REFUNDED / PAYMENT_CHARGEBACK_*            → registra estorno + alerta admin
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
    const txId = `${payment.id}_${kind}`;
    await supabase
      .from("admin_financial_transactions")
      .upsert(
        {
          type: "expense",
          category: kind === "refund" ? "refund" : "chargeback",
          amount,
          description: `${label} Asaas - ${companyName} (${payment.id})`,
          reference_id: companyId,
          reference_type: kind === "refund" ? "subscription_refund" : "subscription_chargeback",
          asaas_transaction_id: txId,
          transaction_date: new Date().toISOString(),
        },
        { onConflict: "asaas_transaction_id", ignoreDuplicates: true },
      );
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

  await supabase.from("companies").update(companyUpdate).eq("id", companyId);

  // Ativa módulos do plano (idempotente; no-op se included_modules vazio).
  await activatePlanModules(supabase, companyId, company.subscription_plan ?? null);

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

  // admin_financial_transactions (receita) — UPSERT ON CONFLICT DO NOTHING (UNIQUE asaas_transaction_id).
  await supabase.from("admin_financial_transactions").upsert(
    {
      type: "income",
      category: financialCategory,
      amount: paymentAmount,
      description: financialDescription,
      reference_id: companyId,
      reference_type: "subscription_payment",
      asaas_transaction_id: opts.asaasPaymentId,
      transaction_date: new Date().toISOString(),
    },
    { onConflict: "asaas_transaction_id", ignoreDuplicates: true },
  );

  // Tarifa Asaas (só quando netValue real veio e é menor que o bruto).
  const netValue = Number(opts.netValue ?? 0);
  if (netValue > 0 && netValue < paymentAmount) {
    const asaasFee = Math.round((paymentAmount - netValue) * 100) / 100;
    await supabase.from("admin_financial_transactions").upsert(
      {
        type: "expense",
        category: "asaas_fee",
        amount: asaasFee,
        description: `Tarifa Asaas - ${company.name} (${opts.billingType || "PIX"})`,
        reference_id: companyId,
        reference_type: "asaas_fee",
        asaas_transaction_id: `${opts.asaasPaymentId}_fee`,
        transaction_date: new Date().toISOString(),
      },
      { onConflict: "asaas_transaction_id", ignoreDuplicates: true },
    );
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
  "id, name, subscription_status, subscription_plan, subscription_value, subscription_expires_at, " +
  "billing_cycle, ltv, origin, salesperson_id, sdr_id, asaas_customer_id, asaas_subscription_id, " +
  "pending_subscription_value, custom_price, custom_price_months, custom_price_payments_made, " +
  "custom_price_permanent";

/** Resolve a company por cascata: asaas_subscription_id → externalReference → asaas_customer_id. */
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
  return null;
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
    // O dinheiro/ativação chega depois no ACTIVATED e nos PAYMENT_RECEIVED.
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
    // PIX AUTOMÁTICO — autorização ativada (pagamento confirmado)
    // ==========================================================
    if (event === "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED") {
      const authorization = body.pixAutomatic || body.authorization || body;
      const authId: string | undefined =
        authorization?.id || authorization?.authorizationId;
      const authValue = Number(authorization?.value || authorization?.scheduledValue || 0);
      const netValue = Number(authorization?.netValue || 0);

      if (!authId) {
        return json({ received: true, ignored: "sem authorizationId" });
      }

      const { data: companyByAuth } = await supabase
        .from("companies")
        .select(COMPANY_COLS)
        .eq("asaas_subscription_id", authId)
        .maybeSingle();

      if (!companyByAuth) {
        console.log(`[pix-auto] nenhuma company para authorization ${authId}`);
        return json({ received: true, matched: false });
      }

      // pay_* real, se vier no payload; senão usa o authId como id de idempotência.
      const realPaymentId: string =
        (authorization as any)?.payment?.id ||
        (authorization as any)?.paymentId ||
        authId;
      const amount = authValue > 0 ? authValue : Number(companyByAuth.subscription_value || 0);

      const result = await processConfirmedPayment(supabase, companyByAuth, {
        asaasPaymentId: realPaymentId,
        amount,
        billingType: "PIX",
        netValue,
        customerId: companyByAuth.asaas_customer_id,
        matchedBy: "pix_automatic_activated",
      });
      return json({ received: true, ...result });
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
        console.log(`[payment] sem company para ${payment.id} (cascata falhou). Ignorado.`);
        return json({ received: true, matched: false });
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
