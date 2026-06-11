import { useState } from 'react';
import { CreditCard, ExternalLink, Plus, Receipt, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useToast } from '@/hooks/use-toast';
import {
  useAdminCompanyPayments,
  mapPaymentRpcError,
  type UnifiedCompanyPayment,
} from '@/hooks/useAdminCompanyPayments';
import { RegisterCompanyPaymentModal } from '@/components/admin/RegisterCompanyPaymentModal';

interface CompanyPaymentsTabProps {
  companyId: string;
  company: any;
}

/**
 * Data/hora em America/Sao_Paulo. Pagamento manual registrado pela RPC entra
 * como meia-noite UTC (date puro) — nesses casos mostramos só a data, lendo o
 * trecho YYYY-MM-DD direto da string (converter pra BRT recuaria 1 dia).
 */
function formatPaymentDate(iso: string | null): string {
  if (!iso) return '—';
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso) || /T00:00:00(\.0+)?(\+00(:00)?|Z)$/.test(iso);
  if (isDateOnly) {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y.slice(2)}`;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const datePart = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit',
  }).format(date);
  const timePart = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
  return `${datePart} ${timePart}`;
}

function getTypeLabel(payment: UnifiedCompanyPayment): string {
  if (payment.source === 'asaas') return 'Cobrança Asaas';
  switch (payment.type) {
    case 'primeira_venda':
      return 'Venda';
    case 'renewal':
    case 'renovacao':
      return 'Renovação';
    default:
      return 'Pagamento';
  }
}

function getMethodLabel(payment: UnifiedCompanyPayment): string {
  const method = payment.paymentMethod;
  if (!method) return payment.source === 'manual' ? 'Manual' : 'N/A';
  const labels: Record<string, string> = {
    PIX: 'PIX',
    BOLETO: 'Boleto',
    CREDIT_CARD: 'Cartão',
    UNDEFINED: 'N/A',
  };
  return labels[method.toUpperCase()] || method;
}

function isPaid(status: string): boolean {
  return status === 'RECEIVED' || status === 'CONFIRMED';
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'RECEIVED':
    case 'CONFIRMED':
      return <Badge className="bg-success text-success-foreground border-0 hover:bg-success">Pago</Badge>;
    case 'PENDING':
      return <Badge className="bg-warning text-warning-foreground border-0 hover:bg-warning">Pendente</Badge>;
    case 'OVERDUE':
      return <Badge className="bg-destructive text-destructive-foreground border-0 hover:bg-destructive">Vencido</Badge>;
    case 'CANCELLED':
      return <Badge className="bg-muted text-muted-foreground border-0 hover:bg-muted">Cancelado</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function CompanyPaymentsTab({ companyId, company }: CompanyPaymentsTabProps) {
  const { toast } = useToast();
  const { payments, isLoading, deletePayment } = useAdminCompanyPayments(companyId);
  const [showRegister, setShowRegister] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<UnifiedCompanyPayment | null>(null);

  const handleConfirmDelete = () => {
    if (!paymentToDelete) return;
    deletePayment.mutate(paymentToDelete.id, {
      onSuccess: () => {
        toast({ title: 'Pagamento excluído', description: 'Valores e vencimento foram estornados.' });
        setPaymentToDelete(null);
      },
      onError: (error) => {
        toast({ variant: 'destructive', title: 'Erro ao excluir pagamento', description: mapPaymentRpcError(error) });
        setPaymentToDelete(null);
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Header da aba */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Pagamentos manuais e cobranças do Asaas desta empresa.
        </p>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setShowRegister(true)}>
          <Plus className="h-4 w-4" /> Registrar Pagamento
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : payments.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
          <Receipt className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>
          <p className="text-xs text-muted-foreground">
            Registre uma venda ou renovação recebida fora do Asaas pelo botão acima.
          </p>
        </div>
      ) : (
        <div className="space-y-2 md:space-y-3">
          {payments.map((payment) => {
            const paid = isPaid(payment.status);
            const cancelled = payment.status === 'CANCELLED';
            return (
              <div
                key={`${payment.source}-${payment.id}`}
                className={cn(
                  'flex flex-col gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between md:p-4',
                  cancelled && 'opacity-60',
                )}
              >
                {/* Esquerda: ícone + tipo + valor + meta */}
                <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center md:gap-4">
                  <div
                    className={cn(
                      'shrink-0 rounded-lg p-2',
                      paid ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <CreditCard className="h-4 w-4 md:h-5 md:w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold md:text-base">{getTypeLabel(payment)}</p>
                      <span className="sm:hidden">
                        <StatusBadge status={payment.status} />
                      </span>
                    </div>
                    <p className="mt-0.5 text-base font-bold md:text-lg">
                      {payment.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <p className="text-xs text-muted-foreground">{formatPaymentDate(payment.date)}</p>
                      <span className="text-xs text-muted-foreground">•</span>
                      <p className="text-xs text-muted-foreground">{getMethodLabel(payment)}</p>
                    </div>
                    {payment.notes && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{payment.notes}</p>
                    )}
                    {payment.source === 'asaas' && payment.invoiceUrl && (
                      <a
                        href={payment.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Ver fatura
                      </a>
                    )}
                  </div>
                </div>

                {/* Direita: status (desktop) + excluir (só manual) */}
                <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0 md:gap-3">
                  <span className="hidden sm:inline-flex">
                    <StatusBadge status={payment.status} />
                  </span>
                  {payment.source === 'manual' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Excluir pagamento"
                      disabled={deletePayment.isPending}
                      onClick={() => setPaymentToDelete(payment)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmação de exclusão (só pagamento manual) */}
      <AlertDialog open={!!paymentToDelete} onOpenChange={(open) => { if (!open && !deletePayment.isPending) setPaymentToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pagamento?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <span className="block">
                O pagamento de{' '}
                <strong className="text-foreground">
                  {paymentToDelete?.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </strong>{' '}
                será excluído e os valores estornados (receita e LTV). Se for o pagamento mais
                recente, o vencimento da empresa também será retraído.
              </span>
              <span className="block">Esta ação não pode ser desfeita.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePayment.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmDelete(); }}
              disabled={deletePayment.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePayment.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RegisterCompanyPaymentModal company={company} open={showRegister} onOpenChange={setShowRegister} />
    </div>
  );
}
