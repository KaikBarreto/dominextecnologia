// asaas-card-fees
// ----------------
// Resolve as taxas REAIS da conta Asaas do tenant (cartão, Pix, boleto e
// antecipação) e calcula o "gross-up" para repasse ao cliente (empresa recebe
// o valor cheio líquido).
//
// Fonte da taxa, em ordem de prioridade:
//   1. Override manual do tenant (tenant_payment_accounts.card_fee_override).
//   2. Cache da conta Asaas (card_fees_cache) se ainda fresco.
//   3. GET /v3/myAccount/fees (grava o cache) — taxa REAL do plano do tenant.
//   4. Fallback estático (taxa padrão Asaas) — nunca bloqueia a cobrança.
//
// A taxa NUNCA é confiada ao client: o gross-up autoritativo roda no edge.
//
// ─── Shape REAL de GET /v3/myAccount/fees (observado em 2026-09-06, em conta
// sandbox E em conta de produção; blocos irrelevantes omitidos) ──────────────
//
//   {
//     "payment": {
//       "pix": {
//         "fixedFeeValue": 1.99, "fixedFeeValueWithDiscount": 0.99,
//         "percentageFee": null, "minimumFeeValue": null, "maximumFeeValue": null,
//         "discountExpiration": "2026-11-15 00:00:00", "type": "FIXED",
//         "monthlyCreditsWithoutFee": 100, "creditsReceivedOfCurrentMonth": 0
//       },
//       "bankSlip": {
//         "defaultValue": 1.99, "discountValue": 0.99,
//         "expirationDate": "2026-11-15 00:00:00", "daysToReceive": 1
//       },
//       "creditCard": {
//         "operationValue": 0.49,
//         "oneInstallmentPercentage": 2.99, "upToSixInstallmentsPercentage": 3.49,
//         "upToTwelveInstallmentsPercentage": 3.99, "upToTwentyOneInstallmentsPercentage": 4.29,
//         "discountOneInstallmentPercentage": 1.99, ... ,
//         "hasValidDiscount": true, "daysToReceive": 32,
//         "discountExpiration": "2026-11-15 00:00:00"
//       }
//     },
//     "anticipation": {
//       "bankSlip":   { "monthlyFeePercentage": 5.79 },
//       "pix":        { "monthlyFeePercentage": 5.79 },
//       "creditCard": { "detachedMonthlyFeeValue": 1.15, "installmentMonthlyFeeValue": 1.60 }
//     }
//   }
//
// Observações provadas:
//   • Pix NÃO é grátis: é tarifa FIXA por recebimento (R$ 0,99 promocional /
//     R$ 1,99 cheia), com as `monthlyCreditsWithoutFee` primeiras do mês isentas.
//     O texto antigo da tela ("R$ 0,00") era mentira.
//   • `percentageFee`/`minimumFeeValue`/`maximumFeeValue` vêm null quando
//     `type === "FIXED"`. Em conta com plano percentual (`type === "PERCENTAGE"`)
//     é o inverso — por isso normalizamos os dois.
//   • A API NÃO expõe `daysToReceive` para Pix (só boleto e cartão).
//   • O `detachedMonthlyFeeValue`/`installmentMonthlyFeeValue` da antecipação de
//     cartão são PERCENTUAIS ao mês (apesar do sufixo "Value" no nome).
// ─────────────────────────────────────────────────────────────────────────────

import type { AsaasTenantClient } from "./asaas-tenant-client.ts";

/** Marcador de build — usado para conferir qual versão está no ar após deploy. */
export const ASAAS_FEES_MODULE_MARKER = "asaas-fees@v2-pix-boleto-antecipacao";

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

/** Tarifa de Pix recebido. `percent` só é > 0 em conta com plano percentual. */
export interface PixFeeInfo {
  /** Tarifa fixa por Pix recebido, em R$ (0 quando o plano é percentual). */
  fixed: number;
  /** Percentual sobre o valor recebido (0 quando o plano é fixo). */
  percent: number;
  /** Recebimentos Pix isentos por mês (Asaas: `monthlyCreditsWithoutFee`). */
  freeCount?: number;
  /** Quantos recebimentos já usados no mês corrente (informativo). */
  freeUsed?: number;
  /** Piso/teto da tarifa percentual (null no plano fixo). */
  minFee?: number | null;
  maxFee?: number | null;
}

/** Tarifa de boleto recebido. */
export interface BankSlipFeeInfo {
  /** Tarifa fixa por boleto liquidado, em R$. */
  fixed: number;
}

/**
 * Taxas de antecipação, todas em % AO MÊS (pro-rata por dia: a Asaas cobra
 * `valor × taxa/100 × dias/30`, confirmado contra POST /anticipations/simulate).
 */
export interface AnticipationFeeInfo {
  /** Percentual "de referência" (boleto/Pix), pra quem só quer um número. */
  monthlyPercent: number;
  bankSlipMonthlyPercent?: number;
  pixMonthlyPercent?: number;
  /** Cartão à vista (1x). */
  cardDetachedMonthlyPercent?: number;
  /** Cartão parcelado (2x+). */
  cardInstallmentMonthlyPercent?: number;
}

/** Prazo de liquidação (D+) informado pela própria Asaas. null = não exposto. */
export interface SettlementDaysInfo {
  pix: number | null;
  bankSlip: number | null;
  card: number | null;
}

/** Blocos NOVOS (Pix/boleto/antecipação/prazos) — null quando a API não expôs. */
export interface TenantFeeExtras {
  pix: PixFeeInfo | null;
  bankSlip: BankSlipFeeInfo | null;
  anticipation: AnticipationFeeInfo | null;
  settlementDays: SettlementDaysInfo;
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

/**
 * Extras de fallback: TUDO null de propósito.
 *
 * Regra de honestidade: quando não conseguimos ler a taxa da conta do tenant,
 * NÃO inventamos número — o front mostra "não informado pela Asaas" ou uma
 * faixa explicitamente rotulada como referência. Zero falso (o antigo
 * "Pix R$ 0,00") é pior que ausência.
 */
export const FALLBACK_FEE_EXTRAS: TenantFeeExtras = {
  pix: null,
  bankSlip: null,
  anticipation: null,
  settlementDays: { pix: null, bankSlip: null, card: null },
};

/** Cache considerado fresco por 24h. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function num(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Número opcional: devolve null quando ausente/inválido (não inventa zero). */
function optNum(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Promo vigente? (`discountExpiration`/`expirationDate` no futuro). */
function promoActive(expiration: unknown, nowMs: number): boolean {
  if (!expiration) return false;
  // A Asaas devolve "YYYY-MM-DD HH:mm:ss" (sem timezone). Normaliza pra ISO.
  const iso = String(expiration).trim().replace(" ", "T");
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t > nowMs;
}

/**
 * Normaliza a resposta de GET /v3/myAccount/fees (bloco creditCard) para
 * CardFeeTable. Prefere a taxa promocional (discount*) enquanto vigente
 * (discountExpiration no futuro); senão usa a cheia.
 */
export function normalizeAsaasFees(creditCard: any, nowMs: number): CardFeeTable {
  if (!creditCard || typeof creditCard !== "object") return { ...FALLBACK_CARD_FEES };

  const promo = promoActive(creditCard.discountExpiration, nowMs);

  const pick = (fullKey: string, promoKey: string, fb: number): number => {
    if (promo && creditCard[promoKey] != null) return num(creditCard[promoKey], fb);
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

/**
 * Normaliza os blocos NOVOS da resposta de GET /v3/myAccount/fees:
 * Pix, boleto, antecipação e prazos de liquidação.
 *
 * DEFENSIVO por contrato: qualquer bloco ausente vira `null` — nunca um número
 * inventado. Espelha o cuidado com taxa promocional já usado no cartão.
 *
 * @param payload resposta crua da API (raiz, com `payment`/`anticipation`).
 */
export function normalizeAsaasExtras(payload: any, nowMs: number): TenantFeeExtras {
  if (!payload || typeof payload !== "object") return { ...FALLBACK_FEE_EXTRAS, settlementDays: { pix: null, bankSlip: null, card: null } };

  const payment = payload.payment && typeof payload.payment === "object" ? payload.payment : payload;
  const anticipationRaw = payload.anticipation && typeof payload.anticipation === "object"
    ? payload.anticipation
    : null;

  // ── Pix ────────────────────────────────────────────────────────────────────
  let pix: PixFeeInfo | null = null;
  const pixRaw = payment?.pix;
  if (pixRaw && typeof pixRaw === "object") {
    const pixPromo = promoActive(pixRaw.discountExpiration, nowMs);
    const fullFixed = optNum(pixRaw.fixedFeeValue);
    const promoFixed = optNum(pixRaw.fixedFeeValueWithDiscount);
    const fixed = pixPromo && promoFixed !== null ? promoFixed : fullFixed;
    const percent = optNum(pixRaw.percentageFee);

    // Só monta o bloco se a API deu ao menos UM dos dois componentes da tarifa.
    if (fixed !== null || percent !== null) {
      pix = {
        fixed: fixed ?? 0,
        percent: percent ?? 0,
        freeCount: optNum(pixRaw.monthlyCreditsWithoutFee) ?? undefined,
        freeUsed: optNum(pixRaw.creditsReceivedOfCurrentMonth) ?? undefined,
        minFee: optNum(pixRaw.minimumFeeValue),
        maxFee: optNum(pixRaw.maximumFeeValue),
      };
    }
  }

  // ── Boleto ─────────────────────────────────────────────────────────────────
  let bankSlip: BankSlipFeeInfo | null = null;
  const slipRaw = payment?.bankSlip;
  if (slipRaw && typeof slipRaw === "object") {
    const slipPromo = promoActive(slipRaw.expirationDate, nowMs);
    const full = optNum(slipRaw.defaultValue);
    const promoVal = optNum(slipRaw.discountValue);
    const fixed = slipPromo && promoVal !== null ? promoVal : full;
    if (fixed !== null) bankSlip = { fixed };
  }

  // ── Antecipação ────────────────────────────────────────────────────────────
  let anticipation: AnticipationFeeInfo | null = null;
  if (anticipationRaw) {
    const slipPct = optNum(anticipationRaw?.bankSlip?.monthlyFeePercentage);
    const pixPct = optNum(anticipationRaw?.pix?.monthlyFeePercentage);
    const cardDetached = optNum(anticipationRaw?.creditCard?.detachedMonthlyFeeValue);
    const cardInstallment = optNum(anticipationRaw?.creditCard?.installmentMonthlyFeeValue);
    const headline = slipPct ?? pixPct ?? cardInstallment ?? cardDetached;
    if (headline !== null) {
      anticipation = {
        monthlyPercent: headline,
        bankSlipMonthlyPercent: slipPct ?? undefined,
        pixMonthlyPercent: pixPct ?? undefined,
        cardDetachedMonthlyPercent: cardDetached ?? undefined,
        cardInstallmentMonthlyPercent: cardInstallment ?? undefined,
      };
    }
  }

  // ── Prazos (D+) — a API só expõe boleto e cartão; Pix vem sempre ausente ────
  const settlementDays: SettlementDaysInfo = {
    pix: optNum(payment?.pix?.daysToReceive),
    bankSlip: optNum(payment?.bankSlip?.daysToReceive),
    card: optNum(payment?.creditCard?.daysToReceive),
  };

  return { pix, bankSlip, anticipation, settlementDays };
}

/** Valida se um objeto tem o shape mínimo de CardFeeTable (para override/cache). */
function isCardFeeTable(v: any): v is CardFeeTable {
  return v && typeof v === "object" &&
    ["operationValue", "oneInstallment", "upToSix", "upToTwelve", "upToTwentyOne"]
      .every((k) => Number.isFinite(Number(v[k])));
}

/**
 * Extrai SÓ os 5 campos de CardFeeTable de um objeto (o cache passou a guardar
 * um superset com pix/bankSlip/anticipation). Mantém o contrato antigo intacto
 * para quem consome `fees` (create-charge, ChargeDialog).
 */
function pickCardTable(v: any): CardFeeTable {
  return {
    operationValue: num(v?.operationValue, FALLBACK_CARD_FEES.operationValue),
    oneInstallment: num(v?.oneInstallment, FALLBACK_CARD_FEES.oneInstallment),
    upToSix: num(v?.upToSix, FALLBACK_CARD_FEES.upToSix),
    upToTwelve: num(v?.upToTwelve, FALLBACK_CARD_FEES.upToTwelve),
    upToTwentyOne: num(v?.upToTwentyOne, FALLBACK_CARD_FEES.upToTwentyOne),
  };
}

/** Lê os extras de dentro do cache (formato antigo — sem extras — vira null). */
function extrasFromCache(v: any): TenantFeeExtras | null {
  if (!v || typeof v !== "object") return null;
  const hasAny = v.pix !== undefined || v.bankSlip !== undefined ||
    v.anticipation !== undefined || v.settlementDays !== undefined;
  if (!hasAny) return null;
  return {
    pix: (v.pix ?? null) as PixFeeInfo | null,
    bankSlip: (v.bankSlip ?? null) as BankSlipFeeInfo | null,
    anticipation: (v.anticipation ?? null) as AnticipationFeeInfo | null,
    settlementDays: {
      pix: optNum(v?.settlementDays?.pix),
      bankSlip: optNum(v?.settlementDays?.bankSlip),
      card: optNum(v?.settlementDays?.card),
    },
  };
}

interface AccountFeeFields {
  card_fee_override?: unknown;
  card_fees_cache?: unknown;
  card_fees_synced_at?: string | null;
}

/** Payload gravado em `card_fees_cache`: CardFeeTable + extras (superset). */
export type CachedFeePayload = CardFeeTable & Partial<TenantFeeExtras>;

export interface ResolvedTenantFees {
  /** Tabela de cartão efetiva (override → cache → API → fallback). */
  card: CardFeeTable;
  /** Procedência da tabela de CARTÃO. */
  source: CardFeeSource;
  /** Pix / boleto / antecipação / prazos. null onde a API não expôs. */
  extras: TenantFeeExtras;
  /** Procedência dos extras (override NÃO cobre extras → cache/asaas/fallback). */
  extrasSource: Exclude<CardFeeSource, "override">;
}

/**
 * Resolve TODAS as taxas efetivas do tenant (cartão + Pix + boleto +
 * antecipação). `persistCache` grava o cache quando busca na API (best-effort;
 * falha de escrita não interrompe).
 *
 * Nota: o override manual (`card_fee_override`) cobre só o CARTÃO. Os extras
 * continuam vindo do cache/API — por isso `source` e `extrasSource` são
 * separados.
 */
export async function resolveTenantFees(opts: {
  account: AccountFeeFields;
  asaas: AsaasTenantClient;
  nowMs: number;
  persistCache?: (payload: CachedFeePayload) => Promise<void>;
}): Promise<ResolvedTenantFees> {
  const { account, asaas, nowMs, persistCache } = opts;

  const overrideTable = isCardFeeTable(account.card_fee_override)
    ? pickCardTable(account.card_fee_override)
    : null;

  const syncedAt = account.card_fees_synced_at ? new Date(account.card_fees_synced_at).getTime() : 0;
  const cacheFresh = Number.isFinite(syncedAt) && syncedAt > 0 && nowMs - syncedAt < CACHE_TTL_MS;
  const cacheValid = isCardFeeTable(account.card_fees_cache);
  const cachedExtras = extrasFromCache(account.card_fees_cache);

  // 1+2. Override (cartão) + cache fresco (extras) — não precisa ir na API.
  if (overrideTable && cacheFresh && cacheValid && cachedExtras) {
    return { card: overrideTable, source: "override", extras: cachedExtras, extrasSource: "cache" };
  }
  if (!overrideTable && cacheFresh && cacheValid && cachedExtras) {
    return {
      card: pickCardTable(account.card_fees_cache),
      source: "cache",
      extras: cachedExtras,
      extrasSource: "cache",
    };
  }

  // 3. API do Asaas (grava cache). Best-effort.
  try {
    const resp = await asaas.get<any>("/myAccount/fees");
    const table = normalizeAsaasFees(resp?.payment?.creditCard ?? resp?.creditCard, nowMs);
    const extras = normalizeAsaasExtras(resp, nowMs);
    if (persistCache) {
      try { await persistCache({ ...table, ...extras }); } catch { /* cache é best-effort */ }
    }
    return {
      card: overrideTable ?? table,
      source: overrideTable ? "override" : "asaas",
      extras,
      extrasSource: "asaas",
    };
  } catch {
    // 3b. Cache velho ainda é melhor que fallback.
    if (cacheValid) {
      return {
        card: overrideTable ?? pickCardTable(account.card_fees_cache),
        source: overrideTable ? "override" : "cache",
        extras: cachedExtras ?? { ...FALLBACK_FEE_EXTRAS },
        extrasSource: cachedExtras ? "cache" : "fallback",
      };
    }
  }

  // 4. Fallback estático (cartão) + extras nulos (honestidade).
  return {
    card: overrideTable ?? { ...FALLBACK_CARD_FEES },
    source: overrideTable ? "override" : "fallback",
    extras: { ...FALLBACK_FEE_EXTRAS, settlementDays: { pix: null, bankSlip: null, card: null } },
    extrasSource: "fallback",
  };
}

/**
 * Compat: resolve só a tabela de CARTÃO (contrato antigo, usado pelo
 * tenant-asaas-create-charge). Delega em `resolveTenantFees` — a busca na API
 * já traz e cacheia os extras de graça.
 */
export async function resolveTenantCardFees(opts: {
  account: AccountFeeFields;
  asaas: AsaasTenantClient;
  nowMs: number;
  persistCache?: (table: CardFeeTable) => Promise<void>;
}): Promise<{ fees: CardFeeTable; source: CardFeeSource }> {
  const resolved = await resolveTenantFees({
    account: opts.account,
    asaas: opts.asaas,
    nowMs: opts.nowMs,
    persistCache: opts.persistCache
      ? (payload) => opts.persistCache!(payload as CardFeeTable)
      : undefined,
  });
  return { fees: resolved.card, source: resolved.source };
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
