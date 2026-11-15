import { EMPTY_CART, type CartState } from '@/lib/pdv/cart';

export const MAX_PDV_SALE_DRAFTS = 20;

export interface PdvSaleAttempt {
  signature: string;
  orderId: string | null;
  clientRequestId: string;
  /** Presente somente na venda direta com identidade financeira durável. */
  directSaleVersion?: 3;
  idempotencyKey?: string;
  confirmedSale?: {
    orderId: string; orderNumber: number; deliveryId: string;
    subtotal: number; discountAmount: number; total: number; idempotent: boolean;
  };
}

/**
 * Voucher escolhido no resumo da venda. Ele permanece apenas como intenção
 * no rascunho; o saldo só é consumido pela RPC de liquidação, sob lock.
 */
export interface PdvAppliedVoucher {
  voucherId: string;
  code: string;
  amount: number;
  balance: number;
  expiresOn: string | null;
}

export interface PdvSaleDraft {
  id: string;
  sequence: number;
  cart: CartState;
  stockId: string | null;
  notes: string;
  transactionDate: string;
  transactionDateTouched: boolean;
  appliedVoucher: PdvAppliedVoucher | null;
  attempt: PdvSaleAttempt | null;
  createdAt: string;
  updatedAt: string;
}

export interface PdvSaleDraftWorkspace {
  drafts: PdvSaleDraft[];
  activeId: string;
  nextSequence: number;
}

type DraftOwner = { companyId: string; userId: string; cashSessionId: string; terminalId: string; stockId: string };

function cloneCart(cart: CartState): CartState {
  return {
    customerId: cart.customerId,
    discount: cart.discount,
    lines: cart.lines.map((line) => ({ ...line })),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export function pdvSaleDraftStorageKey(owner: DraftOwner): string {
  return `pdv_sale_drafts:${owner.companyId}:${owner.userId}:${owner.cashSessionId}:${owner.terminalId}:${owner.stockId}`;
}

export function createPdvSaleDraft(
  sequence: number,
  transactionDate: string,
  stockId: string | null = null,
  id = crypto.randomUUID(),
): PdvSaleDraft {
  const timestamp = nowIso();
  return {
    id,
    sequence,
    cart: cloneCart(EMPTY_CART),
    stockId,
    notes: '',
    transactionDate,
    transactionDateTouched: false,
    appliedVoucher: null,
    attempt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createPdvSaleWorkspace(
  transactionDate: string,
  stockId: string | null = null,
): PdvSaleDraftWorkspace {
  const draft = createPdvSaleDraft(1, transactionDate, stockId);
  return { drafts: [draft], activeId: draft.id, nextSequence: 2 };
}

export function hasPdvSaleDraftContent(draft: PdvSaleDraft): boolean {
  return (
    draft.cart.lines.length > 0 ||
    draft.cart.customerId != null ||
    draft.cart.discount > 0 ||
    draft.notes.trim().length > 0 ||
    draft.appliedVoucher != null ||
    draft.transactionDateTouched
  );
}

/** Trocar a pessoa remove qualquer voucher vinculado à pessoa anterior. */
export function setPdvSaleDraftCustomer(draft: PdvSaleDraft, customerId: string | null): PdvSaleDraft {
  return {
    ...draft,
    cart: { ...draft.cart, customerId },
    appliedVoucher: customerId === draft.cart.customerId ? draft.appliedVoucher : null,
    attempt: null,
  };
}

/**
 * Atualiza um rascunho PELO ID, nunca pelo "ativo" lido depois. Essa é a
 * trava principal contra contaminação quando o operador troca de pedido
 * enquanto um evento/await antigo ainda está terminando.
 */
export function updatePdvSaleDraft(
  workspace: PdvSaleDraftWorkspace,
  draftId: string,
  updater: (draft: PdvSaleDraft) => PdvSaleDraft,
): PdvSaleDraftWorkspace {
  if (!workspace.drafts.some((draft) => draft.id === draftId)) return workspace;
  return {
    ...workspace,
    drafts: workspace.drafts.map((draft) =>
      draft.id === draftId
        ? { ...updater({ ...draft, cart: cloneCart(draft.cart) }), id: draft.id, updatedAt: nowIso() }
        : draft,
    ),
  };
}

export function addPdvSaleDraft(
  workspace: PdvSaleDraftWorkspace,
  transactionDate: string,
  stockId: string | null = null,
): PdvSaleDraftWorkspace {
  if (workspace.drafts.length >= MAX_PDV_SALE_DRAFTS) return workspace;
  const draft = createPdvSaleDraft(workspace.nextSequence, transactionDate, stockId);
  return {
    drafts: [...workspace.drafts, draft],
    activeId: draft.id,
    nextSequence: workspace.nextSequence + 1,
  };
}

export function selectPdvSaleDraft(
  workspace: PdvSaleDraftWorkspace,
  draftId: string,
): PdvSaleDraftWorkspace {
  if (workspace.activeId === draftId || !workspace.drafts.some((draft) => draft.id === draftId)) {
    return workspace;
  }
  return { ...workspace, activeId: draftId };
}

export function deletePdvSaleDraft(
  workspace: PdvSaleDraftWorkspace,
  draftId: string,
  transactionDate: string,
  stockId: string | null = null,
): PdvSaleDraftWorkspace {
  const index = workspace.drafts.findIndex((draft) => draft.id === draftId);
  if (index < 0) return workspace;

  const remaining = workspace.drafts.filter((draft) => draft.id !== draftId);
  if (remaining.length === 0) {
    const replacement = createPdvSaleDraft(workspace.nextSequence, transactionDate, stockId);
    return {
      drafts: [replacement],
      activeId: replacement.id,
      nextSequence: workspace.nextSequence + 1,
    };
  }

  const nextActiveId = workspace.activeId === draftId
    ? remaining[Math.min(index, remaining.length - 1)].id
    : workspace.activeId;
  return { ...workspace, drafts: remaining, activeId: nextActiveId };
}

function isCartState(value: unknown): value is CartState {
  if (!value || typeof value !== 'object') return false;
  const cart = value as Partial<CartState>;
  return (
    Array.isArray(cart.lines) &&
    typeof cart.discount === 'number' &&
    (cart.customerId == null || typeof cart.customerId === 'string')
  );
}

function sanitizeDraft(value: unknown): PdvSaleDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<PdvSaleDraft>;
  if (
    typeof draft.id !== 'string' ||
    typeof draft.sequence !== 'number' ||
    !isCartState(draft.cart) ||
    typeof draft.transactionDate !== 'string'
  ) return null;

  const timestamp = nowIso();
  const rawVoucher = draft.appliedVoucher && typeof draft.appliedVoucher === 'object'
    ? draft.appliedVoucher as Partial<PdvAppliedVoucher>
    : null;
  const appliedVoucher = rawVoucher
    && typeof rawVoucher.voucherId === 'string'
    && typeof rawVoucher.code === 'string'
    && typeof rawVoucher.amount === 'number'
    && Number.isFinite(rawVoucher.amount)
    && rawVoucher.amount > 0
    && typeof rawVoucher.balance === 'number'
    && Number.isFinite(rawVoucher.balance)
      ? {
          voucherId: rawVoucher.voucherId,
          code: rawVoucher.code,
          amount: Math.min(rawVoucher.amount, Math.max(0, rawVoucher.balance)),
          balance: Math.max(0, rawVoucher.balance),
          expiresOn: typeof rawVoucher.expiresOn === 'string' ? rawVoucher.expiresOn : null,
        }
      : null;
  return {
    id: draft.id,
    sequence: Math.max(1, Math.floor(draft.sequence)),
    cart: cloneCart(draft.cart),
    stockId: typeof draft.stockId === 'string' ? draft.stockId : null,
    notes: typeof draft.notes === 'string' ? draft.notes : '',
    transactionDate: draft.transactionDate,
    transactionDateTouched: draft.transactionDateTouched === true,
    appliedVoucher,
    attempt:
      draft.attempt &&
      typeof draft.attempt.signature === 'string' &&
      typeof draft.attempt.clientRequestId === 'string'
        ? {
            signature: draft.attempt.signature,
            orderId: typeof draft.attempt.orderId === 'string' ? draft.attempt.orderId : null,
            clientRequestId: draft.attempt.clientRequestId,
            ...(draft.attempt.directSaleVersion === 3 ? {
              directSaleVersion: 3 as const,
              idempotencyKey: typeof draft.attempt.idempotencyKey === 'string' ? draft.attempt.idempotencyKey : undefined,
              confirmedSale: draft.attempt.confirmedSale && typeof draft.attempt.confirmedSale.orderId === 'string'
                && draft.attempt.confirmedSale.orderId === draft.attempt.orderId
                && typeof draft.attempt.confirmedSale.deliveryId === 'string'
                && [draft.attempt.confirmedSale.orderNumber, draft.attempt.confirmedSale.subtotal,
                  draft.attempt.confirmedSale.discountAmount, draft.attempt.confirmedSale.total].every(Number.isFinite)
                ? { orderId: draft.attempt.confirmedSale.orderId, orderNumber: draft.attempt.confirmedSale.orderNumber,
                  deliveryId: draft.attempt.confirmedSale.deliveryId, subtotal: draft.attempt.confirmedSale.subtotal,
                  discountAmount: draft.attempt.confirmedSale.discountAmount, total: draft.attempt.confirmedSale.total,
                  idempotent: draft.attempt.confirmedSale.idempotent === true }
                : undefined,
            } : {}),
          }
        : null,
    createdAt: typeof draft.createdAt === 'string' ? draft.createdAt : timestamp,
    updatedAt: typeof draft.updatedAt === 'string' ? draft.updatedAt : timestamp,
  };
}

export function parsePdvSaleWorkspace(
  raw: string | null,
  transactionDate: string,
  stockId: string | null = null,
): PdvSaleDraftWorkspace {
  if (!raw) return createPdvSaleWorkspace(transactionDate, stockId);
  try {
    const parsed = JSON.parse(raw) as Partial<PdvSaleDraftWorkspace>;
    const drafts = (Array.isArray(parsed.drafts) ? parsed.drafts : [])
      .map(sanitizeDraft)
      .filter((draft): draft is PdvSaleDraft => draft != null);
    if (drafts.length === 0) return createPdvSaleWorkspace(transactionDate, stockId);
    const activeId = drafts.some((draft) => draft.id === parsed.activeId)
      ? parsed.activeId as string
      : drafts[0].id;
    const highestSequence = drafts.reduce((max, draft) => Math.max(max, draft.sequence), 0);
    return {
      drafts,
      activeId,
      nextSequence: Math.max(highestSequence + 1, Number(parsed.nextSequence) || 1),
    };
  } catch {
    return createPdvSaleWorkspace(transactionDate, stockId);
  }
}
