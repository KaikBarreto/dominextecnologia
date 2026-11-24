import { jsPDF } from 'jspdf';
import { DOMINEX_LEGAL } from '@/data/termsOfUse';
import {
  PROPOSAL_CONTRACT_DRAFT_NOTICE,
  buildProposalContractSections,
  type ProposalContractSection,
} from '@/data/proposalContractDraft';
import {
  buildProposalPdfMetadata,
  type GenerateProposalPdfInput,
  type ProposalPdfMetadata,
} from '@/utils/proposalSimulatorPdf';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 17;
const BODY_TOP = 31;
const BODY_BOTTOM = 276;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK: [number, number, number] = [11, 18, 16];
const DARK: [number, number, number] = [5, 10, 9];
const DEEP_GREEN: [number, number, number] = [7, 39, 29];
const GREEN: [number, number, number] = [20, 215, 137];
const PALE_GREEN: [number, number, number] = [230, 250, 241];
const MUTED: [number, number, number] = [91, 103, 98];
const HAIRLINE: [number, number, number] = [214, 222, 218];
const WHITE: [number, number, number] = [248, 250, 249];

const DISPLAY_FONT = 'ArchivoBlack';

export interface ProposalContractPdfMetadata extends ProposalPdfMetadata {
  contractCode: string;
  contractFilename: string;
}

export type GenerateProposalContractPdfInput = GenerateProposalPdfInput;

interface FlowState {
  doc: jsPDF;
  displayFont: string;
  metadata: ProposalContractPdfMetadata;
  y: number;
}

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

async function imageAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Não foi possível carregar o logo da minuta.');
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível preparar o logo da minuta.'));
    reader.readAsDataURL(blob);
  });
}

function setText(doc: jsPDF, color: [number, number, number]) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function setFill(doc: jsPDF, color: [number, number, number]) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function setDraw(doc: jsPDF, color: [number, number, number]) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function money(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0).replace(/\u00a0/g, ' ');
}

export function buildProposalContractPdfMetadata(
  clientName: string,
  unitCount: number,
  issuedAt = new Date(),
  validityDays = 15,
): ProposalContractPdfMetadata {
  const proposal = buildProposalPdfMetadata(clientName, unitCount, issuedAt, validityDays);
  return {
    ...proposal,
    contractCode: proposal.code.replace(/^DOM-/, 'MIN-').replace(/-+$/, ''),
    contractFilename: proposal.filename.replace(/^proposta-/, 'minuta-contratual-'),
  };
}

function drawCoverArt(doc: jsPDF) {
  setFill(doc, DARK);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');

  setFill(doc, DEEP_GREEN);
  doc.triangle(95, 297, 210, 88, 210, 297, 'F');
  doc.setFillColor(8, 27, 22);
  doc.triangle(122, 297, 210, 151, 210, 297, 'F');
  doc.setFillColor(12, 60, 43);
  doc.triangle(156, 297, 210, 215, 210, 297, 'F');

  setDraw(doc, GREEN);
  doc.setLineWidth(0.28);
  const nodes = [
    [104, 235], [125, 207], [147, 231], [167, 191], [191, 216],
    [115, 268], [144, 274], [176, 253], [199, 277], [191, 158],
    [150, 164], [126, 181], [177, 129], [204, 112], [146, 119],
  ] as const;
  const links = [
    [0, 1], [0, 2], [0, 5], [1, 2], [1, 10], [1, 11], [2, 3], [2, 6],
    [2, 7], [3, 4], [3, 9], [3, 10], [4, 7], [4, 8], [5, 6], [6, 7],
    [7, 8], [9, 10], [9, 12], [10, 11], [10, 13], [10, 14], [12, 13],
    [12, 14], [13, 14],
  ] as const;
  links.forEach(([from, to], index) => {
    const a = nodes[from];
    const b = nodes[to];
    doc.setGState(doc.GState({ opacity: index % 3 === 0 ? 0.48 : 0.22 }));
    doc.line(a[0], a[1], b[0], b[1]);
  });
  doc.setGState(doc.GState({ opacity: 1 }));

  nodes.forEach(([x, y], index) => {
    if (index % 4 === 0) {
      doc.setGState(doc.GState({ opacity: 0.14 }));
      setFill(doc, GREEN);
      doc.circle(x, y, 4.8, 'F');
    }
    doc.setGState(doc.GState({ opacity: 1 }));
    setFill(doc, index % 3 === 0 ? WHITE : GREEN);
    doc.circle(x, y, index % 3 === 0 ? 1.25 : 0.75, 'F');
  });

  doc.setGState(doc.GState({ opacity: 0.12 }));
  setDraw(doc, GREEN);
  doc.setLineWidth(0.8);
  doc.line(79, 297, 210, 65);
  doc.line(111, 297, 210, 121);
  doc.setGState(doc.GState({ opacity: 1 }));
}

function drawCover(
  doc: jsPDF,
  displayFont: string,
  input: GenerateProposalContractPdfInput,
  metadata: ProposalContractPdfMetadata,
  logo: string,
) {
  drawCoverArt(doc);
  doc.addImage(logo, 'PNG', MARGIN, 18, 55, 12, undefined, 'FAST');

  setFill(doc, GREEN);
  doc.roundedRect(MARGIN, 48, 39, 7, 3.5, 3.5, 'F');
  setText(doc, DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.text('MINUTA CONTRATUAL', MARGIN + 4, 52.7, { charSpace: 0.45 });

  setText(doc, WHITE);
  doc.setFont(displayFont, 'normal');
  doc.setFontSize(29);
  doc.text(['TECNOLOGIA', 'QUE PROTEGE', 'A OPERAÇÃO.'], MARGIN, 79, { lineHeightFactor: 1.02 });

  setText(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Software, dados e confiança no mesmo contrato.', MARGIN, 116);

  setDraw(doc, GREEN);
  doc.setLineWidth(1.2);
  doc.line(MARGIN, 132, 65, 132);

  setText(doc, WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('PREPARADA PARA', MARGIN, 146, { charSpace: 1.1 });
  doc.setFont(displayFont, 'normal');
  doc.setFontSize(15);
  const clientLines = doc.splitTextToSize(metadata.clientName.toUpperCase(), 93) as string[];
  doc.text(clientLines.slice(0, 3), MARGIN, 158, { lineHeightFactor: 1.05 });

  const infoY = 251;
  setText(doc, MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.text('CÓDIGO', MARGIN, infoY);
  doc.text('EMISSÃO', MARGIN + 48, infoY);
  doc.text('ESCOPO', MARGIN + 91, infoY);
  setText(doc, WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.3);
  doc.text(metadata.contractCode, MARGIN, infoY + 6);
  doc.text(metadata.issuedLabel, MARGIN + 48, infoY + 6);
  doc.text(metadata.unitSummary, MARGIN + 91, infoY + 6);

  setText(doc, MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.7);
  doc.text(PROPOSAL_CONTRACT_DRAFT_NOTICE, MARGIN, 281, { maxWidth: 115 });

  setText(doc, WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.text(DOMINEX_LEGAL.site.toUpperCase(), PAGE_WIDTH - MARGIN, 281, { align: 'right', charSpace: 0.7 });

  void input;
}

function drawBodyHeader(doc: jsPDF, displayFont: string, metadata: ProposalContractPdfMetadata) {
  setFill(doc, DARK);
  doc.rect(0, 0, PAGE_WIDTH, 20, 'F');
  setFill(doc, GREEN);
  doc.rect(0, 20, PAGE_WIDTH, 1.2, 'F');
  setText(doc, WHITE);
  doc.setFont(displayFont, 'normal');
  doc.setFontSize(9.5);
  doc.text('DOMINEX', MARGIN, 12.5, { charSpace: 0.5 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.3);
  doc.text(`MINUTA CONTRATUAL · ${metadata.clientName}`, PAGE_WIDTH - MARGIN, 12.5, { align: 'right' });
}

function addBodyPage(state: FlowState) {
  state.doc.addPage();
  setFill(state.doc, WHITE);
  state.doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');
  drawBodyHeader(state.doc, state.displayFont, state.metadata);
  state.y = BODY_TOP;
}

function ensureSpace(state: FlowState, required: number) {
  if (state.y + required <= BODY_BOTTOM) return;
  addBodyPage(state);
}

function drawPageTitle(state: FlowState, eyebrow: string, title: string) {
  ensureSpace(state, 24);
  setText(state.doc, GREEN);
  state.doc.setFont('helvetica', 'bold');
  state.doc.setFontSize(7.2);
  state.doc.text(eyebrow.toUpperCase(), MARGIN, state.y, { charSpace: 1.1 });
  setText(state.doc, INK);
  state.doc.setFont(state.displayFont, 'normal');
  state.doc.setFontSize(19);
  state.doc.text(title.toUpperCase(), MARGIN, state.y + 10);
  state.y += 20;
}

function drawSummaryCard(
  state: FlowState,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  accent = false,
) {
  setFill(state.doc, accent ? PALE_GREEN : [241, 244, 242]);
  state.doc.roundedRect(x, y, width, 25, 3, 3, 'F');
  setText(state.doc, accent ? [8, 97, 62] : MUTED);
  state.doc.setFont('helvetica', 'bold');
  state.doc.setFontSize(6.5);
  state.doc.text(label.toUpperCase(), x + 4, y + 7, { charSpace: 0.65 });
  setText(state.doc, INK);
  state.doc.setFont(state.displayFont, 'normal');
  state.doc.setFontSize(11);
  const lines = state.doc.splitTextToSize(value, width - 8) as string[];
  state.doc.text(lines.slice(0, 2), x + 4, y + 16, { lineHeightFactor: 1.05 });
}

function drawSummaryPage(state: FlowState, input: GenerateProposalContractPdfInput) {
  addBodyPage(state);
  drawPageTitle(state, 'Visão geral', 'Quadro-resumo');

  const gap = 4;
  const cardWidth = (CONTENT_WIDTH - gap) / 2;
  drawSummaryCard(state, 'Contratante', state.metadata.clientName, MARGIN, state.y, cardWidth);
  drawSummaryCard(state, 'Contratada', DOMINEX_LEGAL.razaoSocial, MARGIN + cardWidth + gap, state.y, cardWidth);
  state.y += 30;
  drawSummaryCard(state, 'Investimento anual', money(input.totals.yearlyDiscounted), MARGIN, state.y, cardWidth, true);
  drawSummaryCard(
    state,
    'Alternativa mensal',
    input.showMonthlyPrice === false ? 'Não exibida nesta minuta' : `${money(input.totals.monthly)} / mês`,
    MARGIN + cardWidth + gap,
    state.y,
    cardWidth,
    true,
  );
  state.y += 34;

  setText(state.doc, INK);
  state.doc.setFont(state.displayFont, 'normal');
  state.doc.setFontSize(11);
  state.doc.text('ESCOPO CONTRATADO', MARGIN, state.y);
  state.y += 8;

  input.units.forEach((unit, index) => {
    const moduleText = unit.modules.join(' · ');
    state.doc.setFont('helvetica', 'normal');
    state.doc.setFontSize(8.1);
    const moduleLines = state.doc.splitTextToSize(moduleText, CONTENT_WIDTH - 8) as string[];
    const blockHeight = 16 + moduleLines.length * 3.8;
    ensureSpace(state, blockHeight);

    setFill(state.doc, index % 2 === 0 ? [245, 247, 246] : [238, 243, 240]);
    state.doc.roundedRect(MARGIN, state.y, CONTENT_WIDTH, blockHeight - 3, 2.5, 2.5, 'F');
    setText(state.doc, INK);
    state.doc.setFont('helvetica', 'bold');
    state.doc.setFontSize(9);
    state.doc.text(`${unit.name} · ${unit.planName}`, MARGIN + 4, state.y + 6);
    setText(state.doc, MUTED);
    state.doc.setFont('helvetica', 'normal');
    state.doc.setFontSize(7.5);
    state.doc.text(`${unit.users} ${unit.users === 1 ? 'usuário' : 'usuários'}`, PAGE_WIDTH - MARGIN - 4, state.y + 6, { align: 'right' });
    state.doc.setFontSize(8.1);
    state.doc.text(moduleLines, MARGIN + 4, state.y + 12, { lineHeightFactor: 1.05 });
    state.y += blockHeight;
  });

  ensureSpace(state, 25);
  setFill(state.doc, PALE_GREEN);
  state.doc.roundedRect(MARGIN, state.y, CONTENT_WIDTH, 19, 3, 3, 'F');
  setText(state.doc, [8, 92, 59]);
  state.doc.setFont('helvetica', 'bold');
  state.doc.setFontSize(7.7);
  const noticeLines = state.doc.splitTextToSize(PROPOSAL_CONTRACT_DRAFT_NOTICE, CONTENT_WIDTH - 10) as string[];
  state.doc.text(noticeLines, MARGIN + 5, state.y + 7, { lineHeightFactor: 1.15 });
  state.y += 24;
}

function paragraphHeight(doc: jsPDF, text: string): { lines: string[]; height: number } {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH - 17) as string[];
  return { lines, height: lines.length * 4.25 + 5 };
}

function drawSectionHeading(state: FlowState, section: ProposalContractSection) {
  const first = section.paragraphs[0];
  const firstHeight = first ? Math.min(paragraphHeight(state.doc, first.text).height, 20) : 0;
  ensureSpace(state, 16 + firstHeight);
  setText(state.doc, GREEN);
  state.doc.setFont(state.displayFont, 'normal');
  state.doc.setFontSize(10.5);
  state.doc.text(`${section.number}. ${section.title}`, MARGIN, state.y);
  setDraw(state.doc, HAIRLINE);
  state.doc.setLineWidth(0.3);
  state.doc.line(MARGIN, state.y + 4, PAGE_WIDTH - MARGIN, state.y + 4);
  state.y += 11;
}

function drawParagraph(state: FlowState, number: string, text: string) {
  const { lines, height } = paragraphHeight(state.doc, text);
  if (height <= BODY_BOTTOM - BODY_TOP) ensureSpace(state, height);

  let lineIndex = 0;
  let firstChunk = true;
  while (lineIndex < lines.length) {
    if (state.y + 4.25 > BODY_BOTTOM) addBodyPage(state);
    const availableLines = Math.max(1, Math.floor((BODY_BOTTOM - state.y) / 4.25));
    const chunk = lines.slice(lineIndex, lineIndex + availableLines);

    setText(state.doc, GREEN);
    state.doc.setFont('helvetica', 'bold');
    state.doc.setFontSize(8.3);
    if (firstChunk) state.doc.text(number, MARGIN, state.y);

    setText(state.doc, INK);
    state.doc.setFont('helvetica', 'normal');
    state.doc.setFontSize(8.8);
    state.doc.text(chunk, MARGIN + 14, state.y, { lineHeightFactor: 1.18 });
    state.y += chunk.length * 4.25;
    lineIndex += chunk.length;
    firstChunk = false;
  }
  state.y += 5;
}

function drawContractBody(state: FlowState, input: GenerateProposalContractPdfInput) {
  addBodyPage(state);
  drawPageTitle(state, 'Instrumento particular', 'Minuta contratual');
  const sections = buildProposalContractSections(input);
  sections.forEach((section) => {
    drawSectionHeading(state, section);
    section.paragraphs.forEach((paragraph) => drawParagraph(state, paragraph.number, paragraph.text));
    state.y += 3;
  });

  ensureSpace(state, 69);
  setText(state.doc, INK);
  state.doc.setFont(state.displayFont, 'normal');
  state.doc.setFontSize(10.5);
  state.doc.text('ASSINATURAS', MARGIN, state.y);
  state.y += 13;
  state.doc.setFont('helvetica', 'normal');
  state.doc.setFontSize(8.2);
  state.doc.text('De acordo com os termos desta minuta, após conferência e validação jurídica:', MARGIN, state.y);
  state.y += 24;

  setDraw(state.doc, MUTED);
  state.doc.setLineWidth(0.35);
  const signatureWidth = (CONTENT_WIDTH - 12) / 2;
  state.doc.line(MARGIN, state.y, MARGIN + signatureWidth, state.y);
  state.doc.line(MARGIN + signatureWidth + 12, state.y, PAGE_WIDTH - MARGIN, state.y);
  setText(state.doc, INK);
  state.doc.setFont('helvetica', 'bold');
  state.doc.text(state.metadata.clientName, MARGIN, state.y + 6, { maxWidth: signatureWidth });
  state.doc.text(DOMINEX_LEGAL.razaoSocial, MARGIN + signatureWidth + 12, state.y + 6, { maxWidth: signatureWidth });
  setText(state.doc, MUTED);
  state.doc.setFont('helvetica', 'normal');
  state.doc.text('CONTRATANTE', MARGIN, state.y + 11);
  state.doc.text('CONTRATADA', MARGIN + signatureWidth + 12, state.y + 11);
}

function drawFooters(doc: jsPDF, metadata: ProposalContractPdfMetadata) {
  const total = doc.getNumberOfPages();
  for (let page = 2; page <= total; page += 1) {
    doc.setPage(page);
    setDraw(doc, HAIRLINE);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, 284, PAGE_WIDTH - MARGIN, 284);
    setText(doc, MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.7);
    doc.text(`${metadata.contractCode} · ${DOMINEX_LEGAL.razaoSocial} · CNPJ ${DOMINEX_LEGAL.cnpj}`, MARGIN, 289);
    doc.text(`${page - 1} / ${total - 1}`, PAGE_WIDTH - MARGIN, 289, { align: 'right' });
  }
}

export async function buildProposalContractPdfDoc(
  input: GenerateProposalContractPdfInput,
): Promise<{ doc: jsPDF; metadata: ProposalContractPdfMetadata }> {
  if (input.units.length === 0) throw new Error('Adicione pelo menos uma unidade à minuta.');
  const issuedAt = input.issuedAt ?? new Date();
  const validityDays = input.validityDays ?? 15;
  const metadata = buildProposalContractPdfMetadata(
    input.clientName,
    input.units.length,
    issuedAt,
    validityDays,
  );
  const logo = await imageAsDataUrl(input.logoUrl);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const displayFont = await ensureDisplayFont(doc);

  drawCover(doc, displayFont, input, metadata, logo);
  const state: FlowState = { doc, displayFont, metadata, y: BODY_TOP };
  drawSummaryPage(state, input);
  drawContractBody(state, input);
  drawFooters(doc, metadata);

  doc.setProperties({
    title: `Minuta contratual Dominex — ${metadata.clientName}`,
    subject: 'Minuta contratual de licenciamento de software como serviço (SaaS)',
    author: DOMINEX_LEGAL.razaoSocial,
    creator: 'Dominex',
    keywords: 'Dominex, minuta, contrato, SaaS, LGPD, confidencialidade',
  });

  return { doc, metadata };
}

export async function generateProposalContractPdf(input: GenerateProposalContractPdfInput): Promise<void> {
  const { doc, metadata } = await buildProposalContractPdfDoc(input);
  doc.save(metadata.contractFilename);
}
