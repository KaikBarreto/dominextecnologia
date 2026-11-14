export type PdvReceiptFormat = "a4" | "58mm" | "80mm";

export interface PdvReceiptSnapshot {
  /** Ausente preserva o comprovante de venda legado. */
  documentKind?: "sale" | "budget";
  company: {
    name: string;
    document?: string | null;
    address?: string | null;
    phone?: string | null;
    logoDataUrl?: string | null;
    logoUrl?: string | null;
    timeZone?: string | null;
    whiteLabelEnabled: boolean;
  };
  order: {
    number: number | string;
    issuedAt: string;
    operatorName: string;
    terminalName?: string | null;
    customerName?: string | null;
  };
  items: Array<{
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    total: number;
    pricePending?: boolean;
  }>;
  totals: { subtotal: number; discount: number; total: number };
  payments: Array<{
    method: string;
    amount: number;
    dueDate?: string | null;
  }>;
  fulfillment?: {
    mode: "retirada" | "entrega";
    status: string;
    address?: string | null;
  } | null;
  note?: string | null;
}

export interface PdvReceiptSettings {
  defaultFormat: PdvReceiptFormat;
  autoPrint: boolean;
  copies: 1 | 2 | 3;
}

export const DEFAULT_PDV_RECEIPT_SETTINGS: PdvReceiptSettings = {
  defaultFormat: "80mm",
  autoPrint: false,
  copies: 1,
};

export function toReceiptCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100);
}

export function formatReceiptMoney(
  value: number,
  locale = "pt-BR",
  currency = "BRL",
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    toReceiptCents(value) / 100,
  );
}

export function receiptFilename(
  snapshot: PdvReceiptSnapshot,
  _format: PdvReceiptFormat,
): string {
  const number = String(snapshot.order.number).trim();
  const customer = snapshot.order.customerName?.trim();
  return `Comprovante de Venda ${number}${customer ? ` - ${customer}` : ""}`;
}
