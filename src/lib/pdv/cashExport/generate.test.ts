import { mkdirSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { ALL_CASH_EXPORT_GROUPS, filterCashExportPayload } from './filters';
import { CASH_EXPORT_PAYMENT_OPTIONS } from './labels';
import { buildCashExportXlsxBuffer, type CashExportDocumentOptions } from './excel';
import { buildCashExportPdf } from './pdf';
import { makeEntry, makePayload, makeSession } from './fixture';

// Só grava amostras em disco quando pedido: PDV_CASH_EXPORT_SAMPLE_DIR=/tmp/x npx vitest run ...
const OUT = process.env.PDV_CASH_EXPORT_SAMPLE_DIR ?? '';
const save = (name: string, data: Buffer) => {
  if (!OUT) return;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}`, data);
};
const fmt = {
  money: (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v),
  dateTime: (v: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(v)),
};
const options: CashExportDocumentOptions = {
  companyName: 'Empresa Exemplo Ltda', periodLabel: 'Período: 01/11/2026 a 30/11/2026',
  filtersLabel: 'todos os tipos de movimentação; todas as formas de pagamento; com vendas canceladas',
  timezone: 'America/Sao_Paulo', includeItems: true,
};
const filters = { groups: ALL_CASH_EXPORT_GROUPS, paymentMethods: [...CASH_EXPORT_PAYMENT_OPTIONS], includeCancelled: true };

// Muitas vendas para forçar quebra de página
function bigSession() {
  const entries = Array.from({ length: 90 }, (_, i) => makeEntry({
    id: `b${i}`, amount: 10 + i, signedAmount: 10 + i, paymentMethod: i % 2 ? 'pix' : 'credito', orderId: `ob${i}`, orderNumber: 100 + i,
    occurredAt: `2026-11-12T${String(10 + (i % 8)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00+00:00`,
    description: `Venda direta PDV nº ${100 + i}`, customerName: 'Cliente com nome bem comprido da silva', isOrderPrimary: true,
    items: [{ name: 'Item de teste com nome longo para quebrar linha', unit: 'un', quantity: 1.5, unitPrice: 5, discount: 1, total: 6.5 }],
  }));
  return makeSession({ sessionId: 'big', terminalName: 'Caixa 2', operatorName: 'Bruno Lima', entries });
}

describe('geração real de XLSX e PDF', () => {
  it('gera o XLSX com 3 abas e confere colunas', async () => {
    const payload = filterCashExportPayload(makePayload([makeSession(), bigSession()]), filters);
    const buffer = await buildCashExportXlsxBuffer(payload, options);
    save('export-amostra.xlsx', Buffer.from(buffer));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumo', 'Movimentações', 'Itens']);
    const mov = wb.getWorksheet('Movimentações')!;
    expect(mov.getRow(1).values).toEqual([undefined, 'Caixa', 'Data e hora', 'Tipo', 'Descrição', 'Nº da venda', 'Cliente', 'Vendedor', 'Lançado por', 'Forma de pagamento', 'Entrada', 'Saída', 'Entra na gaveta', 'Cancelada', 'Motivo do cancelamento', 'Valor cancelado']);
    expect(mov.getRow(2).getCell(1).value).toBe('Caixa principal - Ana Souza');
    expect(mov.getRow(2).getCell(2).value).toBeInstanceOf(Date);
    expect(typeof mov.getRow(2).getCell(10).value).toBe('number');
    expect(mov.getRow(2).getCell(10).numFmt).toContain('R$');
    expect(mov.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    const items = wb.getWorksheet('Itens')!;
    // venda 1 (2 itens) + venda 2 + venda 3 cancelada + 90 da sessão grande, sem duplicar
    expect(items.rowCount - 1).toBe(2 + 1 + 1 + 90);
    const summary = wb.getWorksheet('Resumo')!;
    expect(String(summary.getRow(1).getCell(1).value)).toContain('Histórico');
    let foundTotal = false;
    summary.eachRow((row) => { if (row.getCell(1).value === 'Total') foundTotal = true; });
    expect(foundTotal).toBe(true);
  });

  it('sem "Detalhar itens" a aba Itens não existe', async () => {
    const buffer = await buildCashExportXlsxBuffer(filterCashExportPayload(makePayload(), filters), { ...options, includeItems: false });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumo', 'Movimentações']);
  });

  it('gera o PDF e quebra em várias páginas', () => {
    const payload = filterCashExportPayload(makePayload([makeSession(), bigSession()]), filters);
    const doc = buildCashExportPdf(payload, options, fmt);
    const bytes = Buffer.from(doc.output('arraybuffer'));
    save('export-amostra.pdf', bytes);
    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    const single = buildCashExportPdf(filterCashExportPayload(makePayload(), filters), options, fmt);
    save('export-amostra-1caixa.pdf', Buffer.from(single.output('arraybuffer')));
    expect(single.getNumberOfPages()).toBe(1);
  });
});
