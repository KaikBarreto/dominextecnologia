import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callPdvCouponRpc, PDV_COUPONS_ROOT, usePdvCouponOperationScope, type PdvCouponBaseItem } from './usePdvCoupons';

export interface PdvPendingOrderCouponContext { orderId: string; terminalId: string; cashSessionId: string; cashAccountId: string }
export interface PdvPendingOrderCouponSnapshot {
  orderId: string; revision: number; customerId: string | null; total: number;
  couponId: string | null; couponCode: string | null; discountCents: number; items: PdvCouponBaseItem[];
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = (): never => { throw new Error('Não foi possível confirmar o desconto deste pedido. Atualize os dados e tente novamente.'); };
function uuid(value: unknown): string { return typeof value === 'string' && UUID.test(value) ? value : invalid(); }
function cents(value: unknown): number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid(); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid(); }
export function projectPdvPendingOrderCoupon(value: unknown, orderId: string): PdvPendingOrderCouponSnapshot {
  const row = record(value); if (row.order_id !== orderId || !Array.isArray(row.items) || !row.items.length) return invalid();
  const items = row.items.map(value => { const item = record(value); return { id: uuid(item.id), inventory_id: item.inventory_id === null ? null : uuid(item.inventory_id), net_cents: cents(item.net_cents) }; });
  if (new Set(items.map(item => item.id)).size !== items.length) return invalid();
  const total = typeof row.total === 'number' && Number.isFinite(row.total) && row.total >= 0 && Math.round(row.total * 100) / 100 === row.total ? row.total : invalid();
  const discount = cents(row.discount_cents); const sum = items.reduce((amount, item) => amount + item.net_cents, 0);
  if (!Number.isSafeInteger(sum) || sum - discount !== Math.round(total * 100) || row.coupon_id === null && discount !== 0) return invalid();
  const code = typeof row.coupon_code === 'string' && /^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(row.coupon_code) ? row.coupon_code : null;
  return { orderId: uuid(row.order_id), revision: cents(row.revision), customerId: row.customer_id === null ? null : uuid(row.customer_id), total, discountCents: discount, couponId: row.coupon_id === null ? null : uuid(row.coupon_id), couponCode: code, items };
}
export function usePdvPendingOrderCoupon(context: PdvPendingOrderCouponContext) {
  const scope = usePdvCouponOperationScope(['pending-order', context]); const client = useQueryClient(); const mutationToken = useRef<typeof scope.token | null>(null);
  const queryKey = [...PDV_COUPONS_ROOT, 'pending-order', ...scope.key, context];
  const args = { p_order_id: context.orderId, p_terminal_id: context.terminalId, p_cash_session_id: context.cashSessionId, p_cash_account_id: context.cashAccountId };
  const query = useQuery({ queryKey, enabled: scope.ready, staleTime: 0, gcTime: 0, placeholderData: () => undefined,
    queryFn: async ({ signal }) => { const value = await callPdvCouponRpc('pdv_get_pending_order_coupon_v1', args, signal); if (!scope.isCurrent() || signal.aborted) throw new Error('O contexto do pedido mudou.'); return projectPdvPendingOrderCoupon(value, context.orderId); },
  });
  const save = useMutation({
    mutationFn: async (input: { couponId: string | null; discountCents: number; revision: number }) => {
      if (!scope.isCurrent()) return undefined; mutationToken.current = scope.token;
      const controller = new AbortController(); scope.token.controllers.add(controller);
      try {
        const value = await callPdvCouponRpc('pdv_set_pending_order_coupon_v1', { ...args, p_coupon_id: input.couponId, p_expected_discount_cents: input.discountCents, p_expected_revision: input.revision }, controller.signal);
        if (!scope.isCurrent() || controller.signal.aborted) return undefined;
        const result = projectPdvPendingOrderCoupon(value, context.orderId);
        if (result.couponId !== input.couponId || result.discountCents !== input.discountCents || result.revision !== input.revision + 1) return invalid();
        return result;
      } catch (error) { if (scope.isCurrent() && !controller.signal.aborted) throw error; return undefined; }
      finally { scope.token.controllers.delete(controller); }
    },
    onSuccess: async result => {
      if (!result || !scope.isCurrent()) return;
      client.setQueryData(queryKey, result);
      await Promise.all([['pdv-counter', 'cash-queue'], ['pdv', 'orders-workspace'], ['pdv-orders'], ['pdv-sales-flow'], ['pdv-dispatch'], ['pdv-order-receipt'], ['pdv-cash-session-detail']].map(queryKey => client.invalidateQueries({ queryKey })));
    },
  });
  const visible = scope.isCurrent() && !query.isError;
  const mutationVisible = mutationToken.current === scope.token && scope.isCurrent();
  return { ...query, data: visible ? query.data : undefined, isError: scope.isCurrent() && query.isError, error: scope.isCurrent() ? query.error : null, save: { ...save, data: mutationVisible ? save.data : undefined, error: mutationVisible ? save.error : null, isPending: mutationVisible && save.isPending }, isCurrent: scope.isCurrent };
}
