import { describe, expect, it } from 'vitest';
import { buildDfcExportRows } from './dfcExport';
import { csvCell } from './movimentacoesCsvGenerator';

describe('exportações financeiras', () => {
  it('mantém o mesmo conteúdo do DFC nos três formatos', () => {
    const rows = buildDfcExportRows({
      periodLabel: '01/02/2026 a 28/02/2026',
      openingBalance: 100,
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

    expect(rows[2]).toEqual(['Saldo inicial', 100]);
    expect(rows.at(-1)).toEqual([
      'Atividades operacionais', 'Serviços', 'Matriz', '2026-02-10', 'Pagamento', 'Saída', -25,
    ]);
  });

  it('neutraliza fórmulas em células CSV', () => {
    expect(csvCell('=IMPORTXML("url")')).toBe('"\'=IMPORTXML(""url"")"');
    expect(csvCell(12.5)).toBe('"12,50"');
  });
});
