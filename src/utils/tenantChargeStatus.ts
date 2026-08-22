/**
 * Classificação de status de cobranças do tenant (padrão Asaas, gravados em MAIÚSCULO).
 *
 * Valores realmente gravados em tenant_charges.status:
 *   - PENDING_CREATION  → local, ainda não enviada ao Asaas (pendente)
 *   - PENDING           → aguardando pagamento (Asaas)
 *   - AWAITING_RISK_ANALYSIS / AWAITING_PAYMENT → intermediários (pendente)
 *   - CONFIRMED         → baixa aplicada pela RPC apply_tenant_charge_payment
 *   - RECEIVED          → alternativa do Asaas para boleto/pix recebido
 *   - RECEIVED_IN_CASH  → recebido em dinheiro (fora do Asaas)
 *   - OVERDUE           → vencida
 *   - REFUNDED          → estornada pelo webhook PAYMENT_REFUNDED
 *   - CHARGEBACK        → gravado pelo webhook PAYMENT_CHARGEBACK_* (simplificado)
 *   - REFUND_REQUESTED / REFUND_IN_PROGRESS / CHARGEBACK_REQUESTED /
 *     CHARGEBACK_DISPUTE / AWAITING_CHARGEBACK_REVERSAL → subestados de estorno
 */

export type TenantChargeClassification =
  | 'paid'
  | 'pending'
  | 'overdue'
  | 'refunded'
  | 'other';

const PAID_STATUSES = new Set([
  'RECEIVED',
  'CONFIRMED',
  'RECEIVED_IN_CASH',
]);

const PENDING_STATUSES = new Set([
  'PENDING',
  'PENDING_CREATION',
  'AWAITING_RISK_ANALYSIS',
  'AWAITING_PAYMENT',
]);

const OVERDUE_STATUSES = new Set([
  'OVERDUE',
]);

const REFUNDED_STATUSES = new Set([
  'REFUNDED',
  'CHARGEBACK',
  'REFUND_REQUESTED',
  'REFUND_IN_PROGRESS',
  'CHARGEBACK_REQUESTED',
  'CHARGEBACK_DISPUTE',
  'AWAITING_CHARGEBACK_REVERSAL',
]);

/**
 * Classifica o status de uma cobrança de tenant de forma case-insensitive.
 *
 * @param status - valor bruto da coluna tenant_charges.status
 * @returns classificacao semantica para uso em badges e calculos de resumo
 */
export function classifyTenantChargeStatus(
  status: string,
): TenantChargeClassification {
  const normalized = status.trim().toUpperCase();
  if (PAID_STATUSES.has(normalized)) return 'paid';
  if (PENDING_STATUSES.has(normalized)) return 'pending';
  if (OVERDUE_STATUSES.has(normalized)) return 'overdue';
  if (REFUNDED_STATUSES.has(normalized)) return 'refunded';
  return 'other';
}
