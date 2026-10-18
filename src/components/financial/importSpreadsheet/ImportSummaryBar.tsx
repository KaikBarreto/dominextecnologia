import { CheckCircle2, AlertTriangle, Copy, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type { LocaleCode } from '@/lib/i18n/locales';
import { MESSAGES } from '@/lib/i18n/messages';

interface ImportSummaryBarProps {
  readyCount: number;
  blockedCount: number;
  duplicateCount: number;
  totalIn: number;
  totalOut: number;
  locale: LocaleCode;
  currency: string;
}

/**
 * Contadores do topo da conferência — o cliente vê o impacto ANTES de
 * gravar. `tabular-nums` nos números pra não "dançar" a cada atualização.
 */
export function ImportSummaryBar({
  readyCount,
  blockedCount,
  duplicateCount,
  totalIn,
  totalOut,
  locale,
  currency,
}: ImportSummaryBarProps) {
  const t = MESSAGES[locale].app.finance.spreadsheetImport.summary;
  const fmt = (v: number) => formatMoney(v, currency, locale);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <div className="flex items-center gap-2 rounded-md border bg-success/5 p-2.5">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        <span className="text-sm font-medium tabular-nums">{t.ready.replace('{count}', String(readyCount))}</span>
      </div>
      <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <span className="text-sm font-medium tabular-nums">{t.review.replace('{count}', String(blockedCount))}</span>
      </div>
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2.5">
        <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium tabular-nums">{t.duplicate.replace('{count}', String(duplicateCount))}</span>
      </div>
      <div className="flex items-center gap-2 rounded-md border p-2.5">
        <ArrowUpCircle className="h-4 w-4 shrink-0 text-success" />
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground leading-none">{t.totalIn}</p>
          <p className="text-sm font-semibold tabular-nums leading-tight">{fmt(totalIn)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-md border p-2.5">
        <ArrowDownCircle className="h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground leading-none">{t.totalOut}</p>
          <p className="text-sm font-semibold tabular-nums leading-tight">{fmt(totalOut)}</p>
        </div>
      </div>
    </div>
  );
}
