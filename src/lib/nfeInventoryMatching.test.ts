import { describe, expect, it } from 'vitest';
import { findSafeNfeInventoryMatch } from './nfeInventoryMatching';

const candidates = [
  { id: 'a', name: 'Tubo PVC 20 mm', fiscal_gtin: '7891234567890', barcode: null },
  { id: 'b', name: 'Tubo PVC 25 mm', fiscal_gtin: null, barcode: '7891234567891' },
  { id: 'c', name: 'Conexão Curva 90°', fiscal_gtin: null, barcode: null },
];

describe('casamento seguro de item da NF-e com material', () => {
  it('prioriza GTIN exato mesmo quando o nome do fornecedor é diferente', () => {
    expect(findSafeNfeInventoryMatch(
      { name: 'TUBO SOLDAVEL', gtin: '7891234567890' },
      candidates,
    )?.id).toBe('a');
  });

  it('usa nome normalizado exato quando não há GTIN', () => {
    expect(findSafeNfeInventoryMatch(
      { name: '  conexao curva 90° ' },
      candidates,
    )?.id).toBe('c');
  });

  it('aceita nome aproximado somente quando existe um único candidato', () => {
    expect(findSafeNfeInventoryMatch(
      { name: 'Conexão Curva' },
      candidates,
    )?.id).toBe('c');
  });

  it('não escolhe quando o nome aproximado é ambíguo', () => {
    expect(findSafeNfeInventoryMatch(
      { name: 'Tubo PVC' },
      candidates,
    )).toBeNull();
  });

  it('não escolhe quando o mesmo GTIN aparece em mais de um cadastro', () => {
    expect(findSafeNfeInventoryMatch(
      { name: 'Qualquer descrição', gtin: '7891234567890' },
      [...candidates, { id: 'd', name: 'Duplicado', fiscal_gtin: null, barcode: '7891234567890' }],
    )).toBeNull();
  });
});
