import { describe, expect, it, vi } from 'vitest';
import { resolvePdvScannedSelection } from '@/lib/pdv/identifierSelection';

const products = [{
  inventoryId: 'material-1',
  name: 'Cabo PP',
  imageUrl: null,
  unitPrice: 10,
  unit: 'm',
  availableQuantity: 100,
  barcode: '789-UNITARIO',
}];

describe('integração de códigos na venda real do PDV', () => {
  it('resolve QR/alias pelo servidor e preserva o fator da embalagem', async () => {
    const resolveIdentifier = vi.fn().mockResolvedValue({
      material: { id: 'material-1' },
      unitFactor: 25,
    });

    await expect(resolvePdvScannedSelection({
      code: 'ROLO-25M',
      isV2: true,
      products,
      resolveIdentifier,
    })).resolves.toEqual({ product: products[0], unitFactor: 25 });
    expect(resolveIdentifier).toHaveBeenCalledWith('ROLO-25M');
  });

  it('mantém o código de barras antigo no contrato legado sem chamar a RPC nova', async () => {
    const resolveIdentifier = vi.fn();

    await expect(resolvePdvScannedSelection({
      code: '789-UNITARIO',
      isV2: false,
      products,
      resolveIdentifier,
    })).resolves.toEqual({ product: products[0], unitFactor: 1 });
    expect(resolveIdentifier).not.toHaveBeenCalled();
  });

  it('não seleciona material fora do catálogo autorizado', async () => {
    await expect(resolvePdvScannedSelection({
      code: 'RESTRITO',
      isV2: true,
      products,
      resolveIdentifier: vi.fn().mockResolvedValue({ material: { id: 'material-fora' }, unitFactor: 1 }),
    })).resolves.toBeNull();
  });
});
