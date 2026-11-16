import { describe, expect, it } from 'vitest';
import { confirmedCouponDiscount, couponCartReady, couponCartSignature, computeTotal, computeSubtotal, setDiscount, setLineQuantity, type CartState } from './cart';
import { couponBaseItems } from './couponCart';

const cart: CartState = { customerId: 'customer', discount: 10, lines: [
  { inventoryId: 'b', name: 'Segundo', unitPrice: 50, unitCost: 20, discountAmount: 0, quantity: 1, availableQuantity: 10, imageUrl: null },
  { inventoryId: 'a', name: 'Primeiro', unitPrice: 50, unitCost: 20, discountAmount: 0, quantity: 1, availableQuantity: 10, imageUrl: null },
] };
describe('cupom comercial no carrinho', () => {
  it('rateia o desconto manual em centavos antes de avaliar elegibilidade', () => {
    expect(couponBaseItems(cart).map(item => item.net_cents)).toEqual([4500, 4500]);
    const tiny = { ...cart, discount: 0.01 };
    const items = couponBaseItems(tiny);
    expect(items.find(item => item.id === 'a')?.net_cents).toBe(4999);
    expect(items.reduce((sum, item) => sum + item.net_cents, 0)).toBe(9999);
    expect(couponBaseItems({ ...cart, lines: [...cart.lines].reverse(), discount: 0.01 }).find(item => item.id === 'a')?.net_cents).toBe(4999);
  });
  it('subtrai cupom uma única vez além do desconto manual, preservando bruto/custo', () => {
    const selected = { ...cart, coupon: { id: 'promo', code: 'PROMO20', discountCents: 2000, eligible: true, baseSignature: couponCartSignature(cart) } };
    expect(computeTotal(selected)).toBe(70);
    expect(confirmedCouponDiscount(selected)).toBe(20);
    expect(selected.lines[0].unitPrice).toBe(50);
    expect(selected.lines[0].unitCost).toBe(20);
    expect(couponCartReady(selected)).toBe(true);
  });
  it('exige nova confirmação ao alterar cliente, quantidade ou desconto manual', () => {
    const selected = { ...cart, coupon: { id: 'promo', code: 'PROMO20', discountCents: 2000, eligible: true, baseSignature: couponCartSignature(cart) } };
    for (const changed of [setDiscount(selected, 11), setLineQuantity(selected, 'a', 2), { ...selected, customerId: 'other' }]) {
      expect(confirmedCouponDiscount(changed)).toBe(0);
      expect(couponCartReady(changed)).toBe(false);
    }
  });
  it('soma o bruto arredondado por linha como o servidor em vendas fracionadas', () => {
    const fractional = { ...cart, discount: 0, lines: Array.from({ length: 30 }, (_, index) => ({ ...cart.lines[0], inventoryId: String(index), quantity: 0.333, unitPrice: 3.33 })) };
    expect(computeSubtotal(fractional)).toBe(33.30);
    expect(couponBaseItems(fractional).reduce((sum, line) => sum + line.net_cents, 0)).toBe(3330);
    expect(computeTotal(fractional)).toBe(33.30);
    expect(computeSubtotal({ ...fractional, lines: [{ ...fractional.lines[0], quantity: 1.005, unitPrice: 1 }] })).toBe(1.01);
  });
  it('não aceita valor inválido ou avaliação inelegível como desconto', () => {
    expect(confirmedCouponDiscount({ ...cart, coupon: { id: 'p', code: 'P', discountCents: Number.NaN, eligible: true, baseSignature: couponCartSignature(cart) } })).toBe(0);
    expect(confirmedCouponDiscount({ ...cart, coupon: { id: 'p', code: 'P', discountCents: 2000, eligible: false, baseSignature: couponCartSignature(cart) } })).toBe(0);
  });
});
