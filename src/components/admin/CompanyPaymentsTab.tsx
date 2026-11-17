import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Layers3,
  Plus,
  Receipt,
  Tag,
  Trash2,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { useAdminPermissions } from '@/hooks/useAdminPermissions';
import {
  useAdminCompanyPayments,
  useAdminCompanyPaymentDetail,
  mapPaymentRpcError,
  type UnifiedCompanyPayment,
} from '@/hooks/useAdminCompanyPayments';
import { RegisterCompanyPaymentModal } from '@/components/admin/RegisterCompanyPaymentModal';
import type { Database } from '@/integrations/supabase/types';
import { useIsMobile } from '@/hooks/use-mobile';

interface CompanyPaymentsTabProps {
  companyId: string;
  company: Database['public']['Tables']['companies']['Row'];
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

function money(value: number | null | undefined): string {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function cycleLabel(cycle: string | null | undefined): string {
  const normalized = (cycle || '').toLowerCase();
  if (['yearly', 'annual', 'anual'].includes(normalized)) return 'Anual à vista';
  if (['monthly', 'mensal'].includes(normalized)) return 'Mensal';
  return cycle || 'Não identificado';
}

function planLabel(code: string | null | undefined): string {
  if (!code) return 'Plano não identificado';
  return code.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function PaymentDetailPanel({ companyId, payment }: { companyId: string; payment: UnifiedCompanyPayment }) {
  const { data, isLoading, isError, refetch } = useAdminCompanyPaymentDetail(companyId, payment);

  if (isLoading) {
    return (
      <div className="space-y-4 p-5">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="h-7 w-7 text-destructive" />
        <div>
          <p className="font-medium">Não foi possível carregar o detalhe</p>
          <p className="mt-1 text-sm text-muted-foreground">O resumo do pagamento continua disponível.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
      </div>
    );
  }

  const snapshot = data.snapshot || {};
  const modules = snapshot.modules || [];
  const promotions = snapshot.promotions || [];
  const unavailable = data.quality === 'legacy_unavailable';

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-muted/25 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Valor pago</p>
            <p className="mt-1 text-3xl font-bold tracking-tight">{money(payment.amount)}</p>
          </div>
          <StatusBadge status={payment.status} />
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" /> {formatPaymentDate(payment.date)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CreditCard className="h-4 w-4" /> {getMethodLabel(payment)}
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {unavailable ? (
          <div className="rounded-xl border border-dashed bg-muted/25 p-5">
            <p className="font-medium">Detalhamento histórico indisponível</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Este pagamento é anterior ao registro da composição da assinatura. O valor, a data e a forma
              de pagamento são confiáveis; módulos e usuários não serão estimados pela configuração atual.
            </p>
          </div>
        ) : (
          <>
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cobrança</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Plano</p>
                  <p className="mt-1 font-semibold">{snapshot.plan?.label || planLabel(snapshot.plan?.code)}</p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Ciclo</p>
                  <p className="mt-1 font-semibold">
                    {snapshot.installment
                      ? `Parcela ${snapshot.installment.number}/${snapshot.installment.total} do anual`
                      : cycleLabel(snapshot.billing_cycle)}
                  </p>
                </div>
              </div>
            </section>

            {snapshot.users && (
              <section className="rounded-xl border p-4">
                <div className="flex items-center gap-2"><Users className="h-4 w-4" /><p className="font-semibold">Usuários</p></div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-muted-foreground">Limite contratado</p><p className="font-medium">{snapshot.users.limit ?? '—'}</p></div>
                  <div><p className="text-muted-foreground">Adicionais</p><p className="font-medium">{snapshot.users.extra ?? 0}</p></div>
                </div>
              </section>
            )}

            <section>
              <div className="flex items-center gap-2"><Layers3 className="h-4 w-4" /><p className="font-semibold">Módulos incluídos</p></div>
              {modules.length > 0 ? (
                <div className="mt-2 divide-y rounded-xl border">
                  {modules.map((module) => (
                    <div key={module.code} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{module.name || module.code}</p>
                        {(module.quantity || 1) > 1 && <p className="text-xs text-muted-foreground">Quantidade: {module.quantity}</p>}
                      </div>
                      {module.unit_price != null && <span className="shrink-0 text-muted-foreground">{money(module.unit_price)}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">Nenhum módulo individual foi registrado para esta cobrança.</p>
              )}
            </section>

            {promotions.length > 0 && (
              <section>
                <div className="flex items-center gap-2"><Tag className="h-4 w-4" /><p className="font-semibold">Promoção aplicada</p></div>
                <div className="mt-2 space-y-2">
                  {promotions.map((promotion, index) => (
                    <div key={`${promotion.scope_type}-${promotion.module_code || index}`} className="rounded-xl border border-success/30 bg-success/5 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{promotion.module_name || promotion.module_code || 'Assinatura'}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">Ciclo {promotion.cycle_number} de {promotion.billing_cycles}</p>
                        </div>
                        <Badge variant="outline" className="border-success text-success">-{money(promotion.discount)}</Badge>
                      </div>
                      <p className="mt-2 text-sm">
                        <span className="text-muted-foreground line-through">{money(promotion.standard_unit_price)}</span>
                        <span className="ml-2 font-semibold">{money(promotion.promotional_unit_price)}</span>
                        {promotion.quantity > 1 ? ` × ${promotion.quantity}` : ''}
                      </p>
                      {promotion.reason && <p className="mt-1 text-xs text-muted-foreground">{promotion.reason}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {data.quality === 'partial' && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm">
            Este pagamento possui apenas os detalhes históricos que puderam ser comprovados.
          </div>
        )}

        {payment.notes && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Observações</p>
            <p className="mt-2 whitespace-pre-wrap rounded-xl border p-3 text-sm">{payment.notes}</p>
          </section>
        )}

        {payment.invoiceUrl && (
          <Button asChild variant="outline" className="w-full gap-2">
            <a href={payment.invoiceUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> Abrir fatura no Asaas
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

export function CompanyPaymentsTab({ companyId, company }: CompanyPaymentsTabProps) {
  const { toast } = useToast();
  const { hasFunctionAccess } = useAdminPermissions();
  const canRegisterPayment = hasFunctionAccess('admin_empresas_pagamento');
  const { payments, isLoading, deletePayment } = useAdminCompanyPayments(companyId);
  const isMobile = useIsMobile();
  const [showRegister, setShowRegister] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<UnifiedCompanyPayment | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  useEffect(() => {
    if (payments.length === 0) {
      setSelectedKey(null);
      return;
    }
    if (!selectedKey || !payments.some((payment) => `${payment.source}-${payment.id}` === selectedKey)) {
      setSelectedKey(`${payments[0].source}-${payments[0].id}`);
    }
  }, [payments, selectedKey]);

  const selectedPayment = payments.find((payment) => `${payment.source}-${payment.id}` === selectedKey) || payments[0];

  const selectPayment = (payment: UnifiedCompanyPayment) => {
    setSelectedKey(`${payment.source}-${payment.id}`);
    if (isMobile) setMobileDetailOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!paymentToDelete) return;
    deletePayment.mutate(paymentToDelete.id, {
      onSuccess: ({ syncWarning }) => {
        toast(syncWarning
          ? { variant: 'destructive', title: 'Pagamento excluído com pendência', description: syncWarning }
          : { title: 'Pagamento excluído', description: 'Valores, vencimento e condição promocional foram estornados.' });
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
        {canRegisterPayment && (
          <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setShowRegister(true)}>
            <Plus className="h-4 w-4" /> Registrar Pagamento
          </Button>
        )}
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
        <div className="grid overflow-hidden rounded-2xl border bg-card lg:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.65fr)]">
          <div className="border-r-0 lg:border-r">
            <div className="border-b bg-muted/25 px-4 py-3">
              <p className="font-semibold">Pagamentos</p>
              <p className="text-xs text-muted-foreground">{payments.length} registro{payments.length === 1 ? '' : 's'}</p>
            </div>
            <div className="max-h-[680px] space-y-1 overflow-y-auto p-2">
              {payments.map((payment) => {
                const key = `${payment.source}-${payment.id}`;
                const active = key === `${selectedPayment?.source}-${selectedPayment?.id}`;
                const cancelled = payment.status === 'CANCELLED';
                return (
                  <div key={key} className={cn('group relative', cancelled && 'opacity-60')}>
                    <button
                      type="button"
                      onClick={() => selectPayment(payment)}
                      className={cn(
                        'w-full rounded-xl border border-transparent px-3 py-3 pr-10 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active && 'border-foreground/20 bg-foreground/[0.04]',
                      )}
                      aria-pressed={active}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <StatusBadge status={payment.status} />
                        <span className="text-base font-bold">{money(payment.amount)}</span>
                      </div>
                      <p className="mt-2 truncate text-sm font-medium">{getTypeLabel(payment)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatPaymentDate(payment.date)} • {getMethodLabel(payment)}
                      </p>
                      <ChevronRight className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </button>
                    {payment.source === 'manual' && (
                      <Button
                        variant="destructive-ghost"
                        size="icon"
                        className="absolute bottom-2 right-2 z-10 h-8 w-8 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100"
                        title="Excluir pagamento"
                        disabled={deletePayment.isPending}
                        onClick={(event) => {
                          event.stopPropagation();
                          setPaymentToDelete(payment);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="hidden min-h-[560px] lg:block">
            <PaymentDetailPanel companyId={companyId} payment={selectedPayment} />
          </div>
        </div>
      )}

      {selectedPayment && (
        <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
          <SheetContent side="right" className="w-full max-w-none p-0 sm:max-w-none lg:hidden">
            <SheetHeader className="sr-only">
              <SheetTitle>Detalhe do pagamento</SheetTitle>
              <SheetDescription>Composição histórica do pagamento selecionado.</SheetDescription>
            </SheetHeader>
            <PaymentDetailPanel companyId={companyId} payment={selectedPayment} />
          </SheetContent>
        </Sheet>
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
