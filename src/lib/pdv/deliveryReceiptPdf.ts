import jsPDF from 'jspdf';
import { openPdfInTab } from '@/utils/openPdfInTab';
import type { PdvDeliveryReceipt } from '@/hooks/usePdvDispatch';

const PAGE_TOP_MM = 18;
const PAGE_BOTTOM_MM = 275;
const ITEM_LINE_HEIGHT_MM = 5;
const ITEM_GAP_MM = 2;
const PDF_SANS_FONT = 'helvetica';

export interface PdvDeliveryReceiptBlock {
  page: number;
  y: number;
  height: number;
  lines: string[];
  description: string;
}

/** Planeja os blocos antes de escrever, para nenhum texto nascer fora da página. */
export function planPdvDeliveryReceiptBlocks(
  items: PdvDeliveryReceipt['items'],
  startY: number,
  wrap: (text: string) => string[],
): { blocks: PdvDeliveryReceiptBlock[]; page: number; y: number } {
  let page = 1;
  let y = startY;
  const blocks = items.map((item) => {
    const description = `${item.description} — ${item.quantity} ${item.unit} (restante: ${item.remainingQuantity} ${item.unit})`;
    const lines = wrap(description);
    const height = lines.length * ITEM_LINE_HEIGHT_MM + ITEM_GAP_MM;
    if (y + height > PAGE_BOTTOM_MM) {
      page += 1;
      y = PAGE_TOP_MM;
    }
    const block = { page, y, height, lines, description };
    y += height;
    return block;
  });
  return { blocks, page, y };
}

export function generatePdvDeliveryReceiptPdf(snapshot: PdvDeliveryReceipt): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  let y = 18;
  doc.setFont(PDF_SANS_FONT, 'bold'); doc.setFontSize(16);
  doc.text('COMPROVANTE DE RETIRADA', 16, y); y += 7;
  doc.setFontSize(10); doc.text('NÃO FISCAL', 16, y); y += 10;
  doc.setFont(PDF_SANS_FONT, 'normal');
  doc.text(`Pedido #${snapshot.order.number}`, 16, y); y += 6;
  doc.text(`Retirada: ${new Date(snapshot.withdrawnAt).toLocaleString('pt-BR')}`, 16, y); y += 6;
  if (snapshot.customerName) { doc.text(`Cliente: ${snapshot.customerName}`, 16, y); y += 6; }
  if (snapshot.stockName) { doc.text(`Local: ${snapshot.stockName}`, 16, y); y += 8; }
  doc.setFont(PDF_SANS_FONT, 'bold'); doc.text('Itens retirados', 16, y); y += 6;
  doc.setFont(PDF_SANS_FONT, 'normal');
  const plan = planPdvDeliveryReceiptBlocks(
    snapshot.items,
    y,
    (text) => doc.splitTextToSize(text, 178) as string[],
  );
  let renderedPage = 1;
  for (const block of plan.blocks) {
    while (renderedPage < block.page) {
      doc.addPage();
      renderedPage += 1;
    }
    doc.text(block.lines, 16, block.y);
  }
  y = plan.y + 5;
  const noticeLines = doc.splitTextToSize(snapshot.notice, 178) as string[];
  const noticeHeight = noticeLines.length * ITEM_LINE_HEIGHT_MM;
  if (y + noticeHeight > PAGE_BOTTOM_MM) {
    doc.addPage();
    y = PAGE_TOP_MM;
  }
  doc.setFontSize(9); doc.setTextColor(90);
  doc.text(noticeLines, 16, y);
  return doc.output('blob');
}

export function previewPdvDeliveryReceipt(snapshot: PdvDeliveryReceipt, target?: Window | null) {
  openPdfInTab(generatePdvDeliveryReceiptPdf(snapshot), `retirada-pedido-${snapshot.order.number}.pdf`, target);
}
