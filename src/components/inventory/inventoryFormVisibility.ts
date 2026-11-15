export interface InventoryPmocSnapshot {
  is_pmoc_product?: boolean | null;
  pmoc_manufacturer?: string | null;
  pmoc_anvisa_registration?: string | null;
  pmoc_batch_number?: string | null;
  pmoc_manufactured_on?: string | null;
  pmoc_expires_on?: string | null;
}

export function isInventoryModuleConfirmed(isLoading: boolean, allowed: boolean): boolean {
  return !isLoading && allowed;
}

export function hasLegacyInventoryPmocData(item?: InventoryPmocSnapshot | null): boolean {
  if (!item) return false;
  return Boolean(
    item.is_pmoc_product
    || item.pmoc_manufacturer
    || item.pmoc_anvisa_registration
    || item.pmoc_batch_number
    || item.pmoc_manufactured_on
    || item.pmoc_expires_on,
  );
}

export function shouldShowInventoryPmoc(input: {
  modulesLoading: boolean;
  contractsAllowed: boolean;
  item?: InventoryPmocSnapshot | null;
}): boolean {
  return isInventoryModuleConfirmed(input.modulesLoading, input.contractsAllowed)
    || hasLegacyInventoryPmocData(input.item);
}
