// tenant-asaas-card-fees
// ----------------------
// PRIVILEGIADA (mesma auth do create-charge: Bearer + módulo 'cobrancas' +
// can_manage_system). Devolve as taxas EFETIVAS da conta Asaas do tenant
// (override manual → cache → Asaas myAccount/fees → fallback) para o front
// montar o preview do repasse na tela de cobrança, o card "Taxas da Asaas" em
// Configurações e o Simulador de venda.
//
// Não cria cobrança, não vaza custo/margem — só a taxa que o próprio tenant
// já enxerga no painel Asaas dele. company_id vem do profile (payments-auth).
//
// GET (sem corpo) OU POST { refresh?: boolean }. Com refresh=true força
// rebuscar no Asaas e atualizar o cache (usado pelo botão "Sincronizar taxas").
//
// CONTRATO DE RESPOSTA (aditivo — nenhum campo antigo foi removido):
//   {
//     fees, source, feePayerDefault, syncedAt,   ← campos LEGADOS (ChargeDialog)
//     card,                                       ← igual a `fees`
//     pix: { fixed, percent, freeCount?, freeUsed?, minFee?, maxFee? } | null,
//     bankSlip: { fixed } | null,
//     anticipation: { monthlyPercent, ... } | null,
//     settlementDays: { pix, bankSlip, card },   ← null onde a Asaas não expôs
//     extrasSource: 'cache' | 'asaas' | 'fallback'
//   }
//
// Honestidade: bloco que a Asaas não devolveu vem `null`. NUNCA um zero
// inventado (o antigo "Pix R$ 0,00" da tela era texto fixo, não taxa real).

import { handleCors } from "../_shared/cors.ts";
import {
  authorizePaymentsManager,
  jsonResponse,
  vaultReadSecret,
} from "../_shared/payments-auth.ts";
import { asaasFor, AsaasApiError } from "../_shared/asaas-tenant-client.ts";
import {
  resolveTenantFees,
  FALLBACK_CARD_FEES,
  FALLBACK_FEE_EXTRAS,
  ASAAS_FEES_MODULE_MARKER,
  type CardFeePayerDefault,
} from "../_shared/asaas-card-fees.ts";

/** Marcador de deploy — permite conferir a versão no ar (grep no bundle/log). */
const EDGE_MARKER = "tenant-asaas-card-fees@v2-pix-boleto-antecipacao";

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (e) {
    console.error("[card-fees] exceção não tratada:", (e as Error)?.message ?? e);
    return jsonResponse(req, { error: "Não foi possível consultar as taxas da Asaas." }, 500);
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

  const baseExtras = {
    pix: FALLBACK_FEE_EXTRAS.pix,
    bankSlip: FALLBACK_FEE_EXTRAS.bankSlip,
    anticipation: FALLBACK_FEE_EXTRAS.anticipation,
    settlementDays: { pix: null, bankSlip: null, card: null },
    extrasSource: "fallback" as const,
  };

  // Sem conta ativa: devolve fallback pra UI não quebrar (nunca cobra com isso).
  // Extras nulos de propósito — a tela mostra "taxas de referência".
  if (!account || account.status !== "active" || !account.vault_secret_name) {
    return jsonResponse(req, {
      marker: EDGE_MARKER,
      fees: { ...FALLBACK_CARD_FEES },
      card: { ...FALLBACK_CARD_FEES },
      source: "fallback",
      feePayerDefault,
      syncedAt: null,
      ...baseExtras,
    }, 200);
  }

  const apiKey = await vaultReadSecret(supabase, account.vault_secret_name);
  if (!apiKey) {
    const cached = account.card_fee_override ?? account.card_fees_cache ?? null;
    return jsonResponse(req, {
      marker: EDGE_MARKER,
      fees: cached ?? { ...FALLBACK_CARD_FEES },
      card: cached ?? { ...FALLBACK_CARD_FEES },
      source: account.card_fee_override ? "override" : (account.card_fees_cache ? "cache" : "fallback"),
      feePayerDefault,
      syncedAt: account.card_fees_synced_at ?? null,
      ...baseExtras,
      pix: account.card_fees_cache?.pix ?? null,
      bankSlip: account.card_fees_cache?.bankSlip ?? null,
      anticipation: account.card_fees_cache?.anticipation ?? null,
      settlementDays: account.card_fees_cache?.settlementDays ?? baseExtras.settlementDays,
      extrasSource: account.card_fees_cache?.pix ? "cache" : "fallback",
    }, 200);
  }

  const asaas = asaasFor(apiKey);
  // refresh=true zera a validade do cache (força ir no Asaas).
  const accountForResolve = forceRefresh ? { ...account, card_fees_synced_at: null } : account;

  try {
    let persistedAt: string | null = null;
    const { card, source, extras, extrasSource } = await resolveTenantFees({
      account: accountForResolve,
      asaas,
      nowMs: Date.now(),
      persistCache: async (payload) => {
        persistedAt = new Date().toISOString();
        await supabase
          .from("tenant_payment_accounts")
          .update({ card_fees_cache: payload, card_fees_synced_at: persistedAt })
          .eq("company_id", companyId);
      },
    });
    return jsonResponse(req, {
      marker: EDGE_MARKER,
      module: ASAAS_FEES_MODULE_MARKER,
      fees: card,
      card,
      source,
      feePayerDefault,
      syncedAt: persistedAt ?? account.card_fees_synced_at ?? null,
      pix: extras.pix,
      bankSlip: extras.bankSlip,
      anticipation: extras.anticipation,
      settlementDays: extras.settlementDays,
      extrasSource,
    }, 200);
  } catch (e) {
    const status = e instanceof AsaasApiError ? e.status : 500;
    console.error("[card-fees] erro:", (e as Error).message);
    return jsonResponse(req, { error: "Não foi possível consultar as taxas da Asaas." },
      status >= 400 && status < 600 ? status : 500);
  }
}
