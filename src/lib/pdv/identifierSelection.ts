import type { PdvGridProduct } from '@/components/pdv/PdvProductCard';

export interface PdvScannableProduct extends PdvGridProduct {
  barcode: string | null;
}

/**
 * Resolve a leitura sem confiar no material retornado pela busca: o resultado
 * só é aceito se também existir no catálogo já autorizado da venda.
 */
export async function resolvePdvScannedSelection(input: {
  code: string;
  isV2: boolean;
  products: PdvScannableProduct[];
  resolveIdentifier: (code: string) => Promise<{ material: { id: string }; unitFactor: number } | null>;
}): Promise<{ product: PdvScannableProduct; unitFactor: number } | null> {
  const resolved = input.isV2 ? await input.resolveIdentifier(input.code) : null;
  const inventoryId = resolved?.material.id
    ?? input.products.find((product) => product.barcode === input.code)?.inventoryId;
  const product = input.products.find((candidate) => candidate.inventoryId === inventoryId);
  return product ? { product, unitFactor: resolved?.unitFactor ?? 1 } : null;
}
