import { describe, expect, it } from 'vitest';
import {
  buildPdvCoverageRpcArgs,
  buildPdvWorkflowSaveArgs,
  mapPdvCounterError,
  projectPdvCashQueue,
  projectPdvCounterCapability,
  projectPdvWorkflowSettings,
} from './usePdvCounterFlow';

describe('W3 fluxo balcão', () => {
  it('falha fechado quando a capacidade está ausente ou simples', () => {
    expect(projectPdvCounterCapability({})).toEqual({ mode: 'simples', fulfillmentMode: 'dispatch', counterEnabled: false, dispatchEnabled: false, cashierDeliveryEnabled: false });
    expect(projectPdvCounterCapability({ mode: 'simples', fulfillment_mode: 'cashier', counter_enabled: true, dispatch_enabled: true, cashier_delivery_enabled: true })).toEqual({ mode: 'simples', fulfillmentMode: 'cashier', counterEnabled: false, dispatchEnabled: false, cashierDeliveryEnabled: false });
  });

  it('separa entrega no caixa da expedição sem confiar apenas no modo balcão', () => {
    expect(projectPdvCounterCapability({ mode: 'balcao', fulfillment_mode: 'cashier', counter_enabled: true, dispatch_enabled: true, cashier_delivery_enabled: true })).toEqual({ mode: 'balcao', fulfillmentMode: 'cashier', counterEnabled: true, dispatchEnabled: false, cashierDeliveryEnabled: true });
    expect(projectPdvCounterCapability({ mode: 'balcao', fulfillment_mode: 'dispatch', counter_enabled: true, dispatch_enabled: true, cashier_delivery_enabled: true })).toEqual({ mode: 'balcao', fulfillmentMode: 'dispatch', counterEnabled: true, dispatchEnabled: true, cashierDeliveryEnabled: false });
  });

  it('projeta e envia somente a configuração allowlisted do fluxo', () => {
    expect(projectPdvWorkflowSettings({ pdv_mode: 'balcao', fulfillment_mode: 'cashier', secret: 'não pode sair' })).toEqual({ pdvMode: 'balcao', fulfillmentMode: 'cashier' });
    expect(buildPdvWorkflowSaveArgs({ pdvMode: 'balcao', fulfillmentMode: 'dispatch' })).toEqual({ p_pdv_mode: 'balcao', p_fulfillment_mode: 'dispatch' });
  });

  it('explica quando atendimentos em andamento bloqueiam a mudança', () => {
    expect(mapPdvCounterError({ code: '23514', details: 'code=pdv_counter_active_dispatch_blocks_cashier' }).message).toBe('Conclua as retiradas em andamento antes de entregar diretamente no caixa.');
  });

  it('projeta somente pedidos válidos aguardando cobertura', () => {
    expect(projectPdvCashQueue([{ id: 'o1', number: 7, stock_id: 's1', total: '123.45', status: 'aguardando_pagamento', reservation_ready: true, secret: 'não pode sair' }, { id: 'o2', stock_id: 's1', status: 'entregue' }])).toEqual([expect.objectContaining({ id: 'o1', number: 7, total: 123.45, reservationReady: true })]);
  });

  it('envia somente a cobertura allowlisted e remove troco/campos sensíveis', () => {
    const args = buildPdvCoverageRpcArgs({ orderId: 'o1', terminalId: 't1', cashSessionId: 's1', cashAccountId: 'a1', attemptId: 'same-attempt', payments: [{ method: 'dinheiro', amount: 50, change_amount: 10, card_token: 'segredo' } as never] });
    expect(args).toEqual({ p_order_id: 'o1', p_terminal_id: 't1', p_cash_session_id: 's1', p_cash_account_id: 'a1', p_payments: [{ method: 'dinheiro', amount: 50 }], p_idempotency_key: 'same-attempt' });
  });
});
