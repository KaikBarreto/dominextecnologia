// asaas-card-fees
// ----------------
// Resolve a tabela de taxa de cartão do tenant e calcula o "gross-up" para
// repasse ao cliente (empresa recebe o valor cheio líquido).
//
// Fonte da taxa, em ordem de prioridade:
//   1. Override manual do tenant (tenant_payment_accounts.card_fee_override).
//   2. Cache da conta Asaas (card_fees_cache) se ainda fresco.
//   3. GET /v3/myAccount/fees (grava o cache) — taxa REAL do plano do tenant.
//   4. Fallback estático (taxa padrão Asaas) — nunca bloqueia a cobrança.
//
// A taxa NUNCA é confiada ao client: o gross-up autoritativo roda no edge.

import type { AsaasTenantClient } from "./asaas-tenant-client.ts";

/** Tabela de taxa de cartão normalizada (percentuais em %, fixo em R$). */
export interface CardFeeTable {
  /** Tarifa fixa por transação (ex.: 0.49). */
  operationValue: number;
  /** % à vista (1x). */
  oneInstallment: number;
  /** % de 2 a 6 parcelas. */
  upToSix: number;
  /** % de 7 a 12 parcelas. */
  upToTwelve: number;
  /** % de 13 a 21 parcelas. */
  upToTwentyOne: number;
}

/** De onde a tabela efetiva veio (telemetria/preview). */
export type CardFeeSource = "override" | "cache" | "asaas" | "fallback";

/** Preferência padrão de quem paga a taxa do cartão. */
export type CardFeePayerDefault = "company" | "customer";

/**
 * Fallback estático — taxa padrão Asaas publicada (R$0,49 + percentuais).
 * Usado só quando não há override, cache nem resposta da API. Conservador:
 * se a taxa real do tenant for menor, ele repassa um pouco a mais (a favor
 * da empresa), nunca a menos.
 */
export const FALLBACK_CARD_FEES: CardFeeTable = {
  operationValue: 0.49,
  oneInstallment: 2.99,
  upToSix: 2.99,
  upToTwelve: 2.99,
  upToTwentyOne: 4.29,
};

/** Cache considerado fresco por 24h. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function num(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Normaliza a resposta de GET /v3/myAccount/fees (bloco creditCard) para
 * CardFeeTable. Prefere a taxa promocional (discount*) enquanto vigente
 * (discountExpiration no futuro); senão usa a cheia.
 */
export function normalizeAsaasFees(creditCard: any, nowMs: number): CardFeeTable {
  if (!creditCard || typeof creditCard !== "object") return { ...FALLBACK_CARD_FEES };

  const promoActive = (() => {
    const exp = creditCard.discountExpiration;
    if (!exp) return false;
    const t = new Date(exp).getTime();
    return Number.isFinite(t) && t > nowMs;
  })();

  const pick = (fullKey: string, promoKey: string, fb: number): number => {
    if (promoActive && creditCard[promoKey] != null) return num(creditCard[promoKey], fb);
    return num(creditCard[fullKey], fb);
  };

  return {
    operationValue: num(creditCard.operationValue, FALLBACK_CARD_FEES.operationValue),
    oneInstallment: pick("oneInstallmentPercentage", "discountOneInstallmentPercentage", FALLBACK_CARD_FEES.oneInstallment),
    upToSix: pick("upToSixInstallmentsPercentage", "discountUpToSixInstallmentsPercentage", FALLBACK_CARD_FEES.upToSix),
    upToTwelve: pick("upToTwelveInstallmentsPercentage", "discountUpToTwelveInstallmentsPercentage", FALLBACK_CARD_FEES.upToTwelve),
    upToTwentyOne: pick("upToTwentyOneInstallmentsPercentage", "discountUpToTwentyOneInstallmentsPercentage", FALLBACK_CARD_FEES.upToTwentyOne),
  };
}

/** Valida se um objeto tem o shape mínimo de CardFeeTable (para override/cache). */
function isCardFeeTable(v: any): v is CardFeeTable {
  return v && typeof v === "object" &&
    ["operationValue", "oneInstallment", "upToSix", "upToTwelve", "upToTwentyOne"]
      .every((k) => Number.isFinite(Number(v[k])));
}

interface AccountFeeFields {
  card_fee_override?: unknown;
  card_fees_cache?: unknown;
  card_fees_synced_at?: string | null;
}

/**
 * Resolve a tabela de taxa efetiva do tenant. `persistCache` grava o cache
 * quando busca na API (best-effort; falha de escrita não interrompe).
 */
export async function resolveTenantCardFees(opts: {
  account: AccountFeeFields;
  asaas: AsaasTenantClient;
  nowMs: number;
  persistCache?: (table: CardFeeTable) => Promise<void>;
}): Promise<{ fees: CardFeeTable; source: CardFeeSource }> {
  const { account, asaas, nowMs, persistCache } = opts;

  // 1. Override manual.
  if (isCardFeeTable(account.card_fee_override)) {
    return { fees: account.card_fee_override, source: "override" };
  }

  // 2. Cache fresco.
  const syncedAt = account.card_fees_synced_at ? new Date(account.card_fees_synced_at).getTime() : 0;
  const cacheFresh = Number.isFinite(syncedAt) && nowMs - syncedAt < CACHE_TTL_MS;
  if (cacheFresh && isCardFeeTable(account.card_fees_cache)) {
    return { fees: account.card_fees_cache, source: "cache" };
  }

  // 3. API do Asaas (grava cache). Best-effort.
  try {
    const resp = await asaas.get<any>("/myAccount/fees");
    const table = normalizeAsaasFees(resp?.payment?.creditCard ?? resp?.creditCard, nowMs);
    if (persistCache) {
      try { await persistCache(table); } catch { /* cache é best-effort */ }
    }
    return { fees: table, source: "asaas" };
  } catch {
    // 3b. Cache velho ainda é melhor que fallback.
    if (isCardFeeTable(account.card_fees_cache)) {
      return { fees: account.card_fees_cache, source: "cache" };
    }
  }

  // 4. Fallback estático.
  return { fees: { ...FALLBACK_CARD_FEES }, source: "fallback" };
}

/** Percentual da faixa correspondente ao número de parcelas. */
export function tierPercent(fees: CardFeeTable, installmentCount: number): number {
  const n = Math.max(1, Math.floor(installmentCount));
  if (n <= 1) return fees.oneInstallment;
  if (n <= 6) return fees.upToSix;
  if (n <= 12) return fees.upToTwelve;
  return fees.upToTwentyOne;
}

export interface GrossUpResult {
  /** Total que o cliente paga (com a taxa repassada). */
  totalValue: number;
  /** Valor aproximado de cada parcela (Asaas ajusta a última). */
  installmentValue: number;
  /** Quanto de taxa foi repassado ao cliente (totalValue - valor original). */
  feePassedOn: number;
}

/**
 * Gross-up: dado o valor `V` que a empresa quer receber líquido, calcula o
 * total a cobrar do cliente para cobrir a taxa da faixa de parcelas.
 *
 *   total = (V + fixo) / (1 - pct/100)
 *
 * Se pct <= 0, total = V + fixo (só a tarifa fixa). Nunca menor que V.
 */
export function grossUpForCustomer(
  value: number,
  installmentCount: number,
  fees: CardFeeTable,
): GrossUpResult {
  const n = Math.max(1, Math.floor(installmentCount));
  const pct = tierPercent(fees, n);
  const fixed = Number.isFinite(fees.operationValue) ? Math.max(0, fees.operationValue) : 0;
  const rate = Number.isFinite(pct) && pct > 0 ? Math.min(pct, 100) / 100 : 0;

  const rawTotal = rate < 1 ? (value + fixed) / (1 - rate) : value + fixed;
  const totalValue = Math.max(value, Math.round(rawTotal * 100) / 100);
  const installmentValue = Math.round((totalValue / n) * 100) / 100;
  const feePassedOn = Math.round((totalValue - value) * 100) / 100;

  return { totalValue, installmentValue, feePassedOn };
}
