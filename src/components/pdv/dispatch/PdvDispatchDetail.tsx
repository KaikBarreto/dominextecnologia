import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, PackageCheck, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { PdvDispatchStatusBadge } from './PdvDispatchStatusBadge';
import { PdvDeliveryReceiptButton } from './PdvDeliveryReceiptButton';
import { PdvReturnsPanel, type PdvReturnsAccess } from '@/components/pdv/returns/PdvReturnsPanel';
import { stablePdvAttempt, usePdvCompleteDispatch, type PdvDispatchDetail as Detail } from '@/hooks/usePdvDispatch';
import { useToast } from '@/hooks/use-toast';
import type { PdvAfterSaleAccess } from '@/hooks/usePdvAfterSale';
import { PdvAfterSalePanel } from '@/components/pdv/after-sale/PdvAfterSalePanel';
import { hasPdvDispatchConflict, shouldShowPdvDispatchActions } from './dispatchRules';

export function PdvDispatchDetail({ detail, canDeliver, returnsAccess, afterSaleAccess, onBack, onReload }: { detail: Detail; canDeliver: boolean; returnsAccess?: PdvReturnsAccess; afterSaleAccess?: PdvAfterSaleAccess; onBack?: () => void; onReload: () => void }) {
  const { toast } = useToast();
  const mutation = usePdvCompleteDispatch();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [deliveryId, setDeliveryId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'dispatch' | 'returns' | 'values'>('dispatch');
  const attempt = useRef<{ signature: string; id: string } | null>(null);

  useEffect(() => {
    setQuantities(Object.fromEntries(detail.items.filter((item) => item.remainingQuantity > 0).map((item) => [item.id, item.remainingQuantity])));
    attempt.current = null;
  }, [detail.items]);

  useEffect(() => {
    setDeliveryId(null);
    setDetailTab('dispatch');
  }, [detail.order.id]);

  const lines = useMemo(() => detail.items.flatMap((item) => {
    const quantity = Math.max(0, Math.min(item.remainingQuantity, Number(quantities[item.id] ?? 0)));
    if (!quantity) return [];
    const reservation = item.itemType === 'material' ? item.reservations.find((entry) => !entry.hasConflict) : null;
    return [{ orderItemId: item.id, reservationId: reservation?.id ?? null, quantity }];
  }), [detail.items, quantities]);
  const hasConflict = hasPdvDispatchConflict(detail.items);

  async function deliver() {
    const signature = JSON.stringify(lines);
    attempt.current = stablePdvAttempt(attempt.current, signature, () => crypto.randomUUID());
    try {
      const result = await mutation.mutateAsync({ orderId: detail.order.id, lines, attemptId: attempt.current.id });
      const id = typeof result.delivery_id === 'string' ? result.delivery_id : null;
      setDeliveryId(id);
      toast({ title: result.status === 'entregue' ? 'Pedido entregue' : 'Retirada parcial registrada', description: 'O estoque e o histórico foram atualizados.' });
    } catch (error) {
      toast({ title: 'Retirada não registrada', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    }
  }

  return <div className="min-w-0 space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
      <div className="flex min-w-0 items-start gap-3">
        {onBack && <Button variant="ghost" size="icon" onClick={onBack} aria-label="Voltar à fila"><ArrowLeft className="h-5 w-5" /></Button>}
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold">Pedido #{detail.order.number}</h2><PdvDispatchStatusBadge status={detail.order.status} /></div><p className="mt-1 text-sm text-muted-foreground">{detail.order.customer?.name ?? 'Retirada sem cliente identificado'} · {detail.order.stock?.name ?? 'Estoque'}</p></div>
      </div>
      <Button variant="outline" size="sm" onClick={onReload}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
    </header>

    <nav className="flex gap-6 overflow-x-auto border-b" aria-label="Áreas do pedido">
      <DetailTabButton active={detailTab === 'dispatch'} onClick={() => setDetailTab('dispatch')}>Retirada</DetailTabButton>
      {returnsAccess?.enabled && <DetailTabButton active={detailTab === 'returns'} onClick={() => setDetailTab('returns')}>Devoluções</DetailTabButton>}
      {afterSaleAccess?.enabled && <DetailTabButton active={detailTab === 'values'} onClick={() => setDetailTab('values')}>Créditos e reembolsos</DetailTabButton>}
    </nav>

    {detailTab === 'dispatch' && <>
      {hasConflict && <NoticeBanner variant="warning"><AlertTriangle className="mr-2 inline h-4 w-4" />O estoque mudou. Atualize ou reconcilie as reservas antes de entregar.</NoticeBanner>}
      {deliveryId && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-success p-4 text-success-foreground"><span className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5" />Retirada registrada</span><PdvDeliveryReceiptButton deliveryId={deliveryId} /></div>}

      <section aria-label="Itens da retirada" className="divide-y rounded-xl border">
      {detail.items.map((item) => {
        const reservation = item.reservations[0];
        const blocked = item.remainingQuantity <= 0 || (item.itemType === 'material' && (!reservation || reservation.hasConflict));
        return <div key={item.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0"><h3 className="font-semibold break-words">{item.description}</h3><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>Pedido: <strong className="text-foreground tabular-nums">{item.orderedQuantity} {item.unit}</strong></span><span>Retirado: <strong className="text-foreground tabular-nums">{item.deliveredQuantity} {item.unit}</strong></span><span>Restante: <strong className="text-foreground tabular-nums">{item.remainingQuantity} {item.unit}</strong></span></div></div>
          <label className="flex items-center gap-2 text-sm font-medium">Retirar agora<Input aria-label={`Quantidade de ${item.description}`} className="w-28 text-right tabular-nums" type="number" min={0} max={item.remainingQuantity} step="any" disabled={blocked || !canDeliver} value={quantities[item.id] ?? 0} onChange={(event) => { setQuantities((current) => ({ ...current, [item.id]: Number(event.target.value) })); attempt.current = null; }} /></label>
        </div>;
      })}
      </section>

      {shouldShowPdvDispatchActions(detail.order.status) && <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {!canDeliver && <p className="self-center text-sm text-muted-foreground">Seu perfil pode consultar, mas não registrar retiradas.</p>}
        <Button className="min-h-12" onClick={() => void deliver()} disabled={!canDeliver || !lines.length || hasConflict || mutation.isPending}>{mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}Registrar retirada</Button>
      </div>}
    </>}
    {detailTab === 'returns' && returnsAccess?.enabled && <PdvReturnsPanel orderId={detail.order.id} orderNumber={detail.order.number} remainingQuantity={detail.items.reduce((sum, item) => sum + Math.max(0, item.remainingQuantity), 0)} access={returnsAccess} onReload={onReload} />}
    {detailTab === 'values' && afterSaleAccess?.enabled && <PdvAfterSalePanel orderId={detail.order.id} access={afterSaleAccess} onReload={onReload} />}
  </div>;
}

function DetailTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`shrink-0 border-b-2 pb-2 text-sm font-semibold ${active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{children}</button>;
}
