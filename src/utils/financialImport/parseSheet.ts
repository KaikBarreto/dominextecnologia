// ─────────────────────────────────────────────────────────────────────────────
// parseSheet — leitor PURO (sem UI, sem Supabase) da planilha `.xlsx`/`.xls`
// que o cliente devolve preenchida a partir do molde gerado por
// `buildTemplate.ts`.
//
// Mesma lei do parser de OFX (`src/utils/ofx/parseOfx.ts`): o parser NUNCA
// corrige em silêncio. Normaliza o que é inequívoco e marca pra conferência o
// que é ambíguo (`needs_review`). Quem decide o que fazer com a linha
// marcada é a tela de conferência, não este arquivo.
//
// Lib: `xlsx` (SheetJS), já dependência do projeto — ela LÊ perfeitamente,
// o que falta nela (escrever estilo) é o trabalho de `buildTemplate.ts` com
// `exceljs`. Import dinâmico, mesmo padrão dos utilitários vizinhos.
//
// Vocabulário multilíngue (atualizado 2026-10-18): o molde agora sai
// traduzido nos 4 idiomas do Dominex (ver `templateCopy.ts`), então este
// parser precisa reconhecer cabeçalho e valor de célula nos 4, não só em
// PT-BR. Os aliases abaixo são FLAT (não separados por locale): o tenant pode
// ter baixado o molde em espanhol e reimportar depois de editar em outro
// idioma, então a lista de sinônimos cobre todos de uma vez. A disputa entre
// colunas continua pela ORDEM de especificidade (`COLUMN_MATCH_ORDER`), não
// pela ordem dentro de cada lista.
// ─────────────────────────────────────────────────────────────────────────────

import { fuzzyIncludes, normalizeSearch } from '@/lib/utils';
import { parseAmount } from '@/utils/ofx/parseOfx';
import { MOVEMENT_VALUE_TEXTS } from './templateCopy';

export type RowState = 'ready' | 'needs_review' | 'skipped';

export interface ParsedRow {
  /** Número real da linha na planilha (1-indexado, igual ao que o Excel mostra) — pra UI apontar. */
  rowNumber: number;
  state: RowState;
  /** Mensagens PT-BR, uma por problema. Vazio quando `state === 'ready'`. */
  issues: string[];
  date: string | null; // YYYY-MM-DD
  type: 'entrada' | 'saida' | null;
  description: string | null;
  /** SEMPRE positivo — a direção vem de `type`, nunca do sinal. */
  amount: number | null;
  category: string | null;
  account: string | null;
  counterparty: string | null;
  costCenter: string | null;
  paymentMethod: string | null;
  isPaid: boolean;
  paidDate: string | null;
  notes: string | null;
  /** Hash determinístico pra trava de "não duplicar" (ver `computeDedupKey` do OFX, mesma ideia). */
  contentKey: string;
}

export interface ParsedSheet {
  rows: ParsedRow[];
  /** Avisos não-fatais no nível do arquivo (aba escolhida por fallback, coluna obrigatória ausente, truncamento). */
  warnings: string[];
}

const MAX_ROWS = 5000;

/* ─────────────────────────── mapeamento de colunas por nome ─────────────────────────── */

type ColumnKey =
  | 'date'
  | 'type'
  | 'description'
  | 'amount'
  | 'category'
  | 'account'
  | 'counterparty'
  | 'costCenter'
  | 'paymentMethod'
  | 'isPaid'
  | 'paidDate'
  | 'notes';

/**
 * Aliases por coluna — FLAT, cobrindo pt-br/en/es/fr de uma vez (não é por
 * locale: o parser não sabe em que idioma o tenant baixou o molde, só lê o
 * que vier). Mais específico primeiro dentro de cada lista (critério auxiliar
 * de leitura; a ORDEM DE PRIORIDADE entre colunas vem de `COLUMN_MATCH_ORDER`,
 * não da ordem aqui).
 */
const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  date: ['data', 'date', 'fecha', 'data da movimentacao', 'data movimentacao', 'dt'],
  type: [
    'tipo',
    'type',
    'entrada ou saida',
    'entrada/saida',
    'tipo de movimentacao',
    'direcao',
  ],
  description: [
    'descricao',
    'description',
    'descripcion',
    'descricao da movimentacao',
    'historico',
    'titulo',
  ],
  amount: [
    'valor',
    'amount',
    'montant',
    'valor (r$)',
    'valor r$',
    'valor da movimentacao',
    'montante',
  ],
  category: ['categoria', 'category', 'categorie'],
  account: ['conta', 'account', 'compte', 'cuenta', 'conta bancaria', 'conta financeira'],
  counterparty: [
    'cliente/fornecedor',
    'cliente ou fornecedor',
    'cliente / fornecedor',
    'fornecedor/cliente',
    'customer/supplier',
    'cliente/proveedor',
    'client/fournisseur',
    'cliente',
    'fornecedor',
    'customer',
    'supplier',
    'vendor',
    'proveedor',
    'fournisseur',
  ],
  costCenter: [
    'centro de custo',
    'cost center',
    'centro de costo',
    'centre de cout',
    'centro custo',
    'cc',
  ],
  paymentMethod: [
    'forma de pagamento',
    'payment method',
    'metodo de pago',
    'moyen de paiement',
    'meio de pagamento',
    'forma pagamento',
  ],
  isPaid: [
    'pago?',
    'pago',
    'paid',
    'pagado',
    'paye',
    'situacao',
    'status',
    'status do pagamento',
  ],
  paidDate: [
    'data do pagamento',
    'payment date',
    'fecha de pago',
    'date de paiement',
    'data de pagamento',
    'data pagamento',
    'dt pagamento',
  ],
  notes: ['observacoes', 'notes', 'observaciones', 'remarques', 'observacao', 'obs', 'notas'],
};

/**
 * Ordem em que as colunas DISPUTAM cabeçalhos ambíguos: as mais específicas
 * (frases longas, ex: "Data do pagamento") processam primeiro, pra não deixar
 * a coluna genérica ("Data") engolir um cabeçalho renomeado que ainda contém
 * a palavra "data". Ver `buildColumnMap`.
 */
const COLUMN_MATCH_ORDER: ColumnKey[] = [
  'paidDate',
  'costCenter',
  'paymentMethod',
  'counterparty',
  'isPaid',
  'category',
  'account',
  'description',
  'type',
  'notes',
  'date',
  'amount',
];

/**
 * Mapeia cabeçalhos reais (por nome, nunca por posição) pras chaves
 * canônicas. Duas passadas por coluna (na ordem de especificidade):
 * 1) igualdade exata normalizada (cobre acento/caixa/espaço, inclusive o
 *    molde oficial sem ambiguidade nenhuma);
 * 2) `fuzzyIncludes` como fallback pra cabeçalho reescrito (“Valor” → “Valor
 *    (R$)”). Cada cabeçalho só é consumido uma vez.
 */
function buildColumnMap(headerRow: unknown[]): Partial<Record<ColumnKey, number>> {
  const normalizedHeaders = headerRow.map((cell) =>
    cell == null ? '' : normalizeSearch(String(cell)),
  );
  const available = new Set<number>();
  normalizedHeaders.forEach((text, idx) => {
    if (text) available.add(idx);
  });

  const map: Partial<Record<ColumnKey, number>> = {};

  for (const key of COLUMN_MATCH_ORDER) {
    const aliases = COLUMN_ALIASES[key];
    // Passada 1: igualdade exata.
    let foundIdx = [...available].find((idx) => aliases.includes(normalizedHeaders[idx]));
    // Passada 2: substring tolerante (fuzzy), só se a exata não achou nada.
    if (foundIdx === undefined) {
      foundIdx = [...available].find((idx) =>
        aliases.some((alias) => fuzzyIncludes(headerRow[idx] == null ? '' : String(headerRow[idx]), alias)),
      );
    }
    if (foundIdx !== undefined) {
      map[key] = foundIdx;
      available.delete(foundIdx);
    }
  }

  return map;
}

/* ─────────────────────────── data: serial / texto, nunca `new Date(string)` ─────────────────────────── */

/**
 * `dd/mm/yyyy`, `yyyy-mm-dd`, `dd-mm-yy`... Decide qual grupo é o ano pelo
 * tamanho (4 dígitos). Monta a string `YYYY-MM-DD` manualmente, SEM passar
 * por `new Date(...)` — não há timestamp aqui, então não existe risco de
 * fuso (o bug clássico só nasce quando se converte texto → Date → ISO).
 */
function parseDateText(raw: string): string | null {
  const s = raw.trim();
  const m = s.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/);
  if (!m) return null;
  const [, a, b, c] = m;
  let year: number;
  let month: number;
  let day: number;
  if (a.length === 4) {
    year = parseInt(a, 10);
    month = parseInt(b, 10);
    day = parseInt(c, 10);
  } else if (c.length === 4) {
    day = parseInt(a, 10);
    month = parseInt(b, 10);
    year = parseInt(c, 10);
  } else {
    // dd-mm-yy (2 dígitos de ano) — convenção BR: dia primeiro.
    day = parseInt(a, 10);
    month = parseInt(b, 10);
    const yy = parseInt(c, 10);
    year = yy <= 69 ? 2000 + yy : 1900 + yy;
  }
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31) || !(year >= 1900 && year <= 2100)) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface SsfLike {
  parse_date_code: (value: number) => { y: number; m: number; d: number } | null | undefined;
}

/**
 * Converte a célula de data em `YYYY-MM-DD`, cobrindo as 3 formas que uma
 * planilha de cliente chega:
 *  - `Date` nativo (SheetJS já converteu via `cellDates: true`) — extraído
 *    com getters **UTC**, nunca locais (a conversão da própria SheetJS ancora
 *    em UTC; ler com getters locais reintroduziria o off-by-one do fuso).
 *  - número de série puro (célula sem formatação de data reconhecida) —
 *    convertido pelo utilitário oficial `XLSX.SSF.parse_date_code`, que
 *    respeita o bug do ano 1900 por dentro. NUNCA aritmética à mão.
 *  - texto (`17/10/2026`, `2026-10-17`, `17-10-26`) — via `parseDateText`.
 */
function excelDateToIso(value: unknown, ssf: SsfLike): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const mo = value.getUTCMonth() + 1;
    const d = value.getUTCDate();
    return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = ssf.parse_date_code(value);
    if (!parsed) return null;
    return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  if (typeof value === 'string' && value.trim()) {
    return parseDateText(value);
  }
  return null;
}

/* ─────────────────────────── valor: BR, reusando o parser do OFX ─────────────────────────── */

/**
 * Número nativo (célula numérica do Excel) ou string (`R$ 1.234,56`, digitada
 * ou colada). `parseAmount` é o MESMO parser do OFX — reusar em vez de
 * escrever um segundo é o que evita o bug clássico de `replace(',', '.')`
 * cego transformar R$ 1.234,56 em R$ 1,23.
 */
function parseAmountCell(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const n = parseAmount(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/* ─────────────────────────── tipo (Entrada/Saída) ─────────────────────────── */

function textCell(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

/**
 * Palavras reconhecidas como "entrada"/"saída" e "sim"/"não" — montadas a
 * partir do valor CANÔNICO dos 4 idiomas (`MOVEMENT_VALUE_TEXTS`, mesmo mapa
 * que `buildTemplate.ts` usa pros dropdowns) + sinônimos extras que o tenant
 * pode digitar fora do dropdown oficial (Credit/Debit, Egreso, Recette...).
 *
 * Igualdade EXATA do token normalizado inteiro, NUNCA `includes`/substring:
 * "No" (não, en/es) não pode casar com "Nota" ou "Novembro", e "Si" (sim, es)
 * não pode virar falso positivo de outra palavra que só contenha "si". Cada
 * lista vira um `Set` pra comparação O(1) e dedupe automático (vários
 * locales compartilham a mesma palavra, ex: "No" é "não" em en e es).
 */
function normalizedWordSet(words: string[]): Set<string> {
  return new Set(words.map((w) => normalizeSearch(w)));
}

const INCOME_TYPE_WORDS = normalizedWordSet([
  MOVEMENT_VALUE_TEXTS['pt-br'].entrada,
  MOVEMENT_VALUE_TEXTS.en.entrada,
  MOVEMENT_VALUE_TEXTS.es.entrada,
  MOVEMENT_VALUE_TEXTS.fr.entrada,
  'receita',
  'credito',
  'credit',
  'recette',
]);

const EXPENSE_TYPE_WORDS = normalizedWordSet([
  MOVEMENT_VALUE_TEXTS['pt-br'].saida,
  MOVEMENT_VALUE_TEXTS.en.saida,
  MOVEMENT_VALUE_TEXTS.es.saida,
  MOVEMENT_VALUE_TEXTS.fr.saida,
  'despesa',
  'debito',
  'debit',
  'egreso',
  'depense',
]);

const PAID_YES_WORDS = normalizedWordSet([
  MOVEMENT_VALUE_TEXTS['pt-br'].sim,
  MOVEMENT_VALUE_TEXTS.en.sim,
  MOVEMENT_VALUE_TEXTS.es.sim,
  MOVEMENT_VALUE_TEXTS.fr.sim,
  'pago',
  's',
  'y',
  '1',
  'true',
]);

const PAID_NO_WORDS = normalizedWordSet([
  MOVEMENT_VALUE_TEXTS['pt-br'].nao,
  MOVEMENT_VALUE_TEXTS.en.nao,
  MOVEMENT_VALUE_TEXTS.es.nao,
  MOVEMENT_VALUE_TEXTS.fr.nao,
  'n',
  '0',
  'false',
]);

function classifyTypeText(raw: string | null): 'entrada' | 'saida' | null {
  if (!raw) return null;
  const n = normalizeSearch(raw);
  if (INCOME_TYPE_WORDS.has(n)) return 'entrada';
  if (EXPENSE_TYPE_WORDS.has(n)) return 'saida';
  return null;
}

function classifyPaidText(raw: string | null): boolean | 'unrecognized' | null {
  if (!raw) return null;
  const n = normalizeSearch(raw);
  if (PAID_YES_WORDS.has(n)) return true;
  if (PAID_NO_WORDS.has(n)) return false;
  return 'unrecognized';
}

/* ─────────────────────────── contentKey: FNV-1a, mesma ideia do OFX ─────────────────────────── */

/**
 * Hash determinístico (FNV-1a 32-bit em hex) — mesma ideia do `stableHash`
 * interno de `src/utils/ofx/parseOfx.ts` (não exportado por lá, então
 * reimplementado aqui; é só a conta, não uma lib).
 */
function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function computeContentKey(params: {
  date: string | null;
  type: 'entrada' | 'saida' | null;
  amount: number | null;
  description: string | null;
  account: string | null;
}): string {
  const signed = params.type === 'saida' ? -(params.amount ?? 0) : params.amount ?? 0;
  const basis = [
    params.date ?? '',
    String(signed),
    normalizeSearch(params.description ?? ''),
    normalizeSearch(params.account ?? ''),
  ].join('|');
  return stableHash(basis);
}

/* ─────────────────────────── escolha da aba ─────────────────────────── */

const MOVEMENTS_SHEET_ALIASES = [
  'movimentacoes',
  'movimentos',
  'lancamentos',
  'transacoes',
  'transactions',
  'movements',
  'movimientos',
  'mouvements',
];

interface SheetGrid {
  name: string;
  /** Linhas cruas (array de arrays), uma entrada por linha FÍSICA da planilha (0-indexada = linha 1 do Excel). */
  rows: unknown[][];
}

function readSheetGrid(xlsx: typeof import('xlsx'), sheet: import('xlsx').WorkSheet): SheetGrid['rows'] {
  const ref = sheet['!ref'];
  if (!ref) return [];
  const range = xlsx.utils.decode_range(ref);
  const rows: unknown[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: unknown[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = xlsx.utils.encode_cell({ r, c });
      const cell = sheet[addr] as { v?: unknown } | undefined;
      row.push(cell ? cell.v ?? null : null);
    }
    rows.push(row);
  }
  return rows;
}

function findHeaderRowIndex(rows: unknown[][]): number {
  return rows.findIndex((row) => row.some((cell) => textCell(cell) !== null));
}

/**
 * Escolhe a aba de movimentações: 1) nome parecido com "Movimentações"
 * (fuzzy, cobre renomeada/traduzida); 2) fallback pra primeira aba cuja
 * primeira linha não-vazia tenha cabeçalho reconhecível (pelo menos Data E
 * Valor mapeados). Nunca assume `SheetNames[0]` — a aba "Leia primeiro" bem
 * pode vir primeiro.
 */
function pickMovementsSheet(
  xlsx: typeof import('xlsx'),
  workbook: import('xlsx').WorkBook,
): { name: string; rows: unknown[][]; headerRowIdx: number; fallback: boolean } | null {
  for (const name of workbook.SheetNames) {
    if (MOVEMENTS_SHEET_ALIASES.some((alias) => fuzzyIncludes(name, alias))) {
      const rows = readSheetGrid(xlsx, workbook.Sheets[name]);
      const headerRowIdx = findHeaderRowIndex(rows);
      if (headerRowIdx !== -1) return { name, rows, headerRowIdx, fallback: false };
    }
  }
  for (const name of workbook.SheetNames) {
    const rows = readSheetGrid(xlsx, workbook.Sheets[name]);
    const headerRowIdx = findHeaderRowIndex(rows);
    if (headerRowIdx === -1) continue;
    const map = buildColumnMap(rows[headerRowIdx]);
    if (map.date !== undefined && map.amount !== undefined) {
      return { name, rows, headerRowIdx, fallback: true };
    }
  }
  return null;
}

/* ─────────────────────────── parse principal ─────────────────────────── */

export async function parseFinancialSheet(bytes: ArrayBuffer): Promise<ParsedSheet> {
  const XLSX = await import('xlsx');
  const warnings: string[] = [];

  const workbook = XLSX.read(new Uint8Array(bytes), { type: 'array', cellDates: true });
  const picked = pickMovementsSheet(XLSX, workbook);

  if (!picked) {
    warnings.push(
      'Não foi possível encontrar uma aba com as colunas de movimentações (Data, Valor...) neste arquivo.',
    );
    return { rows: [], warnings };
  }

  if (picked.fallback) {
    warnings.push(`Não encontrei uma aba chamada "Movimentações", usando a aba "${picked.name}".`);
  }

  const headerRow = picked.rows[picked.headerRowIdx];
  const columnMap = buildColumnMap(headerRow);

  const REQUIRED_LABELS: Array<[ColumnKey, string]> = [
    ['date', 'Data'],
    ['type', 'Tipo'],
    ['description', 'Descrição'],
    ['amount', 'Valor'],
    ['category', 'Categoria'],
    ['account', 'Conta'],
  ];
  for (const [key, label] of REQUIRED_LABELS) {
    if (columnMap[key] === undefined) {
      warnings.push(
        `A coluna "${label}" não foi encontrada na planilha. As linhas serão marcadas para conferência.`,
      );
    }
  }

  let dataRows = picked.rows.slice(picked.headerRowIdx + 1);
  // Linhas inteiramente vazias (sobra de formatação no fim do arquivo) não contam pro limite.
  const truncatedOriginalLength = dataRows.length;
  if (dataRows.length > MAX_ROWS) {
    dataRows = dataRows.slice(0, MAX_ROWS);
    warnings.push(
      `A planilha tem mais de ${MAX_ROWS} linhas (${truncatedOriginalLength}); só as primeiras ${MAX_ROWS} foram processadas.`,
    );
  }

  const getCell = (row: unknown[], key: ColumnKey): unknown => {
    const idx = columnMap[key];
    return idx === undefined ? null : row[idx];
  };

  const rows: ParsedRow[] = [];

  dataRows.forEach((row, offset) => {
    const rowNumber = picked.headerRowIdx + 2 + offset; // 1-indexado, linha real do Excel

    const dateRaw = getCell(row, 'date');
    const amountRaw = getCell(row, 'amount');
    const descriptionText = textCell(getCell(row, 'description'));
    const typeText = textCell(getCell(row, 'type'));
    const categoryText = textCell(getCell(row, 'category'));
    const accountText = textCell(getCell(row, 'account'));
    const counterpartyText = textCell(getCell(row, 'counterparty'));
    const costCenterText = textCell(getCell(row, 'costCenter'));
    const paymentMethodText = textCell(getCell(row, 'paymentMethod'));
    const isPaidRaw = textCell(getCell(row, 'isPaid'));
    const paidDateRaw = getCell(row, 'paidDate');
    const notesText = textCell(getCell(row, 'notes'));

    const date = excelDateToIso(dateRaw, XLSX.SSF);
    const rawAmount = parseAmountCell(amountRaw);

    // Linha estruturalmente vazia (sobra no fim do arquivo) → ignora em
    // silêncio, sem issue. Qualquer outra combinação segue pro parse normal.
    const dateCellEmpty = textCell(dateRaw) === null;
    const amountCellEmpty = textCell(amountRaw) === null;
    if (dateCellEmpty && amountCellEmpty) {
      rows.push({
        rowNumber,
        state: 'skipped',
        issues: [],
        date: null,
        type: null,
        description: null,
        amount: null,
        category: null,
        account: null,
        counterparty: null,
        costCenter: null,
        paymentMethod: null,
        isPaid: true,
        paidDate: null,
        notes: null,
        contentKey: computeContentKey({ date: null, type: null, amount: null, description: null, account: null }),
      });
      return;
    }

    const issues: string[] = [];

    if (!dateCellEmpty && date === null) {
      issues.push(`Data inválida: "${String(dateRaw)}".`);
    }
    if (!amountCellEmpty && rawAmount === null) {
      issues.push(`Valor inválido: "${String(amountRaw)}".`);
    }
    if (dateCellEmpty) issues.push('Data não informada.');
    if (amountCellEmpty) issues.push('Valor não informado.');

    const amount = rawAmount !== null ? Math.abs(rawAmount) : null;
    const typeFromText = classifyTypeText(typeText);
    const signDir: 'entrada' | 'saida' | null =
      rawAmount === null || rawAmount === 0 ? null : rawAmount > 0 ? 'entrada' : 'saida';

    let type: 'entrada' | 'saida' | null = null;
    if (typeText && typeFromText === null) {
      issues.push(`Tipo "${typeText}" não reconhecido (use Entrada ou Saída).`);
    } else if (typeFromText && signDir && typeFromText !== signDir) {
      // Sinal brigando com o Tipo: a direção vem do Tipo (regra explícita),
      // mas a linha SEMPRE vai pra conferência — nunca escolhe em silêncio.
      issues.push(
        `Valor e Tipo não combinam: Tipo diz "${typeText}", mas o valor tem sinal de ${
          signDir === 'entrada' ? 'entrada' : 'saída'
        }. Confira qual está certo.`,
      );
      type = typeFromText;
    } else if (typeFromText) {
      type = typeFromText;
    } else if (signDir) {
      // Tipo vazio → infere do sinal, sem issue (não é conflito, é inferência unívoca).
      type = signDir;
    } else if (!typeText) {
      issues.push('Tipo não informado e não foi possível inferir pelo valor.');
    }

    if (!descriptionText) issues.push('Descrição não informada.');
    if (!categoryText) issues.push('Categoria não informada.');
    if (!accountText) issues.push('Conta não informada.');

    const paidClassification = classifyPaidText(isPaidRaw);
    let isPaid = true; // padrão Sim quando em branco
    if (paidClassification === true || paidClassification === false) {
      isPaid = paidClassification;
    } else if (paidClassification === 'unrecognized') {
      issues.push(`Valor de "Pago?" não reconhecido: "${isPaidRaw}" (use Sim ou Não). Assumido Sim.`);
    }

    let paidDate: string | null = null;
    const paidDateCellEmpty = textCell(paidDateRaw) === null;
    if (!paidDateCellEmpty) {
      paidDate = excelDateToIso(paidDateRaw, XLSX.SSF);
      if (paidDate === null) {
        issues.push(`Data do pagamento inválida: "${String(paidDateRaw)}".`);
      }
    } else if (isPaid) {
      // "Em branco com Pago? = Sim → usa a Data" (regra do molde).
      paidDate = date;
    }

    const state: RowState = issues.length > 0 ? 'needs_review' : 'ready';

    rows.push({
      rowNumber,
      state,
      issues,
      date,
      type,
      description: descriptionText,
      amount,
      category: categoryText,
      account: accountText,
      counterparty: counterpartyText,
      costCenter: costCenterText,
      paymentMethod: paymentMethodText,
      isPaid,
      paidDate,
      notes: notesText,
      contentKey: computeContentKey({ date, type, amount, description: descriptionText, account: accountText }),
    });
  });

  return { rows, warnings };
}
