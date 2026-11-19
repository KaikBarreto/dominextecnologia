import type { CashExportEntry, CashExportPayload, CashExportSession } from './types';

/** Dados INVENTADOS para teste. Nada aqui vem de cliente real. */
export function makeEntry(over: Partial<CashExportEntry>): CashExportEntry {
  return {
    id: 'e-' + Math.random().toString(36).slice(2, 8),
    kind: 'sale_payment',
    direction: 'in',
    amount: 0,
    signedAmount: 0,
    occurredAt: '2026-11-10T13:00:00+00:00',
    paymentMethod: null,
    description: null,
    notes: null,
    authorName: 'Ana',
    affectsDrawer: false,
    isClosingAdjustment: false,
    orderId: null,
    orderNumber: null,
    orderStatus: null,
    orderTotal: null,
    customerName: null,
    salespersonName: null,
    isCancelled: false,
    cancelledReason: null,
    isOrderPrimary: false,
    items: [],
    ...over,
  };
}

export function makeSession(over: Partial<CashExportSession> = {}): CashExportSession {
  const entries = [
    makeEntry({ id: 'open', kind: 'opening', amount: 100, signedAmount: 100, affectsDrawer: true, description: 'Abertura' }),
    // Venda 1: dois pagamentos (pix 60 + dinheiro 40); itens só na primária (pix)
    makeEntry({
      id: 's1a', amount: 60, signedAmount: 60, paymentMethod: 'pix', orderId: 'o1', orderNumber: 1, orderTotal: 100,
      occurredAt: '2026-11-10T13:05:00+00:00', description: 'Venda direta PDV nº 1', customerName: 'Cliente Teste',
      salespersonName: 'Ana', isOrderPrimary: true,
      items: [
        { name: 'Filtro de ar', unit: 'un', quantity: 2, unitPrice: 30, discount: 0, total: 60 },
        { name: 'Gás R410A', unit: 'kg', quantity: 0.5, unitPrice: 80, discount: 0, total: 40 },
      ],
    }),
    makeEntry({
      id: 's1b', amount: 40, signedAmount: 40, paymentMethod: 'dinheiro', affectsDrawer: true, orderId: 'o1', orderNumber: 1,
      orderTotal: 100, occurredAt: '2026-11-10T13:05:01+00:00', description: 'Venda direta PDV nº 1',
      customerName: 'Cliente Teste', salespersonName: 'Ana',
    }),
    // Venda 2 no fiado
    makeEntry({
      id: 's2', amount: 50, signedAmount: 50, paymentMethod: 'fiado', orderId: 'o2', orderNumber: 2, orderTotal: 50,
      occurredAt: '2026-11-10T14:00:00+00:00', isOrderPrimary: true, description: 'Venda direta PDV nº 2',
      items: [{ name: 'Capacitor', unit: 'un', quantity: 1, unitPrice: 50, discount: 0, total: 50 }],
    }),
    // Venda 3 cancelada no pix
    makeEntry({
      id: 's3', amount: 36, signedAmount: 36, paymentMethod: 'pix', orderId: 'o3', orderNumber: 3, orderTotal: 36,
      occurredAt: '2026-11-10T15:00:00+00:00', isOrderPrimary: true, isCancelled: true, orderStatus: 'cancelado',
      cancelledReason: 'Cliente desistiu', description: 'Venda direta PDV nº 3',
      items: [{ name: 'Fita isolante', unit: 'un', quantity: 3, unitPrice: 12, discount: 0, total: 36 }],
    }),
    makeEntry({ id: 'sup', kind: 'supply', amount: 20, signedAmount: 20, affectsDrawer: true, paymentMethod: 'dinheiro', occurredAt: '2026-11-10T16:00:00+00:00', description: 'Troco' }),
    makeEntry({ id: 'wd', kind: 'withdrawal', direction: 'out', amount: 30, signedAmount: -30, affectsDrawer: true, paymentMethod: 'dinheiro', occurredAt: '2026-11-10T17:00:00+00:00', description: 'Sangria' }),
    makeEntry({ id: 'sh', kind: 'shortage', direction: 'out', amount: 5, signedAmount: -5, affectsDrawer: true, isClosingAdjustment: true, occurredAt: '2026-11-10T21:00:00+00:00', description: 'Falta de caixa' }),
  ];
  return {
    sessionId: 'sess-1',
    terminalId: 't1',
    terminalName: 'Caixa principal',
    openedBy: 'u1',
    operatorName: 'Ana Souza',
    closedBy: 'u1',
    closedByName: 'Ana Souza',
    openedAt: '2026-11-10T12:00:00+00:00',
    closedAt: '2026-11-10T21:00:00+00:00',
    status: 'fechada',
    wasReopened: false,
    cashAccountName: 'Caixa',
    openingAmount: 100,
    expectedAmount: 130,
    countedAmount: 125,
    difference: -5,
    cashReceipts: 40,
    cashPayments: 0,
    supplies: 20,
    withdrawals: 30,
    refunds: 0,
    finalPosition: 0,
    notes: null,
    salesSummary: { ordersCount: 2, cancelledOrdersCount: 1, ordersTotal: 150, byPaymentMethod: [] },
    entries,
    ...over,
  };
}

export function makePayload(sessions: CashExportSession[] = [makeSession()]): CashExportPayload {
  return { from: '2026-11-01', to: '2026-11-30', timezone: 'America/Sao_Paulo', sessions };
}
