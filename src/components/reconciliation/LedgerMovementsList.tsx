import { Badge } from '@/components/ui/badge';
import { CheckCircle2, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { EmptyState } from '@/components/mobile/EmptyState';
import type { ReconLedgerMovement } from '@/lib/reconciliation/types';

/** `transaction_date` chega YYYY-MM-DD da RPC. Fatiar a string, nunca `new Date(...)`. */
function formatDateBR(isoDate: string | null): string {
  if (!isoDate) return '';
  const m = isoDate.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

interface LedgerMovementsListProps {
  movements: ReconLedgerMovement[];
}

/**
 * Painel "sistema": movimentações já existentes na conta dentro do período do
 * extrato (`get_bank_reconciliation_state().ledger_movements`). Read-only, só
 * pra contexto visual lado a lado com o extrato — o CASAMENTO de verdade
 * acontece no `EntryActionPanel` (busca/sugestão/baixa), não aqui.
 */
export function LedgerMovementsList({ movements }: LedgerMovementsListProps) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.ledger;

  if (movements.length === 0) {
    return <EmptyState icon={<ListChecks className="h-10 w-10" />} title={t.empty.title} description={t.empty.description} size="compact" />;
  }

  return (
    <div className="divide-y">
      {movements.map((mv) => {
        const isCredit = mv.transaction_type === 'entrada';
        const counterparty = mv.customer_name || mv.supplier_name || mv.employee_name || null;
        return (
          <div key={mv.id} className="flex items-start gap-3 px-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">{formatDateBR(mv.transaction_date)}</p>
                {mv.is_matched && (
                  <Badge variant="success" className="gap-1 px-1.5 py-0">
                    <CheckCircle2 className="h-3 w-3" />
                    {t.matchedBadge}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 truncate text-sm font-medium text-foreground">{mv.description || mv.category || '—'}</p>
              {counterparty && <p className="truncate text-xs text-muted-foreground">{counterparty}</p>}
            </div>
            <p
              className={cn(
                'shrink-0 text-right text-sm font-semibold tabular-nums',
                isCredit ? 'text-success' : 'text-destructive',
              )}
            >
              {isCredit ? '+' : '−'}
              {formatMoney(Math.abs(mv.amount), currency, locale)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
