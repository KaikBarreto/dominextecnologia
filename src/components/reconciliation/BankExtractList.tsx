import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { EmptyState } from '@/components/mobile/EmptyState';
import { Inbox } from 'lucide-react';
import { ReconciliationStatusBadge } from './ReconciliationStatusBadge';
import type { ReconEntry } from '@/lib/reconciliation/types';

/** `posted_date` já chega YYYY-MM-DD da RPC. Fatiar a string, nunca `new Date(...)`. */
function formatDateBR(isoDate: string): string {
  const m = isoDate.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Linha elegível pra seleção em lote (só pendente/ignorada). */
export function isEntrySelectable(entry: ReconEntry): boolean {
  return entry.status === 'pending' || entry.status === 'ignored';
}

interface BankExtractListProps {
  entries: ReconEntry[];
  selectedEntryId: string | null;
  onSelectEntry: (id: string) => void;
  finalized: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

/** Painel ESQUERDO: linhas do extrato .OFX importado. */
export function BankExtractList({
  entries,
  selectedEntryId,
  onSelectEntry,
  finalized,
  selectedIds,
  onToggleSelect,
}: BankExtractListProps) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.row;

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-10 w-10" />}
        title={t.emptyTitle}
        description={t.emptyDescription}
        size="compact"
      />
    );
  }

  return (
    <div className="divide-y">
      {entries.map((entry) => {
        const isCredit = entry.effective_amount >= 0;
        const selected = entry.id === selectedEntryId;
        const selectable = !finalized && isEntrySelectable(entry);
        const checked = selectedIds.has(entry.id);

        return (
          // `div role="button"` em vez de `<button>`: o Checkbox do Radix já
          // renderiza um `<button>` por dentro, e `<button>` dentro de
          // `<button>` é HTML inválido (acusado pelo React e causa de clique
          // imprevisível na linha). Mesmo padrão de `PmocChecklistPicker.tsx`.
          <div
            key={entry.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectEntry(entry.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectEntry(entry.id);
              }
            }}
            className={cn(
              'flex w-full cursor-pointer items-start gap-3 px-2 py-3 text-left transition-colors hover:bg-muted/50',
              selected && 'bg-primary/5',
            )}
          >
            <div className="flex w-5 shrink-0 justify-center pt-0.5" onClick={(e) => e.stopPropagation()}>
              {selectable && (
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggleSelect(entry.id)}
                  aria-label={t.selectAria}
                />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">{formatDateBR(entry.posted_date)}</p>
                {entry.trn_type && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {entry.trn_type}
                  </span>
                )}
                {entry.sign_suspect && !entry.sign_flipped && (
                  <Badge variant="warning" className="gap-1 px-1.5 py-0">
                    <AlertTriangle className="h-3 w-3" />
                    {t.signSuspectBadge}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 break-words text-sm font-medium text-foreground">
                {entry.memo || entry.name || t.noDescription}
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <ReconciliationStatusBadge status={entry.status} />
                <p
                  className={cn(
                    'min-w-0 shrink-0 text-right text-sm font-bold tabular-nums',
                    isCredit ? 'text-success' : 'text-destructive',
                  )}
                >
                  {isCredit ? '+' : '−'}
                  {formatMoney(Math.abs(entry.effective_amount), currency, locale)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
