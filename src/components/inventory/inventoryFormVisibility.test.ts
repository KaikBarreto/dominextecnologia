import { describe, expect, it } from 'vitest';
import {
  hasLegacyInventoryPmocData,
  isInventoryModuleConfirmed,
  shouldShowInventoryPmoc,
} from './inventoryFormVisibility';

describe('visibilidade progressiva da ficha de material', () => {
  it('só confirma o PDV depois que os módulos terminaram de carregar', () => {
    expect(isInventoryModuleConfirmed(true, true)).toBe(false);
    expect(isInventoryModuleConfirmed(false, false)).toBe(false);
    expect(isInventoryModuleConfirmed(false, true)).toBe(true);
  });

  it('mantém PMOC fora da ficha de quem não contratou Contratos/PMOC', () => {
    expect(shouldShowInventoryPmoc({
      modulesLoading: false,
      contractsAllowed: false,
      item: null,
    })).toBe(false);
  });

  it('mostra PMOC com o módulo e preserva material legado mesmo sem ele', () => {
    expect(shouldShowInventoryPmoc({
      modulesLoading: false,
      contractsAllowed: true,
      item: null,
    })).toBe(true);
    expect(hasLegacyInventoryPmocData({ pmoc_anvisa_registration: 'LEGADO-1' })).toBe(true);
    expect(shouldShowInventoryPmoc({
      modulesLoading: true,
      contractsAllowed: false,
      item: { is_pmoc_product: true },
    })).toBe(true);
  });
});
