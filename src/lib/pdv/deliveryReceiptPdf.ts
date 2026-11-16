import { openPdfInTab } from '@/utils/openPdfInTab';
import { generatePdvReceiptPdf } from './receipt/pdf';
import type { PdvReceiptFormat, PdvReceiptSnapshot } from './receipt/model';
import type { PdvDeliveryReceipt } from '@/hooks/usePdvDispatch';

const PAGE_TOP_MM = 18;
const PAGE_BOTTOM_MM = 275;
const ITEM_LINE_HEIGHT_MM = 5;
const ITEM_GAP_MM = 2;

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

export interface PdvDeliveryReceiptPdfOptions {
  format?: PdvReceiptFormat;
  company?: PdvReceiptSnapshot['company'];
  receivedBy?: string | null;
  operatorName?: string | null;
  copies?: 1 | 2 | 3;
}

/** A origem é o evento de retirada persistido; nenhum valor ou quantidade comercial é reconstruído. */
export function toPdvDeliveryReceiptSnapshot(
  snapshot: PdvDeliveryReceipt,
  options: PdvDeliveryReceiptPdfOptions = {},
): PdvReceiptSnapshot {
  const operatorName = snapshot.operatorName || options.operatorName || 'Não informado';
  return {
    documentKind: 'delivery',
    company: options.company ?? { name: 'Retirada de materiais', whiteLabelEnabled: false },
    order: {
      number: snapshot.order.number,
      issuedAt: snapshot.withdrawnAt,
      customerName: snapshot.customerName,
      operatorName,
    },
    items: [],
    totals: { subtotal: 0, discount: 0, total: 0 },
    payments: [],
    withdrawal: {
      id: snapshot.deliveryId,
      withdrawnAt: snapshot.withdrawnAt,
      stockName: snapshot.stockName,
      receivedBy: options.receivedBy,
      operatorName,
      items: snapshot.items.map(item => ({ ...item })),
    },
    note: snapshot.notice,
  };
}

export function generatePdvDeliveryReceiptPdf(snapshot: PdvDeliveryReceipt, options: PdvDeliveryReceiptPdfOptions = {}): Blob {
  return generatePdvReceiptPdf(toPdvDeliveryReceiptSnapshot(snapshot, options), options.format ?? 'a4', { copies: options.copies });
}

export function previewPdvDeliveryReceipt(snapshot: PdvDeliveryReceipt, target?: Window | null, options: PdvDeliveryReceiptPdfOptions = {}) {
  openPdfInTab(generatePdvDeliveryReceiptPdf(snapshot, options), `Comprovante de Retirada ${snapshot.order.number}`, target);
}
