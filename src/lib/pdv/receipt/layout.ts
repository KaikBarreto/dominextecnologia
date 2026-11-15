import type { PdvReceiptFormat, PdvReceiptSnapshot } from "./model";
import { formatReceiptMoney, getPdvReceiptApproval, getPdvReceiptCoverageLines, getPdvReceiptDocumentMetadata, getPdvReceiptNote, getPdvReceiptWithdrawalItems } from "./model";
import { safeTimeZone } from "@/lib/timezone";

export interface PdvReceiptLine {
  text: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  inverse?: boolean;
  size?: number;
  gapAfter?: number;
}

/** Mantém cada cobertura persistida separada, com vocabulário legível no documento. */
export function getPdvReceiptPaymentRows(snapshot: PdvReceiptSnapshot) {
  const kind = snapshot.documentKind ?? 'sale';
  if (kind !== 'sale' && kind !== 'pickup') return [];
  const labels: Record<string, string> = {
    dinheiro: 'Dinheiro', cash: 'Dinheiro', pix: 'Pix', transferencia: 'Transferência',
    debito: 'Cartão de débito', cartao_debito: 'Cartão de débito', 'cartao de debito': 'Cartão de débito',
    credito: 'Cartão de crédito', cartao_credito: 'Cartão de crédito', 'cartao de credito': 'Cartão de crédito',
    fiado: 'Fiado', saldo_cliente: 'Saldo do cliente', saldo: 'Saldo do cliente', voucher: 'Voucher',
  };
  return snapshot.payments.filter(payment => Number.isFinite(payment.amount) && payment.amount > 0).map(payment => {
    const key = payment.method.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const label = labels[key] ?? 'Outro meio';
    return {
      label, amount: payment.amount,
      text: `${label}: ${formatReceiptMoney(payment.amount)}`,
      due: payment.dueDate ? `Vence ${new Date(`${payment.dueDate}T12:00:00`).toLocaleDateString('pt-BR')}` : key === 'fiado' ? 'Sem vencimento' : null,
    };
  });
}

export type PdvReceiptLogoPlacement = "stacked" | "inline";

export function getPdvReceiptLogoPlacement(
  width: number,
  height: number,
): PdvReceiptLogoPlacement {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return "inline";
  return width / height > 2.2 ? "stacked" : "inline";
}

export function fitPdvReceiptLogo(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (
    ![width, height, maxWidth, maxHeight].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return { width: width * scale, height: height * scale };
}

const maxChars: Record<PdvReceiptFormat, number> = {
  a4: 82,
  "58mm": 31,
  "80mm": 44,
};

function wrap(text: string, limit: number): string[] {
  const words = text.trim().split(/[ \t\r\n]+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= limit) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export interface PdvReceiptItemBlock {
  description: string;
  discount?: string;
  columns: Array<{ label: string; value: string; amount?: number }>;
}

/** Valores extensos ganham linhas próprias no térmico, em vez de microtexto. */
export function stackPdvReceiptItemColumns(format: PdvReceiptFormat, block: PdvReceiptItemBlock): boolean {
  if (format === 'a4') return false;
  const moneyLimit = format === '58mm' ? 11 : 15;
  const quantityLimit = format === '58mm' ? 9 : 13;
  return block.columns.some(column => column.value.length > (column.amount == null ? quantityLimit : moneyLimit));
}

export function getPdvReceiptItemColumnProportions(format: PdvReceiptFormat, count: number): number[] {
  return count === 2 ? [0.5,0.5] : format === 'a4' ? [0.3,0.35,0.35] : format === '58mm' ? [0.22,0.38,0.4] : [0.25,0.35,0.4];
}

/** Material ocupa toda a primeira linha; medidas e valores ficam na linha seguinte. */
export function buildPdvReceiptItemBlocks(snapshot: PdvReceiptSnapshot): PdvReceiptItemBlock[] {
  const quantity = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  if (snapshot.documentKind === 'delivery') return getPdvReceiptWithdrawalItems(snapshot).map(item => ({
    description: item.description,
    columns: [
      { label: 'RETIRADO', value: `${quantity(item.quantity)} ${item.unit}` },
      { label: 'RESTANTE', value: `${quantity(item.remainingQuantity)} ${item.unit}` },
    ],
  }));
  return snapshot.items.map(item => ({
    description: item.description,
    ...(item.discount > 0 ? { discount: `Desconto: -${formatReceiptMoney(item.discount)}` } : {}),
    columns: [
      { label: 'QTD.', value: `${quantity(item.quantity)} ${item.unit}` },
      { label: 'UNITÁRIO', value: item.pricePending ? 'A definir' : formatReceiptMoney(item.unitPrice), ...(!item.pricePending ? { amount: item.unitPrice } : {}) },
      { label: 'TOTAL', value: item.pricePending ? 'A definir' : formatReceiptMoney(item.total), ...(!item.pricePending ? { amount: item.total } : {}) },
    ],
  }));
}

export function buildPdvReceiptLines(
  snapshot: PdvReceiptSnapshot,
  format: PdvReceiptFormat,
  options: { includeCompanyHeader?: boolean } = {},
): PdvReceiptLine[] {
  const width = maxChars[format];
  const metadata = getPdvReceiptDocumentMetadata(snapshot);
  const { kind } = metadata;
  const isDelivery = kind === "delivery";
  const isCommercial = !isDelivery;
  const hasPendingPrices = snapshot.items.some((item) => item.pricePending);
  const lines: PdvReceiptLine[] = [];
  const addText = (text: string, bold = false) => lines.push(...wrap(text, width).map(text => ({ text, bold })));
  if (options.includeCompanyHeader !== false) {
    addText(snapshot.company.name, true);
    if (snapshot.company.document) addText(snapshot.company.document);
    if (snapshot.company.address) addText(snapshot.company.address);
    if (snapshot.company.phone) addText(snapshot.company.phone);
  }
  lines.push(
    { text: isDelivery ? metadata.title : `${metadata.title} Nº ${snapshot.order.number}`, bold: true, inverse: kind !== "budget", size: kind === "sale" ? 9 : 12 },
    ...(isDelivery ? [{ text: `${metadata.numberLabel} Nº ${snapshot.order.number}`, bold: true, size: 13, gapAfter: 2 }] : []),
    { text: `Data: ${new Date(isDelivery && snapshot.withdrawal ? snapshot.withdrawal.withdrawnAt : snapshot.order.issuedAt).toLocaleString("pt-BR", { timeZone: safeTimeZone(snapshot.company.timeZone) })}` },
    { text: `Operador: ${(isDelivery ? snapshot.withdrawal?.operatorName : null) || snapshot.order.operatorName}` },
  );
  if (snapshot.order.terminalName && !isDelivery) addText(`Terminal: ${snapshot.order.terminalName}`);
  if (snapshot.order.customerName) addText(`Cliente: ${snapshot.order.customerName}`);
  if (isDelivery && snapshot.withdrawal) {
    addText(`Retirada: ${snapshot.withdrawal.id}`);
    if (snapshot.withdrawal.stockName) addText(`Local: ${snapshot.withdrawal.stockName}`);
  }
  if (metadata.instruction) addText(metadata.instruction, true);
  lines.push({ text: metadata.itemHeading, bold: true, inverse: true, gapAfter: 1 });
  if (isDelivery) {
    const items = getPdvReceiptWithdrawalItems(snapshot);
    for (const item of items) {
      addText(item.description, true);
      addText(`Retirado: ${item.quantity} ${item.unit} · Restante: ${item.remainingQuantity} ${item.unit}`);
    }
    if (!items.length) addText("Nenhum item retirado informado neste documento.");
    addText(snapshot.withdrawal?.receivedBy ? `Recebido por: ${snapshot.withdrawal.receivedBy}` : "Recebido por: __________________________");
    addText("Assinatura: __________________________");
  } else {
    if (isCommercial) lines.push({ text: "ITEM                         QTD.       TOTAL", bold: true, inverse: true });
    for (const item of snapshot.items) {
      addText(item.description, true);
      if (isCommercial) {
        lines.push({
          text: item.pricePending ? `${item.quantity} ${item.unit} × preço a definir` : `${item.quantity} ${item.unit} × ${formatReceiptMoney(item.unitPrice)}   ${formatReceiptMoney(item.total)}`,
          align: "right",
        });
        if (item.discount > 0) lines.push({ text: `Desconto do item: -${formatReceiptMoney(item.discount)}`, align: "right" });
      } else addText(`Quantidade: ${item.quantity} ${item.unit}`);
    }
    if (isCommercial) {
      lines.push(
        { text: "—".repeat(Math.min(width, 44)), gapAfter: 1 },
        { text: `Subtotal: ${formatReceiptMoney(snapshot.totals.subtotal)}`, align: "right" },
      );
      if (snapshot.totals.discount > 0) lines.push({ text: `Desconto: -${formatReceiptMoney(snapshot.totals.discount)}`, align: "right" });
      lines.push({ text: hasPendingPrices ? "TOTAL A DEFINIR" : `TOTAL  ${formatReceiptMoney(snapshot.totals.total)}`, align: "right", bold: true, inverse: true, size: 12, gapAfter: 2 });
    } else addText(`Valor do pedido: ${formatReceiptMoney(snapshot.totals.total)}`);
  }
  const paymentRows = getPdvReceiptPaymentRows(snapshot);
  if (paymentRows.length) {
    lines.push({ text: 'Formas de Pagamento:', bold: true, align: 'left' });
    for (const payment of paymentRows) {
      lines.push({ text: payment.text, align: 'left' });
      if (payment.due) lines.push({ text: payment.due, align: 'left' });
    }
  }
  const note = getPdvReceiptNote(snapshot);
  if (note) addText(`Observação: ${note}`);
  if (kind === "pickup" && (!paymentRows.length || !snapshot.coverage)) {
    for (const text of getPdvReceiptCoverageLines(snapshot).filter(text => !text.startsWith('Fiado aprovado:') || (snapshot.coverage?.approvedCreditAmount ?? 0) > 0)) addText(text);
  }
  const approval = getPdvReceiptApproval(snapshot);
  if (approval) lines.push({ text: approval, bold: true, size: 18, align: "center" });
  return lines;
}

export function measurePdvReceiptHeight(
  lines: PdvReceiptLine[],
  extraHeightMm = 0,
): number {
  return Math.max(
    40,
    12 +
      lines.reduce(
        (height, line) =>
          height + (line.size ?? 9) * 0.42 + (line.gapAfter ?? 0),
        0,
      ) +
      12 +
      Math.max(0, extraHeightMm),
  );
}
