// ─────────────────────────────────────────────────────────────────────────────
// buildTemplate — gera o molde `.xlsx` de importação financeira por planilha.
//
// Peça PURA (sem UI, sem Supabase): recebe os dados já resolvidos pelo chamador
// (marca do white-label, listas do tenant) e devolve/baixa o arquivo. Quem
// busca marca e decide fallback de negócio é quem CHAMA esta função — aqui só
// existe o fallback TÉCNICO (logo nulo não pode quebrar o download).
//
// Lib: `exceljs` (v4.4.0), via import dinâmico — mesmo motivo do import
// dinâmico de `xlsx` nos geradores vizinhos (`stockPositionExcelGenerator.ts`,
// `salespersonActivityExport.ts`): não jogar ~900KB no chunk inicial. A
// diferença é que `xlsx` (community edition) não escreve estilo (negrito, cor,
// borda, imagem, dropdown) — só a versão paga faz isso. `exceljs` escreve.
//
// Decisão ATUALIZADA 2026-10-18 (substitui a nota antiga): o molde sai 100%
// traduzido em `input.locale` — nome das 3 abas, cabeçalho da aba
// "Movimentações" e valores dos dropdowns (Tipo/Pago) incluídos. A versão
// anterior deixava tudo isso sempre em PT-BR porque `parseSheet.ts` só
// reconhecia vocabulário PT-BR; a correção não foi desfazer essa cautela, foi
// ensinar `parseSheet.ts` o vocabulário dos 4 idiomas (aliases de coluna +
// classificação de Tipo/Pago por igualdade exata, não por `includes` cego).
// As strings em si moraram pra `templateCopy.ts`, compartilhado com
// `parseSheet.ts` — é o contrato entre quem escreve e quem lê de volta.
// ─────────────────────────────────────────────────────────────────────────────

import {
  MOVEMENT_COLUMN_EXAMPLE_TEXTS,
  MOVEMENT_COLUMN_HEADER_TEXTS,
  MOVEMENT_VALUE_TEXTS,
  SHEET_NAME_TEXTS,
  TEMPLATE_TEXTS,
  localeText,
  type MovementColumnKey,
  type MovementValueTexts,
  type SheetNameTexts,
  type SupportedLocale,
  type TemplateTexts,
} from './templateCopy';
import { idealForeground } from '@/lib/colorContrast';

export type { SupportedLocale } from './templateCopy';

export interface FinancialTemplateLogo {
  /** Bytes crus do logo, já baixado pelo chamador (ex: `fetch(logoUrl).then(r => r.arrayBuffer())`). */
  data: ArrayBuffer;
  extension: 'png' | 'jpeg';
}

export interface FinancialTemplateInput {
  companyName: string;
  /** Logo já resolvido pela marca do tenant. `null` = cabeçalho sem imagem, só nome + cor. */
  logo: FinancialTemplateLogo | null;
  /** Cor primária em hex (`#RRGGBB` ou `#RGB`). `null` = verde Dominex (`#00C597`). */
  primaryColor: string | null;
  /**
   * ⚠️ NÃO inclua conta de cartão de crédito em `accounts` — despesa de cartão
   * nunca entra "paga" (só a fatura é paga) e materializar fatura a partir de
   * planilha é outra feature. Quem chama filtra antes.
   *
   * Cadastros do tenant que viram dropdown E formatação condicional. A `color`
   * é a MESMA do cadastro no sistema, pra a planilha falar a língua do app:
   * fundo saturado na cor do item + texto em contraste (régua de UI do projeto).
   * Sem `color`, o item só entra no dropdown, sem cor.
   */
  accounts: TemplateOption[];
  categories: TemplateOption[];
  costCenters: TemplateOption[];
  /** Formas de pagamento não têm cor de cadastro — só dropdown. */
  paymentMethods: string[];
  locale: SupportedLocale;
  /** Código ISO da moeda (ex: `'BRL'`), usado só pra formatar a célula de Valor. */
  currencyCode: string;
}

const DEFAULT_PRIMARY_COLOR = '#00C597'; // verde Dominex — mesmo default de useWhiteLabel.ts
const WHITE_ARGB = 'FFFFFFFF';
const DARK_TEXT_ARGB = 'FF1F2937';
const LIGHT_BORDER_ARGB = 'FFD0D0D0';
const LIST_ROWS_MIN = 500; // faixa generosa pro range de validação da aba "Listas"
const LIGHT_BORDER_ARGB_SOFT = 'FFE8E8E8';
const ZEBRA_ARGB = 'FFF6F7F8';

/**
 * Faixa do título. PRETA por decisão do CEO (18/10/2026) — e não é só gosto:
 * a faixa antes usava a cor primária do tenant, e um logo verde sobre faixa
 * verde fica ilegível. Preto é neutro e funciona com logo de qualquer marca.
 * A cor do tenant continua viva no cabeçalho das tabelas (ver `primaryArgb`).
 */
const MASTHEAD_ARGB = 'FF111111';

/** Item de cadastro do tenant que vira dropdown + cor na planilha. */
export interface TemplateOption {
  name: string;
  /** Hex do cadastro (`#rrggbb`). Ausente/invalido → sem formatação condicional. */
  color?: string | null;
}

/** Entrada e saída seguem a semântica do app: verde recebe, vermelho sai. */
const INCOME_ARGB = 'FF16A34A';
const EXPENSE_ARGB = 'FFDC2626';

/**
 * Teto de regras de formatação condicional POR COLUNA.
 *
 * Cada item vira uma regra. Tenant com cadastro grande geraria centenas, o que
 * engorda o arquivo e esbarra no limite do Google Sheets. Acima do teto os
 * itens continuam no dropdown (a validação é uma regra só) — só não ganham cor.
 */
const MAX_COLOR_RULES = 60;

/**
 * `#rrggbb` → `FFrrggbb`, ou `null` quando não há cor válida.
 *
 * ⚠️ Diferente do `hexToArgb` daqui de baixo DE PROPÓSITO: aquele cai no verde
 * Dominex quando o hex é inválido (certo pra cor primária, que precisa existir).
 * Aqui o certo é `null` — cadastro sem cor não ganha regra, em vez de a coluna
 * inteira virar verde.
 */
function optionalHexToArgb(hex?: string | null): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? `FF${m[1].toUpperCase()}` : null;
}

/** Caixa máxima do logo, em pixels. A proporção real da imagem é preservada. */
const LOGO_MAX_W_PX = 190;
const LOGO_MAX_H_PX = 46;

/**
 * Lê a dimensão real da imagem pra NUNCA distorcer o logo.
 *
 * ⚠️ Antes isto era `ext: { width: 60, height: 42 }` fixo: todo logo era
 * espremido nessa caixa, independente do formato. Um logo horizontal (o caso
 * normal) virava um borrão vertical — foi o que o CEO viu em 18/10/2026.
 *
 * PNG: dimensão no chunk IHDR (offsets 16 e 20, big-endian).
 * JPEG: varre os marcadores até um SOF (0xC0–0xCF, exceto C4/C8/CC).
 * Formato desconhecido ou arquivo truncado → `null`, e quem chama cai numa
 * caixa conservadora em vez de distorcer.
 */
function readImageSize(data: ArrayBuffer, extension: 'png' | 'jpeg'): { width: number; height: number } | null {
  const view = new DataView(data);
  try {
    if (extension === 'png') {
      if (view.byteLength < 24) return null;
      if (view.getUint32(0) !== 0x89504e47) return null; // assinatura PNG
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    // JPEG
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
    let off = 2;
    while (off + 9 < view.byteLength) {
      if (view.getUint8(off) !== 0xff) { off += 1; continue; }
      const marker = view.getUint8(off + 1);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.getUint16(off + 5), width: view.getUint16(off + 7) };
      }
      off += 2 + view.getUint16(off + 2);
    }
    return null;
  } catch {
    return null;
  }
}

/** Encaixa a imagem na caixa máxima mantendo a proporção. */
function fitLogo(size: { width: number; height: number } | null): { width: number; height: number } {
  if (!size || size.width <= 0 || size.height <= 0) {
    return { width: 120, height: 34 }; // caixa conservadora quando não dá pra medir
  }
  const escala = Math.min(LOGO_MAX_W_PX / size.width, LOGO_MAX_H_PX / size.height, 1);
  return { width: Math.round(size.width * escala), height: Math.round(size.height * escala) };
}

const MOVEMENT_DATA_ROWS_END = 2000; // faixa generosa pra colar muita linha na aba "Movimentações"

/**
 * Largura útil (em "caracteres do Excel") do bloco de texto mesclado B:D da aba
 * "Leia primeiro" — soma das larguras de B, C e D.
 */
const README_TEXT_WIDTH = 30 + 16 + 48;

/**
 * Altura, em pontos, de uma célula com `wrapText` — calculada, porque ninguém
 * calcula por nós.
 *
 * ⚠️ O exceljs NÃO tem auto-altura, e o Excel/Google Sheets só auto-ajustam uma
 * linha cuja altura nunca foi definida — em célula **mesclada**, nem isso. Sem
 * este cálculo o texto é cortado no meio da frase, que foi exatamente o que o
 * CEO viu no Google Sheets em 18/10/2026.
 *
 * ~1,9 pt por caractere de folga na estimativa de linhas (Calibri 11 ≈ 1 char
 * por unidade de largura) e 15,5 pt por linha renderizada, com piso de 20.
 */
function wrappedRowHeight(textLength: number, widthInChars: number): number {
  const linhas = Math.max(1, Math.ceil(textLength / Math.max(1, widthInChars - 4)));
  return Math.max(20, Math.round(linhas * 15.5) + 5);
}

interface MovementColumnDef {
  key: MovementColumnKey;
  header: string;
  required: boolean;
  width: number;
  example: string;
}

/** Ordem fixa das colunas + largura (não varia por locale) + `required`, que
 * alimenta a tabela de referência da aba "Leia primeiro". */
const MOVEMENT_COLUMN_LAYOUT: Array<{ key: MovementColumnKey; required: boolean; width: number }> = [
  // ⚠️ A largura tem que caber o CABEÇALHO, não só o dado. Em 18/10/2026 o CEO
  // abriu o molde no Google Sheets e os títulos saíram cortados ("Forma de
  // pagament", "Data do pagamen") porque a largura fora dimensionada pelo
  // conteúdo. Régua: largura >= comprimento do rótulo mais longo nos 4 idiomas
  // + 2 de folga (a unidade do Excel é ~1 caractere de Calibri 11).
  { key: 'date', required: true, width: 14 },
  { key: 'type', required: true, width: 14 },
  { key: 'description', required: true, width: 34 },
  { key: 'amount', required: true, width: 16 },
  { key: 'category', required: true, width: 22 },
  { key: 'account', required: true, width: 22 },
  { key: 'counterparty', required: false, width: 26 },
  { key: 'costCenter', required: false, width: 20 },
  { key: 'paymentMethod', required: false, width: 22 }, // "Forma de pagamento" = 18
  { key: 'isPaid', required: false, width: 12 },
  { key: 'paidDate', required: false, width: 21 },      // "Data do pagamento" = 17
  { key: 'notes', required: false, width: 30 },
];

/** Monta o cabeçalho e o exemplo da aba "Movimentações" traduzidos pro `locale`. */
function buildMovementColumns(locale: SupportedLocale): MovementColumnDef[] {
  const headers = localeText<Record<MovementColumnKey, string>>(MOVEMENT_COLUMN_HEADER_TEXTS, locale);
  const examples = localeText<Record<MovementColumnKey, string>>(MOVEMENT_COLUMN_EXAMPLE_TEXTS, locale);
  return MOVEMENT_COLUMN_LAYOUT.map((col) => ({
    key: col.key,
    required: col.required,
    width: col.width,
    header: headers[col.key],
    example: examples[col.key],
  }));
}

/* ─────────────────────────── tipos derivados do exceljs ─────────────────────────── */

type ExcelJSNamespace = typeof import('exceljs');
type ExcelWorkbook = InstanceType<ExcelJSNamespace['Workbook']>;
type ExcelWorksheet = ReturnType<ExcelWorkbook['addWorksheet']>;

/* ─────────────────────────── helpers de cor/estilo ─────────────────────────── */

function hexToArgb(hex: string): string {
  const clean = hex.replace('#', '').trim();
  const normalized = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const safe = /^[0-9a-fA-F]{6}$/.test(normalized) ? normalized : '00C597';
  return `FF${safe.toUpperCase()}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: 'R$',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

function currencyNumFmt(currencyCode: string): string {
  const symbol = CURRENCY_SYMBOLS[currencyCode.toUpperCase()] ?? currencyCode.toUpperCase();
  return `"${symbol}" #,##0.00`;
}

function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'empresa'
  );
}

/* ─────────────────────────── aba "Leia primeiro" ─────────────────────────── */

function buildReadmeSheet(
  workbook: ExcelWorkbook,
  input: FinancialTemplateInput,
  texts: TemplateTexts,
  primaryArgb: string,
  sheetNames: SheetNameTexts,
  movementColumns: MovementColumnDef[],
): void {
  const sheet = workbook.addWorksheet(sheetNames.readme);
  sheet.properties.defaultRowHeight = 18;
  // A = faixa estreita só pro logo respirar. B/C/D carregam o conteúdo, e a
  // tabela de referência usa B (coluna), C (obrigatória?), D (exemplo).
  // ⚠️ A tabela NÃO pode começar na coluna A: ela tem largura de margem, e foi
  // assim que "Data"/"Descrição"/"Categoria" saíram como "Dat"/"Des"/"Cate" no
  // molde que o CEO abriu no Google Sheets em 18/10/2026.
  sheet.columns = [{ width: 3 }, { width: 30 }, { width: 16 }, { width: 48 }];

  // Barra colorida de título: linha 1 = título do molde, linha 2 = empresa.
  // Colunas A-C pintadas na cor primária; logo (quando houver) flutua sobre a
  // coluna A, título/empresa ficam mesclados em B:C pra não disputar espaço.
  // LINHA 1 = faixa BRANCA só pro logo. O logo fica FORA da faixa preta de
  // propósito: assim funciona com logo claro E com logo escuro de qualquer
  // tenant white-label, sem apostar no contraste. Logo verde sobre faixa verde
  // foi exatamente o problema relatado pelo CEO em 18/10/2026.
  let logoBox: { width: number; height: number } | null = null;
  if (input.logo) {
    // Fallback TÉCNICO: logo ausente/corrompido nunca quebra o download.
    try {
      const imageId = workbook.addImage({ buffer: input.logo.data, extension: input.logo.extension });
      logoBox = fitLogo(readImageSize(input.logo.data, input.logo.extension));
      sheet.addImage(imageId, {
        tl: { col: 1, row: 0.25 }, // alinhado com a coluna B, onde o texto começa
        ext: logoBox,
      });
    } catch {
      logoBox = null;
    }
  }
  // px → pt (1pt ≈ 1,333px) + respiro.
  sheet.getRow(1).height = logoBox ? Math.round(logoBox.height * 0.78) + 10 : 6;

  // LINHAS 2-3 = faixa preta com título e empresa.
  sheet.getRow(2).height = 40;
  sheet.getRow(3).height = 24;
  ['A2', 'B2', 'C2', 'D2', 'A3', 'B3', 'C3', 'D3'].forEach((addr) => {
    sheet.getCell(addr).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MASTHEAD_ARGB } };
  });
  sheet.mergeCells('B2:D2');
  sheet.mergeCells('B3:D3');
  const titleCell = sheet.getCell('B2');
  titleCell.value = texts.docTitle;
  titleCell.font = { bold: true, size: 16, color: { argb: WHITE_ARGB } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  const companyCell = sheet.getCell('B3');
  companyCell.value = `${texts.companyLabel} ${input.companyName}`;
  companyCell.font = { size: 11, color: { argb: WHITE_ARGB } };
  companyCell.alignment = { vertical: 'middle', horizontal: 'left' };

  let row = 5;
  const headingCell = sheet.getCell(`B${row}`);
  headingCell.value = texts.instructionsHeading;
  headingCell.font = { bold: true, size: 12, color: { argb: DARK_TEXT_ARGB } };
  row += 1;

  for (const instruction of texts.instructions) {
    // Cada instrução ocupa B:D mesclado e tem a altura CALCULADA pelo tamanho
    // do texto.
    //
    // ⚠️ `wrapText` sem altura explícita CORTA a frase no meio. O exceljs não
    // calcula altura automática (e o Excel/Sheets só auto-ajusta quando a
    // altura nunca foi definida — em célula MESCLADA, nem isso). Era um
    // `height = 20` fixo aqui, e no molde que o CEO abriu no Google Sheets em
    // 18/10/2026 todas as 8 instruções apareciam só com a primeira linha:
    // "• Preencha uma linha para cada movimentação" e o resto sumia.
    sheet.mergeCells(`B${row}:D${row}`);
    const cell = sheet.getCell(`B${row}`);
    cell.value = `•  ${instruction}`;
    cell.alignment = { wrapText: true, vertical: 'top' };
    cell.font = { size: 11, color: { argb: DARK_TEXT_ARGB } };
    sheet.getRow(row).height = wrappedRowHeight(instruction.length + 4, README_TEXT_WIDTH);
    row += 1;
  }

  row += 1;
  const refHeadingCell = sheet.getCell(`B${row}`);
  refHeadingCell.value = texts.referenceHeading;
  refHeadingCell.font = { bold: true, size: 12, color: { argb: DARK_TEXT_ARGB } };
  row += 1;

  const tableHeaderRow = row;
  sheet.getRow(tableHeaderRow).height = 22;
  const headerLabels = [texts.referenceColHeader, texts.referenceRequiredHeader, texts.referenceExampleHeader];
  headerLabels.forEach((label, idx) => {
    // +2: a tabela começa em B. A coluna A é margem (largura 3) e cortaria o rótulo.
    const cell = sheet.getCell(tableHeaderRow, idx + 2);
    cell.alignment = { vertical: 'middle' };
    cell.value = label;
    cell.font = { bold: true, color: { argb: WHITE_ARGB } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
    cell.border = {
      top: { style: 'thin', color: { argb: LIGHT_BORDER_ARGB } },
      left: { style: 'thin', color: { argb: LIGHT_BORDER_ARGB } },
      bottom: { style: 'thin', color: { argb: LIGHT_BORDER_ARGB } },
      right: { style: 'thin', color: { argb: LIGHT_BORDER_ARGB } },
    };
  });
  row += 1;

  let zebra = false;
  for (const col of movementColumns) {
    const values = [col.header, col.required ? texts.requiredYes : texts.requiredNo, col.example];
    sheet.getRow(row).height = 20;
    values.forEach((value, idx) => {
      const cell = sheet.getCell(row, idx + 2);
      cell.value = value;
      cell.alignment = { vertical: 'middle' };
      if (idx === 0) cell.font = { bold: true, size: 11, color: { argb: DARK_TEXT_ARGB } };
      // Zebra: tabela de 12 linhas sem alternância vira um bloco cinza ilegível.
      if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_ARGB } };
      cell.border = {
        top: { style: 'thin', color: { argb: LIGHT_BORDER_ARGB } },
        left: { style: 'thin', color: { argb: LIGHT_BORDER_ARGB } },
        bottom: { style: 'thin', color: { argb: LIGHT_BORDER_ARGB } },
        right: { style: 'thin', color: { argb: LIGHT_BORDER_ARGB } },
      };
    });
    zebra = !zebra;
    row += 1;
  }

  row += 1;
  sheet.mergeCells(`B${row}:D${row}`);
  const noteCell = sheet.getCell(`B${row}`);
  noteCell.value = texts.reimportNote;
  noteCell.font = { italic: true, size: 10, color: { argb: DARK_TEXT_ARGB } };
  noteCell.alignment = { wrapText: true, vertical: 'top' };
  sheet.getRow(row).height = wrappedRowHeight(texts.reimportNote.length, README_TEXT_WIDTH);
}

/* ─────────────────────────── aba "Listas" (oculta) ─────────────────────────── */

interface ListsRanges {
  accounts: string;
  categories: string;
  costCenters: string;
  paymentMethods: string;
}

/**
 * Faixa generosa (mínimo 500 linhas) com margem sobre a maior lista, pra
 * nunca cortar opção do tenant que tiver cadastro grande. Calculado SEM
 * precisar criar a aba ainda — só os ranges que a validação da aba
 * "Movimentações" vai referenciar.
 */
function computeListsRanges(input: FinancialTemplateInput, listsSheetName: string): ListsRanges {
  const rangeEnd = Math.max(
    LIST_ROWS_MIN,
    input.accounts.length + 10,
    input.categories.length + 10,
    input.costCenters.length + 10,
    input.paymentMethods.length + 10,
  );
  return {
    accounts: `${listsSheetName}!$A$2:$A$${rangeEnd}`,
    categories: `${listsSheetName}!$B$2:$B$${rangeEnd}`,
    costCenters: `${listsSheetName}!$C$2:$C$${rangeEnd}`,
    paymentMethods: `${listsSheetName}!$D$2:$D$${rangeEnd}`,
  };
}

/**
 * Cria a aba "Listas" propriamente (depois da "Movimentações" já existir, pra
 * a ordem das abas no arquivo final sair 1-Leia primeiro / 2-Movimentações /
 * 3-Listas, como no plano — a fórmula de validação já foi calculada por
 * `computeListsRanges` e não depende da ordem de criação).
 */
function createListsSheet(workbook: ExcelWorkbook, input: FinancialTemplateInput, listsSheetName: string): void {
  const sheet = workbook.addWorksheet(listsSheetName, { state: 'hidden' });
  // `veryHidden` existe no exceljs, mas o Google Sheets reclama dele em alguns
  // casos — `hidden` já some da barra de abas e importa sem erro nos dois.
  sheet.getCell('A1').value = 'Contas';
  sheet.getCell('B1').value = 'Categorias';
  sheet.getCell('C1').value = 'Centros de custo';
  sheet.getCell('D1').value = 'Formas de pagamento';

  const fillColumn = (col: string, values: string[]) => {
    values.forEach((value, idx) => {
      sheet.getCell(`${col}${idx + 2}`).value = value;
    });
  };
  fillColumn('A', input.accounts.map((o) => o.name));
  fillColumn('B', input.categories.map((o) => o.name));
  fillColumn('C', input.costCenters.map((o) => o.name));
  fillColumn('D', input.paymentMethods);
}

/* ─────────────────────────── aba "Movimentações" ─────────────────────────── */

/**
 * Pinta uma coluna inteira por VALOR, com formatação condicional de verdade —
 * fundo saturado na cor do cadastro + texto em contraste. É a mesma régua de UI
 * do app (saturado com texto branco), trazida pra planilha, e vale pra qualquer
 * linha que o cliente digitar depois.
 *
 * Por que condicional e não célula pintada: a cor tem que seguir o que o cliente
 * ESCOLHER no dropdown, em 2000 linhas. Pintar célula a célula não acompanha.
 *
 * ⚠️ Em formatação condicional (`dxf`), o preenchimento sólido do OOXML usa
 * `bgColor`, não `fgColor` como numa célula normal. Setamos os dois: o Excel lê
 * `bgColor` e o Google Sheets tolera ambos. Com só `fgColor` a regra entra no
 * arquivo e não pinta nada — falha silenciosa.
 */
function applyValueColorRules(
  sheet: ExcelWorksheet,
  colLetter: string,
  firstRow: number,
  lastRow: number,
  itens: Array<{ name: string; argb: string }>,
): void {
  if (!itens.length) return;
  sheet.addConditionalFormatting({
    ref: `${colLetter}${firstRow}:${colLetter}${lastRow}`,
    rules: itens.slice(0, MAX_COLOR_RULES).map((item, idx) => ({
      type: 'cellIs' as const,
      operator: 'equal' as const,
      priority: idx + 1,
      // Aspas duplas: o valor é literal de texto na fórmula do OOXML.
      formulae: [`"${item.name.replace(/"/g, '""')}"`],
      style: {
        fill: {
          type: 'pattern' as const,
          pattern: 'solid' as const,
          bgColor: { argb: item.argb },
          fgColor: { argb: item.argb },
        },
        font: { color: { argb: optionalHexToArgb(idealForeground(`#${item.argb.slice(2)}`)) ?? WHITE_ARGB }, bold: true },
      },
    })),
  });
}

function applyListValidation(
  sheet: ExcelWorksheet,
  colLetter: string,
  formulae: string[],
  firstRow: number,
  lastRow: number,
): void {
  for (let r = firstRow; r <= lastRow; r++) {
    sheet.getCell(`${colLetter}${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae,
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Valor fora da lista',
      error: 'Escolha uma das opções da lista (clique na célula e use a setinha).',
    };
  }
}

function columnLetter(index: number): string {
  // index 1-based (1 = A)
  let n = index;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function buildMovementsSheet(
  workbook: ExcelWorkbook,
  input: FinancialTemplateInput,
  primaryArgb: string,
  listsRanges: ListsRanges,
  sheetNames: SheetNameTexts,
  movementColumns: MovementColumnDef[],
  valueTexts: MovementValueTexts,
): void {
  const sheet = workbook.addWorksheet(sheetNames.movements, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = movementColumns.map((col) => ({ header: col.header, key: col.key, width: col.width }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 26; // rótulo colado na borda parece erro de montagem
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE_ARGB } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: LIGHT_BORDER_ARGB } },
      left: { style: 'thin', color: { argb: LIGHT_BORDER_ARGB } },
      bottom: { style: 'thin', color: { argb: LIGHT_BORDER_ARGB } },
      right: { style: 'thin', color: { argb: LIGHT_BORDER_ARGB } },
    };
  });

  // Área de digitação com zebra e borda suave: sem isso a aba é uma grade crua e
  // o cliente não enxerga onde é pra escrever. Só as primeiras linhas recebem
  // estilo — a validação (dropdown) vai até 2000, mas pintar 2000 × 12 células
  // engorda o arquivo à toa.
  const STYLED_ROWS_END = 120;
  for (let r = 2; r <= STYLED_ROWS_END; r += 1) {
    const linha = sheet.getRow(r);
    linha.height = 19;
    for (let c = 1; c <= movementColumns.length; c += 1) {
      const cell = linha.getCell(c);
      if (r % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_ARGB } };
      cell.border = {
        top: { style: 'hair', color: { argb: LIGHT_BORDER_ARGB_SOFT } },
        left: { style: 'hair', color: { argb: LIGHT_BORDER_ARGB_SOFT } },
        bottom: { style: 'hair', color: { argb: LIGHT_BORDER_ARGB_SOFT } },
        right: { style: 'hair', color: { argb: LIGHT_BORDER_ARGB_SOFT } },
      };
    }
  }

  const colIndex = (key: MovementColumnKey) => movementColumns.findIndex((c) => c.key === key) + 1;

  // Formato de moeda na coluna Valor, formato de data nas colunas de data.
  sheet.getColumn(colIndex('amount')).numFmt = currencyNumFmt(input.currencyCode);
  sheet.getColumn(colIndex('date')).numFmt = 'dd/mm/yyyy';
  sheet.getColumn(colIndex('paidDate')).numFmt = 'dd/mm/yyyy';
  // Data centralizada e valor à direita: número alinhado à esquerda é o que faz
  // uma planilha parecer "crua" mesmo com tudo certo.
  sheet.getColumn(colIndex('date')).alignment = { horizontal: 'center' };
  sheet.getColumn(colIndex('paidDate')).alignment = { horizontal: 'center' };
  sheet.getColumn(colIndex('amount')).alignment = { horizontal: 'right' };
  sheet.getColumn(colIndex('isPaid')).alignment = { horizontal: 'center' };
  sheet.getColumn(colIndex('type')).alignment = { horizontal: 'center' };

  const firstDataRow = 2;
  applyListValidation(
    sheet,
    columnLetter(colIndex('type')),
    [`"${valueTexts.entrada},${valueTexts.saida}"`],
    firstDataRow,
    MOVEMENT_DATA_ROWS_END,
  );
  applyListValidation(
    sheet,
    columnLetter(colIndex('isPaid')),
    [`"${valueTexts.sim},${valueTexts.nao}"`],
    firstDataRow,
    MOVEMENT_DATA_ROWS_END,
  );
  applyListValidation(
    sheet,
    columnLetter(colIndex('category')),
    [listsRanges.categories],
    firstDataRow,
    MOVEMENT_DATA_ROWS_END,
  );
  applyListValidation(
    sheet,
    columnLetter(colIndex('account')),
    [listsRanges.accounts],
    firstDataRow,
    MOVEMENT_DATA_ROWS_END,
  );
  applyListValidation(
    sheet,
    columnLetter(colIndex('costCenter')),
    [listsRanges.costCenters],
    firstDataRow,
    MOVEMENT_DATA_ROWS_END,
  );
  applyListValidation(
    sheet,
    columnLetter(colIndex('paymentMethod')),
    [listsRanges.paymentMethods],
    firstDataRow,
    MOVEMENT_DATA_ROWS_END,
  );

  // ── Cor por valor: a planilha passa a falar a mesma língua visual do app ──
  // Tipo: semântica fixa (entra verde, sai vermelho). As outras três herdam a
  // cor do próprio cadastro do tenant, então categoria "Impostos" fica da mesma
  // cor aqui e na tela.
  applyValueColorRules(sheet, columnLetter(colIndex('type')), firstDataRow, MOVEMENT_DATA_ROWS_END, [
    { name: valueTexts.entrada, argb: INCOME_ARGB },
    { name: valueTexts.saida, argb: EXPENSE_ARGB },
  ]);

  const comCor = (itens: TemplateOption[]) =>
    itens
      .map((o) => ({ name: o.name, argb: optionalHexToArgb(o.color) }))
      .filter((o): o is { name: string; argb: string } => o.argb !== null);

  applyValueColorRules(sheet, columnLetter(colIndex('category')), firstDataRow, MOVEMENT_DATA_ROWS_END, comCor(input.categories));
  applyValueColorRules(sheet, columnLetter(colIndex('account')), firstDataRow, MOVEMENT_DATA_ROWS_END, comCor(input.accounts));
  applyValueColorRules(sheet, columnLetter(colIndex('costCenter')), firstDataRow, MOVEMENT_DATA_ROWS_END, comCor(input.costCenters));
}

/* ─────────────────────────── montagem + download ─────────────────────────── */

/**
 * Monta o workbook (pura, sem efeito de navegador — testável em Node/vitest).
 * `downloadFinancialImportTemplate` é a casca fina que baixa no navegador.
 */
export async function buildFinancialImportWorkbook(input: FinancialTemplateInput): Promise<ExcelWorkbook> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = input.companyName || 'Dominex';
  workbook.created = new Date();

  const primaryArgb = hexToArgb(input.primaryColor || DEFAULT_PRIMARY_COLOR);
  const texts = localeText<TemplateTexts>(TEMPLATE_TEXTS, input.locale);
  const sheetNames = localeText<SheetNameTexts>(SHEET_NAME_TEXTS, input.locale);
  const valueTexts = localeText<MovementValueTexts>(MOVEMENT_VALUE_TEXTS, input.locale);
  const movementColumns = buildMovementColumns(input.locale);

  buildReadmeSheet(workbook, input, texts, primaryArgb, sheetNames, movementColumns);
  const listsRanges = computeListsRanges(input, sheetNames.lists);
  buildMovementsSheet(workbook, input, primaryArgb, listsRanges, sheetNames, movementColumns, valueTexts);
  createListsSheet(workbook, input, sheetNames.lists);

  // "Leia primeiro" é a 1ª aba adicionada (índice 0) e tem que abrir ativa.
  workbook.views = [
    { x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 0, visibility: 'visible' },
  ];

  return workbook;
}

function templateFilename(companyName: string): string {
  return `molde-importacao-financeira-${slugify(companyName)}.xlsx`;
}

/** Monta e baixa o `.xlsx` no navegador. */
export async function downloadFinancialImportTemplate(input: FinancialTemplateInput): Promise<void> {
  const workbook = await buildFinancialImportWorkbook(input);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = templateFilename(input.companyName);
  link.click();
  URL.revokeObjectURL(url);
}
