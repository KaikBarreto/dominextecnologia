import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, Undo2, AlertTriangle } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type { LocaleCode } from '@/lib/i18n/locales';
import { MESSAGES } from '@/lib/i18n/messages';
import type { FinancialImportApplyResult, FinancialImportRevertResult } from '@/hooks/useFinancialImport';

/** `2026-10-18` → `18/10/2026`. Nunca `new Date(iso)` (UTC voltaria um dia). */
function formatDateBR(iso: string | null): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

interface ImportResultPanelProps {
  result: FinancialImportApplyResult;
  revertResult: FinancialImportRevertResult | null;
  onRevert: () => void;
  isReverting: boolean;
  locale: LocaleCode;
  currency: string;
}

/**
 * Resultado da gravação + "Desfazer importação" ali mesmo — a primeira
 * importação do cliente sempre vem torta, e sem o desfazer ele fica com
 * centenas de lançamentos errados e nenhuma saída.
 */
export function ImportResultPanel({ result, revertResult, onRevert, isReverting, locale, currency }: ImportResultPanelProps) {
  const t = MESSAGES[locale].app.finance.spreadsheetImport.result;
  const fmt = (v: number) => formatMoney(v, currency, locale);

  if (revertResult) {
    if (revertResult.kept_count === 0) {
      return (
        <div className="flex items-center gap-2 rounded-md border bg-success/5 p-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          <p className="text-sm text-foreground">{t.revertSuccess}</p>
        </div>
      );
    }
    return (
      <div className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
          {t.revertPartialTitle.replace('{count}', String(revertResult.kept_count))}
        </p>
        <p className="text-sm text-muted-foreground">{t.revertPartialDescription}</p>
        <div className="max-h-40 space-y-1.5 overflow-y-auto">
          {revertResult.kept.map((k) => (
            <div key={k.financial_transaction_id} className="rounded border bg-background p-2 text-xs">
              <p className="font-medium tabular-nums">
                {formatDateBR(k.transaction_date)} · {fmt(k.amount)} · {k.description}
              </p>
              <p className="text-muted-foreground">{t.revertKeptReasonLabel}: {k.reason_label}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border bg-success/5 p-3">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
        <div>
          <p className="text-sm font-semibold text-foreground">{t.title}</p>
          <p className="text-sm text-muted-foreground">{t.created.replace('{count}', String(result.created_count))}</p>
        </div>
      </div>

      {result.skipped_dup_count > 0 && (
        <p className="text-sm text-muted-foreground">{t.skippedDup.replace('{count}', String(result.skipped_dup_count))}</p>
      )}
      {result.skipped_invalid_count > 0 && (
        <p className="text-sm text-muted-foreground">{t.skippedInvalid.replace('{count}', String(result.skipped_invalid_count))}</p>
      )}

      {result.skipped_samples.length > 0 && (
        <div className="space-y-1 rounded-md border bg-muted/30 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.samplesTitle}</p>
          <div className="max-h-32 space-y-1 overflow-y-auto">
            {result.skipped_samples.map((s, i) => (
              <p key={i} className="text-xs text-muted-foreground tabular-nums">
                {t.sampleRow
                  .replace('{date}', formatDateBR(s.date))
                  .replace('{amount}', fmt(s.amount))
                  .replace('{description}', s.description)}
                {' '}· {s.message}
              </p>
            ))}
          </div>
        </div>
      )}

      {result.created_count > 0 && (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onRevert} disabled={isReverting}>
          {isReverting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
          {isReverting ? t.reverting : t.revertButton}
        </Button>
      )}
    </div>
  );
}
