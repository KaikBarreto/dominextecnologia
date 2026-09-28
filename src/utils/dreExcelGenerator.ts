import type { DreReportData } from '@/utils/dreHtmlGenerator';

export interface DreExcelSheet {
  name: string;
  rows: Array<Array<string | number>>;
  widths: number[];
}

/**
 * Mantém o Excel do DRE baseado no mesmo objeto usado pelo PDF. Assim, trocar
 * regime, período ou filtro de centro de custo nunca produz dois relatórios
 * diferentes dependendo do formato escolhido.
 */
export function buildDreExcelSheets(data: DreReportData): DreExcelSheet[] {
  const regime = data.regime === 'competencia' ? 'Competência' : 'Caixa';
  const dreRows: Array<Array<string | number>> = [
    ['Demonstrativo de Resultado (DRE)'],
    ['Empresa', data.company.name],
    ['CNPJ/CPF', data.company.document ?? ''],
    ['Período', data.period],
    ['Regime', regime],
    [],
    ['Grupo', 'Categoria', 'Valor'],
    ...(data.receitaCategories ?? []).map((row) => ['Receita Bruta', row.name, Math.abs(row.value)]),
    ['Receita Bruta', 'Total', data.receitaBruta],
    ...data.impostosCategories.map((row) => ['Impostos e Deduções', row.name, -Math.abs(row.value)]),
    ['Impostos e Deduções', 'Total', -Math.abs(data.impostos)],
    ['Receita Líquida', 'Total', data.receitaLiquida],
    ...data.cpvCategories.map((row) => ['Custo dos Serviços Prestados', row.name, -Math.abs(row.value)]),
    ['Custo dos Serviços Prestados', 'Total', -Math.abs(data.cpv)],
    ['Lucro Bruto', 'Total', data.lucroBruto],
    ...data.opexCategories.map((row) => ['Despesas Operacionais', row.name, -Math.abs(row.value)]),
    ['Despesas Operacionais', 'Total', -Math.abs(data.opex)],
    ['Resultado Líquido (EBITDA)', 'Total', data.resultadoLiquido],
    ['Margem Bruta', 'Percentual', data.margem / 100],
  ];

  const sheets: DreExcelSheet[] = [{
    name: 'DRE',
    rows: dreRows,
    widths: [32, 36, 18],
  }];

  if (data.costCenters?.length) {
    sheets.push({
      name: 'Centros de custo',
      rows: [
        ['Centro de custo', 'Receitas', 'Despesas', 'Resultado'],
        ...data.costCenters.map((row) => [row.name, row.revenue, -Math.abs(row.expense), row.result]),
      ],
      widths: [34, 18, 18, 18],
    });
  }

  return sheets;
}

function safeFilename(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'dre';
}

export async function generateDreExcel(data: DreReportData): Promise<void> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();

  for (const sheet of buildDreExcelSheets(data)) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    worksheet['!cols'] = sheet.widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }

  XLSX.writeFile(workbook, `${safeFilename(`dre-${data.period}-${data.regime ?? 'caixa'}`)}.xlsx`);
}
