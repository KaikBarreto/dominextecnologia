import type { PdvReceiptFormat, PdvReceiptSnapshot } from "./model";
import { formatReceiptMoney } from "./model";
import { safeTimeZone } from "@/lib/timezone";

export interface PdvReceiptLine {
  text: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  inverse?: boolean;
  size?: number;
  gapAfter?: number;
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
  const words = text.trim().split(/\s+/).filter(Boolean);
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

export function buildPdvReceiptLines(
  snapshot: PdvReceiptSnapshot,
  format: PdvReceiptFormat,
  options: { includeCompanyHeader?: boolean } = {},
): PdvReceiptLine[] {
  const width = maxChars[format];
  const isBudget = snapshot.documentKind === "budget";
  const hasPendingPrices = snapshot.items.some((item) => item.pricePending);
  const lines: PdvReceiptLine[] = [];
  if (options.includeCompanyHeader !== false) {
    lines.push({
      text: snapshot.company.name,
      align: "center",
      bold: true,
      size: 13,
    });
    if (snapshot.company.document)
      lines.push({ text: snapshot.company.document, align: "center" });
    if (snapshot.company.address)
      lines.push(
        ...wrap(snapshot.company.address, width).map((text) => ({
          text,
          align: "center" as const,
        })),
      );
    if (snapshot.company.phone)
      lines.push({
        text: snapshot.company.phone,
        align: "center",
        gapAfter: 2,
      });
  }
  lines.push(
    {
      text: isBudget ? "ORÇAMENTO DO BALCÃO" : "COMPROVANTE NÃO FISCAL",
      align: "center",
      bold: true,
      inverse: true,
      size: 9,
    },
    {
      text: `${isBudget ? "ORÇAMENTO" : "PEDIDO"} Nº ${snapshot.order.number}`,
      align: "center",
      bold: true,
      inverse: true,
      size: 13,
      gapAfter: 2,
    },
    {
      text: `Data: ${new Date(snapshot.order.issuedAt).toLocaleString("pt-BR", { timeZone: safeTimeZone(snapshot.company.timeZone) })}`,
    },
    { text: `Operador: ${snapshot.order.operatorName}` },
  );
  if (snapshot.order.terminalName)
    lines.push({ text: `Terminal: ${snapshot.order.terminalName}` });
  if (snapshot.order.customerName)
    lines.push({ text: `Cliente: ${snapshot.order.customerName}` });
  lines.push({
    text: "ITEM                         QTD.       TOTAL",
    bold: true,
    inverse: true,
    gapAfter: 1,
  });
  for (const item of snapshot.items) {
    lines.push(
      ...wrap(item.description, width).map((text, index) => ({
        text,
        bold: index === 0,
      })),
    );
    lines.push({
      text: item.pricePending
        ? `${item.quantity} ${item.unit} × preço a definir`
        : `${item.quantity} ${item.unit} × ${formatReceiptMoney(item.unitPrice)}   ${formatReceiptMoney(item.total)}`,
      align: "right",
    });
    if (item.discount > 0)
      lines.push({
        text: `Desconto do item: -${formatReceiptMoney(item.discount)}`,
        align: "right",
      });
  }
  lines.push(
    { text: "—".repeat(Math.min(width, 44)), gapAfter: 1 },
    {
      text: `Subtotal: ${formatReceiptMoney(snapshot.totals.subtotal)}`,
      align: "right",
    },
  );
  if (snapshot.totals.discount > 0)
    lines.push({
      text: `Desconto: -${formatReceiptMoney(snapshot.totals.discount)}`,
      align: "right",
    });
  lines.push({
    text: hasPendingPrices
      ? "TOTAL A DEFINIR"
      : `TOTAL  ${formatReceiptMoney(snapshot.totals.total)}`,
    align: "right",
    bold: true,
    inverse: true,
    size: 12,
    gapAfter: 2,
  });
  if (!isBudget) {
    lines.push({ text: "Pagamentos", bold: true });
    for (const payment of snapshot.payments) {
      const due = payment.dueDate
        ? ` · vence ${new Date(`${payment.dueDate}T12:00:00`).toLocaleDateString("pt-BR")}`
        : "";
      lines.push({
        text: `${payment.method}: ${formatReceiptMoney(payment.amount)}${due}`,
      });
    }
  }
  if (snapshot.fulfillment) {
    lines.push({
      text: `${snapshot.fulfillment.mode === "retirada" ? "Retirada" : "Entrega"}: ${snapshot.fulfillment.status}`,
      bold: true,
      gapAfter: 1,
    });
    if (snapshot.fulfillment.address)
      lines.push(
        ...wrap(snapshot.fulfillment.address, width).map((text) => ({ text })),
      );
  }
  if (snapshot.note)
    lines.push(
      ...wrap(`Observação: ${snapshot.note}`, width).map((text) => ({ text })),
    );
  lines.push(
    isBudget
      ? {
          text: "Este orçamento não registra pagamento nem movimenta o caixa.",
          align: "center",
          bold: true,
        }
      : {
          text: "Este documento não substitui nota fiscal.",
          align: "center",
          bold: true,
          gapAfter: 1,
        },
  );
  if (!isBudget)
    lines.push({
      text: "Reimpressão não altera pagamento, estoque ou saldo.",
      align: "center",
    });
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
