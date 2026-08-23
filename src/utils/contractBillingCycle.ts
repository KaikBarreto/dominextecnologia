/**
 * contractBillingCycle — helper puro que mapeia a frequência de um contrato
 * (frequency_type + frequency_value) para o ciclo Asaas correspondente.
 *
 * Tabela de mapeamento:
 *   frequency_type 'months':
 *     1  → MONTHLY
 *     3  → QUARTERLY
 *     6  → SEMIANNUALLY
 *     12 → YEARLY
 *     outros → MONTHLY (fallback)
 *   frequency_type 'weeks':
 *     1  → WEEKLY
 *     2  → BIWEEKLY
 *     outros → WEEKLY (fallback)
 *   fallback geral → MONTHLY
 */

import type { SubscriptionCycle } from '@/hooks/useTenantSubscriptions';

export function contractFrequencyToCycle(
  frequencyType: string | null | undefined,
  frequencyValue: number | null | undefined,
): SubscriptionCycle {
  const type = frequencyType ?? '';
  const value = Number(frequencyValue ?? 0);

  if (type === 'months') {
    if (value === 1) return 'MONTHLY';
    if (value === 3) return 'QUARTERLY';
    if (value === 6) return 'SEMIANNUALLY';
    if (value === 12) return 'YEARLY';
    return 'MONTHLY';
  }

  if (type === 'weeks') {
    if (value === 1) return 'WEEKLY';
    if (value === 2) return 'BIWEEKLY';
    return 'WEEKLY';
  }

  return 'MONTHLY';
}
