// tenant-asaas-manage-subscription
// ---------------------------------
// PRIVILEGIADA (Bearer + módulo 'cobrancas' + can_manage_system). Gerencia uma
// assinatura recorrente existente na conta Asaas DO TENANT (chave BYO do Vault).
//
// company_id vem do profile (payments-auth), nunca do payload. Posse: a
// assinatura TEM que ser da company do gestor (predicado company_id reaplicado).
//
// Ações (MVP):
//   'cancel' → DELETE /v3/subscriptions/{id} no Asaas + status 'cancelled' aqui.
//   'update' → PUT /v3/subscriptions/{id} (value/cycle/nextDueDate/description) +
//              espelha em tenant_subscriptions.
//
// pause/resume: a Asaas NÃO expõe pause/resume nativo de assinatura (só ACTIVE/
// INACTIVE/EXPIRED, sem endpoint de "retomar"). No MVP não oferecemos pause/resume
// (uma pausa só-local geraria cobranças pela Asaas mesmo assim, enganando o tenant).
// Retornamos 400 explicativo se pedido. Reavaliar quando a Asaas suportar.
//
// Nunca loga a chave. Erros em PT-BR via error.context; try/catch de topo.

import { handleCors } from "../_shared/cors.ts";
import {
  authorizePaymentsManager,
  jsonResponse,
  vaultReadSecret,
} from "../_shared/payments-auth.ts";
import { asaasFor, AsaasApiError } from "../_shared/asaas-tenant-client.ts";

type Action = "cancel" | "update" | "pause" | "resume";
const ALLOWED_ACTIONS: readonly Action[] = ["cancel", "update", "pause", "resume"];

type Cycle = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY";
const ALLOWED_CYCLES: readonly Cycle[] = [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUALLY",
  "YEARLY",
];

const MIN_VALUE = 5;

/** Valida `next_due_date` no formato YYYY-MM-DD e não no passado (UTC, dia cheio). */
function validateDueDate(due: string): { ok: true } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return { ok: false, error: "A data de vencimento deve estar no formato AAAA-MM-DD." };
  }
  const parsed = new Date(`${due}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "A data de vencimento é inválida." };
  }
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (parsed.getTime() < todayUtc) {
    return { ok: false, error: "A data de vencimento não pode estar no passado." };
  }
  return { ok: true };
}

interface ManageInput {
  subscription_id?: string; // id local (tenant_subscriptions.id)
  action?: Action;
  // update:
  value?: number;
  cycle?: Cycle;
  next_due_date?: string;
  description?: string;
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (e) {
    console.error("[manage-subscription] exceção não tratada no topo:", (e as Error)?.message ?? e);
    return jsonResponse(req, {
      error: "Ocorreu um erro ao gerenciar a assinatura. Tente novamente em instantes.",
    }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await authorizePaymentsManager(req);
  if (!auth.ok) return auth.response;
  const { supabase, companyId } = auth;

  let input: ManageInput;
  try {
    input = await req.json();
  } catch {
    return jsonResponse(req, { error: "Requisição inválida." }, 400);
  }

  if (!input.subscription_id || typeof input.subscription_id !== "string") {
    return jsonResponse(req, { error: "Assinatura não informada." }, 400);
  }
  const action = input.action as Action;
  if (!ALLOWED_ACTIONS.includes(action)) {
    return jsonResponse(req, { error: "Ação inválida." }, 400);
  }

  // pause/resume não são suportados no MVP (Asaas não expõe pause/resume nativo).
  if (action === "pause" || action === "resume") {
    return jsonResponse(req, {
      error: "Pausar ou retomar assinatura ainda não está disponível. Cancele a assinatura e crie uma nova quando quiser retomar.",
    }, 400);
  }

  try {
    // 1) Carrega a assinatura COM posse por company (predicado reaplicado no server).
    const { data: subData } = await supabase
      .from("tenant_subscriptions")
      .select("id, company_id, asaas_subscription_id, status, value, cycle, next_due_date, description")
      .eq("id", input.subscription_id)
      .eq("company_id", companyId)
      .maybeSingle();
    const sub = subData as any;
    if (!sub) {
      // 404 neutro: não vaza se a assinatura existe em outro tenant.
      return jsonResponse(req, { error: "Assinatura não encontrada na sua empresa." }, 404);
    }

    // 2) Conta ativa + chave do Vault.
    const { data: accountData } = await supabase
      .from("tenant_payment_accounts")
      .select("status, vault_secret_name")
      .eq("company_id", companyId)
      .maybeSingle();
    const account = accountData as any;
    if (!account || account.status !== "active" || !account.vault_secret_name) {
      return jsonResponse(req, {
        error: "Ative o recebimento de pagamentos em Configurações → Integrações para gerenciar assinaturas.",
      }, 400);
    }
    const apiKey = await vaultReadSecret(supabase, account.vault_secret_name);
    if (!apiKey) {
      return jsonResponse(req, {
        error: "A chave da Asaas não foi encontrada. Reative a integração em Configurações → Integrações.",
      }, 400);
    }
    const asaas = asaasFor(apiKey);

    const asaasSubId: string | null =
      typeof sub.asaas_subscription_id === "string" && sub.asaas_subscription_id
        ? sub.asaas_subscription_id
        : null;

    // ================= CANCEL =================
    if (action === "cancel") {
      if (sub.status === "cancelled") {
        return jsonResponse(req, {
          subscription: { id: sub.id, status: "cancelled" },
        }, 200);
      }
      // Cancela no Asaas (se já materializada lá). Se não existe mais no Asaas
      // (404), tratamos como já cancelada e prosseguimos pra marcar local.
      if (asaasSubId) {
        try {
          await asaas.delete<any>(`/subscriptions/${encodeURIComponent(asaasSubId)}`);
        } catch (e) {
          if (e instanceof AsaasApiError && e.status === 404) {
            // Já não existe no Asaas — segue e marca local como cancelada.
          } else {
            throw e;
          }
        }
      }
      await supabase
        .from("tenant_subscriptions")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", sub.id)
        .eq("company_id", companyId);

      return jsonResponse(req, {
        subscription: { id: sub.id, status: "cancelled" },
      }, 200);
    }

    // ================= UPDATE =================
    // Atualiza campos opcionais (só os enviados). Exige assinatura viva no Asaas.
    if (!asaasSubId) {
      return jsonResponse(req, {
        error: "Esta assinatura ainda não está ativa na Asaas e não pode ser alterada.",
      }, 400);
    }
    if (sub.status === "cancelled") {
      return jsonResponse(req, {
        error: "Esta assinatura está cancelada e não pode ser alterada.",
      }, 400);
    }

    const asaasBody: Record<string, unknown> = {};
    const localPatch: Record<string, unknown> = {};

    if (input.value !== undefined) {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < MIN_VALUE) {
        return jsonResponse(req, {
          error: `O valor mínimo de uma assinatura é R$ ${MIN_VALUE.toFixed(2).replace(".", ",")}.`,
        }, 400);
      }
      const rounded = Math.round(value * 100) / 100;
      asaasBody.value = rounded;
      localPatch.value = rounded;
    }
    if (input.cycle !== undefined) {
      if (!ALLOWED_CYCLES.includes(input.cycle)) {
        return jsonResponse(req, { error: "Frequência de cobrança inválida." }, 400);
      }
      asaasBody.cycle = input.cycle;
      localPatch.cycle = input.cycle;
    }
    if (input.next_due_date !== undefined) {
      const raw = String(input.next_due_date).trim();
      const check = validateDueDate(raw);
      if (!check.ok) return jsonResponse(req, { error: check.error }, 400);
      asaasBody.nextDueDate = raw;
      localPatch.next_due_date = raw;
    }
    if (input.description !== undefined) {
      const desc = typeof input.description === "string" ? input.description.trim().slice(0, 500) : "";
      asaasBody.description = desc || null;
      localPatch.description = desc || null;
    }

    if (Object.keys(asaasBody).length === 0) {
      return jsonResponse(req, { error: "Nenhuma alteração informada." }, 400);
    }

    const updated = await asaas.put<any>(
      `/subscriptions/${encodeURIComponent(asaasSubId)}`,
      asaasBody,
    );

    localPatch.updated_at = new Date().toISOString();
    const { data: saved } = await supabase
      .from("tenant_subscriptions")
      .update(localPatch)
      .eq("id", sub.id)
      .eq("company_id", companyId)
      .select("id, status, value, cycle, next_due_date, billing_type")
      .maybeSingle();

    return jsonResponse(req, {
      subscription: {
        id: sub.id,
        status: saved?.status ?? sub.status,
        value: saved?.value ?? updated?.value ?? sub.value,
        cycle: saved?.cycle ?? updated?.cycle ?? sub.cycle,
        next_due_date: saved?.next_due_date ?? updated?.nextDueDate ?? sub.next_due_date,
        billing_type: saved?.billing_type ?? null,
      },
    }, 200);
  } catch (e) {
    const status = e instanceof AsaasApiError ? e.status : 500;
    console.error("[manage-subscription] erro:", (e as Error).message);
    return jsonResponse(req, {
      error: e instanceof AsaasApiError
        ? (e.message || "Falha ao gerenciar a assinatura na Asaas.")
        : "Ocorreu um erro ao gerenciar a assinatura. Tente novamente.",
    }, status >= 400 && status < 600 ? status : 500);
  }
}
