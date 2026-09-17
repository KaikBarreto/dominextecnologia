import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CompanySettings } from '@/hooks/useCompanySettings';
import { DOMINEX_LOGO_BLACK_BASE64 } from '@/utils/dominexLogoBase64';
import { cpfCnpjMask, phoneMask } from '@/utils/masks';
import { openPdfInTab } from '@/utils/openPdfInTab';
import type { MovimentacaoReportRow } from '@/utils/movimentacoesReportHtmlGenerator';
import { MESSAGES } from '@/lib/i18n';
import type { LocaleCode } from '@/lib/i18n/locales';
import { safeTimeZone, todayInTz } from '@/lib/timezone';

/**
 * Relatório PDF A4 paginado (real) das Movimentações financeiras.
 *
 * Por quê: o gerador HTML antigo (`movimentacoesReportHtmlGenerator`) abria uma
 * página com `window.print` — no celular não tinha "voltar" e não gerava um PDF
 * A4 paginado de verdade. Aqui usamos jsPDF + jspdf-autotable: a tabela pagina
 * sozinha, repetindo o cabeçalho em cada página A4. O resultado abre numa aba
 * via `openPdfInTab` (header "voltar" + botão "Baixar PDF" no mobile).
 *
 * Mesmas regras do gerador HTML:
 *  - Cabeçalho: logo + dados da empresa respeitando os toggles `show_*_in_documents`.
 *  - Rodapé Dominex SÓ quando o tenant NÃO é white-label (regra-lei #2).
 *  - BRL. Datas de LANÇAMENTO são dia de calendário (sem fuso); o carimbo
 *    "gerado em" e o nome do arquivo usam o fuso DA EMPRESA.
 */

interface MovimentacoesPdfData {
  company: CompanySettings | null | undefined;
  /** true = tenant white-label → não renderiza rodapé Dominex. */
  whiteLabel: boolean;
  title: string;
  rows: MovimentacaoReportRow[];
  /** Locale do usuário que gera o documento. Padrão: 'pt-br'. */
  locale?: LocaleCode;
  /**
   * Fuso DA EMPRESA (`useAppLocaleContext().timezone`). Entra por parâmetro
   * porque util não chama hook. Ausente ou inválido cai em America/Sao_Paulo.
   */
  timezone?: string | null;
}

const formatCurrencyBR = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

/**
 * Formata um dia de CALENDÁRIO (YYYY-MM-DD, coluna `date` do banco) como
 * dd/MM/yyyy. Não há fuso envolvido: o dia 02 é o dia 02 em qualquer lugar.
 *
 * Antes isto passava por DOIS fusos e errava o dia: montava
 * `new Date(y, m - 1, d)`, que é meia-noite no fuso do APARELHO, e depois
 * reformatava forçando `America/Sao_Paulo`. Exportando de um notebook em Lisboa
 * (UTC+1), a meia-noite local é 20:00 do dia ANTERIOR em São Paulo, então a
 * movimentação do dia 02 saía como 01 no PDF que vai pro contador. Agora o dia
 * é recortado da própria string, sem instante nenhum no meio.
 */
function formatDateBR(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr ?? '').trim());
  if (!m) return dateStr;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Carimbo "gerado em". Este SIM é um instante (`new Date()`), então o relógio
 * mostrado tem que ser o DA EMPRESA, não o do aparelho de quem exportou nem
 * Brasília chumbado: quem lê o documento é a empresa e o contador dela.
 * `safeTimeZone` garante que fuso vazio ou inválido não derrube a exportação.
 */
function formatGeneratedAt(locale?: LocaleCode, timeZone?: string | null): string {
  const bcp47 =
    locale === 'pt-br' ? 'pt-BR'
    : locale === 'en' ? 'en-US'
    : locale === 'es' ? 'es-ES'
    : locale === 'fr' ? 'fr-FR'
    : 'pt-BR';
  return new Date().toLocaleString(bcp47, {
    timeZone: safeTimeZone(timeZone),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** YYYY-MM-DD no fuso DA EMPRESA, pra nomear o arquivo. */
function todayStamp(timeZone?: string | null): string {
  return todayInTz(timeZone);
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

export async function generateMovimentacoesReportPdf(data: MovimentacoesPdfData): Promise<void> {
  const { company, whiteLabel, title, rows, timezone } = data;
  const locale = data.locale ?? 'pt-br';
  const t = MESSAGES[locale].app.finance.movimentacoesGenerator;

  // Abre a janela ANTES do await (gesto do usuário → driblar popup-blocker).
  const targetWindow = window.open('', '_blank');

  let totalEntradas = 0;
  let totalSaidas = 0;
  for (const r of rows) {
    if (r.type === 'entrada') totalEntradas += r.amount;
    else totalSaidas += r.amount;
  }
  const saldo = totalEntradas - totalSaidas;

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
  const registros = `${rows.length} ${rows.length !== 1 ? t.recordsPlural : t.records}`;
  doc.text(`${registros}  |  ${t.generatedAt}: ${formatGeneratedAt(locale, timezone)}`, pageWidth / 2, y, { align: 'center' });
  y += 8;

  // ===== Cards de totais (Entradas / Saídas / Saldo) =====
  const cardGap = 4;
  const cardWidth = (contentWidth - cardGap * 2) / 3;
  const cardHeight = 16;
  const cards: { label: string; value: string; color: [number, number, number] }[] = [
    { label: t.cardLabelEntradas, value: formatCurrencyBR(totalEntradas), color: [22, 163, 74] },
    { label: t.cardLabelSaidas, value: formatCurrencyBR(totalSaidas), color: [220, 38, 38] },
    {
      label: t.cardLabelSaldo,
      value: formatCurrencyBR(saldo),
      color: saldo > 0 ? [22, 163, 74] : saldo < 0 ? [220, 38, 38] : [31, 41, 55],
    },
  ];
  cards.forEach((card, i) => {
    const x = MARGIN + i * (cardWidth + cardGap);
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(229, 229, 229);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardWidth, cardHeight, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text(card.label, x + 4, y + 5.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...card.color);
    doc.text(card.value, x + 4, y + 12);
  });
  y += cardHeight + 6;

  // ===== Tabela paginada (autoTable repete o head em cada página A4) =====
  const body = rows.map((r) => {
    const sinal = r.type === 'entrada' ? '+ ' : '- ';
    return [
      formatDateBR(r.date),
      r.type === 'entrada' ? t.labelRevenue : t.labelExpense,
      r.description || '—',
      r.category || '—',
      r.account || '—',
      `${sinal}${formatCurrencyBR(r.amount)}`,
      r.isPaid ? t.labelPaid : t.labelPending,
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, bottom: 18 },
    head: [[t.colDate, t.colType, t.colDescription, t.colCategory, t.colAccount, t.colAmount, t.colStatus]],
    body: body.length > 0 ? body : [['', '', t.emptyPeriod, '', '', '', '']],
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 18 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 26 },
      4: { cellWidth: 26 },
      5: { cellWidth: 26, halign: 'right' },
      6: { cellWidth: 20, halign: 'center' },
    },
    // Pinta valores: receita verde, despesa vermelha.
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 5) {
        const raw = String(hookData.cell.raw ?? '');
        if (raw.startsWith('+')) hookData.cell.styles.textColor = [22, 163, 74];
        else if (raw.startsWith('-')) hookData.cell.styles.textColor = [220, 38, 38];
        hookData.cell.styles.fontStyle = 'bold';
      }
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
  const filename = `${slug}-${todayStamp(timezone)}`;

  const blob = doc.output('blob');
  openPdfInTab(blob, filename, targetWindow);
}
