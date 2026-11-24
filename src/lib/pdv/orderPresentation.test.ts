import { describe, expect, it } from 'vitest';
import { pdvOrderCurrentState, pdvOrderHasSeparatePickup } from './orderPresentation';
const paid = { commercialStatus: 'pago', paymentStatus: 'pago', pickupStatus: 'aguardando_liberacao' };
describe('estado atual único do pedido', () => {
  it('não inventa retirada pendente para um legado pago', () => {
    expect(pdvOrderCurrentState(paid).label).toBe('Pago');
    expect(pdvOrderHasSeparatePickup(paid)).toBe(false);
  });
  it.each([
    [{ commercialStatus: 'cancelado', pickupStatus: 'entregue' }, 'Cancelado'],
    [{ commercialStatus: 'cancelado_parcial' }, 'Cancelado parcialmente'],
    [{ paymentStatus: 'cancelado' }, 'Pagamento cancelado'],
    [{ paymentStatus: 'reembolsado', pickupStatus: 'entregue' }, 'Reembolsado'],
    [{ paymentStatus: 'reembolso_parcial' }, 'Reembolso parcial'],
    [{ pickupStatus: 'parcial' }, 'Retirada parcial'],
    [{ pickupStatus: 'entregue' }, 'Entregue'],
    [{ pickupStatus: 'liberado', paymentStatus: 'fiado_aprovado' }, 'Aguardando retirada'],
    [{ paymentStatus: 'fiado_aprovado' }, 'Fiado aprovado'],
    [{ paymentStatus: 'parcial', commercialStatus: 'aguardando_pagamento' }, 'Pagamento parcial'],
    [{ paymentStatus: 'aguardando', commercialStatus: 'aguardando_pagamento' }, 'Aguardando pagamento'],
  ])('mantém a prioridade operacional em %j', (overrides, label) => {
    expect(pdvOrderCurrentState({ ...paid, ...overrides }).label).toBe(label);
  });
  it('reconhece a retirada quando existe etapa explícita', () => {
    expect(pdvOrderHasSeparatePickup({ ...paid, pickupStatus: 'liberado' })).toBe(true);
  });
});
