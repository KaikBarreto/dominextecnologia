export type PdvReceiptFormat = "a4" | "58mm" | "80mm";
export type PdvReceiptDocumentKind = "sale" | "budget" | "pickup" | "delivery";

export interface PdvReceiptSnapshot {
  /** Ausente preserva o comprovante de venda legado. */
  documentKind?: PdvReceiptDocumentKind;
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
    budgetNumber?: number | string | null;
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
  /** Valores confirmados pelo pedido, nunca calculados a partir de formas de pagamento. */
  coverage?: {
    paidAmount: number;
    approvedCreditAmount: number;
    status?: "paid" | "credit_approved" | "mixed";
  } | null;
  /** Evento persistido de retirada. Não usa as quantidades comerciais como quantidade entregue. */
  withdrawal?: {
    id: string;
    withdrawnAt: string;
    stockName?: string | null;
    receivedBy?: string | null;
    operatorName?: string | null;
    items: Array<{
      description: string;
      unit: string;
      quantity: number;
      remainingQuantity: number;
    }>;
  } | null;
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
  const title = getPdvReceiptDocumentMetadata(snapshot).filename;
  return `${title} ${number}${customer ? ` - ${customer}` : ""}`;
}

/** Contrato compartilhado por impressão e prévia; ausência do tipo mantém a venda legada. */
export function getPdvReceiptDocumentMetadata(snapshot: PdvReceiptSnapshot) {
  const kind = snapshot.documentKind ?? "sale";
  const documents = {
    sale: {
      title: "PEDIDO",
      numberLabel: "PEDIDO",
      itemHeading: "MATERIAIS DA VENDA",
      instruction: "",
      notice: "Este documento não substitui nota fiscal.",
      filename: "Comprovante de Venda",
    },
    budget: {
      title: "ORÇAMENTO",
      numberLabel: "ORÇAMENTO",
      itemHeading: "ITENS PARA CONFERÊNCIA NO CAIXA",
      instruction: "",
      notice: "Este orçamento não registra pagamento nem autoriza retirada.",
      filename: "Orçamento",
    },
    pickup: {
      title: "PEDIDO",
      numberLabel: "PEDIDO",
      itemHeading: "ITENS DO PEDIDO PARA RETIRADA",
      instruction: "",
      notice: "A retirada será registrada na entrega dos itens. Este pedido não comprova recebimento.",
      filename: "Pedido para Retirada",
    },
    delivery: {
      title: "COMPROVANTE DE RETIRADA",
      numberLabel: "PEDIDO",
      itemHeading: "ITENS RETIRADOS NESTA ENTREGA",
      instruction: "",
      notice: "Este documento comprova somente os itens retirados nesta entrega. Não substitui nota fiscal.",
      filename: "Comprovante de Retirada",
    },
  } as const;
  return { kind, ...documents[kind] };
}

export function getPdvReceiptWithdrawalItems(snapshot: PdvReceiptSnapshot) {
  return snapshot.withdrawal?.items.filter(item => Number.isFinite(item.quantity) && item.quantity > 0) ?? [];
}

/** Não infere aprovação de crédito a partir de pagamentos ou do total comercial. */
export function getPdvReceiptCoverageLines(snapshot: PdvReceiptSnapshot): string[] {
  if (!snapshot.coverage) return ["Cobertura não informada. Confirme os dados no caixa."];
  return [
    `Pago: ${formatReceiptMoney(snapshot.coverage.paidAmount)}`,
    `Fiado aprovado: ${formatReceiptMoney(snapshot.coverage.approvedCreditAmount)}`,
  ];
}

export function getPdvReceiptNote(snapshot: PdvReceiptSnapshot): string | null {
  return snapshot.note?.replace(/Comprovante não fiscal(?: de retirada)?\.?/gi, "").replace(/Reimpressão não altera pagamento, estoque ou saldo\.?/gi, "").replace(/Reimprimir não altera estoque ou pagamento\.?/gi, "").trim() || null;
}

/** Carimbo somente com cobertura explícita: crédito aprovado nunca é rotulado como pago. */
export function getPdvReceiptApproval(snapshot: PdvReceiptSnapshot): 'PAGO' | 'FIADO APROVADO' | 'APROVADO' | null {
  if ((snapshot.documentKind ?? 'sale') !== 'pickup' && (snapshot.documentKind ?? 'sale') !== 'sale') return null;
  if (!snapshot.coverage || !Number.isFinite(snapshot.coverage.paidAmount) || !Number.isFinite(snapshot.coverage.approvedCreditAmount) || !Number.isFinite(snapshot.totals.total) || snapshot.totals.total <= 0) return null;
  const paid = toReceiptCents(snapshot.coverage.paidAmount);
  const credit = toReceiptCents(snapshot.coverage.approvedCreditAmount);
  const total = toReceiptCents(snapshot.totals.total);
  if (paid < 0 || credit < 0 || paid + credit < total) return null;
  if (paid >= total && credit === 0) return 'PAGO';
  return paid === 0 && credit >= total ? 'FIADO APROVADO' : 'APROVADO';
}
