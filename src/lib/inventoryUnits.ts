/** Unidades de medida de estoque — fonte única, reusada no cadastro de item e na cotação de compras. */
export const INVENTORY_UNITS = [
  { value: 'un', label: 'Unidade' },
  { value: 'kg', label: 'Quilograma' },
  { value: 'l', label: 'Litro' },
  { value: 'm', label: 'Metro' },
  { value: 'cx', label: 'Caixa' },
  { value: 'pc', label: 'Peça' },
] as const;

export type InventoryUnit = (typeof INVENTORY_UNITS)[number]['value'];

/** Rótulo legível da unidade; cai no próprio código se for custom/desconhecida. */
export function unitLabel(value: string | null | undefined): string {
  if (!value) return 'un';
  return INVENTORY_UNITS.find((u) => u.value === value)?.label ?? value;
}

/**
 * Passo operacional usado pelos botões +/− do PDV.
 *
 * Peso, volume e comprimento são vendidos fracionados no balcão; embalagens e
 * peças continuam inteiras. A edição direta ainda aceita até três casas, então
 * o operador pode informar 0,025 kg mesmo quando o atalho anda de 0,1 em 0,1.
 */
export function inventoryQuantityStep(value: string | null | undefined): number {
  const unit = value?.trim().toLowerCase();
  return unit === 'kg' || unit === 'l' || unit === 'm' ? 0.1 : 1;
}
