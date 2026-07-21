import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CompanySettings } from '@/hooks/useCompanySettings';
import { DOMINEX_LOGO_BLACK_BASE64 } from '@/utils/dominexLogoBase64';
import { cpfCnpjMask, phoneMask } from '@/utils/masks';
import { openPdfInTab } from '@/utils/openPdfInTab';
import type { LocaleCode } from '@/lib/i18n/locales';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney, formatNumber, toBcp47 } from '@/lib/format';

export interface InventoryCountPdfRow {
  material_name: string;
  material_sku: string | null;
  stock_name: string;
  expected_qty: number;
  counted_qty: number | null;
  diff: number | null;
  unit_cost: number | null;
  diff_value: number | null;
}

interface InventoryCountPdfData {
  company: CompanySettings | null | undefined;
  whiteLabel: boolean;
  countNumber: number | null;
  status: string;
  notes: string | null;
  rows: InventoryCountPdfRow[];
  locale: LocaleCode;
  currency: string;
}

function buildFormatters(locale: LocaleCode, currency: string) {
  return {
    formatCurrency: (v: number) => formatMoney(v, currency, locale),
    formatNum: (v: number) => formatNumber(v, locale, { maximumFractionDigits: 2 }),
  };
}

function formatGeneratedAt(locale: LocaleCode): string {
  return new Date().toLocaleString(toBcp47(locale), {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function todayStamp(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

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

export async function generateInventoryCountPdf(data: InventoryCountPdfData): Promise<void> {
  const { company, whiteLabel, countNumber, status, notes, rows, locale, currency } = data;
  const tr = MESSAGES[locale].app.inventory.inventoryCount.pdf;
  const { formatCurrency, formatNum } = buildFormatters(locale, currency);

  const targetWindow = window.open('', '_blank');

  const totalDiffValue = rows.reduce((acc, r) => acc + (r.diff_value ?? 0), 0);
  const divergences = rows.filter((r) => r.diff !== null && r.diff !== 0);

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;

  const companyName =
    company?.show_name_in_documents !== false && company?.name ? company.name : 'Relatório';
  const title = `${tr.title} #${countNumber ?? '—'}`;
  doc.setProperties({ title: `${title} - ${companyName}`, subject: title });

  let y = MARGIN;

  // Cabeçalho da empresa
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
        // logo falhou
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

  // Título
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(136, 136, 136);
  doc.text(`${tr.status}: ${status}  |  ${tr.generatedAt} ${formatGeneratedAt(locale)}`, pageWidth / 2, y, { align: 'center' });
  y += 5;

  if (notes) {
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    const noteLines = doc.splitTextToSize(`${tr.notes}: ${notes}`, contentWidth);
    noteLines.forEach((line: string) => { doc.text(line, MARGIN, y); y += 4.5; });
  }
  y += 4;

  // Card de total divergência
  const cardHeight = 16;
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(229, 229, 229);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, contentWidth, cardHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text(tr.totalDivCard, MARGIN + 4, y + 5.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(31, 41, 55);
  doc.text(formatCurrency(totalDiffValue), MARGIN + 4, y + 12);
  y += cardHeight + 6;

  // Tabela completa (todos os itens)
  const body = rows.map((r) => {
    const diff = r.diff ?? 0;
    return [
      r.material_name,
      r.material_sku ?? '—',
      r.stock_name,
      formatNum(r.expected_qty),
      r.counted_qty != null ? formatNum(r.counted_qty) : tr.notCounted,
      diff !== 0 ? (diff > 0 ? `+${formatNum(diff)}` : formatNum(diff)) : '—',
      r.unit_cost != null ? formatCurrency(r.unit_cost) : '—',
      r.diff_value != null && r.diff_value !== 0 ? formatCurrency(r.diff_value) : '—',
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, bottom: 18 },
    head: [[tr.colMaterial, tr.colSku, tr.colStock, tr.colExpected, tr.colCounted, tr.colDiff, tr.colCost, tr.colDiffValue]],
    body: body.length > 0 ? body : [['', '', '', '', '', '', '', tr.noItems]],
    foot: divergences.length > 0
      ? [['', '', '', '', '', '', tr.footerTotal, formatCurrency(totalDiffValue)]]
      : undefined,
    theme: 'striped',
    styles: { fontSize: 7.5, cellPadding: 1.8, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    footStyles: { fillColor: [240, 240, 240], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 20 },
      2: { cellWidth: 24 },
      3: { cellWidth: 16, halign: 'right' },
      4: { cellWidth: 16, halign: 'right' },
      5: { cellWidth: 14, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 22, halign: 'right' },
    },
    didParseCell(hookData) {
      // Marca em vermelho/verde células de diferença
      if (hookData.section === 'body' && hookData.column.index === 5) {
        const text = String(hookData.cell.raw);
        if (text.startsWith('+')) hookData.cell.styles.textColor = [21, 128, 61];
        else if (text.startsWith('-') || (text !== '—' && !text.startsWith('+'))) {
          if (text !== '—') hookData.cell.styles.textColor = [185, 28, 28];
        }
      }
    },
  });

  // Rodapé Dominex
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

  const filename = `inventario-${countNumber ?? 'sem-numero'}-${todayStamp()}`;
  const blob = doc.output('blob');
  openPdfInTab(blob, filename, targetWindow);
}
