import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CompanySettings } from '@/hooks/useCompanySettings';
import { DOMINEX_LOGO_BLACK_BASE64 } from '@/utils/dominexLogoBase64';
import { cpfCnpjMask, phoneMask } from '@/utils/masks';
import { openPdfInTab } from '@/utils/openPdfInTab';
import type { LocaleCode } from '@/lib/i18n/locales';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney, formatNumber, toBcp47 } from '@/lib/format';
import { safeTimeZone, todayInTz } from '@/lib/timezone';
import { unitLabel } from '@/lib/inventoryUnits';
import type { CompraOrdemRow } from '@/hooks/useCompraOrdens';

/**
 * Gerador do PDF de uma Ordem de Compra. Extensão `.tsx` (sem JSX dentro) por
 * convenção de divisão de trabalho da tarefa que criou este arquivo: só `.ts`
 * eram do agente dono de hooks/i18n, então este util nasceu `.tsx` pra não
 * colidir. Sem JSX real aqui — é jsPDF puro, igual aos outros geradores do
 * módulo (`stockPositionPdfGenerator.ts`, `movimentacoesPdfGenerator.ts`).
 */

interface OrdemCompraPdfData {
  company: CompanySettings | null | undefined;
  /** true = tenant white-label → sem rodapé Dominex (regra-lei #2). */
  whiteLabel: boolean;
  ordem: CompraOrdemRow;
  /** Título da requisição de origem — só contexto no corpo do documento. */
  compraTitle: string;
  locale: LocaleCode;
  currency: string;
  /** Fuso IANA da empresa (`useAppLocaleContext().timezone`). Ausente/inválido cai em America/Sao_Paulo. */
  timezone?: string | null;
}

/**
 * Rótulos do PDF que AINDA não têm chave dedicada em
 * `app.inventory.compras.ordens` (o contrato de i18n desta tarefa cobria só a
 * LISTA de ordens, não o documento). Ficam escopados a este arquivo pra não
 * mexer no arquivo de mensagens compartilhado — ver relatório final do agente
 * que escreveu este gerador pra migrar isto pra MESSAGES quando o dono do i18n
 * tiver espaço. O que já existe no contrato (`number`, `supplier`, `total`,
 * `orderedQty`, `unitPrice`, `statusLabels`) é lido direto de MESSAGES abaixo.
 */
const PDF_LABELS: Record<LocaleCode, {
  docTitle: string;
  dateLabel: string;
  requisitionLabel: string;
  colMaterial: string;
  colUnit: string;
  colSubtotal: string;
  notesLabel: string;
  noItemsLabel: string;
}> = {
  'pt-br': {
    docTitle: 'Ordem de Compra',
    dateLabel: 'Data de emissão',
    requisitionLabel: 'Requisição',
    colMaterial: 'Material',
    colUnit: 'Unidade',
    colSubtotal: 'Subtotal',
    notesLabel: 'Observações',
    noItemsLabel: 'Nenhum item.',
  },
  en: {
    docTitle: 'Purchase Order',
    dateLabel: 'Issue date',
    requisitionLabel: 'Request',
    colMaterial: 'Material',
    colUnit: 'Unit',
    colSubtotal: 'Subtotal',
    notesLabel: 'Notes',
    noItemsLabel: 'No items.',
  },
  es: {
    docTitle: 'Orden de Compra',
    dateLabel: 'Fecha de emisión',
    requisitionLabel: 'Solicitud',
    colMaterial: 'Material',
    colUnit: 'Unidad',
    colSubtotal: 'Subtotal',
    notesLabel: 'Observaciones',
    noItemsLabel: 'Sin ítems.',
  },
  fr: {
    docTitle: 'Bon de Commande',
    dateLabel: "Date d'émission",
    requisitionLabel: 'Demande',
    colMaterial: 'Matériau',
    colUnit: 'Unité',
    colSubtotal: 'Sous-total',
    notesLabel: 'Remarques',
    noItemsLabel: 'Aucun article.',
  },
};

/** Mesmo helper de cabeçalho usado nos demais geradores do módulo (duplicado por arquivo — não há um compartilhado hoje). */
function buildCompanyDetailLines(s: CompanySettings): string[] {
  const lines: string[] = [];
  if (s.show_address_in_documents && s.address) {
    let a = s.address;
    if (s.address_number) a += `, ${s.address_number}`;
    if (s.complement) a += ` ${s.complement}`;
    if (s.neighborhood) a += ` - ${s.neighborhood}`;
    if (s.city) a += ` - ${s.city}`;
    if (s.state) a += `/${s.state}`;
    if (s.zip_code) a += ` - CEP: ${s.zip_code}`;
    lines.push(a);
  }
  const contact: string[] = [];
  if (s.show_phone_in_documents && s.phone) contact.push(`Tel: ${phoneMask(s.phone)}`);
  if (s.show_email_in_documents && s.email) contact.push(s.email);
  if (contact.length) lines.push(contact.join(' | '));
  if (s.show_cnpj_in_documents && s.document) {
    const digits = s.document.replace(/\D/g, '');
    const label = digits.length <= 11 ? 'CPF' : 'CNPJ';
    lines.push(`${label}: ${cpfCnpjMask(s.document)}`);
  }
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar imagem'));
    img.src = src;
  });
}

const MARGIN = 14;

/**
 * PDF A4 de uma Ordem de Compra: cabeçalho com marca do tenant, número/status,
 * fornecedor, tabela de itens (material, unidade, qtd pedida, preço unitário,
 * subtotal), total e observações. Rodapé Dominex exceto tenant white-label
 * (regra-lei #2). `autoTable` pagina sozinho e não corta linha no meio — mesmo
 * padrão do PDF de Posição de Estoque.
 */
export async function generateOrdemCompraPdf(data: OrdemCompraPdfData): Promise<void> {
  const { company, whiteLabel, ordem, compraTitle, locale, currency, timezone } = data;
  const tOrdens = MESSAGES[locale].app.inventory.compras.ordens;
  const L = PDF_LABELS[locale] ?? PDF_LABELS['pt-br'];
  const formatCurrency = (v: number) => formatMoney(v, currency, locale);
  const formatQty = (v: number) => formatNumber(v, locale, { maximumFractionDigits: 2 });

  const targetWindow = window.open('', '_blank');

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const companyName =
    company?.show_name_in_documents !== false && company?.name ? company.name : L.docTitle;
  doc.setProperties({ title: `${L.docTitle} #${ordem.numero} - ${companyName}`, subject: L.docTitle });

  let y = MARGIN;

  // Cabeçalho da empresa (logo + dados, respeitando os toggles show_*_in_documents)
  if (company) {
    const showName = company.show_name_in_documents !== false && company.name;
    const detailLines = buildCompanyDetailLines(company);
    let infoX = MARGIN;
    const logoBoxSize = 20;

    if (company.logo_url) {
      try {
        const img = await loadImage(company.logo_url);
        const ratio = img.width / img.height || 1;
        let w = logoBoxSize;
        let h = logoBoxSize;
        if (ratio > 1) h = logoBoxSize / ratio;
        else if (ratio < 1) w = logoBoxSize * ratio;
        doc.addImage(img, 'PNG', MARGIN, y + (logoBoxSize - h) / 2, w, h);
        infoX = MARGIN + logoBoxSize + 5;
      } catch {
        // logo falhou — segue sem ela.
      }
    }

    let infoY = y + 4;
    if (showName) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(17, 24, 39);
      const nameLines = doc.splitTextToSize(company.name, pageWidth - infoX - MARGIN);
      nameLines.forEach((line: string) => { doc.text(line, infoX, infoY); infoY += 6; });
      infoY += 1;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    detailLines.forEach((line) => {
      const wrapped = doc.splitTextToSize(line, pageWidth - infoX - MARGIN);
      wrapped.forEach((wl: string) => { doc.text(wl, infoX, infoY); infoY += 4.2; });
    });

    y = Math.max(y + logoBoxSize, infoY) + 4;
    doc.setDrawColor(229, 229, 229);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 7;
  }

  // Título do documento + status
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text(`${L.docTitle} #${ordem.numero}`, pageWidth / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(136, 136, 136);
  const statusLabel = tOrdens.statusLabels[ordem.status] ?? ordem.status;
  doc.text(statusLabel, pageWidth / 2, y, { align: 'center' });
  y += 9;

  // Bloco de informações: fornecedor, requisição de origem, data de emissão
  doc.setFontSize(9.5);
  const infoLineHeight = 5.5;
  const emissionIso = ordem.sent_at ?? ordem.created_at;
  const emissionLabel = new Date(emissionIso).toLocaleDateString(toBcp47(locale), {
    timeZone: safeTimeZone(timezone),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const infoRows: [string, string][] = [
    [tOrdens.supplier, ordem.supplier_name],
    [L.requisitionLabel, compraTitle],
    [L.dateLabel, emissionLabel],
  ];
  for (const [label, value] of infoRows) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(75, 85, 99);
    doc.text(`${label}:`, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(31, 41, 55);
    doc.text(value, MARGIN + 32, y);
    y += infoLineHeight;
  }
  y += 3;

  // Tabela de itens
  const body = ordem.items.map((item) => [
    item.material_name,
    unitLabel(item.unit),
    formatQty(item.quantity_ordered),
    item.unit_price != null ? formatCurrency(item.unit_price) : '-',
    item.unit_price != null ? formatCurrency(item.unit_price * item.quantity_ordered) : '-',
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, bottom: 18 },
    head: [[L.colMaterial, L.colUnit, tOrdens.orderedQty, tOrdens.unitPrice, L.colSubtotal]],
    body: body.length > 0 ? body : [['', '', '', '', L.noItemsLabel]],
    foot: [['', '', '', tOrdens.total, formatCurrency(ordem.total)]],
    theme: 'striped',
    styles: { fontSize: 8.5, cellPadding: 2.2, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    footStyles: { fillColor: [240, 240, 240], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 26, halign: 'right' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
    },
  });

  // `jspdf-autotable` anota o Y final no próprio doc em runtime; os tipos do
  // pacote tipam o parâmetro do doc como `any`, então não há um retorno
  // tipado disponível — só esta leitura pontual, sem `any` solto no resto do arquivo.
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;

  // Observações
  if (ordem.notes) {
    let noteY = finalY + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(75, 85, 99);
    doc.text(L.notesLabel, MARGIN, noteY);
    noteY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(31, 41, 55);
    const noteLines = doc.splitTextToSize(ordem.notes, pageWidth - MARGIN * 2);
    noteLines.forEach((line: string) => { doc.text(line, MARGIN, noteY); noteY += 4.5; });
  }

  // Rodapé Dominex (regra-lei #2: nunca em tenant white-label)
  if (!whiteLabel) {
    const pageCount = doc.getNumberOfPages();
    let footerImg: HTMLImageElement | null = null;
    try { footerImg = await loadImage(DOMINEX_LOGO_BLACK_BASE64); } catch { footerImg = null; }
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      const footerY = pageHeight - 12;
      if (footerImg) {
        const fw = 22;
        const fh = fw / (footerImg.width / footerImg.height || 5);
        doc.addImage(footerImg, 'PNG', (pageWidth - fw) / 2, footerY - fh, fw, fh);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(153, 153, 153);
        doc.text('Desenvolvido por Dominex · dominex.app', pageWidth / 2, footerY + 2.5, { align: 'center' });
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(153, 153, 153);
        doc.text('Desenvolvido por Dominex · dominex.app', pageWidth / 2, footerY, { align: 'center' });
      }
    }
  }

  const filename = `ordem-compra-${ordem.numero}-${todayInTz(timezone)}`;
  const blob = doc.output('blob');
  openPdfInTab(blob, filename, targetWindow);
}
