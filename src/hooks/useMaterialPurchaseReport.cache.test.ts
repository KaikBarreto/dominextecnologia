import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MATERIAL_PURCHASE_REPORT_QUERY_KEY } from './useMaterialPurchaseReport';

const INVALIDATION =
  'queryClient.invalidateQueries({ queryKey: MATERIAL_PURCHASE_REPORT_QUERY_KEY })';

describe('cache do relatório de compras de materiais', () => {
  it('expõe uma chave raiz compartilhada pelo relatório', () => {
    expect(MATERIAL_PURCHASE_REPORT_QUERY_KEY).toEqual(['material-purchase-report']);
  });

  it('atualiza o relatório depois de uma compra direta no PDV', () => {
    const source = readFileSync('src/hooks/useDirectMaterialPurchase.ts', 'utf8');

    expect(source).toContain(INVALIDATION);
  });

  it('atualiza o relatório depois de receber ou excluir uma ordem de compra', () => {
    const source = readFileSync('src/hooks/useCompraOrdens.ts', 'utf8');
    const invalidations = source.split(INVALIDATION).length - 1;

    expect(invalidations).toBeGreaterThanOrEqual(2);
  });
});
