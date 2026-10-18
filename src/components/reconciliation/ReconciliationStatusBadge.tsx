import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Ban, Clock } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import type { EntryStatus } from '@/lib/reconciliation/types';

/**
 * Selo saturado do status de uma linha do extrato (`pending`/`matched`/`ignored`).
 * Nunca outline dessaturado — régua de UI (badges saturados, ícone branco direto
 * no fundo, sem círculo de fundo por trás).
 */
export function ReconciliationStatusBadge({ status }: { status: EntryStatus }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.status;

  if (status === 'matched') {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        {t.matched}
      </Badge>
    );
  }
  if (status === 'ignored') {
    return (
      <Badge variant="muted" className="gap-1">
        <Ban className="h-3 w-3" />
        {t.ignored}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Clock className="h-3 w-3" />
      {t.pending}
    </Badge>
  );
}
