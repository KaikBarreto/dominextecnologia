import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Columns3, LayoutList, PackageCheck, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ListDetailLayout, type ListDetailSortOption } from '@/components/ui/ListDetailLayout';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { usePdvDispatchHistory, usePdvDispatchOrder, usePdvDispatchQueue } from '@/hooks/usePdvDispatch';
import { PdvDispatchStatusBadge } from '@/components/pdv/dispatch/PdvDispatchStatusBadge';
import { PdvDispatchDetail } from '@/components/pdv/dispatch/PdvDispatchDetail';
import { derivePdvReturnsAccess, usePdvReturnsFeature } from '@/hooks/usePdvReturns';
import { derivePdvAfterSaleAccess, usePdvAfterSaleFeature } from '@/hooks/usePdvAfterSale';
import { PdvSalesFlowCard } from '@/components/pdv/flow/PdvSalesFlowCard';
import type { PdvSalesFlowCardModel } from '@/hooks/usePdvSalesFlow';

const oldestFirst: ListDetailSortOption = { value: 'released-asc', label: 'Liberados há mais tempo', shortLabel: 'Mais antigos', compare: (a, b) => (a.searchText ?? '').localeCompare(b.searchText ?? '') };

export default function PdvDispatch() {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedOrderId = searchParams.get('pedido');
  const { profile, roles, permissions, isAdminOrGestor, hasPermissionRecord, hasPermission } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(requestedOrderId);
  const [view, setView] = useState<'list' | 'board'>(() => isMobile ? 'list' : 'board');
  const [stage, setStage] = useState<'active' | 'delivered'>('active');
  const queue = usePdvDispatchQueue();
  const history = usePdvDispatchHistory();
  const detail = usePdvDispatchOrder(selectedId);
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

  function selectOrder(orderId: string | null) {
    setSelectedId(orderId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (orderId) next.set('pedido', orderId);
      else next.delete('pedido');
      return next;
    }, { replace: true });
  }

  const refetchStage = () => stage === 'active' ? queue.refetch() : history.refetch();
  const detailContent = !selectedId ? <EmptyState icon={<PackageCheck className="h-12 w-12 text-muted-foreground" />} title="Selecione um pedido" description={stage === 'active' ? 'Os itens e quantidades aparecem aqui, sem dados de pagamento.' : 'Abra um pedido entregue para consultar retiradas, devoluções, créditos e reembolsos.'} /> : detail.isLoading ? <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-72" /></div> : detail.isError || !detail.data ? <EmptyState icon={<RefreshCw className="h-12 w-12 text-destructive" />} title="Não foi possível abrir o pedido" description="Ele pode ter sido atualizado em outro dispositivo." action={{ label: 'Atualizar', onClick: () => void Promise.all([detail.refetch(), refetchStage()]) }} /> : <PdvDispatchDetail detail={detail.data} canDeliver={canDeliver} returnsAccess={returnsAccess} afterSaleAccess={afterSaleAccess} onBack={isMobile || view === 'board' ? () => selectOrder(null) : undefined} onReload={() => void Promise.all([detail.refetch(), queue.refetch(), history.refetch()])} />;

  return <div className="space-y-4 pb-20 lg:pb-6" data-pdv-ui>
    {!mobileDetailOpen && <PageHeader title="Expedição e retirada" subtitle="Separe, entregue e consulte o pós-venda dos pedidos do balcão." icon={PackageCheck} actions={stage === 'active' ? <div className="flex gap-2"><Button size="sm" variant={view === 'list' ? 'default' : 'outline'} onClick={() => { setView('list'); selectOrder(null); }}><LayoutList className="h-4 w-4" />Lista</Button><Button size="sm" variant={view === 'board' ? 'default' : 'outline'} onClick={() => { setView('board'); selectOrder(null); }}><Columns3 className="h-4 w-4" />Kanban</Button></div> : undefined} />}
    {!mobileDetailOpen && <nav className="flex gap-6 overflow-x-auto border-b" aria-label="Etapas da expedição"><button type="button" onClick={() => { setStage('active'); selectOrder(null); }} className={`shrink-0 border-b-2 pb-2 text-sm font-semibold ${stage === 'active' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}>Em andamento</button><button type="button" onClick={() => { setStage('delivered'); setView('list'); selectOrder(null); }} className={`shrink-0 border-b-2 pb-2 text-sm font-semibold ${stage === 'delivered' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}>Entregues e pós-venda</button></nav>}
    {(stage === 'active' ? queue.isLoading : history.isLoading) ? <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]"><Skeleton className="h-[32rem]" /><Skeleton className="h-[32rem]" /></div> : (stage === 'active' ? queue.isError : history.isError) ? <EmptyState icon={<RefreshCw className="h-12 w-12 text-destructive" />} title="Não foi possível carregar a expedição" description="Nenhum pedido foi alterado." action={{ label: 'Tentar novamente', onClick: () => void refetchStage() }} /> : view === 'list' ? <ListDetailLayout items={items} selectedId={selectedId ?? undefined} listTitle={stage === 'active' ? 'Pedidos liberados' : 'Pedidos entregues'} listDescription={stage === 'active' ? 'Sem valores financeiros na expedição' : 'Histórico disponível para devolução e pós-venda'} sortOptions={[oldestFirst]} storageKey={`pdv-dispatch-${stage}-list`} searchPlaceholder="Buscar pedido ou cliente" emptyLabel={stage === 'active' ? 'Nenhum pedido aguardando retirada' : 'Nenhum pedido entregue encontrado'} mobileDetailOpen={isMobile ? mobileDetailOpen : undefined} onSelect={selectOrder}>{detailContent}</ListDetailLayout> : isMobile && selectedId ? <div className="bg-background">{detailContent}</div> : <div className={selectedId ? 'grid min-w-0 gap-4 xl:grid-cols-[minmax(22rem,0.9fr)_minmax(32rem,1.1fr)] xl:items-start' : undefined}><DispatchBoard orders={orders} selectedId={selectedId} compact={Boolean(selectedId)} onSelect={selectOrder} />{selectedId && <aside className="min-w-0 rounded-lg bg-muted/30 p-4">{detailContent}</aside>}</div>}
  </div>;
}

function DispatchBoard({ orders, selectedId, compact = false, onSelect }: { orders: NonNullable<ReturnType<typeof usePdvDispatchQueue>['data']>; selectedId?: string | null; compact?: boolean; onSelect: (id: string) => void }) {
  const columns = [
    { status: 'liberado_retirada' as const, title: 'Aguardando retirada', className: 'bg-blue-600 text-white' },
    { status: 'retirada_parcial' as const, title: 'Retirada parcial', className: 'bg-amber-600 text-white' },
  ];
  return <div className={`grid min-w-0 gap-4 ${compact ? 'grid-cols-1' : 'lg:grid-cols-2'}`} aria-label="Kanban da expedição">{columns.map((column) => { const columnOrders = orders.filter((order) => order.status === column.status); return <section key={column.status} className="min-w-0 overflow-hidden rounded-xl bg-muted/30"><header className={`flex items-center justify-between px-4 py-3 ${column.className}`}><h2 className="font-bold">{column.title}</h2><span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold text-white">{columnOrders.length}</span></header><div className="space-y-2 p-2.5">{columnOrders.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum pedido nesta etapa.</p> : columnOrders.map((order) => { const card = dispatchOrderToFlowCard(order); return <PdvSalesFlowCard key={card.flowId} card={card} selected={selectedId === order.id} onOpen={() => onSelect(order.id)} showStage={false} />; })}</div></section>; })}</div>;
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
