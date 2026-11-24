import { cartLineGrossCents, type CartState } from './cart';
import type { PdvCouponBaseItem } from '@/hooks/usePdvCoupons';

/** Mesmo largest remainder do servidor: centavos inteiros; nunca flutuação monetária. */
export function couponBaseItems(cart: CartState): PdvCouponBaseItem[] {
  const lines = cart.lines.map(line => ({ id: line.inventoryId, inventory_id: line.inventoryId, net_cents: Math.max(0, cartLineGrossCents(line) - Math.round(line.discountAmount * 100)) }));
  const subtotal = lines.reduce((sum, line) => sum + line.net_cents, 0);
  const discount = Math.min(subtotal, Math.max(0, Math.round(cart.discount * 100)));
  if (!subtotal || !discount) return lines;
  const shares = lines.map(line => ({ ...line, raw: discount * line.net_cents / subtotal, base: Math.floor(discount * line.net_cents / subtotal) }));
  let remainder = discount - shares.reduce((sum, line) => sum + line.base, 0);
  const ranked = [...shares].sort((a, b) => (b.raw - b.base) - (a.raw - a.base) || a.id.localeCompare(b.id));
  const allocations = new Map(ranked.map(line => [line.id, line.base + (remainder-- > 0 ? 1 : 0)]));
  return lines.map(line => ({ ...line, net_cents: line.net_cents - (allocations.get(line.id) ?? 0) }));
}
