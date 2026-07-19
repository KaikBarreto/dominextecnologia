import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { FinancialTransaction } from '@/types/database';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';

/**
 * Datas financeiras são guardadas como 'YYYY-MM-DD' (sem hora). Ancoramos ao
 * meio-dia pra exibir sempre no dia certo em horário de Brasília (UTC-3),
 * sem o vazamento de fuso que jogaria pro dia anterior.
 */
function parseLocalDate(dateStr: string): Date {
  return parseISO(dateStr + 'T12:00:00');
}

interface CustomerTransactionDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: FinancialTransaction | null;
}

function DetailRow({ label, value, valueClassName }: { label: string; value: React.ReactNode; valueClassName?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right font-medium ${valueClassName ?? ''}`}>{value}</span>
    </div>
  );
}

/**
 * Detalhe completo (somente leitura) de um lançamento financeiro do cliente.
 * Cobre entrada e saída — diferente do ReceivableDetailModal, que é focado em
 * recebíveis com histórico de parciais/estorno. Aqui não há ação destrutiva:
 * é a visão "olho" da aba Financeiro do cadastro do cliente.
 */
export function CustomerTransactionDetailModal({ open, onOpenChange, transaction }: CustomerTransactionDetailModalProps) {
  const { locale, currency } = useAppLocaleContext();
  const td = MESSAGES[locale].app.finance.transactionDetail;

  if (!transaction) return null;

  const isEntrada = transaction.transaction_type === 'entrada';
  const amount = Number(transaction.amount ?? 0);
  const received = Number(transaction.amount_received ?? 0);
  const remaining = Math.max(0, amount - received);

  const formatCurrency = (value: number) => formatMoney(value, currency, locale);
  const formatPaymentMethod = (method: string | null | undefined): string => {
    if (!method) return '—';
    return (td.paymentMethods as Record<string, string>)[method] ?? method;
  };
  const formatDateLocal = (dateStr: string) =>
    format(parseLocalDate(dateStr), 'dd/MM/yyyy', { locale: ptBR });

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={transaction.description}
      className="sm:max-w-lg"
    >
      <div className="space-y-4 pb-2">
        {/* Resumo de valores */}
        <div className="rounded-xl border bg-muted/30 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{td.amountLabel}</span>
            <span className={`font-semibold ${isEntrada ? 'text-success' : 'text-destructive'}`}>
              {isEntrada ? '+' : '-'} {formatCurrency(amount)}
            </span>
          </div>
          {isEntrada && received > 0 && remaining > 0 && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{td.alreadyReceived}</span>
                <span className="font-semibold text-success">{formatCurrency(received)}</span>
              </div>
              <div className="flex items-center justify-between text-sm border-t pt-1.5">
                <span className="text-muted-foreground">{td.remaining}</span>
                <span className="font-semibold text-warning">{formatCurrency(remaining)}</span>
              </div>
            </>
          )}
        </div>

        {/* Campos do lançamento */}
        <div className="rounded-xl border bg-card px-3 divide-y">
          <DetailRow
            label={td.typeLabel}
            value={
              <Badge variant="secondary" className={isEntrada ? 'text-success' : 'text-destructive'}>
                {isEntrada ? td.typeEntrada : td.typeSaida}
              </Badge>
            }
          />
          <DetailRow
            label={td.statusLabel}
            value={
              <Badge variant={transaction.is_paid ? 'default' : 'secondary'}>
                {transaction.is_paid ? (isEntrada ? td.statusReceived : td.statusPaid) : td.statusPending}
              </Badge>
            }
          />
          {transaction.category && <DetailRow label={td.categoryLabel} value={transaction.category} />}
          <DetailRow
            label={td.dateLabel}
            value={formatDateLocal(transaction.transaction_date)}
          />
          {transaction.due_date && (
            <DetailRow
              label={td.dueDateLabel}
              value={formatDateLocal(transaction.due_date)}
            />
          )}
          {transaction.paid_date && (
            <DetailRow
              label={isEntrada ? td.receivedOnLabel : td.paidOnLabel}
              value={formatDateLocal(transaction.paid_date)}
            />
          )}
          {transaction.payment_method && (
            <DetailRow label={td.paymentMethodLabel} value={formatPaymentMethod(transaction.payment_method)} />
          )}
          {transaction.installment_total && transaction.installment_total > 1 && (
            <DetailRow
              label={td.installmentLabel}
              value={`${transaction.installment_number ?? 1} ${td.installmentOf} ${transaction.installment_total}`}
            />
          )}
          {transaction.notes && (
            <DetailRow label={td.notesLabel} value={<span className="whitespace-pre-wrap">{transaction.notes}</span>} />
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}
