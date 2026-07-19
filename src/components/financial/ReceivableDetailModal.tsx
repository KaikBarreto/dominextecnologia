import { useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trash2, Receipt, Calendar, CreditCard, Wallet } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { FinancialTransaction } from '@/types/database';
import { useReceivablePayments } from '@/hooks/useReceivablePayments';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';

function parseLocalDate(dateStr: string): Date {
  return parseISO(dateStr + 'T12:00:00');
}

interface ReceivableDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: FinancialTransaction | null;
}

/**
 * Modal de detalhe de uma conta a receber.
 * Hoje mostra apenas o histórico de recebimentos parciais; pode ser expandido
 * com mais blocos no futuro (anexos, contrato, etc).
 */
export function ReceivableDetailModal({ open, onOpenChange, transaction }: ReceivableDetailModalProps) {
  const { locale, currency } = useAppLocaleContext();
  const rd = MESSAGES[locale].app.finance.receivableDetail;
  const td = MESSAGES[locale].app.finance.transactionDetail;

  const { payments, isLoading, reverse } = useReceivablePayments(transaction?.id);
  const [reversingId, setReversingId] = useState<string | null>(null);

  if (!transaction) return null;

  const formatCurrency = (value: number) => formatMoney(value, currency, locale);
  const formatPaymentMethod = (method: string | null): string => {
    if (!method) return '—';
    return (td.paymentMethods as Record<string, string>)[method] ?? method;
  };

  const amount = Number(transaction.amount ?? 0);
  const received = Number(transaction.amount_received ?? 0);
  const remaining = Math.max(0, amount - received);
  const paymentBeingReversed = payments.find((p) => p.id === reversingId);

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={transaction.description}
        className="sm:max-w-lg"
      >
        <div className="space-y-5 pb-2">
          {/* Resumo de valores — mostra a "régua" da conta */}
          <div className="rounded-xl border bg-muted/30 p-3 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{rd.totalLabel}</span>
              <span className="font-semibold">{formatCurrency(amount)}</span>
            </div>
            {received > 0 && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{rd.alreadyReceived}</span>
                  <span className="font-semibold text-success">{formatCurrency(received)}</span>
                </div>
                <div className="flex items-center justify-between text-sm border-t pt-1.5">
                  <span className="text-muted-foreground">{rd.remaining}</span>
                  <span className="font-semibold text-warning">{formatCurrency(remaining)}</span>
                </div>
              </>
            )}
            {transaction.due_date && (
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {rd.dueDateLabel}
                </span>
                <span>{format(parseLocalDate(transaction.due_date), 'dd/MM/yyyy', { locale: ptBR })}</span>
              </div>
            )}
          </div>

          {/* Histórico de recebimentos — só renderiza se houve algum */}
          {payments.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">{rd.historyTitle}</h3>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{payments.length}</Badge>
              </div>
              <div className="rounded-xl border divide-y bg-card">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-success text-sm">{formatCurrency(Number(p.amount))}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {p.paid_date ? format(parseLocalDate(p.paid_date), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CreditCard className="h-3 w-3" />
                          {formatPaymentMethod(p.payment_method)}
                        </span>
                        {p.account?.name && (
                          <span className="flex items-center gap-1">
                            <Wallet className="h-3 w-3" />
                            {p.account.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive h-8 w-8 shrink-0"
                      onClick={() => setReversingId(p.id)}
                      title={rd.reverseAriaLabel}
                      disabled={reverse.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Estado vazio: conta sem nenhum recebimento parcial ainda */}
          {payments.length === 0 && !isLoading && (
            <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-center">
              <Receipt className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {rd.emptyTitle}
              </p>
            </div>
          )}
        </div>
      </ResponsiveModal>

      <AlertDialog open={!!reversingId} onOpenChange={() => !reverse.isPending && setReversingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{rd.reverseTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {paymentBeingReversed
                ? rd.reverseDescription.replace('{amount}', formatCurrency(Number(paymentBeingReversed.amount)))
                : rd.reverseFallbackDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reverse.isPending}>{rd.reverseCancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={reverse.isPending}
              onClick={async () => {
                if (!reversingId) return;
                await reverse.mutateAsync(reversingId);
                setReversingId(null);
              }}
            >
              {reverse.isPending ? rd.reversing : rd.reverseConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
