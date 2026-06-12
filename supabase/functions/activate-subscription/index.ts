// activate-subscription
// ---------------------
// Ativação MANUAL de assinatura por um admin (painel master Auctus).
// Define o plano da company (subscription_plan/status/value/billing_cycle/max_users/
// expires_at) e sincroniza company_modules pelo included_modules do plano.
//
// NÃO cria lançamentos financeiros (admin_financial_transactions / company_payments /
// salesperson_sales / LTV) — isso é responsabilidade do weblhook (PAYMENT_RECEIVED/
// PAYMENT_CONFIRMED) ou do confirm-sale-payment, pra não duplicar receita.
//
// Auth: super_admin (regra-lei Dominex #6 — valida Authorization + has_role server-side).
//
// Adaptado do EcoSistema (activate-subscription/index.ts). Divergências de schema:
//  - subscription_plans usa included_modules (jsonb), NÃO modules.
//  - company_modules usa activated_at + quantity, NÃO added_at.
//  - NFS-e fora de escopo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

interface ActivateRequest {
  company_id: string;
  plan_code: string;
  billing_cycle?: "monthly" | "yearly";
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

    const body: ActivateRequest = await req.json();
    const { company_id, plan_code } = body;
    const billingCycle = body.billing_cycle === "yearly" ? "yearly" : "monthly";

    if (!company_id) return json({ error: "company_id é obrigatório." }, 400);
    if (!plan_code) return json({ error: "plan_code é obrigatório." }, 400);

    // --- Plano ---
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("code, price, max_users, included_modules")
      .eq("code", plan_code)
      .maybeSingle();

    if (planError || !plan) {
      return json({ error: "Plano não encontrado." }, 400);
    }

    const isYearly = billingCycle === "yearly";

    // Plano PERSONALIZADO: o catálogo tem price R$ 0, max_users genérico e
    // included_modules vazio — a fonte do valor é companies.subscription_value,
    // o max_users é o da empresa (definido manualmente na criação) e os módulos
    // são o à la carte já gravado em company_modules. NUNCA sobrescrever com os
    // dados de catálogo (zeraria o valor e apagaria os módulos contratados).
    const isPersonalizado = plan_code === "personalizado";

    // subscription_value guarda o valor mensal do plano; cobrança anual aplica 20% off no momento da cobrança.
    let subscriptionValue = Number(plan.price);
    let maxUsers: number = plan.max_users;
    if (isPersonalizado) {
      const { data: companyRow } = await supabase
        .from("companies")
        .select("subscription_value, max_users")
        .eq("id", company_id)
        .maybeSingle();
      subscriptionValue = Number(companyRow?.subscription_value) || 0;
      maxUsers = companyRow?.max_users ?? plan.max_users;
    }

    // Vencimento via RPC compute_next_expiration (BRT-aware), a partir de agora.
    const { data: expiration } = await supabase.rpc("compute_next_expiration", {
      p_current: new Date().toISOString(),
      p_cycle: billingCycle,
    });
    const expiresAt: string = expiration ?? new Date().toISOString();

    // --- Atualiza a company ---
    const { error: updateError } = await supabase
      .from("companies")
      .update({
        subscription_plan: plan_code,
        subscription_status: "active",
        subscription_value: subscriptionValue,
        billing_cycle: billingCycle,
        max_users: maxUsers,
        subscription_expires_at: expiresAt,
        pending_subscription_value: null,
      })
      .eq("id", company_id);

    if (updateError) {
      console.error("activate-subscription: erro ao atualizar company:", updateError);
      return json({ error: "Erro ao ativar a assinatura." }, 500);
    }

    // --- Sincroniza company_modules com os módulos do plano ---
    // Estratégia: substitui o conjunto pelo included_modules do plano (ativação manual
    // é fonte da verdade do que o admin quis liberar). Idempotente por reescrita.
    // EXCEÇÃO: plano personalizado NÃO reescreve — company_modules (à la carte)
    // é a fonte da verdade dos módulos e seria destruído pelo delete+insert
    // (included_modules do personalizado é vazio).
    let moduleCodes: string[] = [];
    if (!isPersonalizado) {
      const included: unknown = plan.included_modules;
      moduleCodes = Array.isArray(included)
        ? included.filter((m): m is string => typeof m === "string")
        : [];

      await supabase.from("company_modules").delete().eq("company_id", company_id);
      if (moduleCodes.length > 0) {
        const rows = moduleCodes.map((code) => ({
          company_id,
          module_code: code,
          quantity: 1,
          activated_at: new Date().toISOString(),
        }));
        const { error: modError } = await supabase.from("company_modules").insert(rows);
        if (modError) console.error("activate-subscription: erro ao inserir módulos:", modError);
      }
    } else {
      // Reporta os módulos preservados (informativo, sem tocar neles).
      const { data: existingModules } = await supabase
        .from("company_modules")
        .select("module_code")
        .eq("company_id", company_id);
      moduleCodes = (existingModules ?? []).map((m: { module_code: string }) => m.module_code);
    }

    return json({
      success: true,
      company_id,
      subscription_plan: plan_code,
      billing_cycle: billingCycle,
      subscription_expires_at: expiresAt,
      modules: moduleCodes,
    });
  } catch (error) {
    console.error("activate-subscription erro:", error);
    return json(
      { error: error instanceof Error ? error.message : "Erro interno." },
      500,
    );
  }
});
