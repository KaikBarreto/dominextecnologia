import '@/components/pdv/PdvWorkspace.css';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownUp, ArrowLeft, ChevronLeft, ChevronRight, ListOrdered, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { SearchField, SearchFieldAction } from '@/components/ui/search-field-actions';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PdvWorkspaceViewToggle } from '@/components/pdv/flow/PdvWorkspaceViewToggle';
import { PdvFullSalesFlow } from '@/components/pdv/flow/PdvFullSalesFlow';
import { pdvFlowCardDestination } from '@/components/pdv/flow/pdvFlowNavigation';
import { usePdvCounterCapability } from '@/hooks/usePdvCounterFlow';
import { FilterButton } from '@/components/ui/FilterButton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { usePdvOrderReceiptSnapshot } from '@/hooks/usePdvOrderReceiptSnapshot';
import { pdvOrderCurrentState, pdvOrderHasSeparatePickup } from '@/lib/pdv/orderPresentation';
import { DatePicker } from '@/components/ui/DatePicker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PdvPageSkeleton, PdvListRowsSkeleton } from '@/components/pdv/loading/PdvPageSkeleton';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { usePdvReceiptSettings } from '@/hooks/usePdvReceiptSettings';
import { DEFAULT_PDV_RECEIPT_SETTINGS } from '@/lib/pdv/receipt/model';
import { openPdvOrderReceipt } from '@/components/pdv/receipt/PdvOrderReceiptButton';
import { PdvOrderActionsMenu, type PdvOrderActionsMenuProps } from '@/components/pdv/PdvOrderActionsMenu';
import { PdvOrderCancelDialog } from '@/components/pdv/PdvOrderCancelDialog';
import { PdvReturnsPanel } from '@/components/pdv/returns/PdvReturnsPanel';
import { PdvAfterSalePanel } from '@/components/pdv/after-sale/PdvAfterSalePanel';
import { derivePdvReturnsAccess, usePdvReturnsFeature } from '@/hooks/usePdvReturns';
import { derivePdvAfterSaleAccess, usePdvAfterSaleFeature } from '@/hooks/usePdvAfterSale';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { canOperateOtherPdvCash } from '@/components/pdv/caixa-v2/pdvCashAccess';
import { cn } from '@/lib/utils';
import { resolveRequestedPdvOrderId } from '@/lib/pdv/pdvDeepLinks';
import { canCancelPdvOrder } from '@/lib/pdv/orderCancellation';
import {
  type PdvOrderListRow,
  type PdvOrderPaymentStatus,
  type PdvOrderPickupStatus,
  type PdvOrdersListFilters,
  pdvOrderStatusLabel,
  usePdvOrdersList,
  usePdvOrderWorkspace,
  usePdvCancelOrder,
} from '@/hooks/usePdvOrdersList';

const PAGE_SIZE = 25;
type OrderSection = 'details' | 'payments' | 'delivery' | 'history' | 'returns' | 'values';
const SECTION_PARAM: Record<OrderSection, string | null> = { details: null, payments: 'pagamentos', delivery: 'retirada', history: 'historico', returns: 'devolucoes', values: 'valores' };

export default function PdvOrders() {
  const mobile = useIsMobile();
  const [view, setView] = useState<'list' | 'flow'>('list');
  const [cancelTarget, setCancelTarget] = useState<{ id: string; number: number } | null>(null);
  const capability = usePdvCounterCapability();
  const navigate = useNavigate();
  const { money, dateTime } = useLocaleFormatters();
  const { roles, permissions, hasPermissionRecord, profile, hasScreenAccess, isAdminOrGestor } = useAuth();
  const returnsFeature = usePdvReturnsFeature(profile?.company_id);
  const afterSaleFeature = usePdvAfterSaleFeature(profile?.company_id);
  const privileged = isAdminOrGestor() || roles.includes('super_admin');
  const returnsAccess = derivePdvReturnsAccess({ featureEnabled: returnsFeature.data === true, privileged, hasPermissionRecord, permissions });
  const afterSaleAccess = derivePdvAfterSaleAccess({ featureEnabled: afterSaleFeature.data === true, privileged, hasPermissionRecord, permissions });
  const canFilterOtherCash = canOperateOtherPdvCash({ roles, permissions, hasPermissionRecord });
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('busca') ?? '');
  const [filters, setFilters] = useState<PdvOrdersListFilters>({
    query: params.get('busca') ?? '', status: params.get('situacao'),
    paymentStatus: params.get('pagamento') as PdvOrderPaymentStatus | null,
    pickupStatus: params.get('retirada') as PdvOrderPickupStatus | null,
    terminalId: null, operatorId: null, from: params.get('inicio'), to: params.get('fim'),
    sort: params.get('ordem') === 'oldest' ? 'oldest' : 'newest', page: 0, pageSize: PAGE_SIZE,
  });
  const selectedId = resolveRequestedPdvOrderId(params);
  const section: OrderSection = (Object.keys(SECTION_PARAM) as OrderSection[]).find(key => SECTION_PARAM[key] === params.get('acao')) ?? 'details';
  const list = usePdvOrdersList(filters);
  const detail = usePdvOrderWorkspace(selectedId);
  const cancelOrder = usePdvCancelOrder();
  const receiptSettings = usePdvReceiptSettings();
  const { toast } = useToast();
  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canViewFlow = capability.data?.counterEnabled === true && hasScreenAccess('screen:pdv_orders');
  const activeView = view === 'flow' && canViewFlow ? 'flow' : 'list';
  const mobileDetail = activeView === 'list' && mobile && Boolean(selectedId);

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
  const select = (id: string | null) => setParams((current) => { const next = new URLSearchParams(current); next.delete('order'); next.delete('acao'); if (id) next.set('pedido', id); else next.delete('pedido'); return next; }, { replace: true });
  const generateReceipt = async (row: PdvOrderListRow) => {
    try {
      await openPdvOrderReceipt(row.id, receiptSettings.data?.defaultFormat ?? DEFAULT_PDV_RECEIPT_SETTINGS.defaultFormat);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não foi possível gerar o comprovante', description: error instanceof Error ? error.message : 'Tente novamente.' });
    }
  };
  const setFilter = <K extends keyof PdvOrdersListFilters>(key: K, value: PdvOrdersListFilters[K]) => setFilters((current) => ({ ...current, [key]: value, page: 0 }));
  const confirmCancellation = async (reason: string | null) => {
    if (!cancelTarget) return;
    try {
      await cancelOrder.mutateAsync({ orderId: cancelTarget.id, reason });
      setCancelTarget(null);
      toast({ title: `Pedido #${cancelTarget.number} cancelado`, description: 'O estoque e os valores relacionados foram estornados.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não foi possível cancelar o pedido', description: error instanceof Error ? error.message : 'Nenhum valor foi alterado.' });
    }
  };

  const openSection = (id: string, nextSection: OrderSection) => setParams(current => {
    const next = new URLSearchParams(current); next.set('pedido', id); next.delete('order');
    if (SECTION_PARAM[nextSection]) next.set('acao', SECTION_PARAM[nextSection]!); else next.delete('acao');
    return next;
  }, { replace: true });
  const orderActions = (row: PdvOrderListRow): PdvOrderActionsMenuProps => {
    const confirmed = canCancelPdvOrder(row.commercialStatus);
    return { orderId: row.id, orderNumber: row.number, canGenerateReceipt: row.canGenerateReceipt,
      onView: () => openSection(row.id, 'details'), onReceipt: () => void generateReceipt(row),
      onReceive: (privileged || hasScreenAccess('screen:pdv')) && ['aguardando', 'parcial'].includes(row.paymentStatus) ? () => navigate(`/pdv?fila=1&pedido=${encodeURIComponent(row.id)}`) : undefined,
      onPickup: (privileged || hasScreenAccess('screen:pdv_dispatch')) && ['liberado', 'parcial'].includes(row.pickupStatus) ? () => navigate(`/pdv/expedicao?pedido=${encodeURIComponent(row.id)}`) : undefined,
      onReturns: row.commercialStatus !== 'cancelado' && returnsAccess.enabled && (confirmed && (returnsAccess.canReturn || returnsAccess.canReverse) || returnsAccess.canCancelResidual) ? () => openSection(row.id, 'returns') : undefined,
      onValues: confirmed && afterSaleAccess.enabled && afterSaleAccess.canView ? () => openSection(row.id, 'values') : undefined,
      onCancel: confirmed ? () => setCancelTarget({ id: row.id, number: row.number }) : undefined,
    };
  };

  const detailContent = !selectedId ? <OrderDetailEmpty />
    : detail.isLoading ? <PdvPageSkeleton variant="detail" label="Carregando detalhes do pedido" />
    : detail.isError || !detail.data ? <div className="space-y-3">{mobile && <Button type="button" variant="ghost" onClick={() => select(null)}><ArrowLeft className="h-4 w-4" />Voltar aos pedidos</Button>}<EmptyState icon={<RefreshCw className="h-12 w-12 text-destructive" />} title="Não foi possível abrir o pedido" description={detail.error instanceof Error ? detail.error.message : 'Ele pode ter saído dos caixas que você pode consultar.'} action={{ label: 'Atualizar', onClick: () => void detail.refetch() }} /></div>
    : <OrderDetail detail={detail.data} money={money} dateTime={dateTime} format={receiptSettings.data?.defaultFormat ?? DEFAULT_PDV_RECEIPT_SETTINGS.defaultFormat} onBack={mobile ? () => select(null) : undefined} section={section} onSectionChange={next => openSection(selectedId!, next)} returnsAccess={returnsAccess} afterSaleAccess={afterSaleAccess} onReceive={(privileged || hasScreenAccess('screen:pdv')) && ['aguardando', 'parcial'].includes(detail.data.order.paymentStatus) ? () => navigate(`/pdv?fila=1&pedido=${encodeURIComponent(selectedId!)}`) : undefined} onPickup={(privileged || hasScreenAccess('screen:pdv_dispatch')) && ['liberado', 'parcial'].includes(detail.data.order.pickupStatus) ? () => navigate(`/pdv/expedicao?pedido=${encodeURIComponent(selectedId!)}`) : undefined} onReload={() => void Promise.all([detail.refetch(), list.refetch()])} onCancel={canCancelPdvOrder(detail.data.order.commercialStatus) ? () => setCancelTarget({ id: detail.data!.order.id, number: detail.data!.order.number }) : undefined} />;

  return <div className="pdv-workspace space-y-4 pb-20 lg:pb-8" data-pdv-ui>
    <PdvOrderCancelDialog open={cancelTarget !== null} orderNumber={cancelTarget?.number ?? null} isPending={cancelOrder.isPending} onOpenChange={open => { if (!open) setCancelTarget(null); }} onConfirm={reason => void confirmCancellation(reason)} />
    {!mobileDetail && <PageHeader title="Pedidos" subtitle="Consulte os pedidos dos caixas permitidos para o seu perfil." icon={ListOrdered} actions={canViewFlow ? <PdvWorkspaceViewToggle value={activeView} showFlow onChange={value => setView(value === 'flow' ? 'flow' : 'list')} /> : undefined} />}


    {activeView === 'flow' ? <PdvFullSalesFlow fulfillmentMode={capability.data!.fulfillmentMode} formatMoney={money} onOpen={card => { const destination = pdvFlowCardDestination(card, { pdv: hasScreenAccess('screen:pdv'), orders: hasScreenAccess('screen:pdv_orders'), dispatch: hasScreenAccess('screen:pdv_dispatch') }); if (destination) { setView('list'); navigate(destination); } }} /> : mobileDetail ? <div className="min-h-[60vh] bg-background">{detailContent}</div> : list.isLoading && !list.data ? <OrdersLoading /> : list.isError ? <EmptyState icon={<RefreshCw className="h-12 w-12 text-destructive" />} title="Não foi possível carregar os pedidos" description={list.error instanceof Error ? list.error.message : 'Nenhum dado foi alterado.'} action={{ label: 'Tentar novamente', onClick: () => void list.refetch() }} /> : <div className="grid min-h-[34rem] overflow-hidden rounded-xl border bg-background lg:grid-cols-[minmax(20rem,25rem)_minmax(0,1fr)]">
      <section className="min-w-0 border-b lg:border-b-0 lg:border-r" aria-label="Lista de pedidos">
        <div className="pdv-list-toolbar border-b">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Todos os pedidos</h2><p className="text-xs text-muted-foreground">Mostrando {rows.length} de {total} pedidos</p></div>
          <SearchField aria-label="Buscar pedidos" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pedido, cliente ou item" autoComplete="off" actions={<>
            <FilterButton embedded activeCount={activeFilterCount} onClear={() => setFilters(current => ({...current,status:null,paymentStatus:null,pickupStatus:null,terminalId:null,operatorId:null,from:null,to:null,page:0}))}>
              <div className="grid gap-4">        <FilterSelect label="Situação" value={filters.status ?? ''} onChange={(value) => setFilter('status', value || null)} options={[['', 'Todas'], ['rascunho', 'Rascunho'], ['aguardando_pagamento', 'Em aberto'], ['pago', 'Pago'], ['liberado_retirada', 'Liberado'], ['retirada_parcial', 'Retirada parcial'], ['entregue', 'Entregue'], ['cancelado', 'Cancelado'], ['cancelado_parcial', 'Cancelado parcial']]} />
        <FilterSelect label="Pagamento" value={filters.paymentStatus ?? ''} onChange={(value) => setFilter('paymentStatus', (value || null) as PdvOrderPaymentStatus | null)} options={[['', 'Todos'], ['aguardando', 'Aguardando'], ['parcial', 'Parcial'], ['pago', 'Pago'], ['fiado_aprovado', 'Fiado aprovado'], ['reembolso_parcial', 'Reembolso parcial'], ['reembolsado', 'Reembolsado'], ['cancelado', 'Cancelado']]} />
        <FilterSelect label="Retirada" value={filters.pickupStatus ?? ''} onChange={(value) => setFilter('pickupStatus', (value || null) as PdvOrderPickupStatus | null)} options={[['', 'Todas'], ['aguardando_liberacao', 'Aguardando liberação'], ['liberado', 'Liberado'], ['parcial', 'Parcial'], ['entregue', 'Entregue'], ['cancelada', 'Cancelada']]} />
        {list.data?.canFilterCash && <FilterSelect label="Caixa" value={filters.terminalId ?? ''} onChange={(value) => setFilter('terminalId', value || null)} options={[['', 'Todos'], ...list.data.cashOptions.map((option) => [option.id, option.name] as [string, string])]} />}
        {list.data?.canFilterCash && <FilterSelect label="Operador" value={filters.operatorId ?? ''} onChange={(value) => setFilter('operatorId', value || null)} options={[['', 'Todos'], ...list.data.operatorOptions.map((option) => [option.id, option.name] as [string, string])]} />}
        <label className="space-y-1 text-xs font-semibold">De<DatePicker value={filters.from ?? ''} onValueChange={value => setFilter('from', value || null)} /></label>
        <label className="space-y-1 text-xs font-semibold">Até<DatePicker value={filters.to ?? ''} onValueChange={value => setFilter('to', value || null)} /></label></div>
            </FilterButton>
            <Popover><PopoverTrigger asChild><SearchFieldAction icon={ArrowDownUp} label="Ordenar" aria-label={`Ordenar pedidos: ${filters.sort === 'newest' ? 'Mais novos' : 'Mais antigos'}`} /></PopoverTrigger><PopoverContent align="end" className="w-56 space-y-1 p-2"><p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Ordenar pedidos</p>{([['newest', 'Mais novos'], ['oldest', 'Mais antigos']] as const).map(([value, label]) => <Button key={value} type="button" size="sm" variant="ghost" aria-pressed={filters.sort === value} className={cn('w-full justify-start', filters.sort === value && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')} onClick={() => setFilter('sort', value)}>{label}</Button>)}</PopoverContent></Popover>
          </>} />
        </div>
        {rows.length === 0 ? <div className="p-5"><EmptyState icon={<ListOrdered className="h-12 w-12 text-muted-foreground" />} title="Nenhum pedido encontrado" description="Revise a busca ou os filtros." /></div> : <div className="divide-y">{rows.map((row) => <OrderListItem key={row.id} row={row} selected={row.id === selectedId} money={money} dateTime={dateTime} onOpen={() => select(row.id)} actions={orderActions(row)} />)}</div>}
        <div className="flex items-center justify-between gap-2 border-t px-3 py-3 text-sm"><span>Página {filters.page + 1} de {pages}</span><div className="flex gap-1"><Button size="icon" variant="outline" aria-label="Página anterior" disabled={filters.page === 0} onClick={() => setFilter('page', Math.max(0, filters.page - 1))}><ChevronLeft className="h-4 w-4" /></Button><Button size="icon" variant="outline" aria-label="Próxima página" disabled={filters.page + 1 >= pages} onClick={() => setFilter('page', filters.page + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>
      </section>
      <aside className="hidden min-w-0 lg:block">{detailContent}</aside>
    </div>}
  </div>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  const empty = '__all__';
  return <label className="space-y-1 text-xs font-semibold">{label}<Select value={value || empty} onValueChange={next => onChange(next === empty ? '' : next)}><SelectTrigger className="h-10 font-normal"><SelectValue /></SelectTrigger><SelectContent>{options.map(([key, text]) => <SelectItem key={key || empty} value={key || empty}>{text}</SelectItem>)}</SelectContent></Select></label>;
}

function OrderListItem({ row, selected, money, dateTime, onOpen, actions }: { row: PdvOrderListRow; selected: boolean; money: (value: number) => string; dateTime: (value: string | Date | null | undefined) => string; onOpen: () => void; actions: PdvOrderActionsMenuProps }) {
  return <article className={cn('relative transition-colors hover:bg-muted', selected && 'bg-primary text-primary-foreground hover:bg-primary')}>
    <button type="button" onClick={onOpen} className="w-full space-y-3 p-4 pr-12 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={`Abrir detalhes do pedido ${row.number}`}>
      <span className="flex items-start justify-between gap-3"><span className="min-w-0"><strong className="block">Pedido #{row.number}</strong><span className={cn('block truncate text-sm', selected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{row.customerName ?? 'Cliente não informado'}</span></span><strong className="shrink-0 tabular-nums">{money(row.total)}</strong></span>
      <span className="flex flex-wrap gap-1.5"><CurrentStatusBadge order={row} /></span>
      <span className={cn('flex justify-between gap-3 text-xs', selected ? 'text-primary-foreground/75' : 'text-muted-foreground')}><span>{row.cashName ?? row.operatorName ?? 'Venda direta'}</span><span>{dateTime(row.createdAt)}</span></span>
    </button>
    <div className="absolute right-2 top-2"><PdvOrderActionsMenu {...actions} triggerClassName={selected ? 'text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground' : undefined} /></div>
  </article>;
}

function CurrentStatusBadge({ order }: { order: Parameters<typeof pdvOrderCurrentState>[0] }) {
  const state = pdvOrderCurrentState(order);
  return <span data-pdv-order-status className={cn('inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white', state.tone)}>{state.label}</span>;
}

function OrderDetail({ detail, money, dateTime, format, onBack, section, onSectionChange, returnsAccess, afterSaleAccess, onReceive, onPickup, onReload, onCancel }: { detail: NonNullable<ReturnType<typeof usePdvOrderWorkspace>['data']>; money: (value: number) => string; dateTime: (value: string | Date | null | undefined) => string; format: typeof DEFAULT_PDV_RECEIPT_SETTINGS.defaultFormat; onBack?: () => void; section: OrderSection; onSectionChange: (section: OrderSection) => void; returnsAccess: ReturnType<typeof derivePdvReturnsAccess>; afterSaleAccess: ReturnType<typeof derivePdvAfterSaleAccess>; onReceive?: () => void; onPickup?: () => void; onReload: () => void; onCancel?: () => void }) {
  const confirmed = canCancelPdvOrder(detail.order.commercialStatus);
  const canOpenReturns = detail.order.commercialStatus !== 'cancelado' && returnsAccess.enabled && (confirmed && (returnsAccess.canReturn || returnsAccess.canReverse) || returnsAccess.canCancelResidual);
  const canOpenValues = confirmed && afterSaleAccess.enabled && afterSaleAccess.canView;
  const hasDelivery = pdvOrderHasSeparatePickup(detail.order) || detail.items.some(item => item.deliveredQuantity > 0) || detail.order.commercialStatus === 'entregue';
  const activeSection = section === 'returns' && !canOpenReturns || section === 'values' && !canOpenValues || section === 'delivery' && !hasDelivery ? 'details' : section;
  const payments = usePdvOrderReceiptSnapshot(detail.order.id, activeSection === 'payments' && detail.order.canGenerateReceipt);
  const { toast } = useToast();
  const generateReceipt = async () => {
    try { await openPdvOrderReceipt(detail.order.id, format); }
    catch (error) { toast({ variant: 'destructive', title: 'Não foi possível gerar o comprovante', description: error instanceof Error ? error.message : 'Tente novamente.' }); }
  };
  return <div className="pdv-entity-detail space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 flex-1 basis-52 items-start gap-3">{onBack && <Button type="button" size="icon" variant="ghost" aria-label="Voltar aos pedidos" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>}<div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pedido</p><h2 className="pdv-entity-title">#{detail.order.number}</h2><p className="text-sm text-muted-foreground">{detail.order.customerName ?? 'Cliente não informado'} · {dateTime(detail.order.createdAt)}</p></div></div><div className="flex shrink-0 flex-wrap items-center gap-2">{onReceive ? <Button onClick={onReceive}>Receber no caixa</Button> : onPickup ? <Button onClick={onPickup}>Conferir retirada</Button> : null}<PdvOrderActionsMenu orderId={detail.order.id} orderNumber={detail.order.number} canGenerateReceipt={detail.order.canGenerateReceipt} onView={() => onSectionChange('details')} onReceipt={() => void generateReceipt()} onReceive={onReceive} onPickup={onPickup} onReturns={canOpenReturns ? () => onSectionChange('returns') : undefined} onValues={canOpenValues ? () => onSectionChange('values') : undefined} onCancel={onCancel} /></div></header>
    <div className="flex flex-wrap gap-2"><CurrentStatusBadge order={detail.order} /></div>
    <Tabs value={activeSection} onValueChange={value => onSectionChange(value as OrderSection)}>
    <TabsList variant="underline" aria-label="Áreas do pedido">
      <TabsTrigger variant="underline" value="details">Pedido</TabsTrigger>
      <TabsTrigger variant="underline" value="payments">Pagamentos</TabsTrigger>
      {hasDelivery && <TabsTrigger variant="underline" value="delivery">{pdvOrderHasSeparatePickup(detail.order) ? 'Retirada' : 'Entrega'}</TabsTrigger>}
      <TabsTrigger variant="underline" value="history">Histórico</TabsTrigger>
      {canOpenReturns && <TabsTrigger variant="underline" value="returns">Devoluções</TabsTrigger>}
      {canOpenValues && <TabsTrigger variant="underline" value="values">Trocas e créditos</TabsTrigger>}
    </TabsList>
    <TabsContent value="details" className="space-y-5 pt-4">
    <section><div className="mb-2 flex items-center justify-between"><h3 className="font-bold">Itens</h3><strong className="tabular-nums">{money(detail.order.total)}</strong></div><div className="divide-y border-y">{detail.items.map((item) => <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3"><div><p className="font-medium">{item.description}</p><p className="text-xs text-muted-foreground">{item.quantity} × {money(item.unitPrice)}{item.deliveredQuantity > 0 ? ` · ${item.deliveredQuantity} retirado(s)` : ''}</p></div><strong className="tabular-nums">{money(item.total)}</strong></div>)}</div></section>
    {detail.order.notes && <section><h3 className="font-bold">Observações</h3><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{detail.order.notes}</p></section>}
    </TabsContent>
    <TabsContent value="payments" className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"><div><h3 className="font-bold">Pagamento</h3><p className="mt-1 text-sm text-muted-foreground">{pdvOrderStatusLabel('payment', detail.order.paymentStatus)}</p></div><strong className="text-xl font-extrabold tabular-nums">{money(detail.order.total)}</strong></div>
      {payments.isFetching ? <PdvListRowsSkeleton label="Carregando pagamentos" /> : payments.data ? <div className="divide-y">{payments.data.payments.map((payment, index) => <div key={index} className="flex items-center justify-between gap-4 py-3"><div><p className="font-semibold">{PAYMENT_NAMES[payment.method] ?? 'Outra forma'}</p>{payment.dueDate && <p className="mt-1 text-xs text-muted-foreground">Vencimento: {payment.dueDate.slice(0, 10).split('-').reverse().join('/')}</p>}</div><strong className="tabular-nums">{money(payment.amount)}</strong></div>)}</div> : <p className="text-sm text-muted-foreground">{detail.order.canGenerateReceipt ? 'O detalhamento das formas de pagamento não está disponível neste pedido.' : 'As formas de pagamento aparecem depois da confirmação no caixa.'}</p>}
    </TabsContent>
    {hasDelivery && <TabsContent value="delivery" className="space-y-4 pt-4"><h3 className="font-bold">{pdvOrderHasSeparatePickup(detail.order) ? 'Itens da retirada' : 'Itens entregues'}</h3><div className="divide-y">{detail.items.map(item => <div key={item.id} className="py-3"><p className="font-semibold">{item.description}</p><p className="mt-1 text-sm text-muted-foreground">Pedido: {item.quantity} · Entregue: {item.deliveredQuantity} · Restante: {Math.max(0, item.quantity - item.deliveredQuantity)}</p></div>)}</div></TabsContent>}
    <TabsContent value="history" className="pt-4">
    <section><h3 className="font-bold">Histórico</h3><ol className="mt-3 space-y-3 border-l pl-4">{detail.timeline.map((event, index) => <li key={`${event.kind}-${event.at}-${index}`} className="relative"><span className="absolute -left-[1.31rem] top-1.5 h-2 w-2 rounded-full bg-primary" /><p className="font-medium">{event.label}</p><p className="text-xs text-muted-foreground">{dateTime(event.at)}</p></li>)}</ol></section>
    </TabsContent>
    <TabsContent value="returns" className="pt-4">
    {activeSection === 'returns' && returnsAccess.enabled && <PdvReturnsPanel orderId={detail.order.id} orderNumber={detail.order.number} remainingQuantity={detail.items.reduce((sum, item) => sum + Math.max(0, item.quantity - item.deliveredQuantity), 0)} access={returnsAccess} onReload={onReload} />}
    </TabsContent>
    <TabsContent value="values" className="pt-4">
    {activeSection === 'values' && afterSaleAccess.enabled && afterSaleAccess.canView && <PdvAfterSalePanel orderId={detail.order.id} access={afterSaleAccess} onReload={onReload} />}
    </TabsContent>
    </Tabs>
  </div>;
}

const PAYMENT_NAMES: Record<string,string> = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Cartão de débito', credito: 'Cartão de crédito', transferencia: 'Transferência', fiado: 'Fiado', saldo_cliente: 'Saldo do cliente', customer_credit: 'Saldo do cliente', voucher: 'Voucher' };

function OrderDetailEmpty() { return <div className="flex min-h-[34rem] items-center justify-center p-5"><EmptyState icon={<ListOrdered className="h-12 w-12 text-muted-foreground" />} title="Selecione um pedido" description="Os itens, o pagamento e a retirada aparecem aqui." /></div>; }
function OrdersLoading() { return <PdvPageSkeleton variant="list-detail" label="Carregando pedidos" />; }
