// tenant-asaas-card-fees
// ----------------------
// PRIVILEGIADA (mesma auth do create-charge: Bearer + módulo 'cobrancas' +
// can_manage_system). Devolve a tabela de taxa de cartão EFETIVA do tenant
// (override manual → cache → Asaas myAccount/fees → fallback) para o front
// montar o preview do repasse ao cliente na tela de cobrança.
//
// Não cria cobrança, não vaza custo/margem — só a taxa que o próprio tenant
// já enxerga no painel Asaas dele. company_id vem do profile (payments-auth).
//
// GET (sem corpo) OU POST { refresh?: boolean }. Com refresh=true força
// rebuscar no Asaas e atualizar o cache (usado pelo botão "Sincronizar taxas").

import { handleCors } from "../_shared/cors.ts";
import {
  authorizePaymentsManager,
  jsonResponse,
  vaultReadSecret,
} from "../_shared/payments-auth.ts";
import { asaasFor, AsaasApiError } from "../_shared/asaas-tenant-client.ts";
import {
  resolveTenantCardFees,
  FALLBACK_CARD_FEES,
  type CardFeePayerDefault,
} from "../_shared/asaas-card-fees.ts";

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (e) {
    console.error("[card-fees] exceção não tratada:", (e as Error)?.message ?? e);
    return jsonResponse(req, { error: "Não foi possível consultar as taxas do cartão." }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await authorizePaymentsManager(req);
  if (!auth.ok) return auth.response;
  const { supabase, companyId } = auth;

  // refresh opcional (POST { refresh: true }).
  let forceRefresh = false;
  try {
    const body = await req.json();
    forceRefresh = body?.refresh === true;
  } catch {
    // GET / corpo vazio → sem refresh forçado.
  }

  const { data: accountData } = await supabase
    .from("tenant_payment_accounts")
    .select(
      "status, vault_secret_name, card_fee_payer, card_fee_override, card_fees_cache, card_fees_synced_at",
    )
    .eq("company_id", companyId)
    .maybeSingle();
  const account = accountData as any;

  const feePayerDefault: CardFeePayerDefault =
    account?.card_fee_payer === "customer" ? "customer" : "company";

  // Sem conta ativa: devolve fallback pra UI não quebrar (nunca cobra com isso).
  if (!account || account.status !== "active" || !account.vault_secret_name) {
    return jsonResponse(req, {
      fees: { ...FALLBACK_CARD_FEES },
      source: "fallback",
      feePayerDefault,
      syncedAt: null,
    }, 200);
  }

  const apiKey = await vaultReadSecret(supabase, account.vault_secret_name);
  if (!apiKey) {
    return jsonResponse(req, {
      fees: (account.card_fee_override ?? account.card_fees_cache ?? { ...FALLBACK_CARD_FEES }),
      source: account.card_fee_override ? "override" : (account.card_fees_cache ? "cache" : "fallback"),
      feePayerDefault,
      syncedAt: account.card_fees_synced_at ?? null,
    }, 200);
  }

  const asaas = asaasFor(apiKey);
  // refresh=true zera a validade do cache (força ir no Asaas).
  const accountForResolve = forceRefresh ? { ...account, card_fees_synced_at: null } : account;

  try {
    const { fees, source } = await resolveTenantCardFees({
      account: accountForResolve,
      asaas,
      nowMs: Date.now(),
      persistCache: async (table) => {
        await supabase
          .from("tenant_payment_accounts")
          .update({ card_fees_cache: table, card_fees_synced_at: new Date().toISOString() })
          .eq("company_id", companyId);
      },
    });
    return jsonResponse(req, {
      fees,
      source,
      feePayerDefault,
      syncedAt: source === "asaas" ? new Date().toISOString() : (account.card_fees_synced_at ?? null),
    }, 200);
  } catch (e) {
    const status = e instanceof AsaasApiError ? e.status : 500;
    console.error("[card-fees] erro:", (e as Error).message);
    return jsonResponse(req, { error: "Não foi possível consultar as taxas do cartão." },
      status >= 400 && status < 600 ? status : 500);
  }
}
