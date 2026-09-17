import type { MovimentacaoReportRow } from '@/utils/movimentacoesReportHtmlGenerator';
import { MESSAGES } from '@/lib/i18n';
import type { LocaleCode } from '@/lib/i18n/locales';
import { todayInTz } from '@/lib/timezone';

/**
 * Gera um `.xlsx` das Movimentações financeiras com as mesmas colunas do PDF.
 *
 * O `xlsx` (SheetJS) é importado de forma lazy (`await import`) pra não pesar o
 * bundle inicial — só carrega quando o usuário clica em "Exportar → Excel".
 */

const formatCurrencyBR = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

/**
 * Formata um dia de CALENDÁRIO (YYYY-MM-DD, coluna `date` do banco) como
 * dd/MM/yyyy. Não há fuso envolvido: o dia 02 é o dia 02 em qualquer lugar.
 *
 * Antes isto passava por DOIS fusos e errava o dia: montava
 * `new Date(y, m - 1, d)`, que é meia-noite no fuso do APARELHO, e depois
 * reformatava forçando `America/Sao_Paulo`. Exportando de um notebook em Lisboa
 * (UTC+1), a meia-noite local é 20:00 do dia ANTERIOR em São Paulo, então a
 * movimentação do dia 02 saía como 01 no PDF que vai pro contador. Agora o dia
 * é recortado da própria string, sem instante nenhum no meio.
 */
function formatDateBR(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr ?? '').trim());
  if (!m) return dateStr;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** YYYY-MM-DD no fuso DA EMPRESA, pra nomear o arquivo. */
function todayStamp(timeZone?: string | null): string {
  return todayInTz(timeZone);
}

interface GenerateMovimentacoesExcelParams {
  title: string;
  rows: MovimentacaoReportRow[];
  /** Locale do usuário que gera o documento. Padrão: 'pt-br'. */
  locale?: LocaleCode;
  /**
   * Fuso DA EMPRESA (`useAppLocaleContext().timezone`). Entra por parâmetro
   * porque util não chama hook. Ausente ou inválido cai em America/Sao_Paulo.
   */
  timezone?: string | null;
}

export async function generateMovimentacoesExcel({ title, rows, locale: rawLocale, timezone }: GenerateMovimentacoesExcelParams): Promise<void> {
  const locale = rawLocale ?? 'pt-br';
  const t = MESSAGES[locale].app.finance.movimentacoesGenerator;
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
    t.labelEntradas, formatCurrencyBR(totalEntradas),
    t.labelSaidas, formatCurrencyBR(totalSaidas),
    t.labelSaldo, formatCurrencyBR(saldo),
  ]);
  aoa.push([]);

  // Cabeçalho da tabela (mesmas colunas do PDF)
  aoa.push([t.colDate, t.colType, t.colDescription, t.colCategory, t.colAccount, t.colAmount, t.colStatus]);

  for (const r of rows) {
    aoa.push([
      formatDateBR(r.date),
      r.type === 'entrada' ? t.labelRevenue : t.labelExpense,
      r.description || '',
      r.category || '',
      r.account || '',
      // Valor com sinal: saída fica negativa pra somar corretamente na planilha.
      r.type === 'entrada' ? r.amount : -r.amount,
      r.isPaid ? t.labelPaid : t.labelPending,
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
  XLSX.writeFile(wb, `${slug}-${todayStamp(timezone)}.xlsx`);
}
