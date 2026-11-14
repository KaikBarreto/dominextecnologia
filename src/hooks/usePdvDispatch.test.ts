import { describe, expect, it } from 'vitest';
import { buildPdvDispatchRpcArgs, projectPdvDeliveryReceipt, projectPdvDispatchDetail, projectPdvDispatchQueue, stablePdvAttempt } from './usePdvDispatch';

describe('W3 expedição sem dados financeiros', () => {
  it('remove totais, pagamentos e campos desconhecidos da fila e detalhe', () => {
    const queue = projectPdvDispatchQueue([{ id: 'o1', number: 9, recipient_name: 'Cliente Exemplo', stock_id: 's1', stock_name: 'Loja', status: 'liberado_retirada', released_at: '2026-11-07T10:00:00Z', remaining_items: 2, total: 999, payments: ['pix'] }]);
    const detail = projectPdvDispatchDetail({ order: { id: 'o1', number: 9, status: 'liberado_retirada', total: 999, customer: { id: 'c1', name: 'Cliente Exemplo' }, stock: { id: 's1', name: 'Loja' } }, items: [{ id: 'i1', description: 'Argamassa', item_type: 'material', unit: 'sc', ordered_quantity: 10, delivered_quantity: 4, remaining_quantity: 6, unit_price: 80, reservations: [{ id: 'r1', stock_id: 's1', available_quantity: 6, has_conflict: false }] }] });
    expect(queue[0]).not.toHaveProperty('total');
    expect(queue[0]).not.toHaveProperty('payments');
    expect(detail.order).not.toHaveProperty('total');
    expect(detail.items[0]).not.toHaveProperty('unit_price');
  });

  it('preserva o snapshot imutável da retirada sem valores', () => {
    const receipt = projectPdvDeliveryReceipt({ kind: 'withdrawal_non_fiscal', delivery_id: 'd1', withdrawn_at: '2026-11-07T10:00:00Z', order: { id: 'o1', number: 9, status: 'retirada_parcial' }, items: [{ description: 'Argamassa', unit: 'sc', quantity: 2, remaining_quantity: 4, amount: 160 }], notice: 'Comprovante não fiscal.' });
    expect(receipt.items[0]).toEqual({ description: 'Argamassa', unit: 'sc', quantity: 2, remainingQuantity: 4 });
    expect(receipt.items[0]).not.toHaveProperty('amount');
  });

  it('mantém a chave no retry e cria outra quando a retirada parcial muda', () => {
    const first = stablePdvAttempt(null, 'i1:2', () => 'attempt-1');
    expect(stablePdvAttempt(first, 'i1:2', () => 'não-usar')).toBe(first);
    expect(stablePdvAttempt(first, 'i1:3', () => 'attempt-2')).toEqual({ signature: 'i1:3', id: 'attempt-2' });
    expect(buildPdvDispatchRpcArgs({ orderId: 'o1', attemptId: first.id, lines: [{ orderItemId: 'i1', reservationId: 'r1', quantity: 2 }] })).toEqual({ p_order_id: 'o1', p_lines: [{ order_item_id: 'i1', reservation_id: 'r1', quantity: 2 }], p_idempotency_key: 'attempt-1' });
  });
});
