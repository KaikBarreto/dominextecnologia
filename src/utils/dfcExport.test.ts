import { describe, expect, it } from 'vitest';
import { buildDfcExportRows } from './dfcExport';
import { csvCell } from './movimentacoesCsvGenerator';

describe('exportações financeiras', () => {
  it('mantém o mesmo conteúdo do DFC nos três formatos', () => {
    const rows = buildDfcExportRows({
      periodLabel: '01/02/2026 a 28/02/2026',
      openingBalance: 100,
      totalInflow: 0,
      totalOutflow: -25,
      netChange: -25,
      closingBalance: 75,
      movements: [{
        activity: 'Atividades operacionais',
        category: 'Serviços',
        costCenter: 'Matriz',
        paidDate: '2026-02-10',
        description: 'Pagamento',
        type: 'Saída',
        amount: -25,
      }],
    });

    expect(rows[2]).toEqual(['Total de entradas', 0]);
    expect(rows[3]).toEqual(['Total de saídas', -25]);
    expect(rows[4]).toEqual(['Saldo inicial', 100]);
    expect(rows.at(-1)).toEqual([
      'Atividades operacionais', 'Serviços', 'Matriz', '2026-02-10', 'Pagamento', 'Saída', -25,
    ]);
  });

  it('leva os totais de entrada e saída do período para o cabeçalho', () => {
    const rows = buildDfcExportRows({
      periodLabel: '01/09/2026 a 30/09/2026',
      openingBalance: 0,
      totalInflow: 8_557.99,
      totalOutflow: -10_587.96,
      netChange: -2_029.97,
      closingBalance: -2_029.97,
      movements: [],
    });

    expect(rows[2]).toEqual(['Total de entradas', 8_557.99]);
    expect(rows[3]).toEqual(['Total de saídas', -10_587.96]);
    expect(rows[5]).toEqual(['Variação líquida', -2_029.97]);
  });

  it('neutraliza fórmulas em células CSV', () => {
    expect(csvCell('=IMPORTXML("url")')).toBe('"\'=IMPORTXML(""url"")"');
    expect(csvCell(12.5)).toBe('"12,50"');
  });
});
