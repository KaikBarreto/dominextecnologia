import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LedgerStatus } from '@/hooks/useAsaasReconciliation';

/**
 * Badge de status de um movimento do extrato Asaas (`ledger_asaas.status`).
 *
 * - `auto_categorized`       → "Conferido" (verde): casado pelo webhook.
 * - `manually_categorized`   → "Categorizado" (verde): classificado a mão.
 * - `pending_categorization` → "A categorizar" (vermelho): exige ação.
 */
const META: Record<LedgerStatus, { label: string; className: string }> = {
  auto_categorized: {
    label: 'Conferido',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  },
  manually_categorized: {
    label: 'Categorizado',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  },
  pending_categorization: {
    label: 'A categorizar',
    className: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
  },
};

export function ReconciliationStatusBadge({ status }: { status: LedgerStatus }) {
  const meta = META[status] ?? { label: status, className: '' };
  return (
    <Badge variant="outline" className={cn('font-medium', meta.className)}>
      {meta.label}
    </Badge>
  );
}
