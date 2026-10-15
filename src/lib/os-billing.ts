// ─────────────────────────────────────────────────────────────────────────────
// "Faturar OS" — regras PURAS de quando cada ação (lançar receita / gerar
// cobrança) fica disponível, bloqueada ou nem aparece. Nada de React, nada de
// Supabase: só a decisão, pra poder testar sem montar tela nenhuma.
//
// Fonte única dos NÚMEROS: a RPC `os_billing_state` (ver `useOsBillingState`).
// A trava de VERDADE mora no banco (trigger + guard da edge); isto aqui só
// evita que o usuário clique pra tomar um erro na cara — espelha, não decide.
// ─────────────────────────────────────────────────────────────────────────────

/** Recorte de `os_billing_state(...)` que as decisões precisam enxergar. */
export interface OsBillingSnapshot {
  hasRevenue: boolean;
  hasCharge: boolean;
  revenueTotal: number;
  chargeValue: number | null;
  chargeDueDate: string | null;
  chargeId: string | null;
  chargeStatus: string | null;
}

/** O que mostrar no topo do diálogo quando a OS já foi faturada. */
export type OsBillingStatus =
  | { kind: 'none' }
  | { kind: 'revenue'; total: number }
  | { kind: 'charge'; value: number | null; dueDate: string | null; chargeId: string | null; status: string | null };

export function getOsBillingStatus(snapshot: OsBillingSnapshot | null): OsBillingStatus {
  if (!snapshot) return { kind: 'none' };
  // Cobrança viva tem precedência: é o caso mais específico (e `has_revenue`
  // também vem `true` quando a cobrança já gerou o recebível).
  if (snapshot.hasCharge) {
    return {
      kind: 'charge',
      value: snapshot.chargeValue,
      dueDate: snapshot.chargeDueDate,
      chargeId: snapshot.chargeId,
      status: snapshot.chargeStatus,
    };
  }
  if (snapshot.hasRevenue) return { kind: 'revenue', total: snapshot.revenueTotal };
  return { kind: 'none' };
}

/** Por que uma opção do diálogo está desabilitada. Nunca some em silêncio. */
export type OsBillingBlockReason = 'hasRevenue' | 'hasCharge' | 'noCustomer';

/**
 * `reason` SEMPRE presente (possivelmente `null`) — de propósito NÃO é um
 * discriminated union por `enabled`. Este projeto roda com `strict: false`
 * (sem `strictNullChecks`) em `tsconfig.app.json`, e sob esse modo o TS não
 * narrowa `{enabled:true} | {enabled:false; reason:...}` de forma confiável
 * (reproduzido isoladamente: nem `if (decision.enabled) return` nem a
 * negação no JSX chamador estreitam o acesso a `.reason`). Forma plana evita
 * depender de narrowing que este tsconfig não garante.
 */
export interface OsBillingOptionDecision {
  enabled: boolean;
  reason: OsBillingBlockReason | null;
}

/**
 * "Lançar receita": bloqueado quando já existe cobrança viva (o banco recusa
 * esse insert — ver trigger `financial_transactions`, ERRCODE 23001) ou quando
 * já existe receita manual lançada (evita duplicar a mesma venda).
 */
export function getRevenueOptionDecision(snapshot: OsBillingSnapshot | null): OsBillingOptionDecision {
  if (snapshot?.hasCharge) return { enabled: false, reason: 'hasCharge' };
  if (snapshot?.hasRevenue) return { enabled: false, reason: 'hasRevenue' };
  return { enabled: true, reason: null };
}

/**
 * "Gerar cobrança": exige cliente (a Asaas cobra PESSOA, não serviço). Bloqueada
 * quando já existe cobrança viva, ou quando já existe receita manual (a edge
 * recusa — guard espelhado aqui só pra não deixar o usuário chegar lá).
 */
export function getChargeOptionDecision(
  snapshot: OsBillingSnapshot | null,
  options: { hasCustomer: boolean },
): OsBillingOptionDecision {
  if (!options.hasCustomer) return { enabled: false, reason: 'noCustomer' };
  if (snapshot?.hasCharge) return { enabled: false, reason: 'hasCharge' };
  if (snapshot?.hasRevenue) return { enabled: false, reason: 'hasRevenue' };
  return { enabled: true, reason: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trava do banco (rede de segurança): trigger `BEFORE INSERT` em
// `financial_transactions` recusa receita manual quando a OS já tem cobrança
// viva. SQLSTATE 23001 ("restrict violation"), nunca o texto — a mensagem do
// trigger só existe em PT-BR, e o nosso mapeamento tem que valer nos 4 idiomas.
// ─────────────────────────────────────────────────────────────────────────────

export const OS_REVENUE_BLOCKED_BY_CHARGE_PG_CODE = '23001';

export function isOsRevenueBlockedByChargeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === OS_REVENUE_BLOCKED_BY_CHARGE_PG_CODE;
}
