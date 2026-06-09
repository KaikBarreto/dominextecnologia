import type { MovimentacaoReportRow } from '@/utils/movimentacoesReportHtmlGenerator';

/**
 * Gera um `.xlsx` das Movimentações financeiras com as mesmas colunas do PDF.
 *
 * O `xlsx` (SheetJS) é importado de forma lazy (`await import`) pra não pesar o
 * bundle inicial — só carrega quando o usuário clica em "Exportar → Excel".
 */

const formatCurrencyBR = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateBR(dateStr: string): string {
  try {
    return parseLocalDate(dateStr).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return dateStr;
  }
}

function todayStamp(): string {
  // YYYY-MM-DD em horário de Brasília para nomear o arquivo.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts; // en-CA já entrega no formato YYYY-MM-DD
}

interface GenerateMovimentacoesExcelParams {
  title: string;
  rows: MovimentacaoReportRow[];
}

export async function generateMovimentacoesExcel({ title, rows }: GenerateMovimentacoesExcelParams): Promise<void> {
  const XLSX = await import('xlsx');

  let totalEntradas = 0;
  let totalSaidas = 0;
  for (const r of rows) {
    if (r.type === 'entrada') totalEntradas += r.amount;
    else totalSaidas += r.amount;
  }
  const saldo = totalEntradas - totalSaidas;

  const aoa: (string | number)[][] = [];

  // Cabeçalho do arquivo
  aoa.push([title]);
  aoa.push([
    'Entradas', formatCurrencyBR(totalEntradas),
    'Saídas', formatCurrencyBR(totalSaidas),
    'Saldo', formatCurrencyBR(saldo),
  ]);
  aoa.push([]);

  // Cabeçalho da tabela (mesmas colunas do PDF)
  aoa.push(['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta', 'Valor', 'Status']);

  for (const r of rows) {
    aoa.push([
      formatDateBR(r.date),
      r.type === 'entrada' ? 'Receita' : 'Despesa',
      r.description || '',
      r.category || '',
      r.account || '',
      // Valor com sinal: saída fica negativa pra somar corretamente na planilha.
      r.type === 'entrada' ? r.amount : -r.amount,
      r.isPaid ? 'Pago' : 'Pendente',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 12 }, // Data
    { wch: 10 }, // Tipo
    { wch: 40 }, // Descrição
    { wch: 20 }, // Categoria
    { wch: 22 }, // Conta
    { wch: 16 }, // Valor
    { wch: 12 }, // Status
  ];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Movimentações');

  const slug = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
  XLSX.writeFile(wb, `${slug}-${todayStamp()}.xlsx`);
}
