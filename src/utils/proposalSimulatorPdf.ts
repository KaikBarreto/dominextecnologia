import { jsPDF } from 'jspdf';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 16;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const GREEN: [number, number, number] = [20, 215, 137];
const DARK: [number, number, number] = [7, 12, 11];
const CARD: [number, number, number] = [18, 25, 23];
const MUTED: [number, number, number] = [155, 163, 160];
const WHITE: [number, number, number] = [247, 249, 248];

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
    .replace(/[\u0300-\u036f]/g, '')
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
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
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

function addDarkPage(doc: jsPDF) {
  doc.setFillColor(...DARK);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');
}

function addSectionHeader(doc: jsPDF, eyebrow: string, title: string, pageLabel: string) {
  setTextColor(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(eyebrow.toUpperCase(), MARGIN, 19, { charSpace: 1.4 });
  setTextColor(doc, MUTED);
  doc.text(pageLabel, PAGE_WIDTH - MARGIN, 19, { align: 'right', charSpace: 1.2 });
  setTextColor(doc, WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.text(title, MARGIN, 37);
}

function addFooter(doc: jsPDF, code: string, page: number, total: number) {
  doc.setDrawColor(44, 51, 49);
  doc.line(MARGIN, PAGE_HEIGHT - 14, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 14);
  setTextColor(doc, MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`DOMINEX · ${code}`, MARGIN, PAGE_HEIGHT - 8);
  doc.text(`${page} / ${total}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 8, { align: 'right' });
}

function unitCardHeight(doc: jsPDF, unit: ProposalPdfUnit): number {
  const moduleLines = unit.modules.flatMap((label) => doc.splitTextToSize(label, 112));
  return Math.max(38, 28 + moduleLines.length * 4.2);
}

function drawUnitCard(doc: jsPDF, unit: ProposalPdfUnit, index: number, y: number): number {
  const height = unitCardHeight(doc, unit);
  doc.setFillColor(...CARD);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 3, 3, 'F');

  setTextColor(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(String(index + 1).padStart(2, '0'), MARGIN + 5, y + 9);

  setTextColor(doc, WHITE);
  doc.setFontSize(12);
  doc.text(safeText(unit.name, `Unidade ${index + 1}`), MARGIN + 19, y + 9);
  setTextColor(doc, MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Plano ${safeText(unit.planName, 'Personalizado')} · ${unit.users} usuários`, MARGIN + 19, y + 15);

  setTextColor(doc, WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`${money(unit.monthly)}/mês`, PAGE_WIDTH - MARGIN - 5, y + 8, { align: 'right' });
  setTextColor(doc, GREEN);
  doc.setFontSize(8);
  doc.text(`${money(unit.yearlyDiscounted)}/ano`, PAGE_WIDTH - MARGIN - 5, y + 14, { align: 'right' });

  let moduleY = y + 23;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  unit.modules.forEach((module) => {
    const lines = doc.splitTextToSize(safeText(module, 'Módulo'), 112);
    setTextColor(doc, GREEN);
    doc.circle(MARGIN + 20.5, moduleY - 1.1, 0.75, 'F');
    setTextColor(doc, MUTED);
    doc.text(lines, MARGIN + 24, moduleY);
    moduleY += lines.length * 4.2;
  });

  return height;
}

export async function generateProposalSimulatorPdf(input: GenerateProposalPdfInput): Promise<void> {
  if (input.units.length === 0) throw new Error('Adicione pelo menos uma unidade à proposta.');

  const issuedAt = input.issuedAt ?? new Date();
  const validityDays = input.validityDays ?? 15;
  const metadata = buildProposalPdfMetadata(input.clientName, input.units.length, issuedAt, validityDays);
  const logo = await imageAsDataUrl(input.logoUrl);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  // Capa
  addDarkPage(doc);
  setTextColor(doc, MUTED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('DOMINEX', MARGIN, 21, { charSpace: 1.4 });
  doc.text(`PROPOSTA ${metadata.code}`, PAGE_WIDTH - MARGIN, 21, { align: 'right', charSpace: 0.45 });
  doc.addImage(logo, 'PNG', MARGIN, 45, 58, 11.6, undefined, 'FAST');

  setTextColor(doc, GREEN);
  doc.setFontSize(8);
  doc.text('PROPOSTA COMERCIAL', MARGIN, 74, { charSpace: 1.5 });
  setTextColor(doc, WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(37);
  doc.text('Proposta', MARGIN, 94);
  doc.setFontSize(34);
  const clientLines = doc.splitTextToSize(metadata.clientName, 150).slice(0, 3);
  const clientStartY = 111;
  doc.text(clientLines, MARGIN, clientStartY);
  const afterClient = clientStartY + (clientLines.length - 1) * 12;
  setTextColor(doc, MUTED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(
    input.units.length === 1
      ? `Unidade ${safeText(input.units[0].name, 'principal')}`
      : `${metadata.unitSummary} com planos independentes`,
    MARGIN,
    afterClient + 13,
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    doc.splitTextToSize(
      'Tecnologia para organizar a operação, acompanhar equipes e transformar informação em decisões mais rápidas.',
      145,
    ),
    MARGIN,
    afterClient + 30,
  );

  const planNames = [...new Set(input.units.map((unit) => safeText(unit.planName, 'Personalizado')))];
  let badgeX = MARGIN;
  planNames.slice(0, 4).forEach((planName) => {
    const label = `Plano ${planName}`;
    const badgeWidth = Math.min(48, doc.getTextWidth(label) + 10);
    if (badgeX + badgeWidth <= PAGE_WIDTH - MARGIN) {
      doc.setDrawColor(...GREEN);
      doc.roundedRect(badgeX, afterClient + 53, badgeWidth, 8, 4, 4, 'S');
      setTextColor(doc, GREEN);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text(label, badgeX + badgeWidth / 2, afterClient + 58.2, { align: 'center' });
      badgeX += badgeWidth + 3;
    }
  });

  doc.setDrawColor(44, 51, 49);
  doc.line(MARGIN, 255, PAGE_WIDTH - MARGIN, 255);
  setTextColor(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(metadata.unitSummary.toUpperCase(), MARGIN, 266, { charSpace: 1 });
  setTextColor(doc, WHITE);
  doc.setFontSize(13);
  doc.text(`${money(input.totals.monthly)}/mês`, MARGIN, 274);
  setTextColor(doc, MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Emitida em ${metadata.issuedLabel}`, PAGE_WIDTH - MARGIN, 265, { align: 'right' });
  doc.text(`Válida até ${metadata.validityLabel}`, PAGE_WIDTH - MARGIN, 271, { align: 'right' });

  // Escopo por unidade, com paginação automática.
  doc.addPage();
  addDarkPage(doc);
  addSectionHeader(doc, 'O que entra na proposta', 'Planos por unidade', 'ESCOPO');
  let y = 50;
  input.units.forEach((unit, index) => {
    const cardHeight = unitCardHeight(doc, unit);
    if (y + cardHeight > PAGE_HEIGHT - 29) {
      doc.addPage();
      addDarkPage(doc);
      addSectionHeader(doc, 'Continuação', 'Planos por unidade', 'ESCOPO');
      y = 50;
    }
    y += drawUnitCard(doc, unit, index, y) + 4;
  });

  if (y + 33 > PAGE_HEIGHT - 25) {
    doc.addPage();
    addDarkPage(doc);
    addSectionHeader(doc, 'Resumo', 'Investimento consolidado', 'VALORES');
    y = 50;
  }
  doc.setFillColor(...GREEN);
  doc.roundedRect(MARGIN, y + 3, CONTENT_WIDTH, 27, 3, 3, 'F');
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('INVESTIMENTO MENSAL', MARGIN + 7, y + 12, { charSpace: 1.1 });
  doc.setFontSize(22);
  doc.text(`${money(input.totals.monthly)}/mês`, MARGIN + 7, y + 23);
  doc.setFontSize(8.5);
  doc.text(`${money(input.totals.yearlyDiscounted)}/ano no plano anual`, PAGE_WIDTH - MARGIN - 7, y + 20, { align: 'right' });

  // Condições e pagamento.
  doc.addPage();
  addDarkPage(doc);
  addSectionHeader(doc, 'Como contratar', 'No anual, 20% mais econômico.', 'CONDIÇÕES');

  doc.setFillColor(...CARD);
  doc.roundedRect(MARGIN, 52, 84, 60, 3, 3, 'F');
  setTextColor(doc, MUTED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('MENSAL', MARGIN + 8, 65, { charSpace: 1.2 });
  setTextColor(doc, WHITE);
  doc.setFontSize(21);
  doc.text(`${money(input.totals.monthly)}/mês`, MARGIN + 8, 79);
  setTextColor(doc, MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(doc.splitTextToSize('Cobrança recorrente, sem fidelidade. Cancele quando quiser.', 67), MARGIN + 8, 91);

  doc.setFillColor(11, 35, 27);
  doc.setDrawColor(...GREEN);
  doc.roundedRect(105, 52, 89, 60, 3, 3, 'FD');
  setTextColor(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('ANUAL · 20% DE DESCONTO', 113, 65, { charSpace: 0.8 });
  setTextColor(doc, WHITE);
  doc.setFontSize(21);
  doc.text(`${money(input.totals.yearlyDiscounted)}/ano`, 113, 79);
  setTextColor(doc, MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setFontSize(7.5);
  doc.text(`De ${money(input.totals.yearlyFull)} sem desconto`, 113, 88);
  doc.setFontSize(8.5);
  doc.text(`Equivale a ${money(input.totals.yearlyDiscounted / 12)}/mês`, 113, 96);
  setTextColor(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.text(`Economia de ${money(input.totals.savings)}`, 113, 105);

  setTextColor(doc, GREEN);
  doc.setFontSize(8);
  doc.text('FORMAS DE PAGAMENTO', MARGIN, 125, { charSpace: 1.2 });
  const paymentCards = [
    ['PIX', `Anual em até 3x de ${money(input.totals.pixInstallment)}`],
    ['CARTÃO', 'Recorrência no mensal ou parcelamento do anual'],
    ['BOLETO', 'Vencimento combinado e envio antes da data'],
  ];
  paymentCards.forEach(([title, description], index) => {
    const cardWidth = (CONTENT_WIDTH - 8) / 3;
    const x = MARGIN + index * (cardWidth + 4);
    doc.setFillColor(...CARD);
    doc.roundedRect(x, 132, cardWidth, 42, 3, 3, 'F');
    setTextColor(doc, WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, x + 6, 145);
    setTextColor(doc, MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(description, cardWidth - 12), x + 6, 155);
  });

  setTextColor(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CONDIÇÕES', MARGIN, 193, { charSpace: 1.2 });
  const conditions = [
    'Sem taxa de adesão e sem fidelidade',
    'Implantação guiada e tutoriais completos',
    'Suporte humano pelo WhatsApp',
    'Módulos e usuários ajustáveis',
    'Atualizações e melhorias contínuas',
    `Proposta válida por ${validityDays} dias`,
  ];
  conditions.forEach((condition, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + column * 91;
    const itemY = 206 + row * 11;
    setTextColor(doc, GREEN);
    doc.text('—', x, itemY);
    setTextColor(doc, MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(condition, x + 5, itemY);
  });

  const totalPages = doc.getNumberOfPages();
  for (let page = 2; page <= totalPages; page += 1) {
    doc.setPage(page);
    addFooter(doc, metadata.code, page - 1, totalPages - 1);
  }

  doc.save(metadata.filename);
}
