/**
 * Travas de o que dá pra FAZER com uma cobrança (tenant_charges), num lugar só.
 *
 * Por que existe: a Central de Cobranças (FinanceCobrancas) e a ficha do
 * cliente (CustomerDetail) mostram as MESMAS cobranças. Enquanto cada tela
 * escrevia a sua própria condição, a ficha do cliente já divergia da central:
 * ela oferecia "Estornar" para cobrança recebida EM DINHEIRO (RECEIVED_IN_CASH,
 * fora do Asaas) e para cobrança sem `asaas_payment_id` — um caminho paralelo
 * que a central nunca abriu. Agora as duas telas derivam daqui.
 *
 * A palavra final continua sendo do servidor (a edge responde `not_editable`
 * quando a cobrança já foi paga/estornada). Isto aqui é a trava de UI: não
 * oferecer o que vai ser recusado.
 */
import { classifyTenantChargeStatus } from '@/utils/tenantChargeStatus';

export interface ChargeRuleInput {
  status: string;
  asaas_payment_id?: string | null;
}

/**
 * Editar/excluir só faz sentido em cobrança ainda NÃO paga e NÃO estornada.
 * O caminho da cobrança paga é o estorno (`canRefundCharge`).
 */
export function canManageCharge(status: string): boolean {
  const cls = classifyTenantChargeStatus(status);
  return cls === 'pending' || cls === 'overdue';
}

/**
 * Estorno só existe quando o dinheiro passou pelo Asaas: precisa estar paga,
 * ter `asaas_payment_id` e NÃO ser recebimento em espécie (RECEIVED_IN_CASH,
 * que entrou por fora do gateway e não tem o que devolver por lá).
 */
export function canRefundCharge(charge: ChargeRuleInput): boolean {
  return (
    classifyTenantChargeStatus(charge.status) === 'paid' &&
    charge.status.trim().toUpperCase() !== 'RECEIVED_IN_CASH' &&
    !!charge.asaas_payment_id
  );
}
