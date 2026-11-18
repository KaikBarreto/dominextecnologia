import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BadgeDollarSign,
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Layers3,
  Landmark,
  Plus,
  Receipt,
  Tag,
  Trash2,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  type AdminPaymentDetailResponse,
  type AdminSaleDetail,
  type UnifiedCompanyPayment,
} from '@/hooks/useAdminCompanyPayments';
import { RegisterCompanyPaymentModal } from '@/components/admin/RegisterCompanyPaymentModal';
import type { Database } from '@/integrations/supabase/types';
import { useIsMobile } from '@/hooks/use-mobile';
import { subscriptionModuleDisplayName } from '@/lib/subscriptionCatalog';

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
    case 'SUPERSEDED':
      return <Badge className="bg-muted text-muted-foreground border-0 hover:bg-muted">Substituído</Badge>;
    case 'EXPIRED':
      return <Badge className="bg-muted text-muted-foreground border-0 hover:bg-muted">Expirado</Badge>;
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

function commercialStatusLabel(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    confirmed: 'Confirmada', pending_work: 'Aguardando trabalho comercial',
    pending: 'Pendente', paid: 'Paga', voided: 'Estornada',
  };
  return labels[(value || '').toLowerCase()] || value || '—';
}

function SaleDetailSection({
  sale,
  view,
}: {
  sale: AdminSaleDetail;
  view: 'commercial' | 'financial' | 'technical';
}) {
  const commercial = sale.commercial;
  const affiliate = sale.affiliate_commission;
  const financial = sale.financial_transaction;
  const processor = sale.processor;
  const fiscal = sale.payment.fiscal || processor?.fiscal;
  const traceIds = [
    ['Pagamento', sale.payment.id], ['Venda comercial', commercial?.id],
    ['Lançamento financeiro', financial?.id], ['Comissão de afiliado', affiliate?.id],
    ['Asaas', processor?.asaas_payment_id || sale.payment.asaas_payment_id],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <section className="space-y-6">
      {view === 'commercial' && <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><BriefcaseBusiness className="h-4 w-4 text-primary" /><p className="font-semibold">Detalhes da venda</p></div>
        <Badge variant="outline" className="border-primary/30 text-primary">Primeira venda</Badge>
      </div>
      <div className="space-y-6">
        <div className="grid gap-x-6 gap-y-4 border-b pb-6 sm:grid-cols-2 lg:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Origem comercial</p><p className="mt-1 font-medium">{commercial?.customer_origin || sale.payment.origin || 'Não informada'}</p></div>
          <div><p className="text-xs text-muted-foreground">Venda registrada em</p><p className="mt-1 font-medium">{formatPaymentDate(commercial?.created_at || sale.payment.payment_date || null)}</p></div>
          <div><p className="text-xs text-muted-foreground">Registrada por</p><p className="mt-1 font-medium">{commercial?.registered_by?.name || sale.payment.registered_by?.name || 'Não identificado'}</p></div>
        </div>

        {commercial ? (
          <div>
            <div className="flex items-center gap-2"><BadgeDollarSign className="h-4 w-4" /><p className="font-semibold">Comercial e comissão</p></div>
            <div className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div><p className="text-muted-foreground">Closer / vendedor</p><p className="font-medium">{commercial.seller.name}</p></div>
              {commercial.sdr && <div><p className="text-muted-foreground">SDR</p><p className="font-medium">{commercial.sdr.name}</p></div>}
              <div><p className="text-muted-foreground">Ciclo vendido</p><p className="font-medium">{cycleLabel(commercial.billing_cycle)}</p></div>
              <div><p className="text-muted-foreground">Valor recebido</p><p className="font-medium">{money(commercial.paid_amount)}</p></div>
              <div><p className="text-muted-foreground">Base da comissão</p><p className="font-medium">{money(commercial.commission_base)}</p></div>
              <div><p className="text-muted-foreground">Comissão total</p><p className="font-medium">{money(commercial.commission_amount)}</p></div>
              {commercial.seller_commission != null && <div><p className="text-muted-foreground">Comissão do closer</p><p className="font-medium">{money(commercial.seller_commission)}</p></div>}
              {commercial.sdr_commission != null && <div><p className="text-muted-foreground">Comissão do SDR</p><p className="font-medium">{money(commercial.sdr_commission)}</p></div>}
              <div><p className="text-muted-foreground">Status da comissão</p><p className="font-medium">{commercialStatusLabel(commercial.status)}</p></div>
              {commercial.released_at && <div><p className="text-muted-foreground">Liberada em</p><p className="font-medium">{formatPaymentDate(commercial.released_at)}</p></div>}
            </div>
          </div>
        ) : sale.commercial_match_quality === 'ambiguous' ? (
          <div className="rounded-lg bg-warning/10 px-4 py-3 text-sm">Existem {sale.commercial_candidate_count} registros comerciais possíveis nesta empresa; nenhum vendedor foi atribuído sem prova suficiente.</div>
        ) : (
          <p className="text-sm text-muted-foreground">Esta venda não gerou registro de comissão comercial.</p>
        )}

        {affiliate && (
          <div className="border-t pt-6">
            <p className="font-semibold">Afiliado</p>
            <div className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div><p className="text-muted-foreground">Afiliado responsável</p><p className="font-medium">{affiliate.affiliate.name}</p></div>
              <div><p className="text-muted-foreground">Base</p><p className="font-medium">{money(affiliate.base_amount)}</p></div>
              <div><p className="text-muted-foreground">Percentual</p><p className="font-medium">{Number(affiliate.pct_applied).toLocaleString('pt-BR')}%</p></div>
              <div><p className="text-muted-foreground">Comissão</p><p className="font-medium">{money(affiliate.commission_amount)}</p></div>
              <div><p className="text-muted-foreground">Tipo</p><p className="font-medium">{affiliate.kind === 'first' ? 'Primeira venda' : 'Recorrente'}</p></div>
              <div><p className="text-muted-foreground">Status</p><p className="font-medium">{commercialStatusLabel(affiliate.status)}</p></div>
            </div>
          </div>
        )}
      </div>
      </>}

      {view === 'financial' && <div className="space-y-6">
        {(financial || processor) ? (
          <div>
            <div className="flex items-center gap-2"><Landmark className="h-4 w-4" /><p className="font-semibold">Recebimento e financeiro</p></div>
            <div className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {processor && <><div><p className="text-muted-foreground">Status no Asaas</p><p className="font-medium">{processor.status || '—'}</p></div><div><p className="text-muted-foreground">Vencimento</p><p className="font-medium">{formatPaymentDate(processor.due_date || null)}</p></div><div><p className="text-muted-foreground">Recebido no Asaas</p><p className="font-medium">{formatPaymentDate(processor.paid_at || null)}</p></div></>}
              {financial && <><div><p className="text-muted-foreground">Descrição financeira</p><p className="font-medium">{financial.description || 'Venda'}</p></div><div><p className="text-muted-foreground">Data do lançamento</p><p className="font-medium">{formatPaymentDate(financial.transaction_date || null)}</p></div><div><p className="text-muted-foreground">Registrado por</p><p className="font-medium">{financial.registered_by?.name || 'Não identificado'}</p></div></>}
            </div>
            {processor?.invoice_url && <Button asChild variant="outline" size="sm" className="mt-4"><a href={processor.invoice_url} target="_blank" rel="noopener noreferrer">Abrir cobrança no Asaas</a></Button>}
          </div>
        ) : <p className="text-sm text-muted-foreground">Nenhum lançamento financeiro vinculado a esta venda.</p>}

        <div className="border-t pt-6">
          <div className="flex items-center gap-2"><Receipt className="h-4 w-4" /><p className="font-semibold">Nota fiscal</p></div>
          {fiscal && Object.values(fiscal).some(Boolean) ? <>
            <div className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2"><div><p className="text-muted-foreground">Status</p><p className="font-medium">{fiscal.status || 'Não emitida'}</p></div><div><p className="text-muted-foreground">Número</p><p className="font-medium">{fiscal.number || '—'}</p></div></div>
            <div className="mt-4 flex flex-wrap gap-2">{fiscal.pdf_url && <Button asChild variant="outline" size="sm"><a href={fiscal.pdf_url} target="_blank" rel="noopener noreferrer">Baixar PDF</a></Button>}{fiscal.xml_url && <Button asChild variant="outline" size="sm"><a href={fiscal.xml_url} target="_blank" rel="noopener noreferrer">Baixar XML</a></Button>}</div>
            {fiscal.error && <p className="mt-3 text-sm text-destructive">{fiscal.error}</p>}
          </> : <p className="mt-3 text-sm text-muted-foreground">Nenhuma nota fiscal vinculada a este pagamento.</p>}
        </div>
      </div>}

      {view === 'technical' && (
        <div className="text-sm">
          <p className="font-semibold">Rastreabilidade técnica</p>
          <dl className="mt-4 divide-y">
            {traceIds.map(([label, value]) => <div key={label} className="grid gap-1 py-3 first:pt-0 sm:grid-cols-[150px_1fr]"><dt className="text-muted-foreground">{label}</dt><dd className="break-all font-mono text-xs">{value}</dd></div>)}
            <div className="grid gap-1 py-3 sm:grid-cols-[150px_1fr]"><dt className="text-muted-foreground">Vínculo comercial</dt><dd>{sale.commercial_match_quality}</dd></div>
            <div className="grid gap-1 py-3 sm:grid-cols-[150px_1fr]"><dt className="text-muted-foreground">Vínculo financeiro</dt><dd>{sale.financial_match_quality}</dd></div>
          </dl>
        </div>
      )}
    </section>
  );
}

function ContractCompositionSection({
  detail,
  payment,
}: {
  detail: AdminPaymentDetailResponse;
  payment: UnifiedCompanyPayment;
}) {
  const snapshot = detail.snapshot || {};
  const modules = (snapshot.modules || []).filter((module) => module.code !== 'extra_user');
  const promotions = snapshot.promotions || [];
  const unavailable = detail.quality === 'legacy_unavailable';
  const hasPlan = Boolean(snapshot.plan?.label || snapshot.plan?.code);
  const hasCycle = Boolean(snapshot.installment || snapshot.billing_cycle);
  const paidAmount = Number(snapshot.amounts?.paid ?? payment.amount);
  const moduleTotal = modules.reduce(
    (total, module) => total + Number(module.unit_price || 0) * Number(module.quantity || 1),
    0,
  );
  const allModulesPriced = modules.length > 0 && modules.every((module) => module.unit_price != null);
  const extraUsers = Number(snapshot.users?.extra || 0);
  const extraUserPrice = snapshot.users?.extra_unit_price;
  const extraUsersTotal = extraUserPrice == null ? 0 : extraUsers * Number(extraUserPrice);
  const discount = Number(snapshot.amounts?.discount || 0);
  const identifiedTotal = moduleTotal + extraUsersTotal - discount;
  const isAnnual = ['yearly', 'annual', 'anual'].includes((snapshot.billing_cycle || '').toLowerCase());
  const canCompareWithPaid = allModulesPriced && !isAnnual && !snapshot.installment;
  const unexplainedAmount = canCompareWithPaid ? paidAmount - identifiedTotal : 0;
  const hasUnexplainedAmount = Math.abs(unexplainedAmount) >= 0.01;

  if (unavailable) {
    return (
      <div className="rounded-xl bg-muted/40 p-5">
        <p className="font-medium">Composição não registrada nessa época</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          O valor, a data e a forma de pagamento são confiáveis. Módulos, usuários e promoções não são
          preenchidos com a configuração atual para evitar mostrar uma informação incorreta.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /><h3 className="font-semibold">O que formou este pagamento</h3></div>
        <div className="mt-4 grid gap-x-6 gap-y-4 border-b pb-6 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {hasPlan && <div><p className="text-muted-foreground">Plano</p><p className="mt-1 font-medium">{snapshot.plan?.label || planLabel(snapshot.plan?.code)}</p></div>}
          {hasCycle && <div><p className="text-muted-foreground">Ciclo</p><p className="mt-1 font-medium">{snapshot.installment ? `Parcela ${snapshot.installment.number}/${snapshot.installment.total} do anual` : cycleLabel(snapshot.billing_cycle)}</p></div>}
          <div><p className="text-muted-foreground">Total pago</p><p className="mt-1 text-base font-semibold tabular-nums">{money(paidAmount)}</p></div>
          {discount > 0 && snapshot.amounts?.base != null && <div><p className="text-muted-foreground">Preço cheio antes do desconto</p><p className="mt-1 font-medium tabular-nums">{money(snapshot.amounts.base)}</p></div>}
          {isAnnual && snapshot.amounts?.subscription != null && <div><p className="text-muted-foreground">Valor do período</p><p className="mt-1 font-medium tabular-nums">{money(snapshot.amounts.subscription)}</p></div>}
        </div>
      </section>

      <section aria-labelledby="payment-breakdown-title">
        <div className="flex items-center gap-2"><Layers3 className="h-4 w-4" /><p id="payment-breakdown-title" className="font-semibold">Composição do valor</p></div>
        <div className="mt-3 divide-y text-sm">
          {modules.map((module) => {
            const quantity = Number(module.quantity || 1);
            const lineTotal = module.unit_price == null ? null : Number(module.unit_price) * quantity;
            return (
              <div key={module.code} className="flex items-start justify-between gap-4 py-3 first:pt-0">
                <div className="min-w-0">
                  <p className="font-medium">{subscriptionModuleDisplayName(module.code, module.name || module.code)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {module.price_detail || (quantity > 1 ? `${quantity} × ${money(module.unit_price)}` : 'Módulo mensal')}
                  </p>
                </div>
                <span className="shrink-0 font-medium tabular-nums">{lineTotal == null ? '—' : money(lineTotal)}</span>
              </div>
            );
          })}

          <div className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><Users className="h-4 w-4" /><p className="font-medium">Usuários adicionais</p></div>
              {snapshot.users ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {extraUsers > 0 && extraUserPrice != null
                    ? `${extraUsers} × ${money(extraUserPrice)} por mês${snapshot.users.limit != null ? ` · limite total ${snapshot.users.limit}` : ''}`
                    : `Nenhum adicional cobrado${snapshot.users.limit != null ? ` · limite total ${snapshot.users.limit}` : ''}`}
                </p>
              ) : <p className="mt-0.5 text-xs text-muted-foreground">Sem evidência histórica de cobrança adicional por usuário.</p>}
            </div>
            <span className="shrink-0 font-medium tabular-nums">{snapshot.users && extraUserPrice != null ? money(extraUsersTotal) : '—'}</span>
          </div>

          {discount > 0 && <div className="flex items-center justify-between gap-4 py-3 text-success"><div className="flex items-center gap-2"><Tag className="h-4 w-4" /><span className="font-medium">Descontos e promoções</span></div><span className="font-semibold tabular-nums">-{money(discount)}</span></div>}

          {allModulesPriced && <div className="flex items-center justify-between gap-4 py-3"><span className="font-medium">{isAnnual || snapshot.installment ? 'Composição mensal identificada' : 'Total identificado'}</span><span className="font-semibold tabular-nums">{money(identifiedTotal)}</span></div>}

          {hasUnexplainedAmount && (
            <div className="flex items-start justify-between gap-4 bg-warning/10 px-3 py-3">
              <div><p className="font-medium">{unexplainedAmount < 0 ? 'Desconto ou ajuste sem registro histórico' : 'Parte sem detalhamento histórico'}</p><p className="mt-0.5 text-xs text-muted-foreground">{unexplainedAmount < 0 ? 'O cliente pagou menos que a soma identificada, mas a condição comercial da época não foi preservada.' : 'O pagamento é confirmado, mas o item que explica esta diferença não foi preservado no snapshot antigo.'}</p></div>
              <span className="shrink-0 font-semibold tabular-nums">{money(unexplainedAmount)}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 pt-4 text-base"><span className="font-semibold">Total pago</span><span className="font-bold tabular-nums">{money(paidAmount)}</span></div>
        </div>
      </section>

      <section className="border-t pt-6">
        <div className="flex items-center gap-2"><Tag className="h-4 w-4" /><p className="font-semibold">Promoções</p></div>
        {promotions.length > 0 ? (
          <div className="mt-3 space-y-3">
            {promotions.map((promotion, index) => (
              <div key={`${promotion.scope_type}-${promotion.module_code || index}`} className="rounded-lg bg-success/5 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-medium">{promotion.module_name || promotion.module_code || 'Assinatura'}</p><p className="mt-0.5 text-xs text-muted-foreground">Ciclo {promotion.cycle_number} de {promotion.billing_cycles}</p></div>
                  <span className="text-sm font-semibold text-success">Economia de {money(promotion.discount)}</span>
                </div>
                <p className="mt-2 text-sm"><span className="text-muted-foreground line-through">{money(promotion.standard_unit_price)}</span><span className="ml-2 font-semibold">{money(promotion.promotional_unit_price)}</span>{promotion.quantity > 1 ? ` × ${promotion.quantity}` : ''}</p>
                {promotion.reason && <p className="mt-1 text-xs text-muted-foreground">{promotion.reason}</p>}
              </div>
            ))}
          </div>
        ) : <p className="mt-3 text-sm text-muted-foreground">{detail.quality === 'partial' ? 'Sem registro histórico de promoção para esta cobrança.' : 'Nenhuma promoção aplicada nesta cobrança.'}</p>}
      </section>

      {detail.quality === 'partial' && <div className="rounded-lg bg-warning/10 px-4 py-3 text-sm">Composição reconstruída pelo histórico e pelo catálogo. Itens sem prova suficiente aparecem como diferença, nunca como módulo inventado.</div>}
      {payment.notes && <section className="border-t pt-6"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Observações</p><p className="mt-2 whitespace-pre-wrap text-sm">{payment.notes}</p></section>}
    </div>
  );
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

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-5">
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

      <Tabs defaultValue="charge" className="flex min-h-0 flex-1 flex-col">
        <div className="px-5 pt-4">
          <TabsList variant="underline" className="w-full">
            <TabsTrigger value="charge" variant="underline" level="section">Cobrança</TabsTrigger>
            {data.sale && <TabsTrigger value="sale" variant="underline" level="section">Venda</TabsTrigger>}
            <TabsTrigger value="financial" variant="underline" level="section">Financeiro e nota</TabsTrigger>
            <TabsTrigger value="technical" variant="underline" level="section">Dados técnicos</TabsTrigger>
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="charge" className="m-0 p-5"><ContractCompositionSection detail={data} payment={payment} /></TabsContent>
          {data.sale && <TabsContent value="sale" className="m-0 p-5"><SaleDetailSection sale={data.sale} view="commercial" /></TabsContent>}
          <TabsContent value="financial" className="m-0 space-y-6 p-5">
            {data.sale ? <SaleDetailSection sale={data.sale} view="financial" /> : <p className="text-sm text-muted-foreground">Nenhum detalhe financeiro adicional vinculado.</p>}
            {payment.invoiceUrl && <Button asChild variant="outline" className="gap-2"><a href={payment.invoiceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Abrir fatura no Asaas</a></Button>}
          </TabsContent>
          <TabsContent value="technical" className="m-0 p-5">
            {data.sale ? <SaleDetailSection sale={data.sale} view="technical" /> : (
              <dl className="divide-y text-sm">
                <div className="grid gap-1 py-3 first:pt-0 sm:grid-cols-[150px_1fr]"><dt className="text-muted-foreground">Pagamento</dt><dd className="break-all font-mono text-xs">{payment.id}</dd></div>
                <div className="grid gap-1 py-3 sm:grid-cols-[150px_1fr]"><dt className="text-muted-foreground">Origem</dt><dd>{payment.source === 'asaas' ? 'Asaas' : 'Manual'}</dd></div>
              </dl>
            )}
          </TabsContent>
        </div>
      </Tabs>
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
