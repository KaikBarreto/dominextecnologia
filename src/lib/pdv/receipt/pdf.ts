import { jsPDF } from 'jspdf';
import { autoTable, type UserOptions, type RowInput } from 'jspdf-autotable';
import { openPdfInTab } from '@/utils/openPdfInTab';
import { DOMINEX_LOGO_BLACK_BASE64 } from '@/utils/dominexLogoBase64';
import { buildPdvReceiptItemBlocks, buildPdvReceiptLines, getPdvReceiptItemColumnProportions, getPdvReceiptPaymentRows, fitPdvReceiptLogo, stackPdvReceiptItemColumns } from './layout';
import { formatReceiptMoney, getPdvReceiptApproval, getPdvReceiptCoverageLines, getPdvReceiptDocumentMetadata, getPdvReceiptNote, receiptFilename, type PdvReceiptFormat, type PdvReceiptSnapshot } from './model';
import { safeTimeZone } from '@/lib/timezone';

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
  const detailSize = format === 'a4' ? 9 : 8;
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
  doc.setTextColor(0);
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
    y = drawCompanyText(doc, snapshot, format, margin, y, contentWidth, 'left');
  } else {
    const logoBoxWidth = contentWidth * (format === 'a4' ? 0.24 : 0.3);
    const gap = format === 'a4' ? 6 : 3;
    const fitted = fitPdvReceiptLogo(logo.width, logo.height, logoBoxWidth, format === 'a4' ? 24 : 18);
    const infoX = margin + logoBoxWidth + gap;
    const textBottom = drawCompanyText(doc, snapshot, format, infoX, y, width - margin - infoX, 'left');
    const headerTop = y - 3;
    const headerHeight = Math.max(fitted.height, textBottom - headerTop);
    doc.addImage(logo.dataUrl, logo.type, margin, headerTop + (headerHeight - fitted.height) / 2, fitted.width, fitted.height, undefined, 'FAST');
    y = headerTop + headerHeight;
  }

  y += format === 'a4' ? 2 : 1.5;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(format === 'a4' ? 0.25 : 0.18);
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
  const logoWidth = format === 'a4' ? 22 : Math.min(18, (width - 2 * margin) * 0.55);
  const logoHeight = logoWidth / DOMINEX_LOGO_ASPECT;
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.25);
  doc.line(margin, y, width - margin, y);
  const logoY = y + (format === 'a4' ? 3 : 2.5);
  try {
    doc.addImage(DOMINEX_LOGO_BLACK_BASE64, 'PNG', (width - logoWidth) / 2, logoY, logoWidth, logoHeight, undefined, 'FAST');
  } catch { /* O endereço permanece mesmo se a imagem embutida falhar. */ }
  doc.setFont(PDF_SANS_FONT, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(0);
  doc.text('www.dominex.app', width / 2, logoY + logoHeight + 3, { align: 'center' });
}

/** Desenha e mede exatamente os mesmos blocos nos dois passes da impressão térmica. */
function renderStructuredReceipt(doc: jsPDF, snapshot: PdvReceiptSnapshot, format: PdvReceiptFormat): number {
  const isA4 = format === 'a4';
  const metadata = getPdvReceiptDocumentMetadata(snapshot);
  const { kind } = metadata;
  const isDelivery = kind === 'delivery';
  const isCommercial = !isDelivery;
  const width = widthMm[format];
  const margin = isA4 ? 16 : 4;
  const contentWidth = width - 2 * margin;
  const fontSize = isA4 ? 10 : format === '58mm' ? 8 : 9;
  const padding = isA4 ? 2.3 : 1.6;
  const gap = isA4 ? 3 : format === '58mm' ? 1.8 : 2.2;
  const sectionHeading = { fillColor: 0, textColor: 255, fontStyle: 'bold' as const, fontSize: isA4 ? 9 : format === '58mm' ? 6.8 : 8, cellPadding: padding, lineWidth: 0, lineColor: 0, halign: 'left' as const };
  const footerReserve = snapshot.company.whiteLabelEnabled ? 0 : isA4 ? 17 : 11;
  const pageBottom = doc.internal.pageSize.getHeight() - margin - footerReserve;
  let y = drawCompanyHeader(doc, snapshot, format, width, margin, isA4 ? 18 : 7);

  const table = (options: UserOptions) => {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, top: margin, bottom: margin + footerReserve },
      tableWidth: contentWidth,
      theme: 'plain',
      styles: { font: PDF_SANS_FONT, fontSize, textColor: 0, fillColor: 255, lineColor: 200, lineWidth: { bottom: 0.15 }, cellPadding: padding, overflow: 'linebreak', valign: 'middle' },
      headStyles: sectionHeading,
      alternateRowStyles: { fillColor: 255 },
      rowPageBreak: 'avoid',
      ...options,
      willDrawCell(data) {
        // Uma faixa única sob as células evita emendas claras de antialias entre retângulos pretos.
        if (data.column.index === 0 && data.cell.styles.fillColor === 0) {
          doc.setFillColor('#000000');
          doc.rect(data.cell.x, data.cell.y, typeof options.tableWidth === 'number' ? options.tableWidth : contentWidth, data.row.height, 'F');
        }
        return options.willDrawCell?.(data);
      },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + gap;
  };

  const issuedDate = new Date(isDelivery && snapshot.withdrawal ? snapshot.withdrawal.withdrawnAt : snapshot.order.issuedAt);
  const dateOptions = { timeZone: safeTimeZone(snapshot.company.timeZone) };
  const issuedAt = `${issuedDate.toLocaleDateString('pt-BR', dateOptions)}\n${issuedDate.toLocaleTimeString('pt-BR', { ...dateOptions, hour: '2-digit', minute: '2-digit' })}`;
  const title = isDelivery ? `${metadata.title}\nPEDIDO Nº ${snapshot.order.number}` : `${metadata.title} Nº ${snapshot.order.number}`;
  table({
    body: [[title]],
    styles: { font: PDF_SANS_FONT, fontSize: isA4 ? 21 : format === '58mm' ? 12 : 14, fontStyle: 'bold', textColor: 0, fillColor: 255, lineWidth: 0, cellPadding: {top:0,right:0,bottom:1,left:0}, overflow: 'linebreak' },
    pageBreak: 'avoid',
  });
  if (!isDelivery && snapshot.order.budgetNumber != null) {
    table({ body: [[`Origem: Orçamento Nº ${snapshot.order.budgetNumber}`]], styles: { font: PDF_SANS_FONT, fontSize: isA4 ? 9 : 8, textColor: 0, lineWidth: 0, cellPadding: 0 } });
  }
  // Uma moldura leve mantém o contexto unido; o título tem hierarquia própria.
  table({
    body: [
      [{ content: `Cliente: ${snapshot.order.customerName || 'Não informado'}`, colSpan: 2, styles: { fontStyle: 'bold' as const, fontSize: isA4 ? 10 : format === '58mm' ? 8 : 9 } }],
      [`Operador: ${(isDelivery ? snapshot.withdrawal?.operatorName : null) || snapshot.order.operatorName}${!isDelivery && snapshot.order.terminalName ? `\n${snapshot.order.terminalName}` : ''}`, issuedAt],
      ...(isDelivery && snapshot.withdrawal ? [[{ content: `Registro de retirada: ${snapshot.withdrawal.id}${snapshot.withdrawal.stockName ? `\nLocal: ${snapshot.withdrawal.stockName}` : ''}`, colSpan: 2 }]] : []),
    ],
    styles: { font: PDF_SANS_FONT, fontSize: isA4 ? 9 : 8, textColor: 0, fillColor: 255, lineColor: 130, lineWidth: 0.18, cellPadding: isA4 ? 2 : format === '58mm' ? 1.2 : 1.4, overflow: 'linebreak', halign: 'left', valign: 'middle' },
    columnStyles: { 0: { cellWidth: contentWidth * 0.65 }, 1: { cellWidth: contentWidth * 0.35, halign:'right' } },
    pageBreak: 'avoid',
  });
  const pendingPrices = snapshot.items.some(item => item.pricePending);
  const itemBlocks = buildPdvReceiptItemBlocks(snapshot);
  for (const block of itemBlocks) {
    if (stackPdvReceiptItemColumns(format, block)) {
      table({
        body: [
          [{ content: `${block.description}${block.discount ? `\n${block.discount}` : ''}`, colSpan: 2, styles: { fontStyle: 'bold', cellPadding: { top: 1, right: 0, bottom: 1, left: 0 } } }],
          ...block.columns.flatMap<RowInput>((column, index) => {
            doc.setFont(PDF_SANS_FONT, column.label === 'TOTAL' ? 'bold' : 'normal'); doc.setFontSize(fontSize);
            const valueStyles = { halign: 'right' as const, fontStyle: column.label === 'TOTAL' ? 'bold' as const : 'normal' as const, ...(index === block.columns.length - 1 ? { lineWidth: { bottom: 0.15 } } : {}) };
            return doc.getTextWidth(column.value) > contentWidth * 0.65
              ? [[{content:column.label,colSpan:2}], [{content:column.value,colSpan:2,styles:valueStyles}]]
              : [[{content:column.label,styles:{fontStyle:column.label==='TOTAL'?'bold' as const:'normal' as const}}, {content:column.value,styles:valueStyles}]];
          }),
        ],
        styles: { font: PDF_SANS_FONT, fontSize, textColor: 0, fillColor: 255, lineWidth: 0, lineColor: 130, cellPadding: { top: 0.4, right: 0, bottom: 0.6, left: 0 }, overflow: 'linebreak' },
        columnStyles: { 0: { cellWidth: contentWidth * 0.35 }, 1: { cellWidth: contentWidth * 0.65 } },
        pageBreak: 'avoid',
      });
      continue;
    }
    const count = block.columns.length;
    const proportions = getPdvReceiptItemColumnProportions(format,count);
    table({
      body: [
        [{ content: `${block.description}${block.discount ? `\n${block.discount}` : ''}`, colSpan: count, styles: { fontStyle:'bold',halign:'left',cellPadding:{top:1,right:0,bottom:1,left:0} } }],
        block.columns.map((column,index) => ({ content:column.label, styles:{fontSize:8,textColor:0,halign:index===0?'left' as const:'right' as const,cellPadding:{top:0,right:index<count-1?1.2:0,bottom:0.3,left:0}} })),
        block.columns.map((column,index) => ({ content:column.value,styles:{halign:index===0?'left' as const:'right' as const,fontStyle:column.label==='TOTAL'?'bold' as const:'normal' as const,lineWidth:{bottom:0.15},cellPadding:{top:0,right:index<count-1?1.2:0,bottom:isA4?2:1.3,left:0}} })),
      ],
      styles: {font:PDF_SANS_FONT,fontSize,textColor:0,fillColor:255,lineColor:210,lineWidth:0,cellPadding:0,overflow:'linebreak',valign:'middle'},
      columnStyles:Object.fromEntries(proportions.map((proportion,index)=>[index,{cellWidth:contentWidth*proportion}])),
      pageBreak:'avoid',
      didParseCell(data){
        if(data.row.index!==2)return;
        const text=block.columns[data.column.index]?.value??'';
        const available=contentWidth*proportions[data.column.index]-(data.column.index<count-1?1.2:0);
        doc.setFont(PDF_SANS_FONT,data.cell.styles.fontStyle);
        let size=data.cell.styles.fontSize;doc.setFontSize(size);
        while(size>8 && doc.getTextWidth(text)>available){size-=0.25;doc.setFontSize(size);}
        data.cell.styles.fontSize=size;
      },
    });
  }
  if (isDelivery && !itemBlocks.length) table({ body: [['Nenhum item retirado informado neste documento.']] });

  if (isCommercial) {
  const summaryWidth = isA4 ? 72 : contentWidth;
  const valueFraction = format === '58mm' ? 0.68 : 0.58;
  doc.setFont(PDF_SANS_FONT, 'bold'); doc.setFontSize(isA4 ? 13 : 10);
  const summaryEntries = [
    ['Subtotal', formatReceiptMoney(snapshot.totals.subtotal)],
    ...(snapshot.totals.discount > 0 ? [['Descontos', `-${formatReceiptMoney(snapshot.totals.discount)}`]] : []),
    [pendingPrices ? 'TOTAL A DEFINIR' : 'TOTAL', pendingPrices ? '—' : formatReceiptMoney(snapshot.totals.total)],
  ];
  const wideSummary = summaryEntries.some(([,value]) => doc.getTextWidth(value) > summaryWidth*valueFraction-2*padding-0.3);
  table({
    tableWidth:summaryWidth,
    margin:{left:width-margin-summaryWidth,right:margin,top:margin,bottom:margin+footerReserve},
    body: wideSummary ? summaryEntries.flatMap<RowInput>(([label,value],index) => {
      const total = index === summaryEntries.length-1;
      const styles = total ? { ...sectionHeading, fontSize:isA4?13:10 } : {cellPadding:{top:1,right:padding,bottom:1,left:padding}};
      return [[{content:label,colSpan:2,styles}], [{content:value,colSpan:2,styles:{...styles,halign:'right' as const}}]];
    }) : [
      ['Subtotal', formatReceiptMoney(snapshot.totals.subtotal)],
      ...(snapshot.totals.discount > 0 ? [['Descontos', `-${formatReceiptMoney(snapshot.totals.discount)}`]] : []),
      [
        { content: pendingPrices ? 'TOTAL A DEFINIR' : 'TOTAL', styles: { ...sectionHeading, fontSize: isA4 ? 13 : 10 } },
        { content: pendingPrices ? '—' : formatReceiptMoney(snapshot.totals.total), styles: { ...sectionHeading, halign: 'right', fontSize: isA4 ? 13 : 10 } },
      ],
    ],
    columnStyles: { 0: { cellWidth: summaryWidth * (1-valueFraction) }, 1: { cellWidth: summaryWidth * valueFraction, halign: 'right' } },
    didParseCell(data) {
      if(wideSummary || data.column.index!==1)return;
      const text=data.cell.text.join(' ');doc.setFont(PDF_SANS_FONT,data.cell.styles.fontStyle);
      let size=data.cell.styles.fontSize;doc.setFontSize(size);
      const available=summaryWidth*valueFraction-2*padding-0.3;
      while(size>8 && doc.getTextWidth(text)>available){size-=0.25;doc.setFontSize(size);}
      data.cell.styles.fontSize=size;
    },
  });

  }

  const paymentRows = getPdvReceiptPaymentRows(snapshot);
  if (paymentRows.length) {
    table({
      body: [
        [{ content: 'Formas de Pagamento:', styles: { fontStyle: 'bold' } }],
        ...paymentRows.map(payment => [{ content: [payment.text, ...(payment.due ? [payment.due] : [])].join('\n') }]),
      ],
      styles: { font: PDF_SANS_FONT, fontSize, textColor: 0, fillColor: 255, lineWidth: 0, halign: 'left', cellPadding: { top: 0, right: 0, bottom: isA4 ? 1.5 : 1.2, left: 0 }, overflow: 'linebreak' },
      pageBreak: 'avoid',
      didParseCell(data) {
        if (data.row.index === 0) return;
        const text = paymentRows[data.row.index - 1].text;
        doc.setFont(PDF_SANS_FONT, 'normal');
        doc.setFontSize(data.cell.styles.fontSize);
        if (doc.getTextWidth(text) > contentWidth) {
          const payment = paymentRows[data.row.index - 1];
          data.cell.text = [`${payment.label}:`, formatReceiptMoney(payment.amount), ...(payment.due ? [payment.due] : [])];
        }
      },
    });
  }
  const details: string[] = [];
  if (kind === 'pickup' && (!paymentRows.length || !snapshot.coverage)) {
    details.push(...getPdvReceiptCoverageLines(snapshot).filter(text => !text.startsWith('Fiado aprovado:') || (snapshot.coverage?.approvedCreditAmount ?? 0) > 0));
  }


  // A nota pertence à loja; avisos padrão repetidos pelo caller ficam somente no rodapé.
  const note = getPdvReceiptNote(snapshot);
  if (note) details.push(`Observações: ${note}`);
  if (details.length) {
    table({
      body: details.map(detail => [detail]),
      styles: { font: PDF_SANS_FONT, fontSize, textColor: 0, fillColor: 255, lineWidth: 0, cellPadding: { top: 0, right: padding, bottom: isA4 ? 2 : 1.5, left: padding }, overflow: 'linebreak', valign: 'top' },
    });
  }

  if (isDelivery) {
    table({
      body: [
        [snapshot.withdrawal?.receivedBy ? `Recebido por: ${snapshot.withdrawal.receivedBy}` : `Recebido por: ${'_'.repeat(format === '58mm' ? 20 : 32)}`],
        [`Assinatura: ${'_'.repeat(format === '58mm' ? 24 : 36)}`],
      ],
      styles: { font: PDF_SANS_FONT, fontSize, textColor: 0, lineWidth: 0, cellPadding: { top: isA4 ? 4 : 3, right: padding, bottom: isA4 ? 4 : 3, left: padding }, overflow: 'linebreak' },
      pageBreak: 'avoid',
    });
  }
  const approval = getPdvReceiptApproval(snapshot);
  if (approval) {
    const stampSize = isA4 ? 12 : format === '58mm' ? 9 : 10;
    doc.setFont(PDF_SANS_FONT,'bold');doc.setFontSize(stampSize);
    const stampWidth = Math.min(contentWidth,Math.max(isA4 ? 30 : 24,doc.getTextWidth(approval)+7));
    table({
      body: [[approval]],
      tableWidth: stampWidth,
      margin: { left: (width - stampWidth) / 2, right: (width - stampWidth) / 2, top: margin, bottom: margin + footerReserve },
      styles: { font: PDF_SANS_FONT, fontSize:stampSize, fontStyle: 'bold', textColor: 0, fillColor: 255, lineColor: 0, lineWidth:0.35,cellPadding:isA4?2:1.5, halign: 'center', overflow: 'linebreak' },
      pageBreak: 'avoid',
    });
  }

  if (!snapshot.company.whiteLabelEnabled) {
    if (isA4 && y + 14 > pageBottom) { doc.addPage(); y = margin; }
    drawDominexFooter(doc, format, width, margin, isA4 ? doc.internal.pageSize.getHeight() - margin - 11 : y);
    y += 11;
  }
  return y + margin;
}

export function generatePdvReceiptPdf(snapshot: PdvReceiptSnapshot, format: PdvReceiptFormat, options: { copies?: 1 | 2 | 3 } = {}): Blob {
  const width = widthMm[format];
  let height = 297;
  if (format !== 'a4') {
    // A folha longa de medição impede que a paginação A4 altere a altura térmica calculada.
    const measuringDoc = new jsPDF({ unit: 'mm', format: [width, 5000], orientation: 'portrait' });
    const contentHeight = renderStructuredReceipt(measuringDoc, snapshot, format) + 1;
    // PDF limita cada folha a 5,08 m. Acima disso, mantém páginas sucessivas sem perder o início.
    height = measuringDoc.getNumberOfPages() > 1 ? 5000 : Math.max(80, contentHeight);
  }
  const doc = new jsPDF({ unit: 'mm', format: format === 'a4' ? 'a4' : [width, height], orientation: 'portrait', compress: true });
  const copies = options.copies === 2 || options.copies === 3 ? options.copies : 1;
  for (let copy = 0; copy < copies; copy += 1) {
    if (copy > 0) doc.addPage(format === 'a4' ? 'a4' : [width, height], 'portrait');
    renderStructuredReceipt(doc, snapshot, format);
  }
  return doc.output('blob');
}

/** Mede com a fonte real do PDF: quebra automática sem medir altura cortava as faixas e o rodapé. */
export function planPdvReceiptPdfRows(snapshot: PdvReceiptSnapshot, format: PdvReceiptFormat) {
  const measure = new jsPDF({ unit: 'mm', format: 'a4' });
  const contentWidth = widthMm[format] - 2 * (format === 'a4' ? 16 : 4);
  return buildPdvReceiptLines(snapshot, format, { includeCompanyHeader: false }).flatMap((line) => {
    const size = line.size ?? (format === 'a4' ? 10 : 8.5);
    const padding = line.inverse ? 1 : 0.5;
    const rule = /^—+$/.test(line.text);
    measure.setFont(PDF_SANS_FONT, line.bold ? 'bold' : 'normal');
    measure.setFontSize(size);
    const text = line.text.startsWith('ITEM ') ? 'MATERIAL / QTD. / VALOR' : line.text;
    const wrapped: string[] = rule ? [''] : measure.splitTextToSize(text, contentWidth);
    return wrapped.map((text, index) => ({
      text, size, padding, rule,
      inverse: line.inverse === true,
      bold: line.bold === true,
      align: line.align ?? 'left' as const,
      height: rule ? 3 : size * 0.46 + padding * 2,
      gapAfter: index === wrapped.length - 1 ? line.gapAfter ?? 0 : 0,
    }));
  });
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

export function previewPdvReceiptPdf(snapshot: PdvReceiptSnapshot, format: PdvReceiptFormat, targetWindow?: Window | null, options: { copies?: 1 | 2 | 3 } = {}) {
  const blob = generatePdvReceiptPdf(snapshot, format, options);
  openPdfInTab(blob, receiptFilename(snapshot, format), targetWindow);
}
