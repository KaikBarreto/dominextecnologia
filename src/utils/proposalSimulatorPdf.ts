import { jsPDF } from 'jspdf';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 16;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const DARK: [number, number, number] = [7, 12, 11];
const CARD: [number, number, number] = [18, 25, 23];
const HAIRLINE: [number, number, number] = [42, 49, 47];
const MUTED: [number, number, number] = [150, 158, 155];
const WHITE: [number, number, number] = [247, 249, 248];
const GREEN: [number, number, number] = [20, 215, 137];
const GREEN_DARK_BG: [number, number, number] = [11, 35, 27];
const PILL_OUTLINE: [number, number, number] = [70, 78, 75];

const DISPLAY_FONT = 'ArchivoBlack';

/** addFileToVFS/addFont são por instância de jsPDF — precisa rodar de novo a cada doc novo. */
async function ensureDisplayFont(doc: jsPDF): Promise<string> {
  try {
    const { ARCHIVO_BLACK_TTF_BASE64 } = await import('@/assets/fonts/archivoBlackBase64');
    doc.addFileToVFS('ArchivoBlack-Regular.ttf', ARCHIVO_BLACK_TTF_BASE64);
    doc.addFont('ArchivoBlack-Regular.ttf', DISPLAY_FONT, 'normal');
    return DISPLAY_FONT;
  } catch {
    return 'helvetica';
  }
}

export interface ProposalPdfUnit {
  name: string;
  planName: string;
  modules: string[];
  users: number;
  monthly: number;
  yearlyFull: number;
  yearlyDiscounted: number;
}

export interface ProposalPdfTotals {
  monthly: number;
  yearlyFull: number;
  yearlyDiscounted: number;
  savings: number;
  pixInstallment: number;
}

export interface GenerateProposalPdfInput {
  clientName: string;
  units: ProposalPdfUnit[];
  totals: ProposalPdfTotals;
  logoUrl: string;
  issuedAt?: Date;
  validityDays?: number;
}

export interface ProposalPdfMetadata {
  clientName: string;
  code: string;
  filename: string;
  issuedLabel: string;
  validityLabel: string;
  unitSummary: string;
}

function safeText(value: string, fallback: string): string {
  const cleaned = [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('')
    .trim();
  return cleaned || fallback;
}

function fileSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'cliente';
}

function dateParts(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return { year, month, day };
}

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function longDateLabel(date: Date): string {
  return `${date.getDate()} de ${MONTHS_PT[date.getMonth()]} de ${date.getFullYear()}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function buildProposalPdfMetadata(
  clientName: string,
  unitCount: number,
  issuedAt = new Date(),
  validityDays = 15,
): ProposalPdfMetadata {
  const safeClient = safeText(clientName, 'Cliente');
  const { year, month, day } = dateParts(issuedAt);
  const validUntil = new Date(issuedAt);
  validUntil.setDate(validUntil.getDate() + validityDays);

  return {
    clientName: safeClient,
    code: `DOM-${year}${month}${day}-${fileSlug(safeClient).slice(0, 8).toUpperCase()}`,
    filename: `proposta-dominex-${fileSlug(safeClient)}.pdf`,
    issuedLabel: issuedAt.toLocaleDateString('pt-BR'),
    validityLabel: validUntil.toLocaleDateString('pt-BR'),
    unitSummary: `${unitCount} ${unitCount === 1 ? 'unidade' : 'unidades'}`,
  };
}

function money(value: number): string {
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
  // Intl insere um espaço NÃO-quebrável (U+00A0) depois de "R$". As fontes core do jsPDF
  // (Helvetica) medem esse glyph com o dobro da largura de um espaço comum, o que abre um
  // vão visível sempre que o valor aparece dentro de texto corrido/quebrado manualmente.
  // Como a quebra de linha aqui é sempre manual (nunca depende do navegador), um espaço
  // comum resolve sem efeito colateral.
  return formatted.replace(/ /g, ' ');
}

/** Separa um valor monetário em parte inteira ("R$ 1.234") e parte decimal (",56"). */
function moneyParts(value: number): { intPart: string; centsPart: string } {
  const full = money(value);
  const commaIndex = full.lastIndexOf(',');
  if (commaIndex === -1) return { intPart: full, centsPart: '' };
  return { intPart: full.slice(0, commaIndex), centsPart: full.slice(commaIndex) };
}

async function imageAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Não foi possível carregar o logo da proposta.');
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível preparar o logo da proposta.'));
    reader.readAsDataURL(blob);
  });
}

function setTextColor(doc: jsPDF, color: [number, number, number]) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function setDrawColor(doc: jsPDF, color: [number, number, number]) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function setFillColor(doc: jsPDF, color: [number, number, number]) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function addDarkPage(doc: jsPDF) {
  setFillColor(doc, DARK);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');
}

/**
 * Quebra texto em linhas considerando `charSpace` (letter-spacing) — `splitTextToSize` do jsPDF
 * ignora esse parâmetro na medição, então com letter-spacing ativo ele mede a largura menor do
 * que a realmente desenhada e deixa o texto estourar a margem em vez de quebrar linha.
 */
function splitWithCharSpace(doc: jsPDF, text: string, maxWidth: number, charSpace: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    const width = doc.getTextWidth(candidate) + candidate.length * charSpace;
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines;
}

/** Trunca com reticências pra caber em uma única linha — usa a fonte/tamanho já ativos no doc. */
function ellipsizeToWidth(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  const ellipsis = '…';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${text.slice(0, mid).trimEnd()}${ellipsis}`;
    if (doc.getTextWidth(candidate) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}${ellipsis}`;
}

/**
 * jsPDF mede `align: 'right'`/`'center'` com `doc.getStringUnitWidth` puro — ignora `charSpace`
 * (letter-spacing), então um texto com letter-spacing alinhado à direita estoura a margem (a
 * extensão real desenhada é maior do que a largura usada pro cálculo do alinhamento). Medimos
 * manualmente somando o espaçamento extra entre caracteres e posicionamos à esquerda.
 */
function charSpaceWidth(doc: jsPDF, text: string, charSpace: number): number {
  return doc.getTextWidth(text) + Math.max(0, text.length - 1) * charSpace;
}

function drawRightAligned(doc: jsPDF, text: string, rightX: number, y: number, charSpace = 0) {
  const width = charSpaceWidth(doc, text, charSpace);
  doc.text(text, rightX - width, y, charSpace ? { charSpace } : undefined);
}

function roundedRectOutline(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, color: [number, number, number]) {
  setDrawColor(doc, color);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, r, r, 'S');
}

/** Desenha um valor grande em 2 runs: parte inteira grande + ",centavos"/sufixo pequeno, alinhado à esquerda. */
function drawBigMoney(
  doc: jsPDF,
  displayFont: string,
  value: number,
  x: number,
  y: number,
  bigSize: number,
  smallSize: number,
  color: [number, number, number],
  suffix = '',
): number {
  const { intPart, centsPart } = moneyParts(value);
  setTextColor(doc, color);
  doc.setFont(displayFont, 'normal');
  doc.setFontSize(bigSize);
  doc.text(intPart, x, y);
  const intWidth = doc.getTextWidth(intPart);
  doc.setFontSize(smallSize);
  doc.text(`${centsPart}${suffix}`, x + intWidth, y);
  return x + intWidth + doc.getTextWidth(`${centsPart}${suffix}`);
}

/** Desenha um parágrafo com trechos em bold branco dentro de texto muted, quebrando linha automaticamente. */
function drawRichParagraph(
  doc: jsPDF,
  runs: { text: string; bold: boolean }[],
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
): number {
  doc.setFontSize(fontSize);
  type Word = { text: string; bold: boolean };
  // Tokeniza o texto já concatenado (não por run isolada): um espaço pode cair exatamente na
  // fronteira entre dois runs (ex. run bold terminando em "mês" seguido de run normal começando
  // com " e pode..."), e dividir run a run derruba esse espaço de fronteira (vira "mêse").
  const fullText = runs.map((run) => run.text).join('');
  const boldAtIndex: boolean[] = [];
  runs.forEach((run) => {
    for (let i = 0; i < run.text.length; i += 1) boldAtIndex.push(run.bold);
  });
  const words: Word[] = [];
  let cursor = 0;
  while (cursor < fullText.length) {
    let end = cursor;
    while (end < fullText.length && fullText[end] !== ' ') end += 1;
    if (end > cursor) {
      const hasTrailingSpace = fullText[end] === ' ';
      words.push({ text: fullText.slice(cursor, end) + (hasTrailingSpace ? ' ' : ''), bold: boldAtIndex[cursor] });
    }
    cursor = end + 1;
  }

  let lineWords: Word[] = [];
  let lineWidth = 0;
  let cursorY = y;
  const flushLine = () => {
    let cursorX = x;
    lineWords.forEach((word) => {
      doc.setFont('helvetica', word.bold ? 'bold' : 'normal');
      setTextColor(doc, word.bold ? WHITE : MUTED);
      doc.text(word.text, cursorX, cursorY);
      cursorX += doc.getTextWidth(word.text);
    });
    cursorY += lineHeight;
    lineWords = [];
    lineWidth = 0;
  };

  words.forEach((word) => {
    doc.setFont('helvetica', word.bold ? 'bold' : 'normal');
    const wordWidth = doc.getTextWidth(word.text);
    if (lineWidth + wordWidth > maxWidth && lineWords.length > 0) {
      flushLine();
    }
    lineWords.push(word);
    lineWidth += wordWidth;
  });
  if (lineWords.length > 0) flushLine();

  return cursorY;
}

function addSectionHeader(
  doc: jsPDF,
  displayFont: string,
  eyebrow: string,
  titleLines: string[],
  pageLabel: string,
): number {
  setTextColor(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(eyebrow.toUpperCase(), MARGIN, 19, { charSpace: 1.4 });
  setTextColor(doc, MUTED);
  drawRightAligned(doc, pageLabel, PAGE_WIDTH - MARGIN, 19, 1.2);

  setTextColor(doc, WHITE);
  doc.setFont(displayFont, 'normal');
  doc.setFontSize(26);
  let y = 35;
  titleLines.forEach((line) => {
    doc.text(line, MARGIN, y);
    y += 9.5;
  });
  return y + 6;
}

function addFooter(doc: jsPDF, code: string, page: number, total: number) {
  setDrawColor(doc, HAIRLINE);
  doc.line(MARGIN, PAGE_HEIGHT - 14, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 14);
  setTextColor(doc, MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`DOMINEX · ${code}`, MARGIN, PAGE_HEIGHT - 8);
  doc.text(`${page} / ${total}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 8, { align: 'right' });
}

// ---------- Capa ----------

function drawCoverPage(
  doc: jsPDF,
  displayFont: string,
  input: GenerateProposalPdfInput,
  metadata: ProposalPdfMetadata,
  logoDataUrl: string,
  issuedAt: Date,
) {
  addDarkPage(doc);

  setTextColor(doc, MUTED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('DOMINEX', MARGIN, 19, { charSpace: 1.4 });
  drawRightAligned(doc, `PROPOSTA ${metadata.code}`, PAGE_WIDTH - MARGIN, 19, 1);

  // Logo — mantém proporção 58×11.6mm. Desce pra ~25% da altura da página (referência).
  try {
    doc.addImage(logoDataUrl, 'PNG', MARGIN, 70, 58, 11.6, undefined, 'FAST');
  } catch {
    // Se o logo não puder ser decodificado, segue sem travar a geração.
  }

  const titleX = MARGIN;
  let titleY = 117;
  setTextColor(doc, WHITE);
  doc.setFont(displayFont, 'normal');
  doc.setFontSize(34);
  doc.text('Proposta', titleX, titleY);
  titleY += 11.5;

  doc.setFontSize(30);
  const clientLines: string[] = doc.splitTextToSize(metadata.clientName, 160).slice(0, 2);
  clientLines.forEach((line, index) => {
    doc.text(line, titleX, titleY + index * 10.8);
  });
  titleY += clientLines.length * 10.8 + 9;

  // Bloco de baixo (subtítulo + intro + pills) é ancorado numa região fixa perto do rodapé,
  // não flui direto depois do título — senão com nome de cliente curto (1 linha) sobra um vazio
  // enorme no meio da página. `titleY` (fim do título, no máx. ~170mm com cliente em 2 linhas,
  // já que o bloco título agora começa em ~117mm) serve só de piso de segurança pra nunca
  // sobrepor o título em cenários extremos — nesses casos o bloco de baixo desce, nunca sobe
  // (não reabre o vazio no pé da página).
  let blockY = Math.max(184, titleY + 20);

  setTextColor(doc, WHITE);
  doc.setFont(displayFont, 'normal');
  doc.setFontSize(13.5);
  const subtitle = input.units.length === 1
    ? safeText(input.units[0].name, 'Unidade principal')
    : `${metadata.unitSummary} · planos independentes`;
  doc.text(subtitle, titleX, blockY);
  blockY += 12;

  const totalModules = new Set(input.units.flatMap((unit) => unit.modules)).size;
  const totalUsers = input.units.reduce((sum, unit) => sum + unit.users, 0);

  const introRuns = [
    { text: 'A operação inteira num lugar só: ', bold: false },
    { text: 'ordens de serviço, agenda, orçamentos e financeiro', bold: true },
    { text: ', sem planilha, sem retrabalho, sem papel.', bold: false },
  ];
  const introEndY = drawRichParagraph(doc, introRuns, titleX, blockY, 150, 10.5, 5.6);

  const pillY = introEndY + 10;
  const pillHeight = 9;
  let pillX = titleX;
  const firstPlanLabel = input.units.length === 1
    ? safeText(input.units[0].planName, 'Personalizado')
    : metadata.unitSummary;
  const pillLabels: { text: string; filled: boolean }[] = [
    { text: firstPlanLabel, filled: true },
    { text: `${totalModules} ${totalModules === 1 ? 'módulo' : 'módulos'}`, filled: false },
    { text: `${totalUsers} ${totalUsers === 1 ? 'usuário' : 'usuários'}`, filled: false },
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  pillLabels.forEach((pill) => {
    const textWidth = doc.getTextWidth(pill.text);
    const pillWidth = Math.min(textWidth + 12, PAGE_WIDTH - MARGIN - pillX);
    if (pillWidth < 16 || pillX + pillWidth > PAGE_WIDTH - MARGIN) return;
    if (pill.filled) {
      setFillColor(doc, GREEN);
      doc.roundedRect(pillX, pillY, pillWidth, pillHeight, pillHeight / 2, pillHeight / 2, 'F');
      setTextColor(doc, DARK);
    } else {
      roundedRectOutline(doc, pillX, pillY, pillWidth, pillHeight, pillHeight / 2, PILL_OUTLINE);
      setTextColor(doc, WHITE);
    }
    doc.text(pill.text, pillX + pillWidth / 2, pillY + pillHeight / 2 + 1.2, { align: 'center' });
    pillX += pillWidth + 3;
  });

  // Rodapé da capa.
  setDrawColor(doc, HAIRLINE);
  doc.line(MARGIN, 258, PAGE_WIDTH - MARGIN, 258);

  const planNames = [...new Set(input.units.map((unit) => safeText(unit.planName, 'Personalizado')))];
  const planEyebrow = planNames.length === 1 ? `PLANO ${planNames[0].toUpperCase()}` : 'PLANO PERSONALIZADO';
  setTextColor(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(planEyebrow, MARGIN, 266, { charSpace: 1.2 });

  setTextColor(doc, WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const summaryLine = input.units.length === 1
    ? `${planNames[0]} · ${totalUsers} ${totalUsers === 1 ? 'usuário' : 'usuários'}`
    : `${metadata.unitSummary} · ${money(input.totals.monthly)}/mês`;
  doc.text(summaryLine, MARGIN, 273);

  setTextColor(doc, MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Emitida em ${longDateLabel(issuedAt)}`, PAGE_WIDTH - MARGIN, 265, { align: 'right' });
  doc.text('Validade: 15 dias', PAGE_WIDTH - MARGIN, 270.5, { align: 'right' });
}

// ---------- Escopo ----------

function unitCardHeight(doc: jsPDF, unit: ProposalPdfUnit): number {
  // splitTextToSize mede com a fonte/tamanho ATIVOS no doc — sem fixar aqui, herda o que
  // sobrou de uma chamada anterior (ex. título 26pt) e infla a contagem de linhas.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const moduleLines = unit.modules.flatMap((label) => doc.splitTextToSize(safeText(label, 'Módulo'), 118));
  return Math.max(26, 20 + moduleLines.length * 4.1);
}

function drawUnitCard(doc: jsPDF, displayFont: string, unit: ProposalPdfUnit, index: number, y: number): number {
  const height = unitCardHeight(doc, unit);
  setFillColor(doc, CARD);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 3, 3, 'F');

  setTextColor(doc, GREEN);
  doc.setFont(displayFont, 'normal');
  doc.setFontSize(12);
  doc.text(String(index + 1), MARGIN + 7, y + 9.5);

  setTextColor(doc, WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(safeText(unit.name, `Unidade ${index + 1}`), MARGIN + 18, y + 8.5, { maxWidth: 95 });
  setTextColor(doc, MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Plano ${safeText(unit.planName, 'Personalizado')} · ${unit.users} ${unit.users === 1 ? 'usuário' : 'usuários'}`, MARGIN + 18, y + 13.5);

  const { intPart, centsPart } = moneyParts(unit.monthly);
  setTextColor(doc, WHITE);
  doc.setFont(displayFont, 'normal');
  doc.setFontSize(13);
  const priceRight = PAGE_WIDTH - MARGIN - 6;
  doc.text(`${intPart}${centsPart}`, priceRight, y + 9, { align: 'right' });
  setTextColor(doc, MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('por mês', priceRight, y + 13.5, { align: 'right' });

  let moduleY = y + 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  unit.modules.forEach((module) => {
    const lines = doc.splitTextToSize(safeText(module, 'Módulo'), 118);
    setFillColor(doc, GREEN);
    doc.circle(MARGIN + 19, moduleY - 1.2, 0.7, 'F');
    setTextColor(doc, MUTED);
    doc.text(lines, MARGIN + 23, moduleY);
    moduleY += lines.length * 4.1;
  });

  return height;
}

interface UsersValuesRow {
  label: string;
  qty: string;
  value: string;
}

function buildUsersValuesRows(input: GenerateProposalPdfInput): UsersValuesRow[] {
  const totalUsers = input.units.reduce((sum, unit) => sum + unit.users, 0);
  return [
    { label: 'Usuários inclusos', qty: String(totalUsers), value: 'Incluso' },
    { label: 'Unidades contratadas', qty: String(input.units.length), value: money(input.totals.monthly) },
  ];
}

const TABLE_QTDE_RIGHT = PAGE_WIDTH - MARGIN - 55;
const TABLE_VALUE_RIGHT = PAGE_WIDTH - MARGIN;
const TABLE_ROW_HEIGHT = 9;

/** Altura total da tabela — precisa bater exatamente com os incrementos de `drawUsersValuesTable`. */
function usersValuesTableHeight(rowCount: number): number {
  return 9 /* eyebrow -> header */
    + 4 /* header -> hairline */
    + 7 /* hairline -> 1ª linha */
    + rowCount * TABLE_ROW_HEIGHT
    + 3 /* última linha -> hairline final */
    + 9 /* hairline final -> total */
    + 3; /* margem final */
}

function drawUsersValuesTable(
  doc: jsPDF,
  displayFont: string,
  rows: UsersValuesRow[],
  totalLabel: string,
  totalMonthly: number,
  y: number,
): number {
  const startY = y;

  setTextColor(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('USUÁRIOS E VALORES', MARGIN, y, { charSpace: 1.2 });
  y += 9;

  setTextColor(doc, MUTED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('DESCRIÇÃO', MARGIN, y, { charSpace: 1 });
  drawRightAligned(doc, 'QTDE', TABLE_QTDE_RIGHT, y, 1);
  drawRightAligned(doc, 'VALOR', TABLE_VALUE_RIGHT, y, 1);
  y += 4;

  setDrawColor(doc, HAIRLINE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  rows.forEach((row) => {
    setTextColor(doc, WHITE);
    doc.text(row.label, MARGIN, y);
    setTextColor(doc, MUTED);
    drawRightAligned(doc, row.qty, TABLE_QTDE_RIGHT, y);
    drawRightAligned(doc, row.value, TABLE_VALUE_RIGHT, y);
    y += TABLE_ROW_HEIGHT;
  });

  y += 3;
  setDrawColor(doc, HAIRLINE);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 9;

  setTextColor(doc, WHITE);
  doc.setFont(displayFont, 'normal');
  doc.setFontSize(13);
  doc.text(totalLabel, MARGIN, y);
  drawRightAligned(doc, money(totalMonthly), TABLE_VALUE_RIGHT, y);
  y += 3;

  return y - startY;
}

const INVESTMENT_BAND_HEIGHT = 36;

function drawInvestmentBand(doc: jsPDF, displayFont: string, totals: ProposalPdfTotals, y: number): number {
  setFillColor(doc, GREEN);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, INVESTMENT_BAND_HEIGHT, 3, 3, 'F');

  setTextColor(doc, DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('INVESTIMENTO MENSAL', MARGIN + 8, y + 12, { charSpace: 1.1 });

  drawBigMoney(doc, displayFont, totals.monthly, MARGIN + 8, y + 27, 26, 11, DARK, '/mês');

  setTextColor(doc, DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  const note = doc.splitTextToSize(
    'Sem taxa de adesão, sem fidelidade. Módulos e usuários podem entrar ou sair a qualquer momento.',
    64,
  );
  doc.text(note, PAGE_WIDTH - MARGIN - 8, y + 13, { align: 'right' });

  return INVESTMENT_BAND_HEIGHT;
}

/** Renderiza a(s) página(s) de escopo (cards por unidade + faixa de investimento). Assume que a página atual já está em branco. */
function renderScopePages(
  doc: jsPDF,
  displayFont: string,
  input: GenerateProposalPdfInput,
  startInternalPage: number,
  totalPagesLabel: number,
): number {
  let internalPage = startInternalPage;
  const label = () => `${pad2(internalPage)} / ${pad2(totalPagesLabel)}`;

  const scopeTitleLines = input.units.length === 1 ? ['o plano da sua operação.'] : ['um plano por unidade.'];
  addDarkPage(doc);
  let y = addSectionHeader(doc, displayFont, 'O que entra na proposta', scopeTitleLines, label());

  input.units.forEach((unit, index) => {
    const cardHeight = unitCardHeight(doc, unit);
    if (y + cardHeight > PAGE_HEIGHT - 22) {
      doc.addPage();
      internalPage += 1;
      addDarkPage(doc);
      y = addSectionHeader(doc, displayFont, 'O que entra na proposta', ['continuação.'], label());
    }
    y += drawUnitCard(doc, displayFont, unit, index, y) + 4;
  });

  // Tabela "usuários e valores" — se não couber com os cards, vai inteira pra página seguinte.
  // Respiro de ~10mm acima do eyebrow: o loop de cards já deixa 4mm (gap entre cards), soma mais
  // 6mm aqui pra não colar no último card. Numa página nova o header já dá respiro de sobra.
  const GAP_BEFORE_TABLE = 6;
  const tableRows = buildUsersValuesRows(input);
  const tableHeight = usersValuesTableHeight(tableRows.length);
  if (y + GAP_BEFORE_TABLE + tableHeight > PAGE_HEIGHT - 22) {
    doc.addPage();
    internalPage += 1;
    addDarkPage(doc);
    y = addSectionHeader(doc, displayFont, 'O que entra na proposta', ['continuação.'], label());
  } else {
    y += GAP_BEFORE_TABLE;
  }
  y += drawUsersValuesTable(doc, displayFont, tableRows, 'Total mensal', input.totals.monthly, y) + 6;

  // Faixa verde de investimento sempre ancorada no PÉ da página (própria ou compartilhada com
  // os cards/tabela acima) — nunca flutuando logo abaixo do conteúdo com vazio embaixo dela.
  const bandBottomMargin = 20;
  let bandY = PAGE_HEIGHT - bandBottomMargin - INVESTMENT_BAND_HEIGHT;
  if (y > bandY) {
    doc.addPage();
    internalPage += 1;
    addDarkPage(doc);
    addSectionHeader(doc, displayFont, 'Investimento', ['investimento mensal.'], label());
    bandY = PAGE_HEIGHT - bandBottomMargin - INVESTMENT_BAND_HEIGHT;
  }
  drawInvestmentBand(doc, displayFont, input.totals, bandY);

  return internalPage;
}

// ---------- Organograma ----------

/** Renderiza a(s) página(s) de organograma. Assume que a página atual já está em branco. */
function renderOrgChartPages(
  doc: jsPDF,
  displayFont: string,
  input: GenerateProposalPdfInput,
  metadata: ProposalPdfMetadata,
  startInternalPage: number,
  totalPagesLabel: number,
): number {
  let internalPage = startInternalPage;
  const label = () => `${pad2(internalPage)} / ${pad2(totalPagesLabel)}`;

  const rootWidth = 92;
  const rootX = (PAGE_WIDTH - rootWidth) / 2;
  const trunkX = PAGE_WIDTH / 2;
  const rootY = 50;

  const columns = input.units.length >= 5 ? 3 : 2;
  const gap = 6;
  const cardWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const cardHeight = 28;
  const rowGap = 16;

  const rows: ProposalPdfUnit[][] = [];
  for (let i = 0; i < input.units.length; i += columns) rows.push(input.units.slice(i, i + columns));

  const drawRoot = (): number => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    const nameLines: string[] = doc.splitTextToSize(safeText(metadata.clientName, 'Cliente'), rootWidth - 10).slice(0, 2);
    const nameBlockHeight = nameLines.length * 5;
    const height = nameBlockHeight + 15;

    setFillColor(doc, CARD);
    setDrawColor(doc, GREEN);
    doc.setLineWidth(0.4);
    doc.roundedRect(rootX, rootY, rootWidth, height, 3, 3, 'FD');
    setTextColor(doc, WHITE);
    nameLines.forEach((line, index) => {
      doc.text(line, rootX + rootWidth / 2, rootY + 8 + index * 5, { align: 'center' });
    });
    setTextColor(doc, GREEN);
    doc.setFont(displayFont, 'normal');
    doc.setFontSize(10);
    doc.text(`${money(input.totals.monthly)}/mês`, rootX + rootWidth / 2, rootY + 8 + nameBlockHeight + 4, { align: 'center' });

    return height;
  };

  const drawUnitNode = (unit: ProposalPdfUnit, globalIndex: number, x: number, y: number) => {
    setFillColor(doc, CARD);
    doc.roundedRect(x, y, cardWidth, cardHeight, 3, 3, 'F');
    setTextColor(doc, WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    const name = ellipsizeToWidth(doc, safeText(unit.name, `Unidade ${globalIndex + 1}`), cardWidth - 12);
    doc.text(name, x + 6, y + 9);
    setTextColor(doc, MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Plano ${safeText(unit.planName, 'Personalizado')}`, x + 6, y + 14.5);
    doc.text(`${unit.users} ${unit.users === 1 ? 'usuário' : 'usuários'}`, x + 6, y + 19);
    setTextColor(doc, GREEN);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(`${money(unit.monthly)}/mês`, x + 6, y + 25);
  };

  addDarkPage(doc);
  addSectionHeader(doc, displayFont, 'Estrutura do grupo', ['uma visão do grupo.'], label());
  const rootHeight = drawRoot();

  let cursorY = rootY + rootHeight + 18;

  // Cor própria do conector (mais clara que HAIRLINE): contra fundo quase-preto e card quase-preto,
  // o hairline normal [42,49,47] fica baixo demais de contraste e a árvore lê como uma caixa
  // fechada flutuando (haste + trilho + pernas somem visualmente, sem parecer tocar os cards).
  const CONNECTOR: [number, number, number] = [66, 76, 72];
  // Perninha avança 1mm além do topo real do card — a própria silhueta opaca do card (desenhada
  // DEPOIS da linha) encobre o excesso, garantindo encontro sem vão em qualquer motor de render.
  const LEG_OVERSHOOT = 1;
  const STUB_LENGTH = 6;

  rows.forEach((row, rowIndex) => {
    if (cursorY + cardHeight > PAGE_HEIGHT - 20) {
      doc.addPage();
      internalPage += 1;
      addDarkPage(doc);
      addSectionHeader(doc, displayFont, 'Estrutura do grupo', ['uma visão do grupo. (continuação)'], label());
      cursorY = 50;
    }

    setDrawColor(doc, CONNECTOR);
    doc.setLineWidth(0.45);

    if (rowIndex === 0) {
      // Só a 1ª linha ganha a árvore completa (tronco do raiz + trilho + perninhas) — o tronco
      // PARA no trilho, nunca atravessa os cards da 1ª linha pra continuar até a 2ª.
      const rowY = cursorY - 10;
      doc.line(trunkX, rootY + rootHeight, trunkX, rowY);
      const firstCardCenterX = MARGIN + cardWidth / 2;
      const lastCardCenterX = MARGIN + (row.length - 1) * (cardWidth + gap) + cardWidth / 2;
      if (row.length > 1) doc.line(firstCardCenterX, rowY, lastCardCenterX, rowY);
      row.forEach((_, i) => {
        const cx = MARGIN + i * (cardWidth + gap) + cardWidth / 2;
        doc.line(cx, rowY, cx, cursorY + LEG_OVERSHOOT);
      });
    } else {
      // Linhas 2+: sem trilho e sem tronco contínuo (nada cruza os cards da linha anterior) —
      // só um toco curto por card, centrado no topo, sugerindo continuação da árvore.
      row.forEach((_, i) => {
        const cx = MARGIN + i * (cardWidth + gap) + cardWidth / 2;
        doc.line(cx, cursorY - STUB_LENGTH, cx, cursorY + LEG_OVERSHOOT);
      });
    }

    row.forEach((unit, i) => {
      const globalIndex = input.units.indexOf(unit);
      drawUnitNode(unit, globalIndex, MARGIN + i * (cardWidth + gap), cursorY);
    });

    cursorY += cardHeight + rowGap;
  });

  return internalPage;
}

// ---------- Como pagar ----------

function renderPaymentPage(
  doc: jsPDF,
  displayFont: string,
  input: GenerateProposalPdfInput,
  metadata: ProposalPdfMetadata,
  validityDays: number,
  internalPage: number,
  totalPagesLabel: number,
) {
  const label = `${pad2(internalPage)} / ${pad2(totalPagesLabel)}`;
  addDarkPage(doc);
  addSectionHeader(doc, displayFont, 'Como pagar', ['no ano sai', '20% mais barato.'], label);

  const topY = 56;
  const blockHeight = 60;
  const annualWidth = 112;
  const monthlyWidth = CONTENT_WIDTH - annualWidth - 6;
  const annualX = MARGIN;
  const monthlyX = MARGIN + annualWidth + 6;

  // Card mensal.
  setFillColor(doc, CARD);
  doc.roundedRect(monthlyX, topY, monthlyWidth, blockHeight, 3, 3, 'F');
  setTextColor(doc, MUTED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('MENSAL', monthlyX + 7, topY + 10, { charSpace: 1.2 });
  drawBigMoney(doc, displayFont, input.totals.monthly, monthlyX + 7, topY + 22, 15, 8, WHITE, '/mês');
  setTextColor(doc, MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(
    doc.splitTextToSize('Cobrança recorrente, sem fidelidade. Cancele quando quiser.', monthlyWidth - 14),
    monthlyX + 7,
    topY + 31,
  );

  // Card anual.
  setFillColor(doc, GREEN_DARK_BG);
  setDrawColor(doc, GREEN);
  doc.setLineWidth(0.4);
  doc.roundedRect(annualX, topY, annualWidth, blockHeight, 3, 3, 'FD');
  setTextColor(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('ANUAL · 20% DE DESCONTO', annualX + 7, topY + 10, { charSpace: 0.7 });
  drawBigMoney(doc, displayFont, input.totals.yearlyDiscounted, annualX + 7, topY + 22, 23, 10, WHITE, '/ano');

  const miniPillY = topY + 28;
  const miniPillH = 6.2;
  const miniLabels = [
    money(input.totals.monthly).replace(/,00$/, ''),
    '× 12',
    '× 0,8',
    `= ${money(input.totals.yearlyDiscounted).replace(/,00$/, '')}`,
  ];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  let mx = annualX + 7;
  miniLabels.forEach((labelText, index) => {
    const w = doc.getTextWidth(labelText) + 6;
    const filled = index === miniLabels.length - 1;
    if (filled) {
      setFillColor(doc, GREEN);
      doc.roundedRect(mx, miniPillY, w, miniPillH, miniPillH / 2, miniPillH / 2, 'F');
      setTextColor(doc, DARK);
    } else {
      roundedRectOutline(doc, mx, miniPillY, w, miniPillH, miniPillH / 2, PILL_OUTLINE);
      setTextColor(doc, WHITE);
    }
    doc.text(labelText, mx + w / 2, miniPillY + miniPillH / 2 + 1, { align: 'center' });
    mx += w + 2.5;
  });

  const equivRuns = [
    { text: 'Equivale a ', bold: false },
    { text: `${money(input.totals.yearlyDiscounted / 12)}/mês`, bold: true },
    { text: ' e pode ser pago em ', bold: false },
    { text: `até 3× de ${money(input.totals.pixInstallment)} no Pix`, bold: true },
    { text: '.', bold: false },
  ];
  drawRichParagraph(doc, equivRuns, annualX + 7, topY + 42, annualWidth - 14, 7.5, 4.2);

  // Badge de economia.
  const savingsLabel = `Economia de ${money(input.totals.savings)}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const savingsWidth = doc.getTextWidth(savingsLabel) + 10;
  setFillColor(doc, GREEN);
  doc.roundedRect(annualX + 7, topY + blockHeight - 10, savingsWidth, 7, 3.5, 3.5, 'F');
  setTextColor(doc, DARK);
  doc.text(savingsLabel, annualX + 7 + savingsWidth / 2, topY + blockHeight - 5.5, { align: 'center' });

  // 3 cards de forma de pagamento.
  const cardsY = topY + blockHeight + 8;
  const cardsHeight = 32;
  const cardGap = 4;
  const cardWidth = (CONTENT_WIDTH - cardGap * 2) / 3;
  const paymentCards = [
    { title: 'pix', desc: 'À vista no mensal ou no anual, com confirmação na hora.', highlight: `Anual em até 3× de ${money(input.totals.pixInstallment)}` },
    { title: 'cartão', desc: 'Recorrência automática no mensal ou parcelamento do anual na bandeira.', highlight: 'Sem preocupação com vencimento' },
    { title: 'boleto', desc: 'Vencimento combinado, enviado por e-mail e WhatsApp antes de vencer.', highlight: 'Mensal ou anual' },
  ];
  paymentCards.forEach((card, index) => {
    const x = MARGIN + index * (cardWidth + cardGap);
    setFillColor(doc, CARD);
    doc.roundedRect(x, cardsY, cardWidth, cardsHeight, 3, 3, 'F');
    setTextColor(doc, WHITE);
    doc.setFont(displayFont, 'normal');
    doc.setFontSize(11.5);
    doc.text(card.title, x + 6, cardsY + 10);
    setTextColor(doc, MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const descLines = doc.splitTextToSize(card.desc, cardWidth - 12);
    doc.text(descLines, x + 6, cardsY + 15.5);
    setTextColor(doc, GREEN);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(doc.splitTextToSize(card.highlight, cardWidth - 12), x + 6, cardsY + cardsHeight - 5);
  });

  // Callout nota fiscal.
  const calloutY = cardsY + cardsHeight + 8;
  const calloutHeight = 18;
  roundedRectOutline(doc, MARGIN, calloutY, CONTENT_WIDTH, calloutHeight, 3, GREEN);
  setTextColor(doc, GREEN);
  doc.setFont(displayFont, 'normal');
  doc.setFontSize(11);
  doc.text('NF', MARGIN + 8, calloutY + 11.5);
  const calloutRuns = [
    { text: 'Nota fiscal em qualquer valor pago.', bold: true },
    { text: ' Emitimos nota de todo pagamento, para a empresa abater do imposto sempre que precisar.', bold: false },
  ];
  drawRichParagraph(doc, calloutRuns, MARGIN + 22, calloutY + 7.5, CONTENT_WIDTH - 30, 8, 4.3);

  // Condições.
  const conditionsTitleY = calloutY + calloutHeight + 11;
  setTextColor(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CONDIÇÕES', MARGIN, conditionsTitleY, { charSpace: 1.2 });

  const conditions = [
    'Sem taxa de adesão e sem fidelidade',
    'Implantação guiada e tutoriais completos',
    'Suporte humano pelo WhatsApp',
    'Módulos e usuários ajustáveis a qualquer momento',
    'Atualizações e melhorias contínuas incluídas',
    `Proposta válida por ${validityDays} dias`,
  ];
  const colWidth = (CONTENT_WIDTH - 10) / 2;
  conditions.forEach((condition, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + column * (colWidth + 10);
    const itemY = conditionsTitleY + 11 + row * 10;
    setTextColor(doc, index % 2 === 0 ? GREEN : MUTED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('—', x, itemY);
    setTextColor(doc, MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.text(doc.splitTextToSize(condition, colWidth - 7), x + 5, itemY);
  });

  // Rodapé institucional (acima do rodapé genérico de "página X/Y" que o build principal aplica).
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  const closingLines = splitWithCharSpace(
    doc,
    `DOMINEX · PROPOSTA ${metadata.code} · ${metadata.clientName.toUpperCase()}`,
    CONTENT_WIDTH,
    0.6,
  );
  const closingY = PAGE_HEIGHT - 24 - Math.max(0, closingLines.length - 1) * 3.6;
  setDrawColor(doc, HAIRLINE);
  doc.line(MARGIN, closingY, PAGE_WIDTH - MARGIN, closingY);
  setTextColor(doc, MUTED);
  doc.text(closingLines, MARGIN, closingY + 6, { charSpace: 0.6 });
}

/**
 * Desenha todas as páginas internas (escopo, organograma, como pagar) a partir da página
 * atual (que já deve estar em branco e pronta para receber conteúdo). Retorna o total de
 * páginas internas usadas — usado tanto na simulação (dry run) quanto na renderização final.
 */
function renderInternalPages(
  doc: jsPDF,
  displayFont: string,
  input: GenerateProposalPdfInput,
  metadata: ProposalPdfMetadata,
  validityDays: number,
  totalPagesLabel: number,
): number {
  let internalPage = renderScopePages(doc, displayFont, input, 1, totalPagesLabel);

  if (input.units.length > 1) {
    doc.addPage();
    internalPage += 1;
    internalPage = renderOrgChartPages(doc, displayFont, input, metadata, internalPage, totalPagesLabel);
  }

  doc.addPage();
  internalPage += 1;
  renderPaymentPage(doc, displayFont, input, metadata, validityDays, internalPage, totalPagesLabel);

  return internalPage;
}

// ---------- Build principal ----------

export async function buildProposalSimulatorPdfDoc(
  input: GenerateProposalPdfInput,
): Promise<{ doc: jsPDF; metadata: ProposalPdfMetadata }> {
  if (input.units.length === 0) throw new Error('Adicione pelo menos uma unidade à proposta.');

  const issuedAt = input.issuedAt ?? new Date();
  const validityDays = input.validityDays ?? 15;
  const metadata = buildProposalPdfMetadata(input.clientName, input.units.length, issuedAt, validityDays);
  const logo = await imageAsDataUrl(input.logoUrl);

  // 1ª passada (descartável): só pra descobrir quantas páginas internas o conteúdo real vai ocupar,
  // já que a numeração "nn / NN" precisa ser exibida desde a primeira página — não dá pra "chutar" e
  // reescrever depois porque isso exigiria apagar texto já desenhado (frágil).
  const dryDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const dryFont = await ensureDisplayFont(dryDoc);
  const totalInternalPages = renderInternalPages(dryDoc, dryFont, input, metadata, validityDays, 1);

  // 2ª passada: documento real, já com o total correto de páginas internas.
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const displayFont = await ensureDisplayFont(doc);

  drawCoverPage(doc, displayFont, input, metadata, logo, issuedAt);
  doc.addPage();
  renderInternalPages(doc, displayFont, input, metadata, validityDays, totalInternalPages);

  // Rodapé institucional em todas as páginas internas (a partir da 2ª página do PDF) — exceto a
  // última (página de pagamento), que já desenha sua própria linha institucional completa
  // ("DOMINEX · PROPOSTA ... · CLIENTE"); duplicar o rodapé genérico ali empilhava duas linhas
  // de rodapé uma sobre a outra.
  const totalPages = doc.getNumberOfPages();
  for (let page = 2; page < totalPages; page += 1) {
    doc.setPage(page);
    addFooter(doc, metadata.code, page - 1, totalPages - 1);
  }

  return { doc, metadata };
}

export async function generateProposalSimulatorPdf(input: GenerateProposalPdfInput): Promise<void> {
  const { doc, metadata } = await buildProposalSimulatorPdfDoc(input);
  doc.save(metadata.filename);
}
