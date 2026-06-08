// confirm-sale-payment
// --------------------
// Confirmação de renovação/venda a partir do POLLING do checkout (quando o cliente
// paga e o front quer aplicar a renovação na hora, sem esperar o webhook chegar).
//
// Idempotência (defense-in-depth, compartilha o mutex com o webhook):
//  - credit_ltv_once_for_payment(p_asaas_payment_id, p_company_id, p_amount):
//    TRUE = este caller é o "winner" e faz todo o processamento; FALSE = já
//    processado (webhook ou chamada anterior) → no-op.
//  - admin_financial_transactions.asaas_transaction_id UNIQUE → UPSERT ON CONFLICT.
//
// FURO 1 (gating de efeitos não-idempotentes):
//  Todo efeito que NÃO é naturalmente idempotente — em especial a EXTENSÃO de
//  subscription_expires_at (compute_next_expiration) e o INSERT em company_payments —
//  só pode rodar quando o mutex retorna TRUE (winner). A RPC só dá TRUE quando há um
//  asaas_payment_id real apontando uma subscription_payments com ltv_credited_at NULL,
//  então SEM payment_id NÃO há mutex confiável e ESTES efeitos são PULADOS (no-op,
//  resposta 200). Isso garante que o vencimento estenda no máximo 1x por pagamento e
//  nunca seja estendido por uma confirmação sem id (que o webhook resolverá).
//
// FURO 2 (comissão fora daqui):
//  A comissão/venda em salesperson_sales é criada EXCLUSIVAMENTE pelo asaas-webhook
//  (gatilho confiável). Esta função NÃO toca salesperson_sales — evita duplicar e o
//  cálculo anual errado que existia antes. Aqui ficam só: ativação + LTV + financeiro.
//
// NÃO emite NFS-e (fora de escopo).
//
// Auth: super_admin (regra-lei Dominex #6 — Authorization + has_role server-side).
//
// Adaptado do EcoSistema (confirm-sale-payment/index.ts). Divergências de schema:
//  - companies NÃO tem base_subscription_value, crm_lead_id, referrals.
//  - Vencimento via RPC compute_next_expiration (BRT-aware no banco).
//  - subscription_plans usa included_modules (jsonb); company_modules usa activated_at + quantity.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { asaas, AsaasApiError } from "../_shared/asaas-client.ts";

interface ConfirmRequest {
  company_id: string;
  payment_id?: string;
}

/** Busca o pagamento na Asaas (pra valor/netValue/billingType). Não-fatal. */
async function fetchAsaasPayment(paymentId?: string): Promise<any | null> {
  if (!paymentId || paymentId.startsWith("sub_") || paymentId.startsWith("aut_")) return null;
  try {
    return await asaas.get(`/payments/${paymentId}`);
  } catch (e) {
    if (e instanceof AsaasApiError) {
      console.error("fetchAsaasPayment AsaasApiError (não-fatal):", e.message);
    } else {
      console.error("fetchAsaasPayment erro (não-fatal):", (e as Error).message);
    }
    return null;
  }
}

/** Sincroniza company_modules com os módulos do plano (idempotente, additivo). */
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
    if (moduleCodes.length === 0) return;

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
      await supabase.from("company_modules").insert(toInsert);
    }
  } catch (e) {
    console.error("[modules] erro (engolido):", (e as Error).message);
  }
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // --- Auth: token + super_admin ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Autenticação necessária." }, 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return json({ error: "Token inválido." }, 401);
    }
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "super_admin",
    });
    if (!isAdmin) {
      return json({ error: "Acesso negado." }, 403);
    }

    const { company_id, payment_id }: ConfirmRequest = await req.json();
    if (!company_id) return json({ error: "company_id é obrigatório." }, 400);

    // ===== 1) Company =====
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select(
        "id, name, subscription_status, subscription_plan, subscription_value, subscription_expires_at, " +
          "billing_cycle, ltv, origin, salesperson_id, asaas_customer_id, pending_subscription_value, " +
          "custom_price, custom_price_months, custom_price_payments_made, custom_price_permanent",
      )
      .eq("id", company_id)
      .maybeSingle();

    if (companyError || !company) {
      return json({ error: "Empresa não encontrada." }, 404);
    }

    // ===== 2) Idempotência precoce: subscription_payment já com ltv_credited_at? =====
    let subscriptionPayment: any = null;
    if (payment_id) {
      const { data: sp } = await supabase
        .from("subscription_payments")
        .select("id, asaas_payment_id, amount, ltv_credited_at, billing_type, status, paid_at")
        .eq("asaas_payment_id", payment_id)
        .maybeSingle();
      subscriptionPayment = sp;
    }
    if (subscriptionPayment?.ltv_credited_at) {
      return json({ success: true, already_processed: true, company_id });
    }

    // ===== 3) Valor + tipo de cobrança =====
    const asaasPayment = await fetchAsaasPayment(payment_id);
    const paymentAmount = Number(
      subscriptionPayment?.amount ??
        asaasPayment?.value ??
        company.pending_subscription_value ??
        company.subscription_value ??
        0,
    );
    const netValue = Number(asaasPayment?.netValue ?? 0);
    const billingType = String(
      subscriptionPayment?.billing_type ?? asaasPayment?.billingType ?? "PIX",
    ).toUpperCase();

    if (paymentAmount <= 0) {
      return json({ error: "Valor do pagamento inválido." }, 400);
    }

    // ===== 4) Marca subscription_payment como CONFIRMED + paid_at =====
    if (subscriptionPayment) {
      await supabase
        .from("subscription_payments")
        .update({
          status: "CONFIRMED",
          paid_at: subscriptionPayment.paid_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscriptionPayment.id);
    }

    // ===== 5) Ganha a corrida do crédito de LTV (mutex idempotente) =====
    // GATING (FURO 1): SEM payment_id NÃO há linha-mutex confiável (a RPC usa
    // subscription_payments.asaas_payment_id como chave de reivindicação). Nesse caso
    // NÃO somos winner e PULAMOS todo efeito não-idempotente (extensão de vencimento e
    // company_payments). O webhook chegará com o pay_* real e aplicará a renovação 1x.
    // COM payment_id: só é winner quem ganha a reivindicação atômica do LTV (TRUE).
    const idempotencyKey = payment_id ?? `link_${company_id}_${new Date().toISOString().split("T")[0]}`;
    let isWinner = false;
    if (payment_id) {
      const { data: claimed, error: ltvError } = await supabase.rpc("credit_ltv_once_for_payment", {
        p_asaas_payment_id: payment_id,
        p_company_id: company_id,
        p_amount: paymentAmount,
      });
      if (ltvError) {
        console.error("credit_ltv_once_for_payment falhou:", ltvError.message);
        return json({ error: "Erro ao confirmar pagamento." }, 500);
      }
      isWinner = !!claimed;
    } else {
      // Sem payment_id: marcamos status (idempotente) e devolvemos sucesso, mas NÃO
      // estendemos o vencimento — o webhook é a fonte da verdade da renovação.
      console.log(
        `[confirm-sale] sem payment_id para company ${company_id}: ` +
          `extensão de vencimento DELEGADA ao webhook (no-op idempotente aqui).`,
      );
    }
    if (!isWinner) {
      return json({ success: true, already_processed: true, company_id });
    }

    // ===== 6) primeira_venda vs renovacao =====
    const { count: priorCount } = await supabase
      .from("company_payments")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id)
      .in("type", ["primeira_venda", "renovacao"]);
    const isFirstSale = (priorCount ?? 0) === 0 && (Number(company.ltv) || 0) === 0;
    const paymentType = isFirstSale ? "primeira_venda" : "renovacao";
    const financialCategory = isFirstSale ? "first_sale" : "renewal";
    const financialDescription = isFirstSale
      ? `Primeira Venda - ${company.name} (Asaas ${payment_id ?? "link"})`
      : `Renovação - ${company.name} (Asaas ${payment_id ?? "link"})`;

    // ===== 7) Atualiza vencimento + status active + pending + custom price =====
    const billingCycle = company.billing_cycle === "yearly" ? "yearly" : "monthly";
    const baseExpiration = company.subscription_expires_at ?? new Date().toISOString();
    const { data: nextExpiration } = await supabase.rpc("compute_next_expiration", {
      p_current: baseExpiration,
      p_cycle: billingCycle,
    });
    const newExpiration: string = nextExpiration ?? baseExpiration;

    const companyUpdate: Record<string, any> = {
      subscription_status: "active",
      subscription_expires_at: newExpiration,
    };
    if (company.pending_subscription_value !== null && company.pending_subscription_value !== undefined) {
      companyUpdate.subscription_value = company.pending_subscription_value;
      companyUpdate.pending_subscription_value = null;
    }
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
        companyUpdate.custom_price = null;
        companyUpdate.custom_price_months = null;
        companyUpdate.custom_price_payments_made = 0;
      }
    }

    const { error: updateError } = await supabase
      .from("companies")
      .update(companyUpdate)
      .eq("id", company_id);
    if (updateError) {
      console.error("Erro ao atualizar company:", updateError);
      return json({ error: "Erro ao atualizar empresa." }, 500);
    }

    // Ativa módulos do plano (idempotente).
    await activatePlanModules(supabase, company_id, company.subscription_plan ?? null);

    // ===== 8) company_payments (guard por dia pra não duplicar com o webhook) =====
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: existingCp } = await supabase
      .from("company_payments")
      .select("id")
      .eq("company_id", company_id)
      .in("type", ["primeira_venda", "renovacao"])
      .gte("created_at", today.toISOString())
      .limit(1)
      .maybeSingle();

    if (!existingCp) {
      await supabase.from("company_payments").insert({
        company_id,
        amount: paymentAmount,
        type: paymentType,
        payment_method: billingType.toLowerCase(),
        notes: payment_id ? `Pagamento via Asaas - ${payment_id}` : "Pagamento via link de venda",
        payment_date: new Date().toISOString(),
        origin: company.origin || null,
        asaas_payment_id: payment_id ?? null,
      });
    }

    // ===== 9) admin_financial_transactions (receita) — UNIQUE asaas_transaction_id =====
    if (payment_id) {
      await supabase.from("admin_financial_transactions").upsert(
        {
          type: "income",
          category: financialCategory,
          amount: paymentAmount,
          description: financialDescription,
          reference_id: company_id,
          reference_type: "subscription_payment",
          asaas_transaction_id: payment_id,
          transaction_date: new Date().toISOString(),
        },
        { onConflict: "asaas_transaction_id", ignoreDuplicates: true },
      );
    } else {
      await supabase.from("admin_financial_transactions").insert({
        type: "income",
        category: financialCategory,
        amount: paymentAmount,
        description: financialDescription,
        reference_id: company_id,
        reference_type: "subscription_payment",
        transaction_date: new Date().toISOString(),
      });
    }

    // ===== 10) Tarifa Asaas (se netValue válido) =====
    if (payment_id && netValue > 0 && netValue < paymentAmount) {
      const asaasFee = Math.round((paymentAmount - netValue) * 100) / 100;
      await supabase.from("admin_financial_transactions").upsert(
        {
          type: "expense",
          category: "asaas_fee",
          amount: asaasFee,
          description: `Tarifa Asaas - ${company.name} (${billingType})`,
          reference_id: company_id,
          reference_type: "asaas_fee",
          asaas_transaction_id: `${payment_id}_fee`,
          transaction_date: new Date().toISOString(),
        },
        { onConflict: "asaas_transaction_id", ignoreDuplicates: true },
      );
    }

    // ===== 11) salesperson_sales — REMOVIDO (FURO 2) =====
    // A criação de comissão/venda foi REMOVIDA desta função. A fonte da verdade da
    // comissão é EXCLUSIVAMENTE o asaas-webhook (gatilho confiável de pagamento), que
    // calcula com a base mensal correta (× 0,50 mensal / × 0,20 anual, modelo SDR/closer).
    // Manter aqui duplicava a comissão que o webhook já cria e usava um cálculo anual
    // errado (× 12 × 0,8 antes da taxa, ~9,6x maior). Esta função NÃO toca
    // salesperson_sales.

    return json({
      success: true,
      company_id,
      subscription_expires_at: newExpiration,
      payment_type: paymentType,
      idempotency_key: idempotencyKey,
    });
  } catch (error) {
    console.error("confirm-sale-payment erro:", error);
    return json(
      { error: error instanceof Error ? `Erro interno: ${error.message}` : "Erro interno." },
      500,
    );
  }
});
