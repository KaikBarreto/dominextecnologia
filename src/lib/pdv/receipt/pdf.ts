import jsPDF from 'jspdf';
import { openPdfInTab } from '@/utils/openPdfInTab';
import { DOMINEX_LOGO_BLACK_BASE64 } from '@/utils/dominexLogoBase64';
import { buildPdvReceiptLines, fitPdvReceiptLogo, getPdvReceiptLogoPlacement, measurePdvReceiptHeight } from './layout';
import { receiptFilename, type PdvReceiptFormat, type PdvReceiptSnapshot } from './model';

const widthMm: Record<PdvReceiptFormat, number> = { a4: 210, '58mm': 58, '80mm': 80 };
const PDF_SANS_FONT = 'helvetica';
const DOMINEX_LOGO_ASPECT = 1920 / 390;

function imageType(dataUrl: string): 'JPEG' | 'PNG' {
  return /^data:image\/jpe?g/i.test(dataUrl) ? 'JPEG' : 'PNG';
}

function drawCompanyText(
  doc: jsPDF,
  snapshot: PdvReceiptSnapshot,
  format: PdvReceiptFormat,
  x: number,
  startY: number,
  maxWidth: number,
  align: 'left' | 'center',
): number {
  let y = startY;
  const write = (value: string, bold: boolean, fontSize: number) => {
    doc.setFont(PDF_SANS_FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    const lineHeight = fontSize * 0.4;
    const lines = doc.splitTextToSize(value, maxWidth) as string[];
    for (const line of lines) {
      doc.text(line, x, y, { align, maxWidth });
      y += lineHeight;
    }
  };
  write(snapshot.company.name, true, format === 'a4' ? 13 : 10.5);
  const detailSize = format === 'a4' ? 9 : 7.5;
  if (snapshot.company.document) write(snapshot.company.document, false, detailSize);
  if (snapshot.company.address) write(snapshot.company.address, false, detailSize);
  if (snapshot.company.phone) write(snapshot.company.phone, false, detailSize);
  return y;
}

function drawCompanyHeader(
  doc: jsPDF,
  snapshot: PdvReceiptSnapshot,
  format: PdvReceiptFormat,
  width: number,
  margin: number,
  startY: number,
): number {
  const contentWidth = width - 2 * margin;
  let y = startY;
  const dataUrl = snapshot.company.logoDataUrl;
  let logo: { dataUrl: string; type: 'JPEG' | 'PNG'; width: number; height: number } | null = null;
  if (dataUrl) {
    try {
      const properties = doc.getImageProperties(dataUrl);
      if (properties.width > 0 && properties.height > 0) {
        logo = { dataUrl, type: imageType(dataUrl), width: properties.width, height: properties.height };
      }
    } catch { /* Logo opcional: os dados da empresa continuam no cabeçalho. */ }
  }

  if (!logo) {
    y = drawCompanyText(doc, snapshot, format, width / 2, y, contentWidth, 'center');
  } else if (getPdvReceiptLogoPlacement(logo.width, logo.height) === 'stacked') {
    const fitted = fitPdvReceiptLogo(
      logo.width,
      logo.height,
      format === 'a4' ? Math.min(72, contentWidth) : contentWidth,
      format === 'a4' ? 18 : 10,
    );
    doc.addImage(logo.dataUrl, logo.type, (width - fitted.width) / 2, y, fitted.width, fitted.height, undefined, 'FAST');
    y += fitted.height + (format === 'a4' ? 4 : 2.5);
    y = drawCompanyText(doc, snapshot, format, width / 2, y, contentWidth, 'center');
  } else {
    const logoBoxWidth = format === 'a4' ? 32 : 18;
    const gap = format === 'a4' ? 5 : 3;
    const fitted = fitPdvReceiptLogo(logo.width, logo.height, logoBoxWidth, format === 'a4' ? 20 : 12);
    const logoX = margin + (logoBoxWidth - fitted.width) / 2;
    doc.addImage(logo.dataUrl, logo.type, logoX, y, fitted.width, fitted.height, undefined, 'FAST');
    const infoX = margin + logoBoxWidth + gap;
    const textBottom = drawCompanyText(doc, snapshot, format, infoX, y + 1.5, width - margin - infoX, 'left');
    y = Math.max(y + fitted.height, textBottom);
  }

  y += format === 'a4' ? 2 : 1.5;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(format === 'a4' ? 0.45 : 0.3);
  doc.line(margin, y, width - margin, y);
  return y + (format === 'a4' ? 5 : 3.5);
}

function drawDominexFooter(
  doc: jsPDF,
  format: PdvReceiptFormat,
  width: number,
  margin: number,
  y: number,
): void {
  const logoWidth = format === 'a4' ? 26 : Math.min(22, (width - 2 * margin) * 0.55);
  const logoHeight = logoWidth / DOMINEX_LOGO_ASPECT;
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.25);
  doc.line(margin, y, width - margin, y);
  const logoY = y + (format === 'a4' ? 3 : 2.5);
  try {
    doc.addImage(DOMINEX_LOGO_BLACK_BASE64, 'PNG', (width - logoWidth) / 2, logoY, logoWidth, logoHeight, undefined, 'FAST');
  } catch { /* O endereço permanece mesmo se a imagem embutida falhar. */ }
  doc.setFont(PDF_SANS_FONT, 'normal');
  doc.setFontSize(format === 'a4' ? 7 : 6.5);
  doc.setTextColor(110, 110, 110);
  doc.text('www.dominex.app', width / 2, logoY + logoHeight + 3, { align: 'center' });
}

export function generatePdvReceiptPdf(snapshot: PdvReceiptSnapshot, format: PdvReceiptFormat): Blob {
  const measuredLines = buildPdvReceiptLines(snapshot, format);
  const lines = buildPdvReceiptLines(snapshot, format, { includeCompanyHeader: false });
  const width = widthMm[format];
  const logoExtraHeight = snapshot.company.logoDataUrl ? 14 : 0;
  const brandFooterHeight = snapshot.company.whiteLabelEnabled ? 0 : 14;
  const height = format === 'a4' ? 297 : measurePdvReceiptHeight(measuredLines, logoExtraHeight + brandFooterHeight);
  const doc = new jsPDF({ unit: 'mm', format: format === 'a4' ? 'a4' : [width, height], orientation: 'portrait', compress: true });
  doc.setFont(PDF_SANS_FONT, 'normal');
  const margin = format === 'a4' ? 16 : 4;
  let y = drawCompanyHeader(doc, snapshot, format, width, margin, format === 'a4' ? 18 : 7);
  const pageHeight = format === 'a4' ? 297 : height;
  const footerReserve = snapshot.company.whiteLabelEnabled ? 0 : (format === 'a4' ? 15 : 14);
  const contentBottom = pageHeight - margin - footerReserve;

  for (const line of lines) {
    const fontSize = line.size ?? (format === 'a4' ? 10 : 8.5);
    const lineHeight = fontSize * 0.42;
    if (format === 'a4' && y + lineHeight > contentBottom) { doc.addPage(); y = margin; }
    if (line.inverse) {
      doc.setFillColor(0, 0, 0);
      doc.rect(margin, y - lineHeight * 0.82, width - 2 * margin, lineHeight + 1.5, 'F');
      doc.setTextColor(255, 255, 255);
    } else {
      doc.setTextColor(0, 0, 0);
    }
    doc.setFont(PDF_SANS_FONT, line.bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    const x = line.align === 'center' ? width / 2 : line.align === 'right' ? width - margin : margin;
    doc.text(line.text, x, y, { align: line.align ?? 'left', maxWidth: width - 2 * margin });
    y += lineHeight + (line.gapAfter ?? 0);
  }
  if (!snapshot.company.whiteLabelEnabled) {
    const footerY = format === 'a4' ? pageHeight - margin - 11 : y + 3;
    drawDominexFooter(doc, format, width, margin, footerY);
  }
  return doc.output('blob');
}

async function logoUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!/^image\/(png|jpe?g)$/i.test(blob.type) || blob.size > 2_000_000) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

export async function preparePdvReceiptSnapshotLogo(snapshot: PdvReceiptSnapshot): Promise<PdvReceiptSnapshot> {
  if (snapshot.company.logoDataUrl || !snapshot.company.logoUrl) return snapshot;
  const logoDataUrl = await logoUrlToDataUrl(snapshot.company.logoUrl);
  return logoDataUrl ? { ...snapshot, company: { ...snapshot.company, logoDataUrl } } : snapshot;
}

export function previewPdvReceiptPdf(snapshot: PdvReceiptSnapshot, format: PdvReceiptFormat, targetWindow?: Window | null) {
  const blob = generatePdvReceiptPdf(snapshot, format);
  openPdfInTab(blob, receiptFilename(snapshot, format), targetWindow);
}
