/**
 * Rascunho transitório criado ao escolher "Editar" numa venda paga.
 *
 * A venda original nunca é alterada: ela é cancelada pela RPC canônica e este
 * snapshot preenche uma NOVA venda. `sessionStorage` permite sobreviver a um
 * reload acidental sem transformar dados do pedido em parâmetro de URL.
 */
export interface PdvSaleEditDraft {
  sourceOrderId: string;
  sourceReference: string;
  customerId: string | null;
  stockId: string | null;
  discountAmount: number;
  notes: string;
  items: Array<{
    inventoryId: string;
    description: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
  }>;
}

const STORAGE_KEY = 'dominex:pdv:sale-edit-draft';

export function savePdvSaleEditDraft(draft: PdvSaleEditDraft): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // O estado de navegação continua sendo o fallback quando storage é negado.
  }
}

export function loadPdvSaleEditDraft(sourceOrderId: string | null): PdvSaleEditDraft | null {
  if (!sourceOrderId) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PdvSaleEditDraft>;
    if (parsed.sourceOrderId !== sourceOrderId || !Array.isArray(parsed.items)) return null;
    return parsed as PdvSaleEditDraft;
  } catch {
    return null;
  }
}

export function clearPdvSaleEditDraft(sourceOrderId?: string): void {
  try {
    if (sourceOrderId) {
      const current = loadPdvSaleEditDraft(sourceOrderId);
      if (!current) return;
    }
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Limpeza best-effort; nunca bloqueia uma venda concluída.
  }
}
