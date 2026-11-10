import type { ContractServiceOrder } from '@/hooks/useContracts';
import type { ServiceOrder } from '@/types/database';

export function isServiceOrderAvailableForContractLink(
  order: ServiceOrder,
  customerId: string,
  contractId: string,
): boolean {
  return order.entry_type !== 'tarefa'
    && order.customer_id === customerId
    && order.origin !== 'contract'
    && order.status !== 'cancelada'
    && (!order.contract_id || order.contract_id === contractId)
    && !(order.contract_id === contractId
      && !!order.contract_reference_date
      && !!order.contract_visit_customized_at);
}

export function availableContractPeriods(
  occurrences: ContractServiceOrder[],
): Array<[string, ContractServiceOrder]> {
  const unique = new Map<string, ContractServiceOrder>();
  occurrences.forEach(order => {
    const reference = order.contract_reference_date ?? order.scheduled_date;
    if (
      reference
      && order.origin === 'contract'
      && !order.contract_visit_customized_at
      && ['agendada', 'pendente'].includes(order.status)
    ) unique.set(reference, order);
  });
  return Array.from(unique.entries()).sort(([a], [b]) => a.localeCompare(b));
}
