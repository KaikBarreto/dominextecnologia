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
  paymentMethodCodeForLabel,
  type MovementColumnKey,
  type MovementValueTexts,
  type SheetNameTexts,
  type SupportedLocale,
  type TemplateTexts,
} from './templateCopy';
import { idealForeground } from '@/lib/colorContrast';
import type { PaymentMethodCode } from '@/lib/finance-payment-methods';

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
  /** Cada categoria carrega o próprio `type` — é o que decide em qual (ou nas duas) listas da coluna "Categoria" ela entra. Ver `splitCategoriesByType`. */
  categories: CategoryTemplateOption[];
  costCenters: TemplateOption[];
  /** Cadastro do tenant. Sem `color` de propósito — "Cliente"/"Fornecedor" só têm dropdown, nunca formatação condicional (não existe cor de cliente/fornecedor no cadastro). */
  customers: TemplateOption[];
  suppliers: TemplateOption[];
  /**
   * RÓTULOS (não código cru), já no idioma do tenant — ex: "Cartão de Débito",
   * não "cartao_debito". Quem monta a lista é `paymentMethodLabels(locale)`
   * de `templateCopy.ts`; o servidor aceita os dois na leitura, mas um
   * arquivo com logo que sai do sistema não pode mostrar código de banco pro
   * contador do cliente. Sem cor de cadastro — a cor que existe aqui
   * (`PAYMENT_METHOD_COLOR_ARGB`) é semântica fixa, não vem do banco.
   */
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

/**
 * Categoria carrega o próprio `type` (vocabulário de `financial_categories.type`
 * no banco, ver `src/lib/financial-category-filter.ts`). `'ambos'` é conceito
 * LEGÍTIMO do Dominex — entra nas DUAS listas (entrada e saída) da coluna
 * "Categoria", nunca é recusada.
 */
export interface CategoryTemplateOption extends TemplateOption {
  type: 'entrada' | 'saida' | 'ambos';
}

/**
 * Separa a lista de categorias em "aceitas no Tipo = Entrada" e "aceitas no
 * Tipo = Saída" — mesma regra de `filterCategoriesByTransactionType`
 * (`src/lib/financial-category-filter.ts`), reimplementada aqui (sem
 * `is_active` pra checar: quem chama já manda só categoria ativa) porque
 * aquele helper espera `CategoryLike` com `is_active` e este arquivo não tem
 * acesso a hook/Supabase. Categoria `'ambos'` entra nas duas.
 */
function splitCategoriesByType(categories: CategoryTemplateOption[]): {
  entrada: CategoryTemplateOption[];
  saida: CategoryTemplateOption[];
} {
  return {
    entrada: categories.filter((c) => c.type === 'entrada' || c.type === 'ambos'),
    saida: categories.filter((c) => c.type === 'saida' || c.type === 'ambos'),
  };
}

/** Pago? segue a semântica do app: quitado verde, pendente vermelho. */
const PAID_YES_ARGB = 'FF15803D';
const PAID_NO_ARGB = 'FFDC2626';

/** Entrada e saída seguem a semântica do app: verde recebe, vermelho sai. */
const INCOME_ARGB = 'FF16A34A';
const EXPENSE_ARGB = 'FFDC2626';

/**
 * Fundo de ALERTA da camada 2 da validação de Categoria x Tipo (ver
 * `applyCategoryValidationAndFlag`) — cor de aviso, nunca reaproveitada de
 * `INCOME_ARGB`/`EXPENSE_ARGB` pra não ser confundida com "Tipo = Saída".
 */
const CATEGORY_MISMATCH_ARGB = 'FFEF4444';

/**
 * Paleta FIXA por forma de pagamento — SEMÂNTICA, decidida em código, NÃO
 * vem de cadastro (`payment_method` não tem cor no banco, diferente de
 * conta/categoria/centro de custo). Direção escolhida: dinheiro e Pix em
 * verdes distintos (pra não confundir com o verde de "Entrada"), cartões em
 * azul/roxo, transferência em ciano, boleto em âmbar, cheque em cinza-
 * azulado. Saturação alta de propósito — texto branco (`idealForeground`)
 * precisa ficar legível em cima.
 */
const PAYMENT_METHOD_COLOR_ARGB: Record<PaymentMethodCode, string> = {
  dinheiro: 'FF15803D', // verde escuro (green-700)
  pix: 'FF0D9488', // teal/verde-azulado (teal-600) — distinto do verde de "Entrada" e do dinheiro
  cartao_debito: 'FF2563EB', // azul (blue-600)
  cartao_credito: 'FF7C3AED', // roxo (violet-600)
  transferencia: 'FF0891B2', // ciano (cyan-600)
  boleto: 'FFD97706', // âmbar (amber-600)
  cheque: 'FF475569', // cinza-azulado (slate-600)
};

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
  { key: 'customer', required: false, width: 22 },
  { key: 'supplier', required: false, width: 22 },
  { key: 'costCenter', required: false, width: 20 },
  { key: 'paymentMethod', required: false, width: 22 }, // "Forma de pagamento" = 18
  // Vencimento vem ANTES de "Pago?"/"Data do pagamento" de propósito: as três
  // colunas contam a mesma história (esta conta já saiu? quando vence? quando
  // saiu?) e ficam lado a lado pra quem está digitando. Só tem efeito em linha
  // NÃO paga — em linha paga o servidor ignora e avisa na conferência.
  { key: 'dueDate', required: false, width: 14 },
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
  /** Categorias compatíveis com Tipo = Entrada (inclui as `'ambos'`). */
  categoriesEntrada: string;
  /** Categorias compatíveis com Tipo = Saída (inclui as `'ambos'`). */
  categoriesSaida: string;
  costCenters: string;
  paymentMethods: string;
  customers: string;
  suppliers: string;
  /**
   * TODAS as categorias, sem duplicar as de tipo `'ambos'`. É esta a lista que
   * alimenta o dropdown da coluna Categoria.
   *
   * ⚠️ Por que não a validação DEPENDENTE do Tipo: a versão com `INDIRECT` só
   * funciona no Excel, e no Google Sheets ela não é descartada — é importada e
   * **resolve vazia**, deixando o cliente com um seletor sem nenhuma opção.
   * Lista sem opção é pior que lista longa. O descompasso entre Tipo e
   * Categoria continua coberto pela formatação condicional, que funciona nos
   * dois mundos, e pelo servidor, que recusa categoria de tipo incompatível.
   */
  categoriesTodas: string;
}

/**
 * Faixa generosa (mínimo 500 linhas) com margem sobre a maior lista, pra
 * nunca cortar opção do tenant que tiver cadastro grande. Calculado SEM
 * precisar criar a aba ainda — só os ranges que a validação da aba
 * "Movimentações" vai referenciar.
 */
function computeListsRanges(input: FinancialTemplateInput, listsSheetName: string): ListsRanges {
  const { entrada, saida } = splitCategoriesByType(input.categories);
  const rangeEnd = Math.max(
    LIST_ROWS_MIN,
    input.accounts.length + 10,
    entrada.length + 10,
    saida.length + 10,
    input.costCenters.length + 10,
    input.paymentMethods.length + 10,
    input.customers.length + 10,
    input.suppliers.length + 10,
  );
  return {
    accounts: `${listsSheetName}!$A$2:$A$${rangeEnd}`,
    categoriesEntrada: `${listsSheetName}!$B$2:$B$${rangeEnd}`,
    categoriesSaida: `${listsSheetName}!$C$2:$C$${rangeEnd}`,
    costCenters: `${listsSheetName}!$D$2:$D$${rangeEnd}`,
    paymentMethods: `${listsSheetName}!$E$2:$E$${rangeEnd}`,
    customers: `${listsSheetName}!$F$2:$F$${rangeEnd}`,
    suppliers: `${listsSheetName}!$G$2:$G$${rangeEnd}`,
    categoriesTodas: `${listsSheetName}!$H$2:$H$${rangeEnd}`,
  };
}

/**
 * Nomes definidos (workbook-level) que alimentam a validação DEPENDENTE da
 * coluna "Categoria" — ver `applyCategoryValidationAndFlag`. Não traduzidos
 * (são internos, só aparecem no Gerenciador de Nomes do Excel).
 */
const CATEGORY_ENTRADA_NAME = 'cat_entrada';
const CATEGORY_SAIDA_NAME = 'cat_saida';

/**
 * Cria a aba "Listas" propriamente (depois da "Movimentações" já existir, pra
 * a ordem das abas no arquivo final sair 1-Leia primeiro / 2-Movimentações /
 * 3-Listas, como no plano — a fórmula de validação já foi calculada por
 * `computeListsRanges` e não depende da ordem de criação).
 */
function createListsSheet(
  workbook: ExcelWorkbook,
  input: FinancialTemplateInput,
  listsSheetName: string,
  listsRanges: ListsRanges,
): void {
  const sheet = workbook.addWorksheet(listsSheetName, { state: 'hidden' });
  // `veryHidden` existe no exceljs, mas o Google Sheets reclama dele em alguns
  // casos — `hidden` já some da barra de abas e importa sem erro nos dois.
  sheet.getCell('A1').value = 'Contas';
  sheet.getCell('B1').value = 'Categorias (entrada)';
  sheet.getCell('C1').value = 'Categorias (saída)';
  sheet.getCell('D1').value = 'Centros de custo';
  sheet.getCell('E1').value = 'Formas de pagamento';
  sheet.getCell('F1').value = 'Clientes';
  sheet.getCell('G1').value = 'Fornecedores';
  sheet.getCell('H1').value = 'Categorias (todas)';

  const fillColumn = (col: string, values: string[]) => {
    values.forEach((value, idx) => {
      sheet.getCell(`${col}${idx + 2}`).value = value;
    });
  };
  const { entrada, saida } = splitCategoriesByType(input.categories);
  fillColumn('A', input.accounts.map((o) => o.name));
  fillColumn('B', entrada.map((o) => o.name));
  fillColumn('C', saida.map((o) => o.name));
  fillColumn('D', input.costCenters.map((o) => o.name));
  fillColumn('E', input.paymentMethods);
  fillColumn('F', input.customers.map((o) => o.name));
  fillColumn('G', input.suppliers.map((o) => o.name));
  // Dedup pelo nome: categoria 'ambos' aparece em entrada E saída, e
  // apareceria duas vezes no dropdown se a lista fosse a concatenação crua.
  fillColumn('H', [...new Set([...entrada, ...saida].map((o) => o.name))]);

  // Nome definido pros dois ranges de categoria — alimenta o INDIRECT da
  // validação dependente da coluna "Categoria" (CAMADA 1, só Excel de
  // verdade — ver `applyCategoryValidationAndFlag`).
  workbook.definedNames.add(listsRanges.categoriesEntrada, CATEGORY_ENTRADA_NAME);
  workbook.definedNames.add(listsRanges.categoriesSaida, CATEGORY_SAIDA_NAME);
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

/**
 * CAMADA 1 da validação de Categoria x Tipo — validação DEPENDENTE: a lista
 * que aparece no dropdown muda conforme o valor da coluna "Tipo" NA MESMA
 * LINHA (`INDIRECT(IF(<tipo>="Saída", "cat_saida", "cat_entrada"))`, sobre os
 * nomes definidos criados em `createListsSheet`).
 *
 * ⚠️ SÓ FUNCIONA NO EXCEL DE VERDADE. O Google Sheets, na importação de um
 * `.xlsx` com essa validação (`type: 'list'` + `formulae` sendo uma FÓRMULA
 * em vez de um range/lista literal), NÃO aplica a regra — ele importa o
 * arquivo sem erro, mas a célula fica livre pra qualquer texto, sem
 * dropdown. Isso é uma limitação conhecida e documentada do Sheets com
 * validação por fórmula dependente de outra célula da MESMA linha; não é bug
 * nosso e não tem workaround só com `.xlsx` (o workaround de verdade seria
 * gerar a planilha via Google Sheets API, fora de escopo aqui). Por isso
 * existe a CAMADA 2 (`applyCategoryConditionalFormatting`, chamada em
 * seguida): ela é formatação condicional, não validação, e funciona IGUAL
 * nos dois mundos — é a que de fato protege o cliente que abre no Sheets.
 */
function applyDependentCategoryValidation(
  sheet: ExcelWorksheet,
  categoryColLetter: string,
  typeColLetter: string,
  valueTexts: MovementValueTexts,
  firstRow: number,
  lastRow: number,
): void {
  const saidaLiteral = valueTexts.saida.replace(/"/g, '""');
  for (let r = firstRow; r <= lastRow; r++) {
    sheet.getCell(`${categoryColLetter}${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [
        `INDIRECT(IF(${typeColLetter}${r}="${saidaLiteral}","${CATEGORY_SAIDA_NAME}","${CATEGORY_ENTRADA_NAME}"))`,
      ],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Categoria fora do Tipo',
      error: 'Escolha uma categoria da lista do Tipo desta linha (Entrada ou Saída).',
    };
  }
}

/**
 * CAMADA 2 da validação de Categoria x Tipo — formatação condicional por
 * EXPRESSÃO que acende um fundo de ALERTA quando a categoria escolhida não
 * pertence à lista do Tipo da mesma linha. Funciona IGUAL no Excel e no
 * Google Sheets (formatação condicional, nunca ignorada como a validação da
 * CAMADA 1 acima) — é a camada que de fato salva o cliente que abre no
 * Sheets, onde o dropdown dependente simplesmente não aparece.
 *
 * Combinada na MESMA chamada de `addConditionalFormatting` com a cor por
 * valor de cada categoria (igual às outras colunas), com o alerta em
 * PRIORIDADE 1 (precedência sobre as demais) — pra nunca ficar escondido
 * debaixo da cor normal da categoria quando as duas regras batem na mesma
 * célula.
 */
function applyCategoryConditionalFormatting(
  sheet: ExcelWorksheet,
  categoryColLetter: string,
  typeColLetter: string,
  valueTexts: MovementValueTexts,
  firstRow: number,
  lastRow: number,
  categories: CategoryTemplateOption[],
): void {
  const saidaLiteral = valueTexts.saida.replace(/"/g, '""');
  const anchorCat = `${categoryColLetter}${firstRow}`;
  const anchorType = `${typeColLetter}${firstRow}`;
  const mismatchFormula =
    `AND(${anchorCat}<>"",${anchorType}<>"",` +
    `IF(${anchorType}="${saidaLiteral}",COUNTIF(${CATEGORY_SAIDA_NAME},${anchorCat})=0,` +
    `COUNTIF(${CATEGORY_ENTRADA_NAME},${anchorCat})=0))`;

  const colorItems = categories
    .map((o) => ({ name: o.name, argb: optionalHexToArgb(o.color) }))
    .filter((o): o is { name: string; argb: string } => o.argb !== null)
    .slice(0, MAX_COLOR_RULES);

  sheet.addConditionalFormatting({
    ref: `${categoryColLetter}${firstRow}:${categoryColLetter}${lastRow}`,
    rules: [
      {
        type: 'expression' as const,
        priority: 1,
        formulae: [mismatchFormula],
        style: {
          fill: {
            type: 'pattern' as const,
            pattern: 'solid' as const,
            bgColor: { argb: CATEGORY_MISMATCH_ARGB },
            fgColor: { argb: CATEGORY_MISMATCH_ARGB },
          },
          font: {
            color: { argb: optionalHexToArgb(idealForeground(`#${CATEGORY_MISMATCH_ARGB.slice(2)}`)) ?? WHITE_ARGB },
            bold: true,
          },
        },
      },
      ...colorItems.map((item, idx) => ({
        type: 'cellIs' as const,
        operator: 'equal' as const,
        priority: idx + 2,
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
    ],
  });
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
  texts: TemplateTexts,
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

  const colIndex = (key: MovementColumnKey) => movementColumns.findIndex((c) => c.key === key) + 1;
  const dateColIdx = colIndex('date');
  const paidDateColIdx = colIndex('paidDate');
  const dueDateColIdx = colIndex('dueDate');
  const amountColIdx = colIndex('amount');
  const descriptionColIdx = colIndex('description');

  // Área de digitação com zebra, borda suave, alinhamento e formato de
  // data/moeda — tudo NA CÉLULA, dentro do MESMO laço, e cobrindo a MESMA
  // faixa da validação (até `MOVEMENT_DATA_ROWS_END`).
  //
  // ⚠️ Antes isto era `sheet.getColumn(...).numFmt =` / `.alignment =`
  // (formato DE COLUNA) e o laço de zebra/borda só ia até a linha 120. O
  // Google Sheets IGNORA formato de coluna quando a célula tem estilo
  // próprio — e o laço de zebra/borda cria estilo pra TODA célula de 2 a
  // 120 (fill OU border, sempre pelo menos a borda). Resultado, visto pelo
  // CEO em 18/10/2026: "21/10" em vez de "21/10/2026", "500" em vez de
  // "R$ 500,00", linhas 2-120 desalinhadas — e, ironicamente, linhas 121+
  // apareciam CERTAS, porque não tinham estilo de célula pra sombrear o da
  // coluna. A correção: aplicar `numFmt`/`alignment` na CÉLULA, no mesmo
  // laço que pinta zebra/borda, e subir esse laço pra cobrir a mesma faixa
  // da validação — não só os primeiros 120. O formato DE COLUNA abaixo
  // continua existindo como REFORÇO (linha colada manualmente além de
  // `MOVEMENT_DATA_ROWS_END`), mas quem vale é o da célula.
  //
  // Regra de alinhamento do CEO: tudo centralizado (horizontal e vertical),
  // MENOS Descrição, que fica à esquerda (e centralizada na vertical).
  //
  // Peso do arquivo: subir de 120 pra `MOVEMENT_DATA_ROWS_END` (2000) linhas
  // estilizadas multiplica por ~17x a quantidade de células com estilo
  // próprio (2000×12 contra 120×12). Decisão: subir mesmo assim — ver a
  // medição real no comentário de `buildFinancialImportWorkbook` e no plano
  // (arquivo ainda fica na faixa de algumas centenas de KB, não MB).
  const STYLED_ROWS_END = MOVEMENT_DATA_ROWS_END;
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
      cell.alignment =
        c === descriptionColIdx
          ? { horizontal: 'left', vertical: 'middle' }
          : { horizontal: 'center', vertical: 'middle' };
      if (c === dateColIdx || c === paidDateColIdx || c === dueDateColIdx) {
        cell.numFmt = 'dd/mm/yyyy';
      } else if (c === amountColIdx) {
        cell.numFmt = currencyNumFmt(input.currencyCode);
      }
    }
  }

  // Formato/alinhamento DE COLUNA — reforço pra linha colada manualmente
  // ALÉM de `STYLED_ROWS_END` (hoje inexistente, já que as duas faixas são
  // iguais, mas documentado caso uma volte a divergir). Mesma regra da célula:
  // tudo centralizado, menos Descrição (à esquerda).
  sheet.getColumn(amountColIdx).numFmt = currencyNumFmt(input.currencyCode);
  sheet.getColumn(dateColIdx).numFmt = 'dd/mm/yyyy';
  sheet.getColumn(paidDateColIdx).numFmt = 'dd/mm/yyyy';
  sheet.getColumn(dueDateColIdx).numFmt = 'dd/mm/yyyy';
  for (let c = 1; c <= movementColumns.length; c += 1) {
    sheet.getColumn(c).alignment =
      c === descriptionColIdx ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
  }

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
  // Categoria: lista COMPLETA (funciona no Excel e no Google Sheets).
  //
  // ⚠️ Já foi uma validação DEPENDENTE do Tipo, com `INDIRECT`. Revertida em
  // 18/10/2026 porque o Google Sheets não descarta a regra: importa e resolve
  // VAZIA, e o cliente abre o seletor de Categoria sem nenhuma opção. Seletor
  // vazio é pior que lista longa. Quem garante a coerência Tipo × Categoria é
  // a formatação condicional de descompasso (abaixo, funciona nos dois) e o
  // servidor, que recusa categoria de tipo incompatível na importação.
  applyListValidation(
    sheet,
    columnLetter(colIndex('category')),
    [listsRanges.categoriesTodas],
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
    columnLetter(colIndex('customer')),
    [listsRanges.customers],
    firstDataRow,
    MOVEMENT_DATA_ROWS_END,
  );
  applyListValidation(
    sheet,
    columnLetter(colIndex('supplier')),
    [listsRanges.suppliers],
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
  // Data e Data do pagamento ganham validação de DATA.
  //
  // Além de barrar texto que não é data, é isso que faz o Google Sheets
  // desenhar o CALENDÁRIO na célula: ele mostra o seletor quando a célula tem
  // regra de data. O Excel não desenha calendário, mas recusa o valor inválido
  // com a mensagem abaixo. Nos dois casos o cliente para de digitar "21/13" ou
  // "ontem" e o leitor não precisa adivinhar.
  for (const chave of ['date', 'paidDate', 'dueDate'] as const) {
    const letra = columnLetter(colIndex(chave));
    for (let r = firstDataRow; r <= MOVEMENT_DATA_ROWS_END; r += 1) {
      sheet.getCell(`${letra}${r}`).dataValidation = {
        type: 'date',
        operator: 'between',
        allowBlank: true,
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: texts.dateErrorTitle,
        error: texts.dateErrorMessage,
        formulae: [new Date(2000, 0, 1), new Date(2100, 11, 31)],
      };
    }
  }

  applyListValidation(
    sheet,
    columnLetter(colIndex('paymentMethod')),
    [listsRanges.paymentMethods],
    firstDataRow,
    MOVEMENT_DATA_ROWS_END,
  );

  // ── Cor por valor: a planilha passa a falar a mesma língua visual do app ──
  // Tipo: semântica fixa (entra verde, sai vermelho). Categoria combina cor +
  // alerta de descompasso na mesma regra (ver `applyCategoryConditionalFormatting`).
  // Conta/Centro de custo herdam a cor do próprio cadastro do tenant. Forma de
  // pagamento usa a paleta fixa `PAYMENT_METHOD_COLOR_ARGB` (não vem de
  // cadastro — formas de pagamento não têm cor no banco).
  applyValueColorRules(sheet, columnLetter(colIndex('type')), firstDataRow, MOVEMENT_DATA_ROWS_END, [
    { name: valueTexts.entrada, argb: INCOME_ARGB },
    { name: valueTexts.saida, argb: EXPENSE_ARGB },
  ]);

  const comCor = (itens: TemplateOption[]) =>
    itens
      .map((o) => ({ name: o.name, argb: optionalHexToArgb(o.color) }))
      .filter((o): o is { name: string; argb: string } => o.argb !== null);

  applyCategoryConditionalFormatting(
    sheet,
    columnLetter(colIndex('category')),
    columnLetter(colIndex('type')),
    valueTexts,
    firstDataRow,
    MOVEMENT_DATA_ROWS_END,
    input.categories,
  );
  applyValueColorRules(sheet, columnLetter(colIndex('account')), firstDataRow, MOVEMENT_DATA_ROWS_END, comCor(input.accounts));
  applyValueColorRules(sheet, columnLetter(colIndex('costCenter')), firstDataRow, MOVEMENT_DATA_ROWS_END, comCor(input.costCenters));

  const paymentMethodColorItems = input.paymentMethods
    .map((label) => {
      const code = paymentMethodCodeForLabel(label, input.locale);
      return code ? { name: label, argb: PAYMENT_METHOD_COLOR_ARGB[code] } : null;
    })
    .filter((item): item is { name: string; argb: string } => item !== null);
  applyValueColorRules(sheet, columnLetter(colIndex('paymentMethod')), firstDataRow, MOVEMENT_DATA_ROWS_END, paymentMethodColorItems);
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
  buildMovementsSheet(workbook, input, primaryArgb, listsRanges, sheetNames, movementColumns, valueTexts, texts);
  createListsSheet(workbook, input, sheetNames.lists, listsRanges);

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
