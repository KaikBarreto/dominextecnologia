import { useMemo, useState } from 'react';
import { CreditCard, ChevronLeft, ChevronRight, ExternalLink, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatBRL } from '@/utils/currency';
import type { SubscriptionPaymentHistoryItem } from '@/hooks/useSubscriptionPaymentHistory';

interface PaymentHistoryListProps {
  payments: SubscriptionPaymentHistoryItem[];
  isLoading?: boolean;
}

/** Data/hora no fuso de São Paulo (padrão do projeto — sem date-fns-tz). */
function formatDateTimeBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const datePart = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(d);
  const timePart = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${datePart} ${timePart}`;
}

function getMethodLabel(billingType: string | null): string {
  switch ((billingType || '').toUpperCase()) {
    case 'PIX':
      return 'PIX';
    case 'BOLETO':
      return 'Boleto';
    case 'CREDIT_CARD':
      return 'Cartão';
    default:
      return billingType || 'Cobrança';
  }
}

function getTypeLabel(type: string | null): string {
  switch (type) {
    case 'primeira_venda':
      return 'Venda';
    case 'renovacao':
      return 'Renovação';
    default:
      return '';
  }
}

function isPaidStatus(status: string): boolean {
  const s = (status || '').toUpperCase();
  return s === 'RECEIVED' || s === 'CONFIRMED';
}

function isPendingStatus(status: string): boolean {
  return (status || '').toUpperCase() === 'PENDING';
}

function StatusBadge({ status }: { status: string }) {
  switch ((status || '').toUpperCase()) {
    case 'RECEIVED':
    case 'CONFIRMED':
      return <Badge className="bg-emerald-600 text-white border-0 hover:bg-emerald-600">Pago</Badge>;
    case 'PENDING':
      return <Badge className="bg-orange-500 text-white border-0 hover:bg-orange-500">Pendente</Badge>;
    case 'OVERDUE':
      return <Badge className="bg-destructive text-destructive-foreground border-0 hover:bg-destructive">Vencido</Badge>;
    case 'CANCELLED':
      return <Badge className="bg-muted text-muted-foreground border-0 hover:bg-muted">Cancelado</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

const PER_PAGE_OPTIONS = [5, 10, 20];

export function PaymentHistoryList({ payments, isLoading }: PaymentHistoryListProps) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const totalPages = Math.max(1, Math.ceil(payments.length / perPage));
  const currentPage = Math.min(page, totalPages);

  const pageItems = useMemo(
    () => payments.slice((currentPage - 1) * perPage, currentPage * perPage),
    [payments, currentPage, perPage],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
        <Receipt className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 md:space-y-3">
        {pageItems.map((p) => {
          const paid = isPaidStatus(p.status);
          const typeLabel = getTypeLabel(p.type);
          const showInvoiceLink = !!p.invoiceUrl && (isPendingStatus(p.status) || !paid);
          return (
            <div
              key={p.id}
              className="flex flex-col gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between md:p-4"
            >
              {/* Esquerda: ícone + valor + meta */}
              <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center md:gap-4">
                <div
                  className={`shrink-0 rounded-lg p-2 ${
                    paid ? 'bg-emerald-600/10 text-emerald-600' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <CreditCard className="h-4 w-4 md:h-5 md:w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-bold md:text-lg">R$ {formatBRL(p.amount)}</p>
                    {typeLabel && (
                      <Badge variant="outline" className="text-[11px] font-medium">
                        {typeLabel}
                      </Badge>
                    )}
                    <span className="sm:hidden">
                      <StatusBadge status={p.status} />
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <p className="text-xs text-muted-foreground">{formatDateTimeBR(p.date)}</p>
                    <span className="text-xs text-muted-foreground">•</span>
                    <p className="text-xs text-muted-foreground">{getMethodLabel(p.billingType)}</p>
                  </div>
                  {showInvoiceLink && (
                    <a
                      href={p.invoiceUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Ver cobrança
                    </a>
                  )}
                </div>
              </div>

              {/* Direita: status (desktop) */}
              <div className="hidden shrink-0 items-center sm:flex">
                <StatusBadge status={p.status} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Paginação */}
      {payments.length > PER_PAGE_OPTIONS[0] && (
        <div className="flex flex-col items-center justify-between gap-3 pt-1 sm:flex-row">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Por página</span>
            <Select
              value={String(perPage)}
              onValueChange={(v) => {
                setPerPage(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[72px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PER_PAGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={String(opt)}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
