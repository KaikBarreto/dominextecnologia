import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { formatSignedMoney } from '@/lib/reconciliation/format';
import type { ReconCardBlock, ReconKind } from '@/lib/reconciliation/types';

/** Tolerância de centavo pra considerar a diferença "zerada". */
const EPS = 0.01;

interface ReconciliationBalanceFooterProps {
  kind: ReconKind;
  statementBalance: number;
  reconciledBalance: number;
  difference: number;
  /** `null` no modo banco. No modo `'card'` troca os 3 rótulos (nunca "saldo"). */
  card: ReconCardBlock | null;
  pendingCount: number;
  matchedValueDifferenceTotal: number;
  matchedValueDifferenceCount: number;
  canFinalize: boolean;
  finalized: boolean;
  isFinalizing: boolean;
  onFinalize: () => void;
  /** `reopen_bank_reconciliation` — vale pros dois modos, não só cartão. */
  canReopen: boolean;
  isReopening: boolean;
  onReopen: () => void;
}

/**
 * Rodapé sticky com os 3 números do fechamento + Finalizar/Reabrir.
 * `canFinalize` vem do `can_finalize` da RPC (lei: NUNCA oferecer
 * lançamento-tampão pra forçar o zero aqui). No modo `'card'` os números são
 * "Total da fatura" / "Compras lançadas" / "Falta lançar" — NUNCA "saldo".
 */
export function ReconciliationBalanceFooter({
  kind,
  statementBalance,
  reconciledBalance,
  difference,
  card,
  pendingCount,
  matchedValueDifferenceTotal,
  matchedValueDifferenceCount,
  canFinalize,
  finalized,
  isFinalizing,
  onFinalize,
  canReopen,
  isReopening,
  onReopen,
}: ReconciliationBalanceFooterProps) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.footer;
  const fmt = (v: number) => formatSignedMoney(v, currency, locale);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmReopenOpen, setConfirmReopenOpen] = useState(false);

  const isCardMode = kind === 'card' && !!card;
  const label1 = isCardMode ? t.billTotal : t.statementBalance;
  const label2 = isCardMode ? t.billReconciled : t.reconciledBalance;
  const label3 = isCardMode ? t.billDifference : t.difference;
  const value1 = isCardMode ? card!.bill_total : statementBalance;
  const value2 = isCardMode ? card!.reconciled_total : reconciledBalance;
  const value3 = isCardMode ? card!.difference : difference;

  // Fatura só com crédito (nenhuma compra) faz `bill_total` vir negativo —
  // semântica correta, mas a tela não pode imprimir "Total da fatura: −R$ X".
  // Mostra zero (nada comprado) + a nota explicando o crédito registrado.
  const billTotalIsCreditOnly = isCardMode && value1 < 0;
  const ledgerMismatch = isCardMode && card!.ledger_balance !== null && !card!.ledger_matches_entries;

  const isZeroed = Math.abs(value3) <= EPS;
  const hasMatchedDiffs = Math.abs(matchedValueDifferenceTotal) > EPS;

  return (
    <div className="sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:gap-4 sm:p-4">
        <div className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-3">
          <div className="min-w-max flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
              {label1}
            </p>
            <p className="mt-0.5 whitespace-nowrap text-sm font-semibold tabular-nums sm:text-base">
              {billTotalIsCreditOnly ? formatMoney(0, currency, locale) : fmt(value1)}
            </p>
            {billTotalIsCreditOnly && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t.billTotalCreditOnlyNote.replace('{amount}', formatMoney(card!.credits_total, currency, locale))}
              </p>
            )}
          </div>

          <div className="min-w-max flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
              {label2}
            </p>
            <p className="mt-0.5 whitespace-nowrap text-sm font-semibold tabular-nums sm:text-base">{fmt(value2)}</p>
          </div>

          <div className="min-w-max flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
              {label3}
            </p>
            <p
              className={cn(
                'mt-0.5 whitespace-nowrap text-sm font-bold tabular-nums sm:text-base',
                isZeroed ? 'text-success' : 'text-destructive',
              )}
            >
              {fmt(value3)}
            </p>
          </div>

          {hasMatchedDiffs && (
            <div className="min-w-max flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-warning sm:text-xs">
                {t.matchedDifferences}
              </p>
              <p className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-sm font-semibold tabular-nums text-warning sm:text-base">
                {fmt(matchedValueDifferenceTotal)}
                <span className="text-xs font-normal text-muted-foreground">({matchedValueDifferenceCount})</span>
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2">
          {finalized ? (
            <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                {t.finalizedBadge}
              </span>
              {canReopen && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={isReopening}
                  onClick={() => setConfirmReopenOpen(true)}
                >
                  {isReopening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  {t.reopenButton}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <Button onClick={() => setConfirmOpen(true)} disabled={!canFinalize || isFinalizing} className="w-full sm:w-auto">
                {isFinalizing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.finalizing}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {t.finalize}
                  </>
                )}
              </Button>
              {!canFinalize && (
                <p className="text-[11px] text-muted-foreground">
                  {pendingCount > 0 ? t.blockedPending.replace('{count}', String(pendingCount)) : t.blockedDifference}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {ledgerMismatch && (
        <div className="flex items-start gap-2 border-t bg-warning/5 px-3 py-2 text-[11px] text-warning sm:px-4">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t.ledgerMismatchWarning}</span>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-3 gap-3 rounded-md border bg-muted/30 p-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label1}</p>
              <p className="mt-0.5 whitespace-nowrap text-sm font-semibold tabular-nums">
                {billTotalIsCreditOnly ? formatMoney(0, currency, locale) : fmt(value1)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label2}</p>
              <p className="mt-0.5 whitespace-nowrap text-sm font-semibold tabular-nums">{fmt(value2)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label3}</p>
              <p className={cn('mt-0.5 whitespace-nowrap text-sm font-semibold tabular-nums', isZeroed ? 'text-success' : 'text-destructive')}>
                {fmt(value3)}
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.confirmCancelButton}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                onFinalize();
              }}
            >
              {t.confirmButton}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReopenOpen} onOpenChange={setConfirmReopenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.reopenConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.reopenConfirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.confirmCancelButton}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmReopenOpen(false);
                onReopen();
              }}
            >
              {t.reopenConfirmButton}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
