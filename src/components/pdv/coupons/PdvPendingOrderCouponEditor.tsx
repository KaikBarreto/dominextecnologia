import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PdvCouponControl } from './PdvCouponControl';
import { usePdvPendingOrderCoupon, type PdvPendingOrderCouponContext } from '@/hooks/usePdvPendingOrderCoupon';
import { confirmedCouponDiscount, couponCartReady, couponCartSignature, type CartState, type PdvCartCoupon } from '@/lib/pdv/cart';

export function PdvPendingOrderCouponEditor({ context, formatCurrency, onSaved, onClose }: {
  context: PdvPendingOrderCouponContext; formatCurrency: (amount: number) => string;
  onSaved: (result: { total: number; revision: number }) => void; onClose: () => void;
}) {
  const order = usePdvPendingOrderCoupon(context); const [coupon, setCoupon] = useState<PdvCartCoupon | null>(null); const [error, setError] = useState<string | null>(null);
  const base = useMemo<CartState>(() => ({ customerId: order.data?.customerId ?? null, discount: 0, lines: (order.data?.items ?? []).map(item => ({ inventoryId: item.id, name: 'Item do pedido', imageUrl: null, unitPrice: item.net_cents / 100, unitCost: 0, discountAmount: 0, quantity: 1, availableQuantity: 1 })) }), [order.data]);
  useEffect(() => { if (order.data) setCoupon(order.data.couponId ? { id: order.data.couponId, code: order.data.couponCode ?? 'INDISPONIVEL', discountCents: order.data.discountCents, eligible: order.data.discountCents > 0, baseSignature: couponCartSignature(base) } : null); }, [base, order.data]);
  const cart = { ...base, coupon };
  async function save() {
    if (!order.data || !couponCartReady(cart)) return; setError(null);
    try { const result = await order.save.mutateAsync({ couponId: coupon?.id ?? null, discountCents: Math.round(confirmedCouponDiscount(cart) * 100), revision: order.data.revision }); if (result && order.isCurrent()) onSaved(result); }
    catch (error) { if (order.isCurrent()) setError(error instanceof Error ? error.message : 'Não foi possível alterar o cupom. Tente novamente.'); }
  }
  return <div className="space-y-3 rounded-lg border p-4" aria-label="Cupom do pedido pendente">
    <p className="text-sm font-semibold">Cupom promocional do pedido</p>
    {order.isLoading ? <p role="status" className="text-sm text-muted-foreground">Conferindo o pedido…</p> : order.isError ? <div role="alert"><p className="text-sm">{order.error?.message}</p><Button variant="outline" onClick={() => void order.refetch()}>Tentar novamente</Button></div> : order.data && <>
      <PdvCouponControl cart={cart} baseItems={order.data.items} disabled={order.save.isPending} onChange={setCoupon} />
      <p className="text-sm">Total após o cupom: <strong className="tabular-nums">{formatCurrency(Math.max(0, order.data.items.reduce((sum, item) => sum + item.net_cents, 0) / 100 - confirmedCouponDiscount(cart)))}</strong></p>
      <p className="text-xs text-muted-foreground">Esta escolha altera apenas o desconto promocional. Os demais descontos permanecem no pedido.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="button" disabled={order.save.isPending || !couponCartReady(cart)} onClick={() => void save()}>{order.save.isPending ? 'Aplicando…' : 'Confirmar cupom'}</Button>
    </>}
    <Button type="button" variant="cancel-ghost" className="ml-2" disabled={order.save.isPending} onClick={onClose}>Fechar</Button>
  </div>;
}
