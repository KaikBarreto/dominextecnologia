// change-subscription-plan
// -------------------------
// Gerencia a mudança de plano/módulos da assinatura SaaS de um tenant a partir da
// tela "Sua Assinatura" (Billing). O TENANT não pode dar UPDATE direto em companies
// (RLS bloqueia), então toda a mudança passa por aqui com service_role, validando
// posse (própria empresa OU super_admin via authorizeAsaasCompany).
//
// Entrada:
//   { company_id, plan_code, billing_cycle, custom_modules?: string[], extra_users?: number }
//
// Valor mensal calculado server-side (NUNCA confia no front):
//   - Plano pronto (start/avancado/master): subscription_plans.price[plan_code].
//   - Personalizado: soma dos preços dos módulos escolhidos + extra_users × 50.
//     `basic` é SEMPRE incluso e obrigatório no personalizado.
//
// Decisão upgrade vs downgrade vs igual (compara com o VALOR EFETIVO atual da empresa:
// custom_price se promoção ativa, senão subscription_value — NUNCA pending):
//
//   B1 — UPGRADE (novo > atual): o preço novo entra JÁ na próxima cobrança.
//        → subscription_value = novo (imediato); limpa pending_subscription_value;
//          aplica plano/módulos/max_users/billing_cycle AGORA; sincroniza company_modules;
//          atualiza a assinatura no Asaas (PUT /v3/subscriptions/{id}) se houver sub_*.
//
//   B2 — DOWNGRADE (novo < atual): paga o ciclo atual; o valor menor vale no próximo.
//        → pending_subscription_value = novo; NÃO mexe em subscription_value nem no Asaas.
//          ⚠️ NÃO aplica plano/módulos/max_users agora — isso quebraria o acesso JÁ PAGO.
//          O acesso atual é preservado integralmente. A INTENÇÃO de downgrade (plano +
//          módulos + max_users + extra_users alvo) fica registrada em subscription_history
//          (reason estruturado) para o webhook de renovação aplicar quando o ciclo virar.
//          ⚠️ SINALIZAÇÃO: o webhook (asaas-webhook) ainda NÃO lê esse pending para trocar
//          plano/módulos na renovação — hoje ele só atualiza o valor. Portanto, no MVP, o
//          downgrade AGENDA o valor e registra a intenção, mas a troca efetiva de
//          plano/módulos no próximo ciclo depende de um passo futuro no webhook.
//
//   IGUAL (novo == atual): aplica plano/módulos/max_users/billing_cycle agora (reorganização
//        sem mudança de preço — ex: trocar módulos mantendo o mesmo valor); limpa pending.
//
// Sincronização de company_modules (só em upgrade/igual):
//   - Plano pronto → included_modules do plano.
//   - Personalizado → custom_modules (com `basic` garantido).
//
// Auth: própria empresa OU super_admin (authorizeAsaasCompany). Escrita via service_role.
// PT-BR nas mensagens. Espelha o modelo do EcoSistema adaptado ao schema Dominex.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { asaas, AsaasConfigError, AsaasApiError } from "../_shared/asaas-client.ts";
import { authorizeAsaasCompany } from "../_shared/asaas-auth.ts";

class ValidationError extends Error {}

const EXTRA_USER_PRICE = 50;
const BASE_MODULE = "basic";

interface ChangePlanRequest {
  company_id: string;
  plan_code: string;
  billing_cycle?: "monthly" | "yearly";
  custom_modules?: string[];
  extra_users?: number;
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

    const body: ChangePlanRequest = await req.json();
    const {
      company_id,
      plan_code,
      billing_cycle,
      custom_modules,
      extra_users,
    } = body;

    if (!company_id) throw new ValidationError("Empresa não informada.");
    if (!plan_code) throw new ValidationError("Plano não informado.");

    const cycleForDb: "monthly" | "yearly" =
      billing_cycle === "yearly" ? "yearly" : "monthly";

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

    // --- Empresa atual ---
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select(
        "id, name, subscription_plan, subscription_value, pending_subscription_value, max_users, extra_users, billing_cycle, asaas_subscription_id, custom_price, custom_price_months, custom_price_payments_made, subscription_status",
      )
      .eq("id", company_id)
      .single();
    if (companyError || !company) throw new ValidationError("Empresa não encontrada.");

    // --- Catálogo de preços (server-side) ---
    const { data: modulesCatalog } = await supabase
      .from("subscription_modules")
      .select("code, price")
      .eq("is_active", true);
    const modulePriceByCode = new Map<string, number>(
      (modulesCatalog ?? []).map((m) => [m.code, Number(m.price) || 0]),
    );

    const isCustom = plan_code === "personalizado";

    // Plano pronto: precisa existir.
    let planRow: { code: string; price: number; max_users: number; included_modules: string[] } | null = null;
    if (!isCustom) {
      const { data: pr } = await supabase
        .from("subscription_plans")
        .select("code, price, max_users, included_modules")
        .eq("code", plan_code)
        .eq("is_active", true)
        .maybeSingle();
      if (!pr) throw new ValidationError("Plano não encontrado.");
      planRow = {
        code: pr.code,
        price: Number(pr.price) || 0,
        max_users: Number(pr.max_users) || 0,
        included_modules: Array.isArray(pr.included_modules)
          ? (pr.included_modules as unknown[]).filter((m): m is string => typeof m === "string")
          : [],
      };
    }

    // --- Resolve módulos + max_users + valor mensal alvo ---
    let targetModules: string[];
    let targetMaxUsers: number;
    let targetMonthlyValue: number;
    const targetExtraUsers = isCustom ? Math.max(0, Number(extra_users) || 0) : 0;

    if (isCustom) {
      // Personalizado: `basic` sempre incluso/obrigatório. Filtra códigos válidos
      // (presentes no catálogo ativo) e ignora extra_user como módulo (é via contador).
      const chosen = new Set<string>([BASE_MODULE]);
      for (const code of custom_modules ?? []) {
        if (code === "extra_user") continue;
        if (modulePriceByCode.has(code)) chosen.add(code);
      }
      targetModules = Array.from(chosen);

      const modulesPrice = targetModules.reduce(
        (sum, code) => sum + (modulePriceByCode.get(code) ?? 0),
        0,
      );
      targetMonthlyValue = modulesPrice + targetExtraUsers * EXTRA_USER_PRICE;
      // No personalizado, companies.max_users JÁ é o total (não soma extra por cima).
      // Base de 2 usuários (igual ao subscription_plans.personalizado.max_users) + extras.
      targetMaxUsers = 2 + targetExtraUsers;
    } else {
      targetModules = planRow!.included_modules;
      targetMaxUsers = planRow!.max_users;
      targetMonthlyValue = planRow!.price;
    }

    if (!(targetMonthlyValue > 0)) {
      throw new ValidationError("Não foi possível calcular o valor do plano. Selecione ao menos um módulo.");
    }

    // --- Valor EFETIVO atual (custom_price se promoção ativa, senão subscription_value) ---
    const cp = Number(company.custom_price) || 0;
    const cpMonths = Number(company.custom_price_months) || 0;
    const cpMade = Number(company.custom_price_payments_made) || 0;
    const hasActiveCustomPrice = cp > 0 && cpMonths > 0 && cpMade < cpMonths;
    const currentEffectiveValue = hasActiveCustomPrice
      ? cp
      : Number(company.subscription_value) || 0;

    const isUpgrade = targetMonthlyValue > currentEffectiveValue;
    const isDowngrade = targetMonthlyValue < currentEffectiveValue;
    const changeKind = isUpgrade ? "upgrade" : isDowngrade ? "downgrade" : "igual";

    // ===================================================================
    // DOWNGRADE (B2): agenda o valor menor pro próximo ciclo, preserva acesso.
    // ===================================================================
    if (isDowngrade) {
      // Agenda o ALVO completo (valor + plano + ciclo + módulos + max_users) nos campos
      // pending_*. NÃO mexe em subscription_value, plano, módulos, max_users nem no Asaas —
      // o cliente já pagou o ciclo atual e mantém o acesso integral. O webhook de renovação
      // lê esses pending_* e aplica a troca quando o próximo ciclo virar.
      await supabase
        .from("companies")
        .update({
          pending_subscription_value: targetMonthlyValue,
          pending_plan_code: plan_code,
          pending_billing_cycle: cycleForDb,
          pending_modules: targetModules,
          pending_max_users: targetMaxUsers,
        })
        .eq("id", company_id);

      // Registra a INTENÇÃO de downgrade (plano + módulos + usuários alvo) pra um
      // passo futuro no webhook de renovação aplicar quando o ciclo virar.
      const intent = {
        scheduled_plan: plan_code,
        scheduled_modules: targetModules,
        scheduled_max_users: targetMaxUsers,
        scheduled_extra_users: targetExtraUsers,
        scheduled_billing_cycle: cycleForDb,
        scheduled_value: targetMonthlyValue,
      };
      await supabase.from("subscription_history").insert({
        company_id,
        changed_by: auth.userId ?? null,
        previous_plan: company.subscription_plan ?? null,
        new_plan: company.subscription_plan ?? null, // plano só muda no próximo ciclo
        previous_value: currentEffectiveValue,
        new_value: company.subscription_value ?? currentEffectiveValue, // valor atual não muda agora
        previous_status: company.subscription_status ?? null,
        new_status: company.subscription_status ?? null,
        reason: `Downgrade agendado para o próximo ciclo: ${JSON.stringify(intent)}`,
      });

      return new Response(
        JSON.stringify({
          success: true,
          change_kind: "downgrade",
          scheduled_value: targetMonthlyValue,
          current_value: company.subscription_value ?? currentEffectiveValue,
          message:
            "Downgrade agendado. Você mantém o plano atual até o fim do período já pago; o novo valor passa a valer na próxima cobrança.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ===================================================================
    // UPGRADE (B1) ou IGUAL: aplica plano/módulos/max_users/ciclo AGORA.
    // ===================================================================

    // 1) Atualiza companies (service_role — RLS bloqueia o tenant direto).
    const companyUpdate: Record<string, unknown> = {
      subscription_plan: plan_code,
      max_users: targetMaxUsers,
      extra_users: targetExtraUsers,
      billing_cycle: cycleForDb,
      subscription_value: targetMonthlyValue, // upgrade entra já; igual mantém o mesmo
      // Limpa qualquer downgrade agendado anterior — o alvo aplica AGORA, não na renovação.
      pending_subscription_value: null,
      pending_plan_code: null,
      pending_billing_cycle: null,
      pending_modules: null,
      pending_max_users: null,
    };
    const { error: updErr } = await supabase
      .from("companies")
      .update(companyUpdate)
      .eq("id", company_id);
    if (updErr) throw new ValidationError("Não foi possível atualizar a assinatura.");

    // 2) Sincroniza company_modules: remove os atuais e insere os do plano alvo.
    await supabase.from("company_modules").delete().eq("company_id", company_id);
    if (targetModules.length > 0) {
      const inserts = targetModules.map((module_code) => ({
        company_id,
        module_code,
      }));
      const { error: insErr } = await supabase.from("company_modules").insert(inserts);
      if (insErr) throw new ValidationError("Não foi possível sincronizar os módulos do plano.");
    }

    // 3) Registra no histórico.
    await supabase.from("subscription_history").insert({
      company_id,
      changed_by: auth.userId ?? null,
      previous_plan: company.subscription_plan ?? null,
      new_plan: plan_code,
      previous_value: currentEffectiveValue,
      new_value: targetMonthlyValue,
      previous_status: company.subscription_status ?? null,
      new_status: company.subscription_status ?? null,
      reason: changeKind === "upgrade"
        ? "Upgrade de plano (valor novo na próxima cobrança)"
        : "Reorganização de módulos sem mudança de valor",
    });

    // 4) Atualiza a assinatura recorrente no Asaas (só em upgrade, só se houver sub_*).
    //    PIX Automático (aut_*) e ausência de recorrência não são atualizados aqui — o
    //    novo valor passa a valer na próxima cobrança gerada pela recorrência.
    let asaasUpdated = false;
    let asaasWarning: string | null = null;
    if (isUpgrade) {
      const subId: string | null = company.asaas_subscription_id ?? null;
      if (subId && subId.startsWith("sub_")) {
        try {
          await asaas.put(`/subscriptions/${subId}`, {
            value: targetMonthlyValue,
            updatePendingPayments: false, // não recria a cobrança do ciclo atual já gerada
          });
          asaasUpdated = true;
        } catch (e) {
          // Não fingimos sucesso da integração, mas o estado local (que é a fonte da
          // verdade pro gate de acesso) já está aplicado. Reportamos como aviso.
          if (e instanceof AsaasConfigError) {
            asaasWarning = "Integração de pagamento não configurada; valor será ajustado na próxima cobrança.";
          } else {
            asaasWarning = "Não foi possível sincronizar o novo valor com a operadora agora; será ajustado na próxima cobrança.";
          }
          console.error(`[change-plan] falha ao atualizar subscription ${subId} no Asaas:`, e);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        change_kind: changeKind,
        new_value: targetMonthlyValue,
        max_users: targetMaxUsers,
        modules: targetModules,
        asaas_updated: asaasUpdated,
        asaas_warning: asaasWarning,
        message: changeKind === "upgrade"
          ? "Plano atualizado! O novo valor já entra na próxima cobrança e os recursos estão liberados."
          : "Plano atualizado com sucesso.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("change-subscription-plan error:", error);
    let status = 500;
    let message = "Erro ao atualizar o plano.";
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
