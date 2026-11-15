import { describe, expect, it } from 'vitest';
import { calculateNfseTaxes } from './nfseTaxes';

describe('calculateNfseTaxes', () => {
  it('mantém paridade de retenções e desconto com o contrato fiscal canônico', () => {
    const result = calculateNfseTaxes({
      valorServico: 1_000,
      aliquotaIssqn: 5,
      tpRetIssqn: '2',
      valorPis: 10,
      valorCofins: 20,
      valorCsll: 30,
      valorInss: 40,
      valorIrrf: 50,
      deducoes: 25,
      descontoCondicionado: 0,
      descontoIncondicionado: 100,
      percentualTribSn: 0,
    });

    expect(result.baseCalculo).toBe(875);
    expect(result.issValor).toBe(43.75);
    expect(result.totalRetencoesFederais).toBe(150);
    expect(result.valorLiquido).toBe(706.25);
  });
});
