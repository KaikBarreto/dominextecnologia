import { cashExportKindLabel, cashExportPaymentLabel } from './labels';
import { cashExportGroupOf } from './filters';
import type { CashExportItem, CashExportPayload, CashExportSession } from './types';

export interface CashExportMovementRow {
  sessionId: string;
  caixa: string;
  occurredAt: string;
  kindLabel: string;
  description: string;
  orderNumber: number | null;
  orderId: string | null;
  customer: string;
  salesperson: string;
  author: string;
  paymentLabel: string;
  /** Vazio quando a venda foi cancelada: o valor vai em `cancelledValue`. */
  entrada: number | null;
  saida: number | null;
  cancelledValue: number | null;
  affectsDrawer: boolean;
  isCancelled: boolean;
  cancelledReason: string;
  isSale: boolean;
  items: CashExportItem[];
}

export interface CashExportItemRow {
  sessionId: string;
  caixa: string;
  orderNumber: number | null;
  occurredAt: string;
  customer: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  isCancelled: boolean;
}

export function cashExportSessionLabel(session: CashExportSession): string {
  const operator = session.operatorName?.trim();
  return operator ? `${session.terminalName} - ${operator}` : session.terminalName;
}

export function buildMovementRows(session: CashExportSession): CashExportMovementRow[] {
  const caixa = cashExportSessionLabel(session);
  return [...session.entries]
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((entry) => ({
      sessionId: session.sessionId,
      caixa,
      occurredAt: entry.occurredAt,
      kindLabel: cashExportKindLabel(entry.kind),
      description: entry.description?.trim() || entry.notes?.trim() || cashExportKindLabel(entry.kind),
      orderNumber: entry.orderNumber,
      orderId: entry.orderId,
      customer: entry.customerName ?? '',
      salesperson: entry.salespersonName ?? '',
      author: entry.authorName ?? '',
      paymentLabel: entry.paymentMethod ? cashExportPaymentLabel(entry.paymentMethod) : '',
      entrada: !entry.isCancelled && entry.direction === 'in' ? entry.amount : null,
      saida: !entry.isCancelled && entry.direction === 'out' ? entry.amount : null,
      cancelledValue: entry.isCancelled ? entry.amount : null,
      affectsDrawer: entry.affectsDrawer && !entry.isClosingAdjustment,
      isCancelled: entry.isCancelled,
      cancelledReason: entry.cancelledReason ?? '',
      isSale: cashExportGroupOf(entry.kind) === 'sales',
      items: entry.isOrderPrimary ? entry.items : [],
    }));
}

export function buildAllMovementRows(payload: CashExportPayload): CashExportMovementRow[] {
  return payload.sessions.flatMap(buildMovementRows);
}

/** Uma linha por item; só a entrada primária da venda carrega itens, então nada duplica. */
export function buildAllItemRows(payload: CashExportPayload): CashExportItemRow[] {
  return payload.sessions.flatMap((session) => {
    const caixa = cashExportSessionLabel(session);
    return [...session.entries]
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .filter((entry) => entry.isOrderPrimary && entry.items.length > 0)
      .flatMap((entry) => entry.items.map((item) => ({
        sessionId: session.sessionId,
        caixa,
        orderNumber: entry.orderNumber,
        occurredAt: entry.occurredAt,
        customer: entry.customerName ?? '',
        name: item.name,
        unit: item.unit ?? '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        total: item.total,
        isCancelled: entry.isCancelled,
      })));
  });
}

/** Instante convertido para o "relógio de parede" do fuso, como Date UTC (planilha não tem fuso). */
export function toWallClockDate(value: string, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(value));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')));
}
