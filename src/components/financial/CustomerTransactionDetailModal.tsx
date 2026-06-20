import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { FinancialTransaction } from '@/types/database';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/**
 * Datas financeiras são guardadas como 'YYYY-MM-DD' (sem hora). Ancoramos ao
 * meio-dia pra exibir sempre no dia certo em horário de Brasília (UTC-3),
 * sem o vazamento de fuso que jogaria pro dia anterior.
 */
function parseLocalDate(dateStr: string): Date {
  return parseISO(dateStr + 'T12:00:00');
}

function formatPaymentMethod(method: string | null | undefined): string {
  if (!method) return '—';
  const map: Record<string, string> = {
    pix: 'PIX',
    dinheiro: 'Dinheiro',
    debito: 'Cartão de Débito',
    credito: 'Cartão de Crédito',
    boleto: 'Boleto',
    transferencia: 'Transferência',
    cheque: 'Cheque',
  };
  return map[method] ?? method;
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
  if (!transaction) return null;

  const isEntrada = transaction.transaction_type === 'entrada';
  const amount = Number(transaction.amount ?? 0);
  const received = Number(transaction.amount_received ?? 0);
  const remaining = Math.max(0, amount - received);

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
            <span className="text-muted-foreground">Valor</span>
            <span className={`font-semibold ${isEntrada ? 'text-success' : 'text-destructive'}`}>
              {isEntrada ? '+' : '-'} {formatCurrency(amount)}
            </span>
          </div>
          {isEntrada && received > 0 && remaining > 0 && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Já recebido</span>
                <span className="font-semibold text-success">{formatCurrency(received)}</span>
              </div>
              <div className="flex items-center justify-between text-sm border-t pt-1.5">
                <span className="text-muted-foreground">Restante</span>
                <span className="font-semibold text-warning">{formatCurrency(remaining)}</span>
              </div>
            </>
          )}
        </div>

        {/* Campos do lançamento */}
        <div className="rounded-xl border bg-card px-3 divide-y">
          <DetailRow
            label="Tipo"
            value={
              <Badge variant="secondary" className={isEntrada ? 'text-success' : 'text-destructive'}>
                {isEntrada ? 'Entrada' : 'Saída'}
              </Badge>
            }
          />
          <DetailRow
            label="Status"
            value={
              <Badge variant={transaction.is_paid ? 'default' : 'secondary'}>
                {transaction.is_paid ? (isEntrada ? 'Recebido' : 'Pago') : 'Pendente'}
              </Badge>
            }
          />
          {transaction.category && <DetailRow label="Categoria" value={transaction.category} />}
          <DetailRow
            label="Data do lançamento"
            value={format(parseLocalDate(transaction.transaction_date), 'dd/MM/yyyy', { locale: ptBR })}
          />
          {transaction.due_date && (
            <DetailRow
              label="Vencimento"
              value={format(parseLocalDate(transaction.due_date), 'dd/MM/yyyy', { locale: ptBR })}
            />
          )}
          {transaction.paid_date && (
            <DetailRow
              label={isEntrada ? 'Recebido em' : 'Pago em'}
              value={format(parseLocalDate(transaction.paid_date), 'dd/MM/yyyy', { locale: ptBR })}
            />
          )}
          {transaction.payment_method && (
            <DetailRow label="Forma de pagamento" value={formatPaymentMethod(transaction.payment_method)} />
          )}
          {transaction.installment_total && transaction.installment_total > 1 && (
            <DetailRow
              label="Parcela"
              value={`${transaction.installment_number ?? 1} de ${transaction.installment_total}`}
            />
          )}
          {transaction.notes && (
            <DetailRow label="Observações" value={<span className="whitespace-pre-wrap">{transaction.notes}</span>} />
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}
