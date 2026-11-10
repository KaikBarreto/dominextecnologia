import type { ServiceOrder } from '@/types/database';

type ServiceOrderAccessSubject = Pick<ServiceOrder, 'entry_type' | 'customer_id'>;

/**
 * Tarefas compartilham a tabela de OS, mas são registros internos da agenda.
 * Entradas legadas sem `entry_type` continuam sendo tratadas como OS.
 */
export function isServiceOrderEntry(
  order: Pick<ServiceOrderAccessSubject, 'entry_type'> | null | undefined,
): boolean {
  return order?.entry_type !== 'tarefa';
}

/** Espelha no cliente a mesma regra fail-closed aplicada pela RPC pública. */
export function canShareServiceOrder(
  order: ServiceOrderAccessSubject | null | undefined,
): boolean {
  return Boolean(order?.customer_id) && isServiceOrderEntry(order);
}
