import { Badge } from '@/components/ui/badge';
import type { LedgerStatus } from '@/hooks/useAsaasReconciliation';

/**
 * Badge de status de um movimento do extrato Asaas (`ledger_asaas.status`).
 *
 * Saturado com texto branco (nunca outline dessaturado) — mesma régua de
 * todo badge/selo do sistema.
 *
 * - `auto_categorized`       → "Conferido" (verde): casado pelo webhook.
 * - `manually_categorized`   → "Categorizado" (verde): classificado a mão.
 * - `pending_categorization` → "A categorizar" (vermelho): exige ação.
 */
const META: Record<LedgerStatus, { label: string; variant: 'success' | 'destructive' }> = {
  auto_categorized: { label: 'Conferido', variant: 'success' },
  manually_categorized: { label: 'Categorizado', variant: 'success' },
  pending_categorization: { label: 'A categorizar', variant: 'destructive' },
};

export function ReconciliationStatusBadge({ status }: { status: LedgerStatus }) {
  const meta = META[status];
  return (
    <Badge variant={meta?.variant ?? 'muted'} className="font-medium">
      {meta?.label ?? status}
    </Badge>
  );
}
