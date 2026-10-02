import { describe, expect, it } from 'vitest';
import { buildSalespersonActivityExcelSheets } from './salespersonActivityExport';

describe('buildSalespersonActivityExcelSheets', () => {
  const baseInput = {
    periodLabel: '01/09/2026 a 30/09/2026',
    totals: { contacts: 400, meetings_scheduled: 10, meetings_held: 6, sales_count: 2 },
    rates: { contactToScheduled: 2.5, scheduledToHeld: 60, heldToSale: null },
    perSalesperson: [
      {
        name: 'Maicon',
        counters: { contacts: 400, meetings_scheduled: 10, meetings_held: 6, sales_count: 2 },
        filledPeriodsLabel: '18/40',
        missingDaysCount: 2,
        partialDaysCount: 1,
        coveragePercent: 92.5,
        goalContactsDaysMet: 15,
        goalMeetingsDaysMet: 10,
        businessDaysCount: 20,
        adherencePercent: 62.5,
      },
    ],
    missingDays: [
      { name: 'Maicon', missingDays: ['2026-09-10', '2026-09-17'] },
    ],
  };

  it('leva os totais e as taxas pro resumo, com "—" em taxa sem denominador', () => {
    const sheets = buildSalespersonActivityExcelSheets(baseInput);
    const resumo = sheets.find((s) => s.name === 'Resumo')!;
    expect(resumo.rows).toContainEqual(['Período', '01/09/2026 a 30/09/2026']);
    expect(resumo.rows).toContainEqual(['Contatos / Prospecções', 400]);
    expect(resumo.rows).toContainEqual(['Contato → Reunião agendada', '2.5%']);
    expect(resumo.rows).toContainEqual(['Reunião realizada → Venda', '—']);
  });

  it('traduz valores legíveis na planilha por vendedor, não só o cabeçalho', () => {
    const sheets = buildSalespersonActivityExcelSheets(baseInput);
    const porVendedor = sheets.find((s) => s.name === 'Por vendedor')!;
    expect(porVendedor.rows[1]).toEqual([
      'Maicon', 400, 10, 6, 2, '18/40', 2, 1, '92.5%', '15/20', '10/20', '62.5%',
    ]);
  });

  it('lista os dias sem registro com data + dia da semana em PT-BR', () => {
    const sheets = buildSalespersonActivityExcelSheets(baseInput);
    const dias = sheets.find((s) => s.name === 'Dias sem registro')!;
    expect(dias.rows[1][0]).toBe('Maicon');
    expect(dias.rows[1][1]).toMatch(/10\/09\/2026 \(.+\)/);
  });

  it('vendedor sem dia faltante aparece com a mensagem de cobertura completa', () => {
    const sheets = buildSalespersonActivityExcelSheets({
      ...baseInput,
      missingDays: [{ name: 'Ana', missingDays: [] }],
    });
    const dias = sheets.find((s) => s.name === 'Dias sem registro')!;
    expect(dias.rows).toContainEqual(['Ana', 'Nenhum — cobertura completa no período']);
  });
});
