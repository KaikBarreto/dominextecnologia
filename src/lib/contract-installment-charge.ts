// ─────────────────────────────────────────────────────────────────────────────
// Parcela de contrato → cobrança online (Asaas BYO do tenant).
//
// Espelho CLIENT-SIDE das validações da edge `tenant-asaas-create-charge`
// (bloco "0.1 PARCELA DE CONTRATO"). A trava de verdade continua sendo o
// servidor; aqui só evitamos que o usuário clique pra tomar erro na cara.
//
// Regra da edge, na mesma ordem:
//   · só `entrada` SEM `parent_transaction_id` (linha-mãe a receber);
//   · parcela já recebida (`is_paid`) não vira cobrança;
//   · parcela com recebimento parcial (`amount_received > 0`) também não;
//   · o valor da cobrança tem que ser IGUAL ao da parcela (por isso o valor é
//     fixo na tela, não editável);
//   · o cliente da cobrança tem que ser o da parcela.
//
// Tudo aqui é função pura: sem React, sem Supabase, testável direto.
// ─────────────────────────────────────────────────────────────────────────────

/** Por que esta parcela não pode virar cobrança online agora. */
export type InstallmentChargeBlockReason =
  | 'notReceivable'
  | 'paid'
  | 'partiallyReceived'
  | 'invalidAmount'
  | 'otherCustomer'
  | 'noCustomer';

/** Recorte de `financial_transactions` que a regra precisa enxergar. */
export interface InstallmentChargeCandidate {
  is_paid?: boolean | null;
  amount?: number | string | null;
  amount_received?: number | string | null;
  transaction_type?: string | null;
  parent_transaction_id?: string | null;
  customer_id?: string | null;
}

export type InstallmentChargeAvailability =
  /** Dá pra cobrar. `customerId` é o cliente que a edge vai exigir. */
  | { kind: 'chargeable'; customerId: string }
  /** Já existe cobrança viva pra esta parcela: a ação vira "ver cobrança". */
  | { kind: 'charged' }
  /**
   * Não dá pra cobrar. `silent = true` quando o próprio card da parcela já
   * explica o motivo (selo "Pago", linha que nem é parcela a receber) — nesse
   * caso a ação some. `silent = false` quando o motivo NÃO está visível: aí a
   * tela mostra o botão desabilitado + o texto do motivo, porque `title` de
   * tooltip não existe no toque.
   */
  | { kind: 'blocked'; reason: InstallmentChargeBlockReason; silent: boolean };

/**
 * Status de cobrança que NÃO conta como cobrança viva.
 * Espelha `DEDUPE_DEAD_STATUSES` da edge: só esses liberam cobrar de novo a
 * mesma parcela (qualquer outro status faz a edge devolver a cobrança que já
 * existe, em vez de criar outra na Asaas).
 */
const DEAD_CHARGE_STATUSES = new Set(['CANCELLED', 'CANCELED', 'REFUNDED', 'CHARGEBACK']);

export function isLiveChargeStatus(status?: string | null): boolean {
  const normalized = (status ?? '').trim().toUpperCase();
  // Sem status legível, trata como viva: melhor mandar o usuário pra cobrança
  // existente do que arriscar uma segunda cobrança pro mesmo dinheiro.
  if (!normalized) return true;
  return !DEAD_CHARGE_STATUSES.has(normalized);
}

/** Número tolerante a string do PostgREST (numeric vira string em alguns casos). */
function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export interface InstallmentChargeOptions {
  /** Cliente do contrato — fallback quando a parcela nasceu sem `customer_id`. */
  contractCustomerId?: string | null;
  /** Já existe cobrança viva ligada a esta parcela. */
  hasLiveCharge?: boolean;
}

export function getInstallmentChargeAvailability(
  installment: InstallmentChargeCandidate,
  options: InstallmentChargeOptions = {},
): InstallmentChargeAvailability {
  const { contractCustomerId = null, hasLiveCharge = false } = options;

  // 1) Linha que não é parcela a receber (saída, ou recebimento parcial filho).
  //    O card nem parece uma parcela cobrável: motivo já visível, ação some.
  if (installment.transaction_type !== 'entrada' || installment.parent_transaction_id) {
    return { kind: 'blocked', reason: 'notReceivable', silent: true };
  }

  // 2) Cobrança viva tem precedência sobre "já recebida": quando o cliente paga
  //    pelo link, a parcela fica paga E a cobrança continua útil de consultar.
  if (hasLiveCharge) return { kind: 'charged' };

  // 3) Parcela já recebida — o card mostra o selo "Pago", motivo visível.
  if (installment.is_paid === true) {
    return { kind: 'blocked', reason: 'paid', silent: true };
  }

  // 4) Recebimento parcial lançado: a baixa automática quitaria a parcela
  //    inteira quando o link fosse pago. Motivo NÃO visível no card.
  if (toNumber(installment.amount_received) > 0) {
    return { kind: 'blocked', reason: 'partiallyReceived', silent: false };
  }

  // 5) Valor zerado/negativo: a Asaas recusa e o valor é fixo (não editável).
  if (toNumber(installment.amount) <= 0) {
    return { kind: 'blocked', reason: 'invalidAmount', silent: false };
  }

  // 6) Cliente. A edge exige que o cliente da cobrança seja o da parcela.
  const installmentCustomer = installment.customer_id ?? null;
  if (installmentCustomer && contractCustomerId && installmentCustomer !== contractCustomerId) {
    return { kind: 'blocked', reason: 'otherCustomer', silent: false };
  }
  const customerId = installmentCustomer ?? contractCustomerId;
  if (!customerId) {
    return { kind: 'blocked', reason: 'noCustomer', silent: false };
  }

  return { kind: 'chargeable', customerId };
}

/**
 * Vencimento com que a cobrança nasce: o da parcela, ou HOJE quando a parcela
 * já venceu (a edge recusa vencimento no passado). Datas em `yyyy-mm-dd`,
 * comparadas como texto — formato ISO ordena igual a calendário.
 */
export function resolveChargeDueDate(
  installmentDueDate: string | null | undefined,
  todayIso: string,
): string {
  const due = (installmentDueDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return todayIso;
  return due < todayIso ? todayIso : due;
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITAR O VALOR de uma parcela que já tem cobrança viva: proibido.
//
// Furo de dinheiro real (não é só "valor divergente"): a RPC
// `apply_tenant_charge_payment` marca o recebível ligado como recebido SEM
// comparar valor. Parcela de R$ 480 com link gerado → alguém edita a parcela
// pra R$ 1.000 → o cliente paga os R$ 480 do link antigo → a parcela de
// R$ 1.000 é baixada INTEIRA e R$ 520 somem do financeiro, em silêncio.
//
// Trava só o VALOR: descrição, vencimento, conta e categoria seguem editáveis.
// A saída existe e é segura (a parcela sobrevive ao cancelamento da cobrança):
// cancelar a cobrança e gerar outra.
// ─────────────────────────────────────────────────────────────────────────────

export type InstallmentValueLockReason = 'liveCharge';

export interface InstallmentValueEditPolicy {
  canEditValue: boolean;
  reason: InstallmentValueLockReason | null;
}

export function getInstallmentValueEditPolicy(
  options: { hasLiveCharge?: boolean } = {},
): InstallmentValueEditPolicy {
  if (options.hasLiveCharge) return { canEditValue: false, reason: 'liveCharge' };
  return { canEditValue: true, reason: null };
}

/**
 * Separa uma lista de parcelas entre as que aceitam mudança de valor e as
 * travadas por cobrança viva. Usado pelos caminhos EM MASSA (editar seleção e
 * "aplicar a todas"), onde o risco é o mesmo da edição individual e passaria
 * batido se a trava morasse só no formulário de uma parcela.
 */
export function splitInstallmentsByValueLock<T>(
  installments: T[],
  hasLiveCharge: (installment: T) => boolean,
): { editable: T[]; valueLocked: T[] } {
  const editable: T[] = [];
  const valueLocked: T[] = [];
  for (const installment of installments) {
    if (getInstallmentValueEditPolicy({ hasLiveCharge: hasLiveCharge(installment) }).canEditValue) {
      editable.push(installment);
    } else {
      valueLocked.push(installment);
    }
  }
  return { editable, valueLocked };
}
