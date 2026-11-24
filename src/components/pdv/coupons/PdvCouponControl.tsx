import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TicketPercent, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PdvCouponPicker } from './PdvCouponPicker';
import { usePdvCoupons, evaluatePdvCoupon, PDV_COUPONS_ROOT, usePdvCouponOperationScope, type PdvCouponBaseItem } from '@/hooks/usePdvCoupons';
import { couponCartSignature, type CartState, type PdvCartCoupon } from '@/lib/pdv/cart';
import { couponBaseItems } from '@/lib/pdv/couponCart';

export function PdvCouponControl({ cart, onChange, disabled = false, baseItems }: {
  cart: CartState; onChange: (value: PdvCartCoupon | null) => void; disabled?: boolean; baseItems?: PdvCouponBaseItem[];
}) {
  const [open, setOpen] = useState(false);
  const coupons = usePdvCoupons(false, open || !!cart.coupon);
  const signature = couponCartSignature(cart);
  const scope = usePdvCouponOperationScope(['preview', cart.coupon?.id, signature], !disabled);
  const items = useMemo(() => baseItems ?? couponBaseItems(cart), [baseItems, cart]);
  const query = useQuery({
    queryKey: [...PDV_COUPONS_ROOT, 'preview', ...scope.key, cart.coupon?.id, signature, JSON.stringify(items)],
    enabled: scope.ready && !!cart.coupon && items.length > 0 && !disabled,
    queryFn: async ({ signal }) => { const result = await evaluatePdvCoupon(cart.coupon!.id, cart.customerId, items, signal); if (!scope.isCurrent() || signal.aborted) throw new Error('O contexto do PDV mudou.'); return result; },
    staleTime: 0, gcTime: 0, placeholderData: () => undefined,
  });
  useEffect(() => {
    if (!query.data || query.isError || !scope.isCurrent() || !cart.coupon || disabled) return;
    const next: PdvCartCoupon = { id: cart.coupon.id, code: query.data.code ?? cart.coupon.code, discountCents: query.data.eligible ? query.data.discount_cents ?? 0 : 0, eligible: query.data.eligible, baseSignature: signature, message: query.data.message };
    if (JSON.stringify(next) !== JSON.stringify(cart.coupon)) onChange(next);
  }, [cart.coupon, disabled, onChange, query.data, query.isError, scope, signature]);
  return <div className="space-y-2">
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button className="min-w-0 flex-1 justify-start" variant="outline" disabled={disabled || !cart.lines.length}><TicketPercent className="mr-2 h-4 w-4 shrink-0" />{cart.coupon ? `Cupom ${cart.coupon.code}` : 'Usar cupom promocional'}</Button></PopoverTrigger>
        <PopoverContent align="end" className="w-[min(94vw,460px)] p-3">
          <p className="mb-3 text-sm font-semibold">Descontos promocionais</p>
          {coupons.isLoading ? <p role="status">Carregando cupons…</p> : coupons.isError ? <div role="alert"><p className="text-sm">Não foi possível carregar os cupons.</p><Button variant="outline" onClick={() => void coupons.refetch()}>Tentar novamente</Button></div> : <PdvCouponPicker coupons={coupons.coupons.map(coupon => ({ id: coupon.id, code: coupon.code, name: coupon.name, kind: coupon.kind, status: coupon.status, value: Number(coupon.value), ruleSummary: coupon.minimum_amount ? `Compra mínima de R$ ${Number(coupon.minimum_amount).toFixed(2).replace('.', ',')}` : 'Regras confirmadas ao selecionar', expiresOn: coupon.expires_on }))} selectedId={cart.coupon?.id} onSelect={coupon => { onChange({ id: coupon.id, code: coupon.code, discountCents: 0, eligible: false, baseSignature: '' }); setOpen(false); }} />}
        </PopoverContent></Popover>
      {cart.coupon && <Button variant="ghost" size="icon" aria-label="Remover cupom promocional" disabled={disabled} onClick={() => onChange(null)}><X className="h-4 w-4" /></Button>}
    </div>
    {cart.coupon && (query.isFetching ? <p role="status" className="text-xs text-muted-foreground">Conferindo as regras do cupom…</p> : query.isError ? <div role="alert" className="text-xs"><p>Não foi possível confirmar o cupom.</p><button type="button" className="underline" onClick={() => void query.refetch()}>Tentar novamente</button></div> : cart.coupon.message ? <p role="status" className="text-xs text-muted-foreground">{cart.coupon.message}</p> : <p className="text-xs text-muted-foreground">Desconto sujeito à confirmação no pagamento.</p>)}
  </div>;
}
