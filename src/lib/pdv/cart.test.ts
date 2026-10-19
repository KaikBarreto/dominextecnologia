import { describe, expect, it } from 'vitest';
import {
  EMPTY_CART,
  addItem,
  clearCart,
  computeItemDiscountTotal,
  computeSubtotal,
  computeTotal,
  countItems,
  incrementLineQuantity,
  removeItem,
  setCartCustomer,
  setDiscount,
  setLineDiscount,
  setLineQuantity,
  type CartProduct,
} from './cart';

function product(overrides: Partial<CartProduct> = {}): CartProduct {
  return {
    inventoryId: 'p1',
    name: 'Capacitor 40uF',
    imageUrl: null,
    unitPrice: 25,
    availableQuantity: 10,
    ...overrides,
  };
}

describe('addItem', () => {
  it('adiciona o produto como linha nova', () => {
    const result = addItem(EMPTY_CART, product());
    expect(result.ok).toBe(true);
    expect(result.cart.lines).toHaveLength(1);
    expect(result.cart.lines[0]).toMatchObject({
      inventoryId: 'p1',
      quantity: 1,
      unitPrice: 25,
      discountAmount: 0,
    });
  });

  it('soma quantidade na mesma linha em vez de duplicar', () => {
    const first = addItem(EMPTY_CART, product());
    const second = addItem(first.cart, product(), 2);
    expect(second.ok).toBe(true);
    expect(second.cart.lines).toHaveLength(1);
    expect(second.cart.lines[0].quantity).toBe(3);
  });

  it('bloqueia item sem saldo nenhum', () => {
    const result = addItem(EMPTY_CART, product({ availableQuantity: 0 }));
    expect(result.ok).toBe(false);
    // `=== false` (não `!result.ok`): sem strictNullChecks neste tsconfig, a
    // negação bare não estreita o discriminated union (TS2339 em 'reason').
    if (result.ok === false) expect(result.reason).toBe('out_of_stock');
    expect(result.cart.lines).toHaveLength(0);
  });

  it('bloqueia quando a soma passaria do saldo disponível', () => {
    const first = addItem(EMPTY_CART, product({ availableQuantity: 3 }), 3);
    expect(first.ok).toBe(true);
    const second = addItem(first.cart, product({ availableQuantity: 3 }), 1);
    expect(second.ok).toBe(false);
    if (second.ok === false) expect(second.reason).toBe('insufficient_stock');
    // Carrinho preservado sem a tentativa que falhou.
    expect(second.cart.lines[0].quantity).toBe(3);
  });

  it('ignora quantidade zero ou negativa sem alterar o carrinho', () => {
    const result = addItem(EMPTY_CART, product(), 0);
    expect(result.ok).toBe(true);
    expect(result.cart.lines).toHaveLength(0);
  });
});

describe('removeItem', () => {
  it('remove a linha inteira', () => {
    const withItem = addItem(EMPTY_CART, product(), 5).cart;
    const result = removeItem(withItem, 'p1');
    expect(result.lines).toHaveLength(0);
  });

  it('não quebra ao remover item que não está no carrinho', () => {
    const result = removeItem(EMPTY_CART, 'inexistente');
    expect(result.lines).toHaveLength(0);
  });
});

describe('setLineQuantity', () => {
  it('define a quantidade exata, respeitando o teto do saldo', () => {
    const withItem = addItem(EMPTY_CART, product({ availableQuantity: 5 }), 1).cart;
    const result = setLineQuantity(withItem, 'p1', 4);
    expect(result.lines[0].quantity).toBe(4);
  });

  it('clampa acima do saldo disponível', () => {
    const withItem = addItem(EMPTY_CART, product({ availableQuantity: 5 }), 1).cart;
    const result = setLineQuantity(withItem, 'p1', 99);
    expect(result.lines[0].quantity).toBe(5);
  });

  it('quantidade zero remove a linha', () => {
    const withItem = addItem(EMPTY_CART, product(), 1).cart;
    const result = setLineQuantity(withItem, 'p1', 0);
    expect(result.lines).toHaveLength(0);
  });
});

describe('incrementLineQuantity', () => {
  it('soma e subtrai a quantidade da linha', () => {
    const withItem = addItem(EMPTY_CART, product({ availableQuantity: 10 }), 2).cart;
    const incremented = incrementLineQuantity(withItem, 'p1', 1);
    expect(incremented.lines[0].quantity).toBe(3);
    const decremented = incrementLineQuantity(incremented, 'p1', -2);
    expect(decremented.lines[0].quantity).toBe(1);
  });

  it('delta que zera a quantidade remove a linha', () => {
    const withItem = addItem(EMPTY_CART, product(), 1).cart;
    const result = incrementLineQuantity(withItem, 'p1', -1);
    expect(result.lines).toHaveLength(0);
  });

  it('não faz nada se a linha não existe', () => {
    const result = incrementLineQuantity(EMPTY_CART, 'inexistente', 1);
    expect(result).toEqual(EMPTY_CART);
  });
});

describe('subtotal e total', () => {
  it('soma quantidade * preço unitário de todas as linhas', () => {
    let cart = addItem(EMPTY_CART, product({ inventoryId: 'p1', unitPrice: 10 }), 2).cart;
    cart = addItem(cart, product({ inventoryId: 'p2', unitPrice: 5, availableQuantity: 20 }), 3).cart;
    expect(computeSubtotal(cart)).toBe(2 * 10 + 3 * 5);
  });

  it('total aplica o desconto', () => {
    const withItem = addItem(EMPTY_CART, product({ unitPrice: 25 }), 2).cart;
    const withDiscount = setDiscount(withItem, 10);
    expect(computeSubtotal(withDiscount)).toBe(50);
    expect(computeTotal(withDiscount)).toBe(40);
  });

  it('aplica desconto absoluto na linha e o soma separadamente', () => {
    let cart = addItem(EMPTY_CART, product({ unitPrice: 25 }), 2).cart;
    cart = setLineDiscount(cart, 'p1', 12.5);
    expect(cart.lines[0].discountAmount).toBe(12.5);
    expect(computeItemDiscountTotal(cart)).toBe(12.5);
    expect(computeSubtotal(cart)).toBe(50);
    expect(computeTotal(cart)).toBe(37.5);
  });

  it('clampa o desconto da linha ao bruto atual', () => {
    const withItem = addItem(EMPTY_CART, product({ unitPrice: 10 }), 2).cart;
    expect(setLineDiscount(withItem, 'p1', 999).lines[0].discountAmount).toBe(20);
    expect(setLineDiscount(withItem, 'p1', -5).lines[0].discountAmount).toBe(0);
  });

  it('reduz o desconto da linha quando a quantidade diminui', () => {
    let cart = addItem(EMPTY_CART, product({ unitPrice: 10 }), 5).cart;
    cart = setLineDiscount(cart, 'p1', 40);
    cart = setLineQuantity(cart, 'p1', 2);
    expect(cart.lines[0]).toMatchObject({ quantity: 2, discountAmount: 20 });
  });

  it('combina desconto dos itens com desconto do pedido', () => {
    let cart = addItem(EMPTY_CART, product({ unitPrice: 25 }), 2).cart;
    cart = setLineDiscount(cart, 'p1', 8);
    cart = setDiscount(cart, 7);
    expect(computeSubtotal(cart)).toBe(50);
    expect(computeTotal(cart)).toBe(35);
  });

  it('total nunca fica negativo ao combinar descontos de item e pedido', () => {
    let cart = addItem(EMPTY_CART, product({ unitPrice: 10 }), 1).cart;
    cart = setLineDiscount(cart, 'p1', 10);
    cart = setDiscount(cart, 999);
    expect(computeTotal(cart)).toBe(0);
  });

  it('total nunca fica negativo mesmo com desconto maior que o subtotal', () => {
    const withItem = addItem(EMPTY_CART, product({ unitPrice: 10 }), 1).cart;
    const withDiscount = setDiscount(withItem, 999);
    expect(computeTotal(withDiscount)).toBe(0);
  });

  it('desconto negativo é clampado em zero', () => {
    const result = setDiscount(EMPTY_CART, -5);
    expect(result.discount).toBe(0);
  });
});

describe('countItems', () => {
  it('soma as quantidades de todas as linhas', () => {
    let cart = addItem(EMPTY_CART, product({ inventoryId: 'p1' }), 2).cart;
    cart = addItem(cart, product({ inventoryId: 'p2', availableQuantity: 20 }), 3).cart;
    expect(countItems(cart)).toBe(5);
  });
});

describe('cliente e limpeza do carrinho', () => {
  it('define e troca o cliente selecionado', () => {
    const withCustomer = setCartCustomer(EMPTY_CART, 'cust-1');
    expect(withCustomer.customerId).toBe('cust-1');
    expect(setCartCustomer(withCustomer, null).customerId).toBeNull();
  });

  it('clearCart zera linhas e desconto, preservando o cliente selecionado', () => {
    let cart = addItem(EMPTY_CART, product(), 2).cart;
    cart = setDiscount(cart, 5);
    cart = setCartCustomer(cart, 'cust-1');
    const cleared = clearCart(cart);
    expect(cleared.lines).toHaveLength(0);
    expect(cleared.discount).toBe(0);
    expect(cleared.customerId).toBe('cust-1');
  });
});
