import type { FiscalInventoryRow, FiscalMovementRow } from '@/hooks/useFiscalInventory';

type ExportView = 'position' | 'movements';

export interface FiscalInventoryExportInput {
  view: ExportView;
  reportTitle?: string;
  fileSlug?: string;
  positionRows?: FiscalInventoryRow[];
  movementRows?: FiscalMovementRow[];
  filtersLabel: string;
  referenceLabel: string;
}

const quantity = (value: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(value);
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const dateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportFiscalInventoryExcel(input: FiscalInventoryExportInput) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const metadata = [
    ['Relatório', input.reportTitle ?? (input.view === 'position' ? 'Posição do estoque fiscal' : 'Movimentações do estoque fiscal')],
    ['Referência', input.referenceLabel],
    ['Filtros', input.filtersLabel],
    ['Gerado em', new Date().toLocaleString('pt-BR')],
    [],
  ];
  const rows = input.view === 'position'
    ? (input.positionRows ?? []).map((row) => ({
        Local: row.stock_name,
        Código: row.sku ?? '',
        Material: row.material_name,
        Grupo: row.group_name ?? 'Sem grupo',
        Unidade: row.unit ?? '',
        'Saldo fiscal': row.fiscal_balance,
        'Saldo operacional': row.operational_balance,
        Divergência: row.divergence,
        'Custo unitário': row.cost_price,
        'Valor fiscal': row.fiscal_value,
        'Valor operacional': row.operational_value,
      }))
    : (input.movementRows ?? []).map((row) => ({
        Data: dateTime(row.occurred_at),
        Local: row.stock_name,
        Código: row.sku ?? '',
        Material: row.material_name,
        Grupo: row.group_name ?? 'Sem grupo',
        Documento: row.source_event === 'opening'
          ? 'Saldo inicial'
          : `${row.document_model === 65 ? 'NFC-e' : 'NF-e'} ${row.document_number ? `nº ${row.document_number}` : ''}`.trim(),
        Evento: row.source_event === 'opening' ? 'Saldo inicial' : row.source_event === 'cancelled' ? 'Cancelamento' : 'Autorização',
        Operação: row.direction === 'entrada' ? 'Entrada' : 'Saída',
        'Saldo antes': row.balance_before,
        Quantidade: row.quantity,
        'Saldo depois': row.balance_after,
        'Custo unitário': row.unit_cost,
        'Valor total': row.total_cost,
        'Chave de acesso': row.access_key ?? '',
      }));
  const sheet = XLSX.utils.aoa_to_sheet(metadata);
  XLSX.utils.sheet_add_json(sheet, rows, { origin: 'A6' });
  sheet['!freeze'] = { xSplit: 0, ySplit: 6 };
  sheet['!cols'] = Object.keys(rows[0] ?? { Material: '' }).map((key) => ({ wch: Math.min(48, Math.max(12, key.length + 4)) }));
  XLSX.utils.book_append_sheet(workbook, sheet, input.view === 'position' ? 'Posição fiscal' : 'Movimentações');
  XLSX.writeFile(workbook, `estoque-fiscal-${input.fileSlug ?? (input.view === 'position' ? 'posicao' : 'movimentacoes')}-${stamp()}.xlsx`);
}

export async function exportFiscalInventoryPdf(input: FiscalInventoryExportInput) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  document.setFontSize(17);
  document.setTextColor(20, 32, 51);
  document.text(input.reportTitle ?? (input.view === 'position' ? 'Posição do estoque fiscal' : 'Movimentações do estoque fiscal'), 14, 15);
  document.setFontSize(8.5);
  document.setTextColor(80, 91, 109);
  document.text(`Referência: ${input.referenceLabel}`, 14, 21);
  const filterLines = document.splitTextToSize(`Filtros: ${input.filtersLabel}`, 265);
  document.text(filterLines, 14, 26);
  const startY = 29 + filterLines.length * 3.5;

  if (input.view === 'position') {
    const rows = input.positionRows ?? [];
    autoTable(document, {
      startY,
      head: [['Local', 'Código', 'Material', 'Grupo', 'Un.', 'Fiscal', 'Operacional', 'Divergência', 'Valor fiscal']],
      body: rows.map((row) => [
        row.stock_name, row.sku ?? '', row.material_name, row.group_name ?? 'Sem grupo', row.unit ?? '',
        quantity(row.fiscal_balance), quantity(row.operational_balance), quantity(row.divergence), money(row.fiscal_value),
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.8 },
      headStyles: { fillColor: [24, 76, 128], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 248, 252] },
    });
  } else {
    const rows = input.movementRows ?? [];
    autoTable(document, {
      startY,
      head: [['Data', 'Local', 'Material', 'Documento', 'Evento', 'Saldo antes', 'Movimento', 'Saldo depois', 'Valor']],
      body: rows.map((row) => [
        dateTime(row.occurred_at), row.stock_name, row.material_name,
        row.source_event === 'opening'
          ? 'Saldo inicial'
          : `${row.document_model === 65 ? 'NFC-e' : 'NF-e'}${row.document_number ? ` ${row.document_number}` : ''}`,
        row.source_event === 'opening' ? 'Saldo inicial' : row.source_event === 'cancelled' ? 'Cancelamento' : 'Autorização',
        quantity(row.balance_before), quantity(row.quantity), quantity(row.balance_after), money(row.total_cost),
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.8 },
      headStyles: { fillColor: [24, 76, 128], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 248, 252] },
    });
  }
  document.save(`estoque-fiscal-${input.fileSlug ?? (input.view === 'position' ? 'posicao' : 'movimentacoes')}-${stamp()}.pdf`);
}
