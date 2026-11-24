import '@/components/pdv/PdvWorkspace.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, PackageCheck, RefreshCw, Search, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field-actions';
import { KanbanColumnHeader } from '@/components/ui/KanbanColumnHeader';
import { PDV_SALES_FLOW_STAGE_META } from '@/components/pdv/flow/pdvSalesFlowStage';
import { fuzzyIncludesAny } from '@/lib/utils';
import { PdvPageSkeleton } from '@/components/pdv/loading/PdvPageSkeleton';
import { ListDetailLayout, type ListDetailSortOption } from '@/components/ui/ListDetailLayout';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { stablePdvAttempt, usePdvCompleteDispatch, usePdvDispatchHistory, usePdvDispatchOrder, usePdvDispatchQueue } from '@/hooks/usePdvDispatch';
import { usePdvStageReceiptAuto } from '@/hooks/usePdvStageReceiptAuto';
import { usePdvReceiptCompany } from '@/hooks/usePdvReceiptCompany';
import { PdvDeliveryReceiptButton, openPdvDeliveryReceipt } from '@/components/pdv/dispatch/PdvDeliveryReceiptButton';
import { PdvDispatchStatusBadge } from '@/components/pdv/dispatch/PdvDispatchStatusBadge';
import { PdvDispatchDetail } from '@/components/pdv/dispatch/PdvDispatchDetail';
import { derivePdvReturnsAccess, usePdvReturnsFeature } from '@/hooks/usePdvReturns';
import { derivePdvAfterSaleAccess, usePdvAfterSaleFeature } from '@/hooks/usePdvAfterSale';
import { PdvSalesFlowCard } from '@/components/pdv/flow/PdvSalesFlowCard';
import { type PdvSalesFlowCardModel } from '@/hooks/usePdvSalesFlow';
import { PdvFullSalesFlow } from '@/components/pdv/flow/PdvFullSalesFlow';
import { PdvWorkspaceViewToggle } from '@/components/pdv/flow/PdvWorkspaceViewToggle';
import { pdvFlowCardDestination } from '@/components/pdv/flow/pdvFlowNavigation';
import { usePdvCounterCapability } from '@/hooks/usePdvCounterFlow';
import { useToast } from '@/hooks/use-toast';
import { hasPdvDispatchConflict } from '@/components/pdv/dispatch/dispatchRules';
import '@/components/pdv/pdv-preview-sale.css';
import { resolveRequestedPdvOrderId } from '@/lib/pdv/pdvDeepLinks';

const oldestFirst: ListDetailSortOption = { value: 'released-asc', label: 'Liberados há mais tempo', shortLabel: 'Mais antigos', compare: (a, b) => (a.searchText ?? '').localeCompare(b.searchText ?? '') };

export default function PdvDispatch() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [quickOrderId, setQuickOrderId] = useState<string | null>(null);
  const [lastDeliveryId, setLastDeliveryId] = useState<string | null>(null);
  const quickDetail = usePdvDispatchOrder(quickOrderId);
  const completeDispatch = usePdvCompleteDispatch();
  const autoReceipt = usePdvStageReceiptAuto();
  const receiptCompany = usePdvReceiptCompany();
  const quickReceiptAttempt = useRef<ReturnType<typeof autoReceipt.prepare> | null>(null);
  const quickInFlight = useRef(false);
  const quickAttempts = useRef(new Map<string, { signature: string; id: string }>());
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedOrderId = resolveRequestedPdvOrderId(searchParams);
  const { profile, roles, permissions, isAdminOrGestor, hasPermissionRecord, hasPermission, hasScreenAccess } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(requestedOrderId);
  const [view, setView] = useState<'list' | 'board' | 'flow'>(() => isMobile ? 'list' : 'board');
  const [stage, setStage] = useState<'active' | 'delivered'>('active');
  const queue = usePdvDispatchQueue();
  const history = usePdvDispatchHistory();
  const detail = usePdvDispatchOrder(selectedId);
  const capability = usePdvCounterCapability();
  const canViewFlow = capability.data?.counterEnabled === true && hasScreenAccess('screen:pdv_dispatch');
  const activeView = view === 'flow' && !canViewFlow ? 'list' : view;
  const canDeliver = isAdminOrGestor() || (hasPermissionRecord && hasPermission('fn:deliver_pdv_order'));
  const returnsFeature = usePdvReturnsFeature(profile?.company_id);
  const afterSaleFeature = usePdvAfterSaleFeature(profile?.company_id);
  const privilegedReturns = isAdminOrGestor() || roles.includes('super_admin');
  const returnsAccess = derivePdvReturnsAccess({ featureEnabled: returnsFeature.data === true, privileged: privilegedReturns, hasPermissionRecord, permissions });
  const afterSaleAccess = derivePdvAfterSaleAccess({ featureEnabled: afterSaleFeature.data === true, privileged: privilegedReturns, hasPermissionRecord, permissions });
  const orders = useMemo(() => stage === 'active' ? (queue.data ?? []) : (history.data ?? []), [history.data, queue.data, stage]);
  const items = useMemo(() => orders.map((order) => ({ id: order.id, title: `Pedido #${order.number}`, subtitle: `${order.recipientName ?? 'Sem cliente'} · ${order.stockName ?? 'Estoque'}`, searchText: `${order.releasedAt} ${order.number} ${order.recipientName ?? ''}`, leading: <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-background font-semibold tabular-nums">{order.number}</div>, trailing: <div className="flex flex-col items-end gap-1"><PdvDispatchStatusBadge status={order.status} />{stage === 'active' && <span className="text-xs whitespace-nowrap text-muted-foreground">{order.remainingItems} item(ns)</span>}</div> })), [orders, stage]);
  const mobileDetailOpen = isMobile && Boolean(selectedId);

  useEffect(() => {
    if (!requestedOrderId) return;
    if (history.data?.some((order) => order.id === requestedOrderId)) {
      setStage('delivered');
      setView('list');
    }
    setSelectedId(requestedOrderId);
  }, [history.data, requestedOrderId]);

  useEffect(() => {
    if (!quickOrderId || quickInFlight.current) return;
    if (quickDetail.isError) {
      toast({ title: 'Não foi possível abrir a retirada', description: 'Atualize a fila e tente novamente.', variant: 'destructive' });
      setQuickOrderId(null);
      quickReceiptAttempt.current?.cancel();
      return;
    }
    const current = quickDetail.data;
    if (!current || current.order.id !== quickOrderId || quickDetail.isFetching) return;
    if (hasPdvDispatchConflict(current.items)) {
      toast({ title: 'Confira o estoque antes de entregar', description: 'Abra o pedido para revisar as reservas.', variant: 'destructive' });
      setQuickOrderId(null);
      quickReceiptAttempt.current?.cancel();
      return;
    }
    const lines = current.items.filter(item => item.remainingQuantity > 0).map(item => ({ orderItemId: item.id, quantity: item.remainingQuantity, reservationId: item.itemType === 'material' ? item.reservations.find(reservation => !reservation.hasConflict)?.id ?? null : null }));
    if (!lines.length) { quickReceiptAttempt.current?.cancel(); setQuickOrderId(null); void queue.refetch(); return; }
    const attempt = stablePdvAttempt(quickAttempts.current.get(quickOrderId) ?? null, JSON.stringify(lines), () => crypto.randomUUID());
    quickAttempts.current.set(quickOrderId, attempt);
    quickInFlight.current = true;
    const receiptAttempt = quickReceiptAttempt.current;
    void completeDispatch.mutateAsync({ orderId: quickOrderId, lines, attemptId: attempt.id }).then(result => {
      if (typeof result.delivery_id === 'string') {
        const id = result.delivery_id;
        void receiptAttempt?.commit(`delivery:${id}`, (format, options) => openPdvDeliveryReceipt(id, format, { ...options, company: receiptCompany }), result.idempotent === true);
      } else receiptAttempt?.cancel();
      if (result.status === 'entregue') {
        if (typeof result.delivery_id === 'string') setLastDeliveryId(result.delivery_id);
        setSelectedId(current => current === quickOrderId ? null : current);
        setSearchParams(current => { const next = new URLSearchParams(current); if (next.get('pedido') === quickOrderId || next.get('order') === quickOrderId) { next.delete('pedido'); next.delete('order'); next.delete('acao'); } return next; }, { replace: true });
      }
      quickAttempts.current.delete(quickOrderId);
      toast({ title: 'Pedido retirado', description: 'Todos os materiais restantes foram entregues.' });
      return Promise.all([queue.refetch(), history.refetch(), ...(selectedId ? [detail.refetch()] : [])]);
    }).catch(error => {
      receiptAttempt?.cancel();
      toast({ title: 'Retirada não registrada', description: error instanceof Error ? error.message : 'Atualize e tente novamente.', variant: 'destructive' });
    }).finally(() => { quickInFlight.current = false; setQuickOrderId(null); });
  }, [completeDispatch, detail, history, queue, quickDetail.data, quickDetail.isError, quickDetail.isFetching, quickOrderId, receiptCompany, selectedId, setSearchParams, toast]);

  function selectOrder(orderId: string | null) {
    setSelectedId(orderId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('order');
      if (orderId) next.set('pedido', orderId);
      else { next.delete('pedido'); next.delete('acao'); }
      return next;
    }, { replace: true });
  }

  const refetchStage = () => stage === 'active' ? queue.refetch() : history.refetch();
  const detailContent = !selectedId ? <EmptyState icon={<PackageCheck className="h-12 w-12 text-muted-foreground" />} title="Selecione um pedido" description={stage === 'active' ? 'Os itens e quantidades aparecem aqui, sem dados de pagamento.' : 'Abra um pedido entregue para consultar retiradas, devoluções, créditos e reembolsos.'} /> : detail.isLoading ? <PdvPageSkeleton variant="detail" label="Carregando retirada" /> : detail.isError || !detail.data ? <div className="space-y-3">{(isMobile || activeView === 'board') && <Button type="button" variant="cancel-ghost" onClick={() => selectOrder(null)}><ArrowLeft className="h-4 w-4" />Voltar à fila</Button>}<EmptyState icon={<RefreshCw className="h-12 w-12 text-destructive" />} title="Não foi possível abrir o pedido" description="Ele pode ter sido atualizado em outro dispositivo." action={{ label: 'Atualizar', onClick: () => void Promise.all([detail.refetch(), refetchStage()]) }} /></div> : <PdvDispatchDetail detail={detail.data} canDeliver={canDeliver} returnsAccess={returnsAccess} afterSaleAccess={afterSaleAccess} onBack={isMobile || activeView === 'board' ? () => selectOrder(null) : undefined} onReload={() => void Promise.all([detail.refetch(), queue.refetch(), history.refetch()])} onCompleted={deliveryId => { setLastDeliveryId(deliveryId); selectOrder(null); }} />;

  return <div className="pdv-workspace space-y-4 pb-20 lg:pb-6" data-pdv-ui>
    {!mobileDetailOpen && <PageHeader title="Expedição e retirada" subtitle="Separe, entregue e consulte o pós-venda dos pedidos do balcão." icon={PackageCheck} actions={stage === 'active' ? <PdvWorkspaceViewToggle value={activeView} showBoard showFlow={canViewFlow} onChange={next => { setView(next); selectOrder(null); }} /> : undefined} />}
    {lastDeliveryId && <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"><p className="text-sm font-semibold">Retirada concluída. A fila está pronta para o próximo pedido.</p><PdvDeliveryReceiptButton deliveryId={lastDeliveryId} /></div>}
    {!mobileDetailOpen && <nav className="flex gap-6 overflow-x-auto border-b" aria-label="Etapas da expedição"><button type="button" onClick={() => { setStage('active'); selectOrder(null); }} className={`shrink-0 border-b-2 pb-2 text-sm font-semibold ${stage === 'active' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}>Em andamento</button><button type="button" onClick={() => { setStage('delivered'); setView('list'); selectOrder(null); }} className={`shrink-0 border-b-2 pb-2 text-sm font-semibold ${stage === 'delivered' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}>Entregues e pós-venda</button></nav>}
    {activeView === 'flow' && canViewFlow ? <PdvFullSalesFlow fulfillmentMode={capability.data!.fulfillmentMode} formatMoney={value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} onOpen={card => { const destination = pdvFlowCardDestination(card, { pdv: hasScreenAccess('screen:pdv'), orders: hasScreenAccess('screen:pdv_orders'), dispatch: hasScreenAccess('screen:pdv_dispatch') }); if (!destination) return; if (destination.startsWith('/pdv/expedicao?') && card.orderId) { setView('list'); setStage(card.stage === 'completed' ? 'delivered' : 'active'); selectOrder(card.orderId); } else navigate(destination); }} /> : (stage === 'active' ? queue.isLoading : history.isLoading) ? <PdvPageSkeleton variant={activeView === 'board' ? 'kanban' : 'list-detail'} listLeading columns={2} label="Carregando expedição" /> : (stage === 'active' ? queue.isError : history.isError) ? <EmptyState icon={<RefreshCw className="h-12 w-12 text-destructive" />} title="Não foi possível carregar a expedição" description="Nenhum pedido foi alterado." action={{ label: 'Tentar novamente', onClick: () => void refetchStage() }} /> : activeView === 'list' ? <ListDetailLayout items={items} selectedId={selectedId ?? undefined} listTitle={stage === 'active' ? 'Pedidos liberados' : 'Pedidos entregues'} listDescription={stage === 'active' ? 'Sem valores financeiros na expedição' : 'Histórico disponível para devolução e pós-venda'} sortOptions={[oldestFirst]} storageKey={`pdv-dispatch-${stage}-list`} searchPlaceholder="Buscar pedido ou cliente" emptyLabel={stage === 'active' ? 'Nenhum pedido aguardando retirada' : 'Nenhum pedido entregue encontrado'} mobileDetailOpen={isMobile ? mobileDetailOpen : undefined} onSelect={selectOrder}>{detailContent}</ListDetailLayout> : isMobile && selectedId ? <div className="bg-background">{detailContent}</div> : <div className={selectedId ? 'grid min-w-0 gap-4 xl:grid-cols-[minmax(22rem,0.9fr)_minmax(32rem,1.1fr)] xl:items-start' : undefined}><DispatchBoard orders={orders} selectedId={selectedId} compact={Boolean(selectedId)} onSelect={selectOrder} onCompletePickup={canDeliver ? id => { if (!quickOrderId) { quickReceiptAttempt.current = autoReceipt.prepare('delivery'); setQuickOrderId(id); } } : undefined} pendingOrderId={quickOrderId} />{selectedId && <aside className="min-w-0 rounded-lg border bg-background p-4">{detailContent}</aside>}</div>}
  </div>;
}

export function DispatchBoard({ orders, selectedId, compact = false, onSelect, onCompletePickup, pendingOrderId }: { orders: NonNullable<ReturnType<typeof usePdvDispatchQueue>['data']>; selectedId?: string | null; compact?: boolean; onSelect: (id: string) => void; onCompletePickup?: (id: string) => void; pendingOrderId?: string | null }) {
  const [search, setSearch] = useState('');
  const hasSearch = search.trim().length > 0;
  const filteredOrders = useMemo(() => orders.filter(order => fuzzyIncludesAny([
    `Pedido #${order.number}`, order.recipientName, order.stockName,
  ], search)), [orders, search]);
  const columns = [
    { status: 'liberado_retirada' as const, stage: 'pickup' as const, title: 'Aguardando retirada' },
    { status: 'retirada_parcial' as const, stage: 'partial' as const, title: 'Retirada parcial' },
  ].map(column => ({ ...column, orders: filteredOrders.filter(order => order.status === column.status) }))
    .filter(column => !hasSearch || column.orders.length > 0);

  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <SearchField containerClassName="min-w-0 flex-1" name="pdv-dispatch-board-search" aria-label="Buscar pedido, cliente ou estoque" placeholder="Buscar pedido, cliente ou estoque" autoComplete="off" value={search} onChange={event => setSearch(event.target.value)} actions={search ? <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Limpar busca de retiradas" onClick={() => setSearch('')}><X className="h-4 w-4" /></Button> : undefined} />
      <span className="text-xs text-muted-foreground" aria-live="polite">{filteredOrders.length} {filteredOrders.length === 1 ? 'pedido' : 'pedidos'}</span>
    </div>
    <div role="region" aria-label="Kanban da expedição">
      {hasSearch && filteredOrders.length === 0 ? <EmptyState icon={<Search className="h-10 w-10" />} title="Nenhuma retirada encontrada" description="Tente outro pedido, cliente ou estoque." action={{ label: 'Limpar busca', onClick: () => setSearch('') }} />
        : <div className={`grid min-w-0 gap-4 ${compact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
          {columns.map(column => {
            const meta = PDV_SALES_FLOW_STAGE_META[column.stage];
            return <section key={column.status} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-background" aria-label={column.title}>
              <KanbanColumnHeader title={column.title} color={meta.color} icon={meta.Icon} count={column.orders.length} />
              <div className="pdv-preview-sale space-y-2 p-2.5">
                {column.orders.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum pedido nesta etapa.</p> : column.orders.map(order => {
                  const card = dispatchOrderToFlowCard(order);
                  return <PdvSalesFlowCard key={card.flowId} card={card} selected={selectedId === order.id} onOpen={() => onSelect(order.id)} showStage={false} onCompletePickup={onCompletePickup ? () => onCompletePickup(order.id) : undefined} pickupPending={Boolean(pendingOrderId)} />;
                })}
              </div>
            </section>;
          })}
        </div>}
    </div>
  </div>;
}

function dispatchOrderToFlowCard(order: NonNullable<ReturnType<typeof usePdvDispatchQueue>['data']>[number]): PdvSalesFlowCardModel {
  return {
    flowId: `order:${order.id}`,
    preorderId: null,
    preorderNumber: null,
    orderId: order.id,
    orderNumber: order.number,
    stage: order.status === 'retirada_parcial' ? 'partial' : order.status === 'entregue' ? 'completed' : 'pickup',
    customerName: order.recipientName,
    stockName: order.stockName,
    total: null,
    itemCount: order.remainingItems,
    remainingItems: order.remainingItems,
    updatedAt: order.releasedAt,
    canSeeAmount: false,
    fulfillmentMode: 'dispatch',
  };
}
