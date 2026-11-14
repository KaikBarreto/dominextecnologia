import { describe, expect, it } from 'vitest';
import {
  buildPdvReturnRpcArgs,
  calculatePdvReturnTotal,
  derivePdvReturnsAccess,
  isPdvReturnsFeatureEnabled,
  mapPdvReturnError,
  projectPdvReturnContext,
  projectPdvReturnableOrder,
  stablePdvReturnAttempt,
} from './usePdvReturns';

describe('W5 devoluções comerciais', () => {
  const returnable = projectPdvReturnableOrder({
    order_id: 'order-1', number: 42, customer_id: 'customer-1', cmv_total: 999,
    items: [{ delivery_item_id: 'delivery-1', order_item_id: 'item-1', description: 'Cimento', item_type: 'material', delivered_quantity: 4, returnable_quantity: 3, commercial_amount: 200, unit_cost: 25 }],
    stocks: [{ stock_id: 'stock-sale', name: 'Loja', destination: 'saleable' }, { stock_id: 'stock-quarantine', name: 'Quarentena', destination: 'quarantine' }],
  });

  it('projeta somente fatias entregues e limita a quantidade ao saldo devolvível', () => {
    expect(returnable.items[0]).toMatchObject({ deliveryItemId: 'delivery-1', deliveredQuantity: 4, returnableQuantity: 3 });
    expect(calculatePdvReturnTotal(returnable.items, { 'delivery-1': 2 })).toBe(100);
    expect(calculatePdvReturnTotal(returnable.items, { 'delivery-1': 99 })).toBe(150);
    expect(returnable).not.toHaveProperty('cmv_total');
    expect(returnable.items[0]).not.toHaveProperty('unit_cost');
  });

  it('envia destino, disposição e data sem custo/CMV no payload', () => {
    const args = buildPdvReturnRpcArgs({
      orderId: 'order-1', occurredOn: '2026-11-06', reason: 'Material não utilizado', attemptId: 'attempt-1',
      lines: [
        { deliveryItemId: 'delivery-1', quantity: 1, destination: 'quarantine', destinationStockId: 'stock-quarantine' },
        { deliveryItemId: 'delivery-2', quantity: 1, destination: 'none' },
      ],
      dispositions: [
        { kind: 'receivable_reduction', amount: 25, receivableTransactionId: 'receivable-1' },
        { kind: 'customer_credit', amount: 25 },
      ],
    });
    expect(args).toMatchObject({ p_occurred_on: '2026-11-06', p_idempotency_key: 'attempt-1' });
    expect(JSON.stringify(args)).toContain('quarantine');
    expect(JSON.stringify(args)).toContain('receivable_reduction');
    expect(JSON.stringify(args)).not.toMatch(/cmv|cost_price|unit_cost|unit_price/i);
  });

  it('mantém a chave no retry idêntico e renova quando a intenção muda', () => {
    const first = stablePdvReturnAttempt(null, 'same', () => 'attempt-1');
    expect(stablePdvReturnAttempt(first, 'same', () => 'unused')).toBe(first);
    expect(stablePdvReturnAttempt(first, 'changed', () => 'attempt-2')).toEqual({ signature: 'changed', id: 'attempt-2' });
  });

  it('fecha feature e permissões por padrão, inclusive backdate', () => {
    expect(isPdvReturnsFeatureEnabled({ enabled: false, company_allowlist: ['company-1'] }, 'company-1')).toBe(true);
    expect(isPdvReturnsFeatureEnabled({ enabled: false, company_allowlist: [] }, 'company-1')).toBe(false);
    expect(derivePdvReturnsAccess({ featureEnabled: false, privileged: true, hasPermissionRecord: true, permissions: ['*'] })).toEqual({ enabled: false, canReturn: false, canReverse: false, canCancelResidual: false, canBackdate: false });
    expect(derivePdvReturnsAccess({ featureEnabled: true, privileged: false, hasPermissionRecord: true, permissions: ['fn:return_pdv_order'] })).toEqual({ enabled: true, canReturn: true, canReverse: false, canCancelResidual: false, canBackdate: false });
  });

  it('projeta histórico e recebíveis sem campos financeiros sensíveis', () => {
    const context = projectPdvReturnContext({ order_id: 'order-1', customer_id: 'customer-1', history: [{ id: 'ret-1', event_kind: 'return', occurred_on: '2026-11-07', reason: 'Sobra', commercial_total: -50, item_count: 1, quantity: 1, can_reverse: true, cmv_total: -30 }], receivables: [{ id: 'recv-1', description: 'Fiado', due_date: '2026-11-20', open_amount: 50, credit_limit: 1000 }] });
    expect(context.history[0]).toMatchObject({ eventKind: 'return', canReverse: true, commercialTotal: -50 });
    expect(context.receivables[0]).toMatchObject({ openAmount: 50 });
    expect(context.history[0]).not.toHaveProperty('cmv_total');
    expect(context.receivables[0]).not.toHaveProperty('credit_limit');
  });

  it('mapeia conflitos e permissões para PT-BR sem vazar códigos internos', () => {
    expect(mapPdvReturnError({ code: '23514', details: 'code=pdv_return_quantity_exceeded' }).message).toMatch(/quantidade entregue mudou/i);
    expect(mapPdvReturnError({ code: '42501', details: 'code=pdv_return_permission_denied' }).message).toBe('Seu perfil não permite realizar esta ação.');
    expect(mapPdvReturnError({ code: '23514', details: 'code=pdv_cancel_financial_disposition_required' }).message).toMatch(/tratamento financeiro/i);
  });
});
