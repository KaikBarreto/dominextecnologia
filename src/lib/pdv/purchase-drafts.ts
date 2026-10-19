export const MAX_PDV_PURCHASE_DRAFTS = 20;

export interface PdvPurchaseItemDraft {
  id: string;
  inventoryId: string;
  quantityText: string;
  unitPriceText: string;
}

export type PdvPurchasePaymentStatus = 'paid' | 'pending';

export interface PdvPurchaseDraft {
  id: string;
  sequence: number;
  clientRequestId: string;
  description: string;
  supplierId: string;
  stockId: string;
  purchaseDate: string;
  purchaseDateTouched: boolean;
  items: PdvPurchaseItemDraft[];
  categoryId: string;
  accountId: string;
  paymentStatus: PdvPurchasePaymentStatus;
  paidDate: string;
  paidDateTouched: boolean;
  dueDate: string;
  paymentMethod: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface PdvPurchaseWorkspace {
  drafts: PdvPurchaseDraft[];
  activeId: string;
  nextSequence: number;
}

export interface PdvPurchaseDraftDefaults {
  purchaseDate: string;
  stockId?: string | null;
  accountId?: string | null;
  categoryId?: string | null;
}

interface PdvPurchaseDraftOwner {
  companyId: string;
  userId: string;
}

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

export const createPdvPurchaseItem = (id = newId()): PdvPurchaseItemDraft => ({
  id,
  inventoryId: '',
  quantityText: '',
  unitPriceText: '',
});

export function pdvPurchaseDraftStorageKey(owner: PdvPurchaseDraftOwner): string {
  return `pdv_purchase_drafts:${owner.companyId}:${owner.userId}`;
}

export function createPdvPurchaseDraft(
  sequence: number,
  defaults: PdvPurchaseDraftDefaults,
  id = newId(),
  clientRequestId = newId(),
): PdvPurchaseDraft {
  const timestamp = nowIso();
  return {
    id,
    sequence,
    clientRequestId,
    description: '',
    supplierId: '',
    stockId: defaults.stockId ?? '',
    purchaseDate: defaults.purchaseDate,
    purchaseDateTouched: false,
    items: [createPdvPurchaseItem()],
    categoryId: defaults.categoryId ?? '',
    accountId: defaults.accountId ?? '',
    paymentStatus: 'paid',
    paidDate: defaults.purchaseDate,
    paidDateTouched: false,
    dueDate: '',
    paymentMethod: '',
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createPdvPurchaseWorkspace(defaults: PdvPurchaseDraftDefaults): PdvPurchaseWorkspace {
  const draft = createPdvPurchaseDraft(1, defaults);
  return { drafts: [draft], activeId: draft.id, nextSequence: 2 };
}

export function hasPdvPurchaseDraftContent(draft: PdvPurchaseDraft): boolean {
  return Boolean(
    draft.description.trim()
    || draft.supplierId
    || draft.notes.trim()
    || draft.paymentMethod
    || draft.paymentStatus !== 'paid'
    || draft.purchaseDateTouched
    || draft.paidDateTouched
    || draft.items.some((item) => item.inventoryId || item.quantityText || item.unitPriceText),
  );
}

export const parsePdvPurchaseNumber = (value: string): number => {
  const parsed = Number((value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function pdvPurchaseDraftTotal(draft: PdvPurchaseDraft): number {
  return draft.items.reduce(
    (total, item) => total
      + parsePdvPurchaseNumber(item.quantityText) * parsePdvPurchaseNumber(item.unitPriceText),
    0,
  );
}

function cloneDraft(draft: PdvPurchaseDraft): PdvPurchaseDraft {
  return { ...draft, items: draft.items.map((item) => ({ ...item })) };
}

export function updatePdvPurchaseDraft(
  workspace: PdvPurchaseWorkspace,
  draftId: string,
  updater: (draft: PdvPurchaseDraft) => PdvPurchaseDraft,
): PdvPurchaseWorkspace {
  if (!workspace.drafts.some((draft) => draft.id === draftId)) return workspace;
  return {
    ...workspace,
    drafts: workspace.drafts.map((draft) => draft.id === draftId
      ? { ...updater(cloneDraft(draft)), id: draft.id, clientRequestId: draft.clientRequestId, updatedAt: nowIso() }
      : draft),
  };
}

export function addPdvPurchaseDraft(
  workspace: PdvPurchaseWorkspace,
  defaults: PdvPurchaseDraftDefaults,
): PdvPurchaseWorkspace {
  if (workspace.drafts.length >= MAX_PDV_PURCHASE_DRAFTS) return workspace;
  const draft = createPdvPurchaseDraft(workspace.nextSequence, defaults);
  return {
    drafts: [...workspace.drafts, draft],
    activeId: draft.id,
    nextSequence: workspace.nextSequence + 1,
  };
}

export function selectPdvPurchaseDraft(
  workspace: PdvPurchaseWorkspace,
  draftId: string,
): PdvPurchaseWorkspace {
  if (!workspace.drafts.some((draft) => draft.id === draftId)) return workspace;
  return workspace.activeId === draftId ? workspace : { ...workspace, activeId: draftId };
}

export function deletePdvPurchaseDraft(
  workspace: PdvPurchaseWorkspace,
  draftId: string,
  defaults: PdvPurchaseDraftDefaults,
): PdvPurchaseWorkspace {
  const deletedIndex = workspace.drafts.findIndex((draft) => draft.id === draftId);
  if (deletedIndex < 0) return workspace;
  const drafts = workspace.drafts.filter((draft) => draft.id !== draftId);
  if (drafts.length === 0) {
    const replacement = createPdvPurchaseDraft(workspace.nextSequence, defaults);
    return { drafts: [replacement], activeId: replacement.id, nextSequence: workspace.nextSequence + 1 };
  }
  const activeId = workspace.activeId === draftId
    ? drafts[Math.min(deletedIndex, drafts.length - 1)].id
    : workspace.activeId;
  return { ...workspace, drafts, activeId };
}

function sanitizeItem(value: unknown): PdvPurchaseItemDraft | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<PdvPurchaseItemDraft>;
  if (typeof item.id !== 'string') return null;
  return {
    id: item.id,
    inventoryId: typeof item.inventoryId === 'string' ? item.inventoryId : '',
    quantityText: typeof item.quantityText === 'string' ? item.quantityText : '',
    unitPriceText: typeof item.unitPriceText === 'string' ? item.unitPriceText : '',
  };
}

function sanitizeDraft(value: unknown, defaults: PdvPurchaseDraftDefaults): PdvPurchaseDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<PdvPurchaseDraft>;
  if (
    typeof draft.id !== 'string'
    || typeof draft.sequence !== 'number'
    || typeof draft.clientRequestId !== 'string'
  ) return null;
  const items = (Array.isArray(draft.items) ? draft.items : [])
    .map(sanitizeItem)
    .filter((item): item is PdvPurchaseItemDraft => item != null);
  const timestamp = nowIso();
  return {
    id: draft.id,
    sequence: Math.max(1, Math.floor(draft.sequence)),
    clientRequestId: draft.clientRequestId,
    description: typeof draft.description === 'string' ? draft.description : '',
    supplierId: typeof draft.supplierId === 'string' ? draft.supplierId : '',
    stockId: typeof draft.stockId === 'string' ? draft.stockId : (defaults.stockId ?? ''),
    purchaseDate: typeof draft.purchaseDate === 'string' ? draft.purchaseDate : defaults.purchaseDate,
    purchaseDateTouched: draft.purchaseDateTouched === true,
    items: items.length > 0 ? items : [createPdvPurchaseItem()],
    categoryId: typeof draft.categoryId === 'string' ? draft.categoryId : (defaults.categoryId ?? ''),
    accountId: typeof draft.accountId === 'string' ? draft.accountId : (defaults.accountId ?? ''),
    paymentStatus: draft.paymentStatus === 'pending' ? 'pending' : 'paid',
    paidDate: typeof draft.paidDate === 'string' ? draft.paidDate : defaults.purchaseDate,
    paidDateTouched: draft.paidDateTouched === true,
    dueDate: typeof draft.dueDate === 'string' ? draft.dueDate : '',
    paymentMethod: typeof draft.paymentMethod === 'string' ? draft.paymentMethod : '',
    notes: typeof draft.notes === 'string' ? draft.notes : '',
    createdAt: typeof draft.createdAt === 'string' ? draft.createdAt : timestamp,
    updatedAt: typeof draft.updatedAt === 'string' ? draft.updatedAt : timestamp,
  };
}

export function parsePdvPurchaseWorkspace(
  raw: string | null,
  defaults: PdvPurchaseDraftDefaults,
): PdvPurchaseWorkspace {
  if (!raw) return createPdvPurchaseWorkspace(defaults);
  try {
    const parsed = JSON.parse(raw) as Partial<PdvPurchaseWorkspace>;
    const drafts = (Array.isArray(parsed.drafts) ? parsed.drafts : [])
      .map((draft) => sanitizeDraft(draft, defaults))
      .filter((draft): draft is PdvPurchaseDraft => draft != null)
      .slice(0, MAX_PDV_PURCHASE_DRAFTS);
    if (drafts.length === 0) return createPdvPurchaseWorkspace(defaults);
    const activeId = drafts.some((draft) => draft.id === parsed.activeId)
      ? parsed.activeId as string
      : drafts[0].id;
    const maxSequence = drafts.reduce((max, draft) => Math.max(max, draft.sequence), 0);
    return {
      drafts,
      activeId,
      nextSequence: Math.max(maxSequence + 1, Number(parsed.nextSequence) || 1),
    };
  } catch {
    return createPdvPurchaseWorkspace(defaults);
  }
}
