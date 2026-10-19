/**
 * Rascunho transitório criado ao escolher "Editar" numa venda paga.
 *
 * A venda original continua válida enquanto este snapshot é editado. Somente
 * ao FINALIZAR a RPC `pdv_replace_order` estorna a original e grava a
 * substituta, na mesma transação. `sessionStorage` permite sobreviver a um
 * reload sem transformar dados financeiros em parâmetro de URL.
 */
export interface PdvSaleEditDraft {
  /** Escopo impede que um terminal compartilhado entregue o rascunho ao próximo usuário/tenant. */
  ownerUserId: string;
  companyId: string;
  /** Persistida: retry após timeout/reload usa a mesma chave no servidor. */
  clientRequestId: string;
  sourceOrderId: string;
  sourceReference: string;
  customerId: string | null;
  stockId: string | null;
  discountAmount: number;
  notes: string;
  /** Competência original da venda; editar não pode deslocar DRE/relatórios para hoje. */
  transactionDate: string;
  items: Array<{
    inventoryId: string;
    description: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
    discountAmount: number;
  }>;
}

const STORAGE_KEY_PREFIX = 'dominex:pdv:sale-edit-draft';
const LEGACY_STORAGE_KEY = STORAGE_KEY_PREFIX;

function storageKey(sourceOrderId: string): string {
  return `${STORAGE_KEY_PREFIX}:${sourceOrderId}`;
}

export function isPdvSaleEditDraft(
  value: unknown,
  sourceOrderId: string,
  owner: { userId: string | null | undefined; companyId: string | null | undefined },
): value is PdvSaleEditDraft {
  if (!value || typeof value !== 'object' || !owner.userId || !owner.companyId) return false;
  const draft = value as Partial<PdvSaleEditDraft>;
  return (
    draft.sourceOrderId === sourceOrderId
    && draft.ownerUserId === owner.userId
    && draft.companyId === owner.companyId
    && typeof draft.clientRequestId === 'string'
    && draft.clientRequestId.length > 0
    && typeof draft.sourceReference === 'string'
    && (draft.customerId == null || typeof draft.customerId === 'string')
    && (draft.stockId == null || typeof draft.stockId === 'string')
    && Number.isFinite(draft.discountAmount)
    && Number(draft.discountAmount) >= 0
    && typeof draft.notes === 'string'
    && typeof draft.transactionDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(draft.transactionDate)
    && Array.isArray(draft.items)
    && draft.items.length > 0
    && draft.items.every((item) => (
      !!item
      && typeof item.inventoryId === 'string'
      && item.inventoryId.length > 0
      && typeof item.description === 'string'
      && item.description.trim().length > 0
      && Number.isFinite(item.quantity)
      && item.quantity > 0
      && Number.isFinite(item.unitPrice)
      && item.unitPrice >= 0
      && Number.isFinite(item.unitCost)
      && item.unitCost >= 0
      && Number.isFinite(item.discountAmount)
      && item.discountAmount >= 0
    ))
  );
}

export function savePdvSaleEditDraft(draft: PdvSaleEditDraft): void {
  try {
    sessionStorage.setItem(storageKey(draft.sourceOrderId), JSON.stringify(draft));
    // Remove o formato antigo (uma chave global que fazia uma edição apagar a
    // outra e podia sobreviver à troca de usuário no mesmo terminal).
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // O estado de navegação continua sendo o fallback quando storage é negado.
  }
}

export function loadPdvSaleEditDraft(
  sourceOrderId: string | null,
  owner: { userId: string | null | undefined; companyId: string | null | undefined },
): PdvSaleEditDraft | null {
  if (!sourceOrderId || !owner.userId || !owner.companyId) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(sourceOrderId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isPdvSaleEditDraft(parsed, sourceOrderId, owner) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPdvSaleEditDraft(sourceOrderId?: string): void {
  try {
    if (sourceOrderId) sessionStorage.removeItem(storageKey(sourceOrderId));
    else sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Limpeza best-effort; nunca bloqueia uma venda concluída.
  }
}
