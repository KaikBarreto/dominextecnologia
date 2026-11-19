/** Formato do histórico detalhado de caixa (exportação PDF/Excel), já em camelCase. */

export interface CashExportItem {
  name: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface CashExportEntry {
  id: string;
  kind: string;
  direction: 'in' | 'out';
  /** Sempre positivo. */
  amount: number;
  signedAmount: number;
  occurredAt: string;
  paymentMethod: string | null;
  description: string | null;
  notes: string | null;
  authorName: string | null;
  affectsDrawer: boolean;
  isClosingAdjustment: boolean;
  orderId: string | null;
  orderNumber: number | null;
  orderStatus: string | null;
  orderTotal: number | null;
  customerName: string | null;
  salespersonName: string | null;
  isCancelled: boolean;
  cancelledReason: string | null;
  /** Só a entrada primária da venda carrega os itens (não somar duas vezes). */
  isOrderPrimary: boolean;
  items: CashExportItem[];
}

export interface CashExportPaymentTotal {
  paymentMethod: string;
  amount: number;
}

export interface CashExportSession {
  sessionId: string;
  terminalId: string | null;
  terminalName: string;
  openedBy: string | null;
  operatorName: string;
  closedBy: string | null;
  closedByName: string | null;
  openedAt: string;
  closedAt: string | null;
  status: string;
  wasReopened: boolean;
  cashAccountName: string | null;
  openingAmount: number;
  expectedAmount: number;
  countedAmount: number;
  difference: number;
  cashReceipts: number;
  cashPayments: number;
  supplies: number;
  withdrawals: number;
  refunds: number;
  finalPosition: number;
  notes: string | null;
  salesSummary: {
    ordersCount: number;
    cancelledOrdersCount: number;
    ordersTotal: number;
    byPaymentMethod: CashExportPaymentTotal[];
  };
  entries: CashExportEntry[];
}

export interface CashExportPayload {
  from: string | null;
  to: string | null;
  timezone: string | null;
  sessions: CashExportSession[];
}

export type CashExportMovementGroup =
  | 'sales'
  | 'cash_movements'
  | 'supplies'
  | 'withdrawals'
  | 'refunds'
  | 'closing_adjustments';

export interface CashExportFilters {
  groups: CashExportMovementGroup[];
  paymentMethods: string[];
  includeCancelled: boolean;
}
