export interface InventoryPmocProductDraft {
  isPmocProduct: boolean;
  manufacturer?: string | null;
  anvisaRegistration?: string | null;
  batchNumber?: string | null;
  manufacturedOn?: string | null;
  expiresOn?: string | null;
}

export type InventoryPmocValidationError =
  | 'manufacturer_required'
  | 'anvisa_required'
  | 'expiration_required'
  | 'manufacture_after_expiration';

/**
 * Valida apenas identificacao regulatoria. Datas ISO (YYYY-MM-DD) podem ser
 * comparadas como texto, preservando dia civil sem conversao de fuso horario.
 */
export function validateInventoryPmocProduct(
  draft: InventoryPmocProductDraft,
): InventoryPmocValidationError | null {
  if (!draft.isPmocProduct) return null;
  if (!draft.manufacturer?.trim()) return 'manufacturer_required';
  if (!draft.anvisaRegistration?.trim()) return 'anvisa_required';
  if (!draft.expiresOn) return 'expiration_required';
  if (draft.manufacturedOn && draft.manufacturedOn > draft.expiresOn) {
    return 'manufacture_after_expiration';
  }
  return null;
}
