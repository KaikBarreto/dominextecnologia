import type { CellObject } from 'xlsx';
import type { LocaleCode } from '@/lib/i18n/locales';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { slugify } from '@/lib/slugify';
import type { ExportSheetKey } from '@/hooks/useCompanyDataExport';

// ─────────────────────────────────────────────────────────────────────────────
// GERADOR DO BACKUP EM EXCEL (Configurações → Empresa → "Exportar meus dados").
//
// Recebe DADOS PRONTOS (já lidos, já com FK resolvida em nome, já formatados no
// locale pelo hook) e só monta o `.xlsx`. Este arquivo NÃO conhece Supabase —
// regra-lei 4 do repo: o hook é a única fronteira do banco.
//
// Padrão copiado de `inventoryExcelGenerator.ts`:
//   • `await import('xlsx')` (lazy) pra não pesar o bundle inicial;
//   • `todayStamp()` no fuso da empresa (default America/Sao_Paulo) pro nome do
//     arquivo — `new Date().toISOString()` daria o dia UTC e viraria o dia
//     seguinte depois das 21h em Brasília;
//   • `formatMoney` de `@/lib/format` com a moeda + locale da empresa.
//
// Aba 1 é SEMPRE o Resumo: nome da empresa, data/hora da exportação e a
// contagem de linhas de cada aba + total. É o que prova ao cliente que o backup
// veio completo (e o que denuncia truncamento silencioso se algum dia voltar).
// ─────────────────────────────────────────────────────────────────────────────

/** Limite duro do Excel: nome de aba com mais de 31 chars corrompe o arquivo. */
const MAX_SHEET_NAME = 31;

/** Limite duro do Excel por célula. Texto acima disso quebra o arquivo. */
const MAX_CELL_CHARS = 32_000;

/** Como a célula deve ser escrita no Excel. */
export type BackupColumnType =
  /** Texto (inclui datas, que o hook já formatou no locale). */
  | 'text'
  /** Número puro (quantidade, contagem, dia). */
  | 'number'
  /** Número COM formato de moeda — continua number pra somar no Excel. */
  | 'money';

export interface BackupColumn {
  /** Chave de i18n em `settings.dataExport.columns[sheetKey][key]`. */
  key: string;
  type?: BackupColumnType;
  /** Largura em caracteres (`!cols`). */
  width?: number;
}

export type BackupCell = string | number | null;

export interface BackupSheet {
  key: ExportSheetKey;
  columns: readonly BackupColumn[];
  /** Linhas alinhadas posicionalmente com `columns`. */
  rows: readonly BackupCell[][];
}

export interface GenerateCompanyBackupExcelParams {
  companyName: string;
  locale: LocaleCode;
  /** ISO 4217 da empresa (ex.: 'BRL'). */
  currency: string;
  /** IANA da empresa (ex.: 'America/Sao_Paulo'). */
  timezone: string;
  generatedAt: Date;
  sheets: readonly BackupSheet[];
}

// ── Shape dos rótulos (contrato do plano 2026-09-10-exportar-dados-empresa-excel)
// Declarado aqui de propósito: o bloco `settings.dataExport` é escrito pelo outro
// Dev em paralelo. Tipar por `typeof MESSAGES` acoplaria o typecheck deste
// arquivo à ordem de merge. O shape é o MESMO do contrato — se divergir, o erro
// aparece no QA (rótulo cai no fallback técnico), não em produção quebrada.
interface DataExportMessages {
  fileNamePrefix?: string;
  sheets?: Partial<Record<ExportSheetKey, string>>;
  columns?: Partial<Record<ExportSheetKey, Record<string, string>>>;
  summary?: {
    companyLabel?: string;
    generatedAtLabel?: string;
    sheetColumn?: string;
    rowCountColumn?: string;
    totalLabel?: string;
  };
}

/** YYYY-MM-DD no fuso da empresa, pro nome do arquivo. */
function todayStamp(timeZone: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  }
}

/**
 * Formato numérico de moeda pro Excel, derivado do `formatMoney` da empresa.
 * O valor da célula continua NUMBER (some com `=SOMA()`); só a exibição leva o
 * símbolo. Extrai o símbolo de uma amostra formatada em vez de cravar "R$".
 */
function currencyNumberFormat(currency: string, locale: LocaleCode): string {
  const sample = formatMoney(1234.56, currency, locale);
  if (!sample) return '#,##0.00';
  // Remove dígitos, separadores e todos os tipos de espaço (inclusive NBSP e
  // narrow NBSP, que o fr-FR usa como separador de milhar).
  const symbol = sample.replace(/[\d\s.,\u00A0\u202F\u2009-]/g, '').trim();
  if (!symbol) return '#,##0.00';
  const escaped = symbol.replace(/"/g, '');
  const symbolFirst = sample.trim().indexOf(symbol) === 0;
  return symbolFirst ? `"${escaped}" #,##0.00` : `#,##0.00 "${escaped}"`;
}

/**
 * Nome de aba seguro: sem os caracteres proibidos do Excel (`: \ / ? * [ ]`),
 * truncado em 31 chars e único no arquivo (sufixo numérico em colisão).
 */
function safeSheetName(raw: string, used: Set<string>): string {
  let name = (raw || 'Sheet').replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) name = 'Sheet';
  if (name.length > MAX_SHEET_NAME) name = name.slice(0, MAX_SHEET_NAME).trim();
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  for (let i = 2; i < 100; i++) {
    const suffix = ` (${i})`;
    const candidate = `${name.slice(0, MAX_SHEET_NAME - suffix.length).trim()}${suffix}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  used.add(name);
  return name;
}

/** Trunca texto longo (ex.: `terms` de orçamento) pra não estourar a célula. */
function safeText(value: string): string {
  return value.length > MAX_CELL_CHARS ? value.slice(0, MAX_CELL_CHARS) : value;
}

export async function generateCompanyBackupExcel({
  companyName,
  locale,
  currency,
  timezone,
  generatedAt,
  sheets,
}: GenerateCompanyBackupExcelParams): Promise<void> {
  const XLSX = await import('xlsx');

  const settingsMessages = MESSAGES[locale].app.settings as unknown as {
    dataExport?: DataExportMessages;
  };
  const tr: DataExportMessages = settingsMessages.dataExport ?? {};
  const sheetLabels = tr.sheets ?? {};
  const columnLabels = tr.columns ?? {};
  const summaryLabels = tr.summary ?? {};

  const sheetLabel = (key: ExportSheetKey): string => sheetLabels[key] ?? key;
  const columnLabel = (sheetKey: ExportSheetKey, columnKey: string): string =>
    columnLabels[sheetKey]?.[columnKey] ?? columnKey;

  const moneyFormat = currencyNumberFormat(currency, locale);
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  // ── Aba 1: Resumo ──────────────────────────────────────────────────────────
  const generatedAtText = (() => {
    try {
      return new Intl.DateTimeFormat(locale === 'pt-br' ? 'pt-BR' : locale, {
        timeZone: timezone,
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(generatedAt);
    } catch {
      return generatedAt.toISOString();
    }
  })();

  const summaryAoa: BackupCell[][] = [
    [summaryLabels.companyLabel ?? 'Empresa', companyName],
    [summaryLabels.generatedAtLabel ?? 'Gerado em', generatedAtText],
    [],
    [summaryLabels.sheetColumn ?? 'Aba', summaryLabels.rowCountColumn ?? 'Registros'],
  ];

  let totalRows = 0;
  for (const sheet of sheets) {
    totalRows += sheet.rows.length;
    summaryAoa.push([sheetLabel(sheet.key), sheet.rows.length]);
  }
  summaryAoa.push([summaryLabels.totalLabel ?? 'Total', totalRows]);

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryAoa as (string | number | null)[][]);
  summaryWs['!cols'] = [{ wch: 38 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, safeSheetName(sheetLabel('summary'), usedNames));

  // ── Demais abas ────────────────────────────────────────────────────────────
  for (const sheet of sheets) {
    const header = sheet.columns.map((c) => columnLabel(sheet.key, c.key));
    const aoa: (string | number | null)[][] = [header];

    for (const row of sheet.rows) {
      const out: (string | number | null)[] = new Array(sheet.columns.length).fill(null);
      for (let c = 0; c < sheet.columns.length; c++) {
        const value = row[c];
        out[c] = typeof value === 'string' ? safeText(value) : (value ?? null);
      }
      aoa.push(out);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Formato de moeda nas colunas monetárias (célula continua número).
    for (let c = 0; c < sheet.columns.length; c++) {
      if (sheet.columns[c].type !== 'money') continue;
      for (let r = 1; r < aoa.length; r++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        const cell = ws[ref] as CellObject | undefined;
        if (cell && cell.t === 'n') cell.z = moneyFormat;
      }
    }

    ws['!cols'] = sheet.columns.map((c, i) => ({
      wch: c.width ?? Math.min(40, Math.max(12, header[i]?.length ?? 12) + 2),
    }));
    if (aoa.length > 1) {
      ws['!autofilter'] = {
        ref: XLSX.utils.encode_range({
          s: { r: 0, c: 0 },
          e: { r: aoa.length - 1, c: Math.max(0, sheet.columns.length - 1) },
        }),
      };
    }

    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sheetLabel(sheet.key), usedNames));
  }

  const prefix = slugify(tr.fileNamePrefix ?? 'backup') || 'backup';
  const companySlug = slugify(companyName || 'empresa') || 'empresa';
  XLSX.writeFile(wb, `${prefix}-${companySlug}-${todayStamp(timezone, generatedAt)}.xlsx`);
}
