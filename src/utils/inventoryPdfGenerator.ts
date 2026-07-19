import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CompanySettings } from '@/hooks/useCompanySettings';
import { DOMINEX_LOGO_BLACK_BASE64 } from '@/utils/dominexLogoBase64';
import { cpfCnpjMask, phoneMask } from '@/utils/masks';
import { openPdfInTab } from '@/utils/openPdfInTab';
import type { LocaleCode } from '@/lib/i18n/locales';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney, formatNumber, toBcp47 } from '@/lib/format';

/**
 * Relatório PDF A4 paginado (real) do Estoque/Inventário.
 *
 * Espelha `movimentacoesPdfGenerator.ts`: jsPDF + jspdf-autotable, a tabela
 * pagina sozinha repetindo o cabeçalho em cada página A4 e o resultado abre
 * numa aba via `openPdfInTab` (header "voltar" + "Baixar PDF" no mobile).
 *
 * Mesmas regras-lei:
 *  - Cabeçalho: logo + dados da empresa respeitando os toggles `show_*_in_documents`.
 *  - Rodapé Dominex SÓ quando o tenant NÃO é white-label (regra-lei #2).
 *  - Moeda e números formatados pelo locale do usuário via src/lib/format.
 */

export interface InventoryReportRow {
  name: string;
  sku: string | null;
  category: string | null;
  quantity: number | null;
  unit: string | null;
  cost_price: number | null;
  sale_price: number | null;
}

interface InventoryPdfData {
  company: CompanySettings | null | undefined;
  /** true = tenant white-label → não renderiza rodapé Dominex. */
  whiteLabel: boolean;
  title: string;
  rows: InventoryReportRow[];
  /** Locale do usuário (de useAppLocaleContext). */
  locale: LocaleCode;
  /** Código ISO 4217 da moeda da empresa (ex.: 'BRL', 'USD'). */
  currency: string;
}

function buildFormatters(locale: LocaleCode, currency: string) {
  const formatCurrency = (value: number) => formatMoney(value, currency, locale);
  const formatNum = (value: number) =>
    formatNumber(value, locale, { maximumFractionDigits: 2 });
  return { formatCurrency, formatNum };
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

/** Linhas de dados da empresa (texto puro pro PDF), respeitando os toggles. */
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

/** Carrega uma imagem (URL ou data URL) num <img> pra o jsPDF poder embedar. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar imagem'));
    img.src = src;
  });
}

const MARGIN = 14; // mm

export async function generateInventoryReportPdf(data: InventoryPdfData): Promise<void> {
  const { company, whiteLabel, title, rows, locale, currency } = data;
  const tr = MESSAGES[locale].app.inventory.report;
  const { formatCurrency, formatNum } = buildFormatters(locale, currency);

  // Abre a janela ANTES do await (gesto do usuário → driblar popup-blocker).
  const targetWindow = window.open('', '_blank');

  // Total geral do valor em estoque (quantity × cost_price).
  let totalEstoque = 0;
  for (const r of rows) {
    totalEstoque += (r.quantity || 0) * (r.cost_price || 0);
  }

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;

  const companyName =
    company?.show_name_in_documents !== false && company?.name ? company.name : 'Relatório';

  doc.setProperties({ title: `${title} - ${companyName}`, subject: title });

  let y = MARGIN;

  // ===== Cabeçalho da empresa (logo opcional + dados) =====
  if (company) {
    const showName = company.show_name_in_documents !== false && company.name;
    const detailLines = buildCompanyDetailLines(company);

    let infoX = MARGIN;
    const logoBoxSize = 20; // mm

    if (company.logo_url) {
      try {
        const img = await loadImage(company.logo_url);
        const ratio = img.width / img.height || 1;
        let w = logoBoxSize;
        let h = logoBoxSize;
        if (ratio > 1) h = logoBoxSize / ratio;
        else if (ratio < 1) w = logoBoxSize * ratio;
        const logoY = y + (logoBoxSize - h) / 2;
        doc.addImage(img, 'PNG', MARGIN, logoY, w, h);
        infoX = MARGIN + logoBoxSize + 5;
      } catch {
        // logo falhou → segue sem ela
      }
    }

    let infoY = y + 4;
    if (showName) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(17, 24, 39);
      const nameLines = doc.splitTextToSize(company.name, pageWidth - infoX - MARGIN);
      nameLines.forEach((line: string) => {
        doc.text(line, infoX, infoY);
        infoY += 6;
      });
      infoY += 1;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    detailLines.forEach((line) => {
      const wrapped = doc.splitTextToSize(line, pageWidth - infoX - MARGIN);
      wrapped.forEach((wl: string) => {
        doc.text(wl, infoX, infoY);
        infoY += 4.2;
      });
    });

    y = Math.max(y + logoBoxSize, infoY) + 4;

    // Linha separadora do cabeçalho
    doc.setDrawColor(229, 229, 229);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 7;
  }

  // ===== Título + subtítulo =====
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(136, 136, 136);
  const count = rows.length;
  const registros = count !== 1
    ? tr.itemCountPlural.replace('{count}', String(count))
    : tr.itemCount.replace('{count}', String(count));
  doc.text(
    `${registros}  |  ${tr.generatedAt} ${formatGeneratedAt(locale)}`,
    pageWidth / 2,
    y,
    { align: 'center' },
  );
  y += 8;

  // ===== Card de total geral (Valor em estoque) =====
  const cardHeight = 16;
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(229, 229, 229);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, contentWidth, cardHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text(tr.totalStockCard, MARGIN + 4, y + 5.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(31, 41, 55);
  doc.text(formatCurrency(totalEstoque), MARGIN + 4, y + 12);
  y += cardHeight + 6;

  // ===== Tabela paginada (autoTable repete o head em cada página A4) =====
  const body = rows.map((r) => {
    const qty = r.quantity || 0;
    const valorTotal = qty * (r.cost_price || 0);
    return [
      r.name || '—',
      r.sku || '—',
      r.category || '—',
      formatNum(qty),
      r.unit || '—',
      r.cost_price != null ? formatCurrency(r.cost_price) : '—',
      r.sale_price != null ? formatCurrency(r.sale_price) : '—',
      formatCurrency(valorTotal),
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, bottom: 18 },
    head: [[
      tr.colName,
      tr.colSku,
      tr.colCategory,
      tr.colQty,
      tr.colUnit,
      tr.colCostUnit,
      tr.colSaleUnit,
      tr.colTotal,
    ]],
    body: body.length > 0 ? body : [['', '', '', '', '', '', '', tr.noItems]],
    foot: body.length > 0
      ? [['', '', '', '', '', '', tr.footerGrandTotal, formatCurrency(totalEstoque)]]
      : undefined,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [240, 240, 240], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 24 },
      2: { cellWidth: 24 },
      3: { cellWidth: 16, halign: 'right' },
      4: { cellWidth: 12, halign: 'center' },
      5: { cellWidth: 24, halign: 'right' },
      6: { cellWidth: 24, halign: 'right' },
      7: { cellWidth: 26, halign: 'right' },
    },
  });

  // ===== Rodapé Dominex (some no white-label) — em todas as páginas =====
  if (!whiteLabel) {
    const pageCount = doc.getNumberOfPages();
    let footerImg: HTMLImageElement | null = null;
    try {
      footerImg = await loadImage(DOMINEX_LOGO_BLACK_BASE64);
    } catch {
      footerImg = null;
    }
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

  const slug = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
  const filename = `${slug}-${todayStamp()}`;

  const blob = doc.output('blob');
  openPdfInTab(blob, filename, targetWindow);
}
