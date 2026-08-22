// change-whatsapp-tier
// --------------------
// Sobe o NÍVEL do add-on de Avisos de WhatsApp de um tenant e ajusta a cobrança.
// Clone de change-nfse-tier.
//
// O add-on `whatsapp` tem 4 níveis, cada um com cota mensal e preço (placeholders
// calibrados pelo CEO no catálogo whatsapp_tiers). companies.whatsapp_tier guarda
// o nível atual, default 1.
//
// Entrada: { company_id, target_tier }
//
// Regra de negócio (espelha change-nfse-tier):
//   - UPGRADE aplica IMEDIATAMENTE. Downgrade de nível está FORA de escopo —
//     rejeitamos com invalid_tier_change.
//   - Pré-requisito: a empresa precisa JÁ TER o módulo `whatsapp` (via plano OU
//     company_modules). Se não tiver, isto não é troca de nível e sim CONTRATAÇÃO
//     do add-on — devolvemos module_not_active.
//   - delta = preço(target) − preço(atual).
//     companies.subscription_value += delta (GREATEST(0, ...)); whatsapp_tier = target.
//   - Asaas: se houver assinatura recorrente (asaas_subscription_id começa com `sub_`),
//     PUT /subscriptions/{id} com o novo value. Falha → WARNING, não derruba a resposta.
//
// Auth: própria empresa OU super_admin (authorizeAsaasCompany). Escrita via service_role.
// PT-BR nas mensagens.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { asaas, AsaasConfigError, AsaasApiError } from "../_shared/asaas-client.ts";
import { authorizeAsaasCompany } from "../_shared/asaas-auth.ts";

class ValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const VALID_TIERS = [1, 2, 3, 4, 5];

interface ChangeWhatsappTierRequest {
  company_id: string;
  target_tier: number;
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

    const body: ChangeWhatsappTierRequest = await req.json();
    const company_id = body?.company_id;
    const targetTier = Number(body?.target_tier);

    if (!company_id) {
      throw new ValidationError("invalid_request", "Empresa não informada.");
    }
    if (!VALID_TIERS.includes(targetTier)) {
      throw new ValidationError(
        "invalid_request",
        "Nível inválido. Escolha um nível entre 1 e 4.",
      );
    }

    // --- Auth: própria empresa OU super_admin ---
    const auth = await authorizeAsaasCompany(
      supabase,
      req.headers.get("Authorization"),
      company_id,
    );
    if (!auth.ok) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: auth.message }),
        { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Pré-requisito: a empresa precisa TER o módulo `whatsapp` ---
    const { data: hasModule, error: moduleErr } = await supabase.rpc("company_has_module", {
      p_company_id: company_id,
      p_module_code: "whatsapp",
    });
    if (moduleErr) {
      throw new ValidationError(
        "module_check_failed",
        "Não foi possível verificar o add-on de Avisos de WhatsApp.",
      );
    }
    if (!hasModule) {
      throw new ValidationError(
        "module_not_active",
        "O add-on de Avisos de WhatsApp não está ativo nesta empresa. Contrate o add-on antes de mudar de nível.",
      );
    }

    // --- Empresa atual ---
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select(
        "id, name, whatsapp_tier, subscription_value, asaas_subscription_id, subscription_plan, subscription_status",
      )
      .eq("id", company_id)
      .single();
    if (companyError || !company) {
      throw new ValidationError("company_not_found", "Empresa não encontrada.");
    }

    const currentTier = Number(company.whatsapp_tier) || 1;

    // Só upgrade. Downgrade/igual fora de escopo.
    if (targetTier <= currentTier) {
      throw new ValidationError(
        "invalid_tier_change",
        targetTier === currentTier
          ? "A empresa já está neste nível de Avisos de WhatsApp."
          : "Não é possível reduzir o nível de Avisos de WhatsApp por aqui. A redução só passa a valer no próximo ciclo e deve ser feita pelo canal de ajuste de assinatura.",
      );
    }

    // --- Preços do catálogo (server-side, NUNCA confia no front) ---
    const { data: tierRows, error: tiersErr } = await supabase
      .from("whatsapp_tiers")
      .select("tier, price")
      .in("tier", [currentTier, targetTier]);
    if (tiersErr || !tierRows) {
      throw new ValidationError("tier_catalog_failed", "Não foi possível ler o catálogo de níveis.");
    }
    const priceByTier = new Map<number, number>(
      tierRows.map((r) => [Number(r.tier), Number(r.price) || 0]),
    );
    const currentPrice = priceByTier.get(currentTier) ?? 0;
    const targetPrice = priceByTier.get(targetTier);
    if (targetPrice === undefined) {
      throw new ValidationError("tier_not_found", "Nível de destino não encontrado no catálogo.");
    }

    const delta = targetPrice - currentPrice;
    const currentValue = Number(company.subscription_value) || 0;
    const newSubscriptionValue = Math.max(0, currentValue + delta);

    // --- Aplica upgrade IMEDIATO (service_role — RLS bloqueia o tenant direto) ---
    const { error: updErr } = await supabase
      .from("companies")
      .update({
        whatsapp_tier: targetTier,
        subscription_value: newSubscriptionValue,
      })
      .eq("id", company_id);
    if (updErr) {
      throw new ValidationError("update_failed", "Não foi possível atualizar o nível de Avisos de WhatsApp.");
    }

    // --- Histórico ---
    await supabase.from("subscription_history").insert({
      company_id,
      changed_by: auth.userId ?? null,
      previous_plan: company.subscription_plan ?? null,
      new_plan: company.subscription_plan ?? null,
      previous_value: currentValue,
      new_value: newSubscriptionValue,
      previous_status: company.subscription_status ?? null,
      new_status: company.subscription_status ?? null,
      reason: `Upgrade de nível de Avisos de WhatsApp: ${JSON.stringify({
        type: "whatsapp_tier_change",
        from: currentTier,
        to: targetTier,
        delta,
      })}`,
    });

    // --- Asaas: atualiza a assinatura recorrente (sub_*) com o novo valor ---
    let asaasUpdated = false;
    let asaasWarning: string | undefined;
    const subId: string | null = company.asaas_subscription_id ?? null;
    if (subId && subId.startsWith("sub_")) {
      try {
        await asaas.put(`/subscriptions/${subId}`, {
          value: newSubscriptionValue,
          updatePendingPayments: false, // não recria a cobrança do ciclo atual já gerada
        });
        asaasUpdated = true;
      } catch (e) {
        // Estado local já aplicado (fonte da verdade pro gate). Asaas vira aviso.
        if (e instanceof AsaasConfigError) {
          asaasWarning = "Integração de pagamento não configurada; o valor será ajustado na próxima cobrança.";
        } else {
          asaasWarning = "Não foi possível sincronizar o novo valor com a operadora agora; será ajustado na próxima cobrança.";
        }
        console.error(`[change-whatsapp-tier] falha ao atualizar subscription ${subId} no Asaas:`, e);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        tier: targetTier,
        new_subscription_value: newSubscriptionValue,
        asaas_updated: asaasUpdated,
        ...(asaasWarning ? { asaas_warning: asaasWarning } : {}),
        message: "Nível de Avisos de WhatsApp atualizado! A cota maior já está liberada e o novo valor entra na próxima cobrança.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("change-whatsapp-tier error:", error);
    let status = 500;
    let code = "internal_error";
    let message = "Erro ao atualizar o nível de Avisos de WhatsApp.";
    if (error instanceof AsaasConfigError) {
      status = 503;
      code = "asaas_not_configured";
      message = error.message;
    } else if (error instanceof ValidationError) {
      status = error.code === "module_not_active" ? 409 : 400;
      code = error.code;
      message = error.message;
    } else if (error instanceof AsaasApiError) {
      status = 400;
      code = "asaas_error";
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return new Response(
      JSON.stringify({ error: code, message }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
