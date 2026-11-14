import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, Filter, ListOrdered, Printer, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { usePdvReceiptSettings } from '@/hooks/usePdvReceiptSettings';
import { DEFAULT_PDV_RECEIPT_SETTINGS } from '@/lib/pdv/receipt/model';
import { openPdvOrderReceipt } from '@/components/pdv/receipt/PdvOrderReceiptButton';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { canOperateOtherPdvCash } from '@/components/pdv/caixa-v2/pdvCashAccess';
import { cn } from '@/lib/utils';
import {
  type PdvOrderListRow,
  type PdvOrderPaymentStatus,
  type PdvOrderPickupStatus,
  type PdvOrderStatusKind,
  type PdvOrdersListFilters,
  pdvOrderStatusLabel,
  usePdvOrdersList,
  usePdvOrderWorkspace,
} from '@/hooks/usePdvOrdersList';

const PAGE_SIZE = 25;

export default function PdvOrders() {
  const mobile = useIsMobile();
  const { money, dateTime } = useLocaleFormatters();
  const { roles, permissions, hasPermissionRecord } = useAuth();
  const canFilterOtherCash = canOperateOtherPdvCash({ roles, permissions, hasPermissionRecord });
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('busca') ?? '');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<PdvOrdersListFilters>({
    query: params.get('busca') ?? '', status: params.get('situacao'),
    paymentStatus: params.get('pagamento') as PdvOrderPaymentStatus | null,
    pickupStatus: params.get('retirada') as PdvOrderPickupStatus | null,
    terminalId: null, operatorId: null, from: params.get('inicio'), to: params.get('fim'),
    sort: params.get('ordem') === 'oldest' ? 'oldest' : 'newest', page: 0, pageSize: PAGE_SIZE,
  });
  const selectedId = params.get('pedido');
  const list = usePdvOrdersList(filters);
  const detail = usePdvOrderWorkspace(selectedId);
  const receiptSettings = usePdvReceiptSettings();
  const { toast } = useToast();
  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const mobileDetail = mobile && Boolean(selectedId);

  useEffect(() => {
    const handle = window.setTimeout(() => setFilters((current) => ({ ...current, query: query.trim(), page: 0 })), 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (canFilterOtherCash) return;
    setFilters((current) => current.terminalId || current.operatorId
      ? { ...current, terminalId: null, operatorId: null, page: 0 }
      : current);
  }, [canFilterOtherCash]);

  useEffect(() => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      const sync = (key: string, value: string | null) => value ? next.set(key, value) : next.delete(key);
      sync('busca', filters.query); sync('situacao', filters.status); sync('pagamento', filters.paymentStatus);
      sync('retirada', filters.pickupStatus); sync('inicio', filters.from); sync('fim', filters.to);
      sync('ordem', filters.sort === 'oldest' ? 'oldest' : null);
      return next;
    }, { replace: true });
  }, [filters.from, filters.paymentStatus, filters.pickupStatus, filters.query, filters.sort, filters.status, filters.to, setParams]);

  const activeFilterCount = [filters.status, filters.paymentStatus, filters.pickupStatus, filters.terminalId, filters.operatorId, filters.from, filters.to].filter(Boolean).length;
  const select = (id: string | null) => setParams((current) => { const next = new URLSearchParams(current); if (id) next.set('pedido', id); else next.delete('pedido'); return next; }, { replace: true });
  const generateReceipt = async (row: PdvOrderListRow) => {
    try {
      await openPdvOrderReceipt(row.id, receiptSettings.data?.defaultFormat ?? DEFAULT_PDV_RECEIPT_SETTINGS.defaultFormat);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não foi possível gerar o comprovante', description: error instanceof Error ? error.message : 'Tente novamente.' });
    }
  };
  const setFilter = <K extends keyof PdvOrdersListFilters>(key: K, value: PdvOrdersListFilters[K]) => setFilters((current) => ({ ...current, [key]: value, page: 0 }));

  const detailContent = !selectedId ? <OrderDetailEmpty />
    : detail.isLoading ? <div className="space-y-4 p-5"><Skeleton className="h-20" /><Skeleton className="h-64" /></div>
    : detail.isError || !detail.data ? <div className="space-y-3">{mobile && <Button type="button" variant="ghost" onClick={() => select(null)}><ArrowLeft className="h-4 w-4" />Voltar aos pedidos</Button>}<EmptyState icon={<RefreshCw className="h-12 w-12 text-destructive" />} title="Não foi possível abrir o pedido" description={detail.error instanceof Error ? detail.error.message : 'Ele pode ter saído dos caixas que você pode consultar.'} action={{ label: 'Atualizar', onClick: () => void detail.refetch() }} /></div>
    : <OrderDetail detail={detail.data} money={money} dateTime={dateTime} format={receiptSettings.data?.defaultFormat ?? DEFAULT_PDV_RECEIPT_SETTINGS.defaultFormat} onBack={mobile ? () => select(null) : undefined} />;

  return <div className="space-y-4 pb-20 lg:pb-8" data-pdv-ui>
    {!mobileDetail && <PageHeader title="Pedidos" subtitle="Consulte os pedidos dos caixas permitidos para o seu perfil." icon={ListOrdered} />}
    {!mobileDetail && <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><span className="sr-only">Buscar pedidos</span><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Buscar pedido, cliente ou item" autoComplete="off" /></label>
        <Button type="button" variant="outline" onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters}><Filter className="h-4 w-4" />Filtros{activeFilterCount ? ` (${activeFilterCount})` : ''}</Button>
        <label className="flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm"><SlidersHorizontal className="h-4 w-4" /><span>Ordenar</span><select className="bg-transparent font-medium outline-none" value={filters.sort} onChange={(event) => setFilter('sort', event.target.value as 'newest' | 'oldest')}><option value="newest">Mais novos</option><option value="oldest">Mais antigos</option></select></label>
      </div>
      {showFilters && <div className="grid gap-3 border-y py-4 sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect label="Situação" value={filters.status ?? ''} onChange={(value) => setFilter('status', value || null)} options={[['', 'Todas'], ['rascunho', 'Rascunho'], ['aguardando_pagamento', 'Em aberto'], ['pago', 'Pago'], ['liberado_retirada', 'Liberado'], ['retirada_parcial', 'Retirada parcial'], ['entregue', 'Entregue'], ['cancelado', 'Cancelado'], ['cancelado_parcial', 'Cancelado parcial']]} />
        <FilterSelect label="Pagamento" value={filters.paymentStatus ?? ''} onChange={(value) => setFilter('paymentStatus', (value || null) as PdvOrderPaymentStatus | null)} options={[['', 'Todos'], ['aguardando', 'Aguardando'], ['parcial', 'Parcial'], ['pago', 'Pago'], ['fiado_aprovado', 'Fiado aprovado'], ['reembolso_parcial', 'Reembolso parcial'], ['reembolsado', 'Reembolsado'], ['cancelado', 'Cancelado']]} />
        <FilterSelect label="Retirada" value={filters.pickupStatus ?? ''} onChange={(value) => setFilter('pickupStatus', (value || null) as PdvOrderPickupStatus | null)} options={[['', 'Todas'], ['aguardando_liberacao', 'Aguardando liberação'], ['liberado', 'Liberado'], ['parcial', 'Parcial'], ['entregue', 'Entregue'], ['cancelada', 'Cancelada']]} />
        {list.data?.canFilterCash && <FilterSelect label="Caixa" value={filters.terminalId ?? ''} onChange={(value) => setFilter('terminalId', value || null)} options={[['', 'Todos'], ...list.data.cashOptions.map((option) => [option.id, option.name] as [string, string])]} />}
        {list.data?.canFilterCash && <FilterSelect label="Operador" value={filters.operatorId ?? ''} onChange={(value) => setFilter('operatorId', value || null)} options={[['', 'Todos'], ...list.data.operatorOptions.map((option) => [option.id, option.name] as [string, string])]} />}
        <label className="space-y-1 text-xs font-semibold">De<Input type="date" value={filters.from ?? ''} onChange={(event) => setFilter('from', event.target.value || null)} /></label>
        <label className="space-y-1 text-xs font-semibold">Até<Input type="date" value={filters.to ?? ''} onChange={(event) => setFilter('to', event.target.value || null)} /></label>
      </div>}
    </section>}

    {mobileDetail ? <div className="min-h-[60vh] bg-background">{detailContent}</div> : list.isLoading && !list.data ? <OrdersLoading /> : list.isError ? <EmptyState icon={<RefreshCw className="h-12 w-12 text-destructive" />} title="Não foi possível carregar os pedidos" description={list.error instanceof Error ? list.error.message : 'Nenhum dado foi alterado.'} action={{ label: 'Tentar novamente', onClick: () => void list.refetch() }} /> : <div className="grid min-h-[34rem] overflow-hidden rounded-xl border bg-background lg:grid-cols-[minmax(20rem,25rem)_minmax(0,1fr)]">
      <section className="min-w-0 border-b lg:border-b-0 lg:border-r" aria-label="Lista de pedidos">
        <div className="border-b px-4 py-3"><p className="font-bold">Todos os pedidos</p><p className="text-xs text-muted-foreground">Mostrando {rows.length} de {total} pedidos</p></div>
        {rows.length === 0 ? <div className="p-5"><EmptyState icon={<ListOrdered className="h-12 w-12 text-muted-foreground" />} title="Nenhum pedido encontrado" description="Revise a busca ou os filtros." /></div> : <div className="divide-y">{rows.map((row) => <OrderListItem key={row.id} row={row} selected={row.id === selectedId} money={money} dateTime={dateTime} onOpen={() => select(row.id)} onReceipt={() => void generateReceipt(row)} />)}</div>}
        <div className="flex items-center justify-between gap-2 border-t px-3 py-3 text-sm"><span>Página {filters.page + 1} de {pages}</span><div className="flex gap-1"><Button size="icon" variant="outline" aria-label="Página anterior" disabled={filters.page === 0} onClick={() => setFilter('page', Math.max(0, filters.page - 1))}><ChevronLeft className="h-4 w-4" /></Button><Button size="icon" variant="outline" aria-label="Próxima página" disabled={filters.page + 1 >= pages} onClick={() => setFilter('page', filters.page + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>
      </section>
      <aside className="hidden min-w-0 lg:block">{detailContent}</aside>
    </div>}
  </div>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="space-y-1 text-xs font-semibold">{label}<select className="h-10 w-full rounded-md border bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}

function OrderListItem({ row, selected, money, dateTime, onOpen, onReceipt }: { row: PdvOrderListRow; selected: boolean; money: (value: number) => string; dateTime: (value: string | Date | null | undefined) => string; onOpen: () => void; onReceipt: () => void }) {
  return <article className={cn('relative transition-colors hover:bg-accent', selected && 'bg-primary text-primary-foreground hover:bg-primary')}>
    <button type="button" onClick={onOpen} className="w-full space-y-3 p-4 pr-12 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={`Abrir detalhes do pedido ${row.number}`}>
      <span className="flex items-start justify-between gap-3"><span className="min-w-0"><strong className="block">Pedido #{row.number}</strong><span className={cn('block truncate text-sm', selected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{row.customerName ?? 'Cliente não informado'}</span></span><strong className="shrink-0 tabular-nums">{money(row.total)}</strong></span>
      <span className="flex flex-wrap gap-1.5"><StatusBadge value={row.commercialStatus} kind="commercial" /><StatusBadge value={row.paymentStatus} kind="payment" /><StatusBadge value={row.pickupStatus} kind="pickup" /></span>
      <span className={cn('flex justify-between gap-3 text-xs', selected ? 'text-primary-foreground/75' : 'text-muted-foreground')}><span>{row.cashName ?? row.operatorName ?? 'Venda direta'}</span><span>{dateTime(row.createdAt)}</span></span>
    </button>
    <div className="absolute right-2 top-2"><RowActionsMenu ariaLabel={`Ações do pedido ${row.number}`} triggerClassName={selected ? 'text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground' : undefined} actions={[{ label: 'Ver detalhes', icon: Eye, onClick: onOpen }, { label: 'Gerar comprovante', icon: Printer, onClick: onReceipt, hidden: !row.canGenerateReceipt }]} /></div>
  </article>;
}

function StatusBadge({ value, kind }: { value: string; kind: PdvOrderStatusKind }) {
  const tone = value.includes('cancel') ? 'bg-red-600' : value === 'entregue' || value === 'pago' || value === 'fiado_aprovado' ? 'bg-emerald-600' : value.includes('parcial') || value === 'parcial' ? 'bg-amber-600' : value === 'reembolsado' ? 'bg-violet-700' : kind === 'pickup' ? 'bg-blue-600' : 'bg-slate-700';
  return <span className={cn('inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white', tone)}>{pdvOrderStatusLabel(kind, value)}</span>;
}

function OrderDetail({ detail, money, dateTime, format, onBack }: { detail: NonNullable<ReturnType<typeof usePdvOrderWorkspace>['data']>; money: (value: number) => string; dateTime: (value: string | Date | null | undefined) => string; format: typeof DEFAULT_PDV_RECEIPT_SETTINGS.defaultFormat; onBack?: () => void }) {
  const { toast } = useToast();
  const generateReceipt = async () => {
    try { await openPdvOrderReceipt(detail.order.id, format); }
    catch (error) { toast({ variant: 'destructive', title: 'Não foi possível gerar o comprovante', description: error instanceof Error ? error.message : 'Tente novamente.' }); }
  };
  return <div className="space-y-6 p-4 sm:p-6">
    <header className="flex items-start justify-between gap-3"><div className="flex items-start gap-3">{onBack && <Button type="button" size="icon" variant="ghost" aria-label="Voltar aos pedidos" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>}<div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pedido</p><h2 className="text-2xl font-extrabold">#{detail.order.number}</h2><p className="text-sm text-muted-foreground">{detail.order.customerName ?? 'Cliente não informado'} · {dateTime(detail.order.createdAt)}</p></div></div><RowActionsMenu ariaLabel={`Ações do pedido ${detail.order.number}`} actions={[{ label: 'Gerar comprovante', icon: Printer, onClick: () => void generateReceipt(), hidden: !detail.order.canGenerateReceipt }]} /></header>
    <div className="flex flex-wrap gap-2"><StatusBadge value={detail.order.commercialStatus} kind="commercial" /><StatusBadge value={detail.order.paymentStatus} kind="payment" /><StatusBadge value={detail.order.pickupStatus} kind="pickup" /></div>
    <section><div className="mb-2 flex items-center justify-between"><h3 className="font-bold">Itens</h3><strong className="tabular-nums">{money(detail.order.total)}</strong></div><div className="divide-y border-y">{detail.items.map((item) => <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3"><div><p className="font-medium">{item.description}</p><p className="text-xs text-muted-foreground">{item.quantity} × {money(item.unitPrice)}{item.deliveredQuantity > 0 ? ` · ${item.deliveredQuantity} retirado(s)` : ''}</p></div><strong className="tabular-nums">{money(item.total)}</strong></div>)}</div></section>
    {detail.order.notes && <section><h3 className="font-bold">Observações</h3><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{detail.order.notes}</p></section>}
    <section><h3 className="font-bold">Histórico</h3><ol className="mt-3 space-y-3 border-l pl-4">{detail.timeline.map((event, index) => <li key={`${event.kind}-${event.at}-${index}`} className="relative"><span className="absolute -left-[1.31rem] top-1.5 h-2 w-2 rounded-full bg-primary" /><p className="font-medium">{event.label}</p><p className="text-xs text-muted-foreground">{dateTime(event.at)}</p></li>)}</ol></section>
  </div>;
}

function OrderDetailEmpty() { return <div className="flex min-h-[34rem] items-center justify-center p-5"><EmptyState icon={<ListOrdered className="h-12 w-12 text-muted-foreground" />} title="Selecione um pedido" description="Os itens, o pagamento e a retirada aparecem aqui." /></div>; }
function OrdersLoading() { return <div className="grid min-h-[34rem] gap-4 lg:grid-cols-[25rem_minmax(0,1fr)]"><Skeleton className="h-[34rem]" /><Skeleton className="h-[34rem]" /></div>; }
