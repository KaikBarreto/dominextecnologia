/**
 * Motor do carrinho do PDV (Caixa). Função pura, sem React e sem Supabase, de
 * propósito: é a parte onde erro vira dinheiro errado, então precisa ser
 * testável isoladamente do componente (que muda de forma a cada onda).
 *
 * Onda 1 entrega a tela "até o ponto de pronto para pagar" — o motor aqui
 * monta e soma o carrinho de verdade, mas NÃO grava nada e NÃO decide forma
 * de pagamento. Isso é da RPC `pdv_settle_order` (ainda não existe).
 *
 * Regra de saldo: um item sem saldo (`availableQuantity <= 0`) nunca entra no
 * carrinho. Um item com saldo não deixa a quantidade da linha passar do saldo
 * disponível naquele local — a tela do balcão não pode vender o que não tem.
 */

export interface CartProduct {
  inventoryId: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  /**
   * Custo unitário do catálogo (`inventory.cost_price`) no momento em que o
   * item entrou no carrinho. Vira SNAPSHOT em `pdv_order_items.unit_cost`, que
   * é o que faz o lucro real do caixa: ler o custo do catálogo depois da venda
   * daria margem retroativa fantasiosa.
   */
  unitCost?: number;
  /** Saldo no local de venda selecionado (`stocks.purpose = 'pdv'`). */
  availableQuantity: number;
}

export interface CartLine {
  inventoryId: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  /** Snapshot do custo (ver `CartProduct.unitCost`). */
  unitCost: number;
  quantity: number;
  /** Saldo capturado no momento da linha — usado como teto de incremento. */
  availableQuantity: number;
}

export interface CartState {
  lines: CartLine[];
  /** Desconto em R$, valor absoluto. Ainda sem regra de teto (Onda 1). */
  discount: number;
  customerId: string | null;
}

export type AddItemFailureReason = 'out_of_stock' | 'insufficient_stock';

export type CartMutationResult =
  | { ok: true; cart: CartState }
  | { ok: false; cart: CartState; reason: AddItemFailureReason };

export const EMPTY_CART: CartState = { lines: [], discount: 0, customerId: null };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Adiciona `quantity` unidades do produto. Soma na linha existente quando o
 * produto já está no carrinho (nunca duplica linha pro mesmo item).
 *
 * Falha sem mutar o carrinho quando:
 * - o produto não tem saldo algum (`out_of_stock`);
 * - a quantidade resultante passaria do saldo disponível (`insufficient_stock`).
 */
export function addItem(cart: CartState, product: CartProduct, quantity = 1): CartMutationResult {
  if (product.availableQuantity <= 0) {
    return { ok: false, cart, reason: 'out_of_stock' };
  }
  if (quantity <= 0) {
    return { ok: true, cart };
  }

  const existing = cart.lines.find((line) => line.inventoryId === product.inventoryId);
  const nextQuantity = (existing?.quantity ?? 0) + quantity;

  if (nextQuantity > product.availableQuantity) {
    return { ok: false, cart, reason: 'insufficient_stock' };
  }

  if (existing) {
    return {
      ok: true,
      cart: {
        ...cart,
        lines: cart.lines.map((line) =>
          line.inventoryId === product.inventoryId
            ? { ...line, quantity: nextQuantity, availableQuantity: product.availableQuantity }
            : line,
        ),
      },
    };
  }

  const newLine: CartLine = {
    inventoryId: product.inventoryId,
    name: product.name,
    imageUrl: product.imageUrl,
    unitPrice: product.unitPrice,
    unitCost: product.unitCost ?? 0,
    quantity,
    availableQuantity: product.availableQuantity,
  };

  return { ok: true, cart: { ...cart, lines: [...cart.lines, newLine] } };
}

/** Remove a linha inteira, qualquer que seja a quantidade. */
export function removeItem(cart: CartState, inventoryId: string): CartState {
  return { ...cart, lines: cart.lines.filter((line) => line.inventoryId !== inventoryId) };
}

/**
 * Define a quantidade exata de uma linha, com teto no saldo disponível.
 * Quantidade <= 0 remove a linha (é o caminho do botão "−" até zerar).
 */
export function setLineQuantity(cart: CartState, inventoryId: string, quantity: number): CartState {
  if (quantity <= 0) {
    return removeItem(cart, inventoryId);
  }
  return {
    ...cart,
    lines: cart.lines.map((line) =>
      line.inventoryId === inventoryId
        ? { ...line, quantity: clamp(quantity, 1, line.availableQuantity) }
        : line,
    ),
  };
}

/** `+`/`−` da linha. Delta negativo que zera a quantidade remove a linha. */
export function incrementLineQuantity(cart: CartState, inventoryId: string, delta: number): CartState {
  const line = cart.lines.find((l) => l.inventoryId === inventoryId);
  if (!line) return cart;
  return setLineQuantity(cart, inventoryId, line.quantity + delta);
}

/** Desconto em R$. Clampa em >= 0 — teto (ex: % máximo por usuário) é Onda 4. */
export function setDiscount(cart: CartState, discount: number): CartState {
  return { ...cart, discount: Math.max(0, discount) };
}

export function setCartCustomer(cart: CartState, customerId: string | null): CartState {
  return { ...cart, customerId };
}

export function clearCart(cart: CartState): CartState {
  return { ...EMPTY_CART, customerId: cart.customerId };
}

export function computeSubtotal(cart: CartState): number {
  return cart.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
}

/** Total nunca fica negativo, mesmo com desconto maior que o subtotal. */
export function computeTotal(cart: CartState): number {
  return Math.max(0, computeSubtotal(cart) - cart.discount);
}

export function countItems(cart: CartState): number {
  return cart.lines.reduce((sum, line) => sum + line.quantity, 0);
}
