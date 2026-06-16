// change-nfse-tier
// ----------------
// Sobe o NÍVEL do módulo de Notas Fiscais (NFS-e) de um tenant e ajusta a cobrança.
//
// O módulo `nfe` tem 4 níveis, cada um com cota mensal e preço:
//   N1 → 200 notas/mês  → R$100
//   N2 → 500 notas/mês  → R$200
//   N3 → 1000 notas/mês → R$300
//   N4 → ilimitado      → R$400
// (catálogo em nfse_tiers; companies.nfse_tier guarda o nível atual, default 1.)
//
// Entrada: { company_id, target_tier }
//
// Regra de negócio (espelha change-subscription-plan):
//   - UPGRADE aplica IMEDIATAMENTE; downgrade é agendado no resto do sistema. Aqui só
//     tratamos UPGRADE (o bloqueio de cota só oferece subir de nível). Downgrade de
//     nível está FORA de escopo — rejeitamos com invalid_tier_change.
//   - Pré-requisito: a empresa precisa JÁ TER o módulo `nfe` (via plano OU company_modules).
//     Se não tiver, isto não é troca de nível e sim CONTRATAÇÃO do módulo — devolvemos
//     module_not_active e deixamos o fluxo normal de contratar módulo cuidar disso.
//   - delta = preço(target) − preço(atual).
//     companies.subscription_value += delta (GREATEST(0, ...)); nfse_tier = target.
//     NÃO mexe em pending_* (upgrade é imediato).
//   - Asaas: se houver assinatura recorrente (asaas_subscription_id começa com `sub_`),
//     PUT /subscriptions/{id} com o novo value. Falha → WARNING, não derruba a resposta
//     (o estado local já é a fonte da verdade pro gate).
//
// Auth: própria empresa OU super_admin (authorizeAsaasCompany). Escrita via service_role
// (RLS bloqueia UPDATE direto do tenant em companies). PT-BR nas mensagens.

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

const VALID_TIERS = [1, 2, 3, 4];

interface ChangeNfseTierRequest {
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

    const body: ChangeNfseTierRequest = await req.json();
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

    // --- Pré-requisito: a empresa precisa TER o módulo `nfe` ---
    const { data: hasModule, error: moduleErr } = await supabase.rpc("company_has_module", {
      p_company_id: company_id,
      p_module_code: "nfe",
    });
    if (moduleErr) {
      throw new ValidationError(
        "module_check_failed",
        "Não foi possível verificar o módulo de Notas Fiscais.",
      );
    }
    if (!hasModule) {
      throw new ValidationError(
        "module_not_active",
        "O módulo de Notas Fiscais não está ativo nesta empresa. Contrate o módulo antes de mudar de nível.",
      );
    }

    // --- Empresa atual ---
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select(
        "id, name, nfse_tier, subscription_value, asaas_subscription_id, subscription_plan, subscription_status",
      )
      .eq("id", company_id)
      .single();
    if (companyError || !company) {
      throw new ValidationError("company_not_found", "Empresa não encontrada.");
    }

    const currentTier = Number(company.nfse_tier) || 1;

    // Só upgrade. Downgrade/igual fora de escopo (o bloqueio só oferece subir).
    if (targetTier <= currentTier) {
      throw new ValidationError(
        "invalid_tier_change",
        targetTier === currentTier
          ? "A empresa já está neste nível de Notas Fiscais."
          : "Não é possível reduzir o nível de Notas Fiscais por aqui. A redução só passa a valer no próximo ciclo e deve ser feita pelo canal de ajuste de assinatura.",
      );
    }

    // --- Preços do catálogo (server-side, NUNCA confia no front) ---
    const { data: tierRows, error: tiersErr } = await supabase
      .from("nfse_tiers")
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
        nfse_tier: targetTier,
        subscription_value: newSubscriptionValue,
      })
      .eq("id", company_id);
    if (updErr) {
      throw new ValidationError("update_failed", "Não foi possível atualizar o nível de Notas Fiscais.");
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
      reason: `Upgrade de nível de Notas Fiscais: ${JSON.stringify({
        type: "nfse_tier_change",
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
        console.error(`[change-nfse-tier] falha ao atualizar subscription ${subId} no Asaas:`, e);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        tier: targetTier,
        new_subscription_value: newSubscriptionValue,
        asaas_updated: asaasUpdated,
        ...(asaasWarning ? { asaas_warning: asaasWarning } : {}),
        message: "Nível de Notas Fiscais atualizado! A cota maior já está liberada e o novo valor entra na próxima cobrança.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("change-nfse-tier error:", error);
    let status = 500;
    let code = "internal_error";
    let message = "Erro ao atualizar o nível de Notas Fiscais.";
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
