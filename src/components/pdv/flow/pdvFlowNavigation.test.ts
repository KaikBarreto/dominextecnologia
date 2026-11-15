import { describe, expect, it } from 'vitest';
import type { PdvSalesFlowCardModel } from '@/hooks/usePdvSalesFlow';
import { pdvFlowCardDestination } from './pdvFlowNavigation';

const card: PdvSalesFlowCardModel = {
  flowId: 'flow-1', preorderId: 'budget-42', preorderNumber: 42, orderId: 'order-11', orderNumber: 11,
  stage: 'cash', customerName: 'Cliente fictício', stockName: 'Loja', total: null, itemCount: 2,
  remainingItems: 1, updatedAt: '2026-11-14T10:00:00Z', canSeeAmount: false, fulfillmentMode: 'dispatch',
};
const all = { pdv: true, orders: true, dispatch: true };

describe('destino do atendimento no fluxo do balcão', () => {
  it('mantém orçamento e pedido com IDs e números independentes', () => {
    expect(pdvFlowCardDestination({ ...card, stage: 'draft', orderId: null }, all)).toBe('/pdv/pre-pedidos?orcamento=budget-42');
    expect(pdvFlowCardDestination(card, all)).toBe('/pdv?fila=1&pedido=order-11');
  });

  it('abre o pedido em consulta quando não pode receber no caixa', () => {
    expect(pdvFlowCardDestination(card, { ...all, pdv: false })).toBe('/pdv/pedidos?pedido=order-11');
  });

  it.each(['pickup', 'partial'] as const)('abre %s na retirada somente com acesso à expedição', stage => {
    expect(pdvFlowCardDestination({ ...card, stage }, all)).toBe('/pdv/expedicao?pedido=order-11');
    expect(pdvFlowCardDestination({ ...card, stage }, { ...all, dispatch: false })).toBe('/pdv/pedidos?pedido=order-11');
  });

  it('expedição exclusiva consulta concluído na própria expedição, sem abrir financeiro', () => {
    const dispatchOnly = { pdv: false, orders: false, dispatch: true };
    expect(pdvFlowCardDestination({ ...card, stage: 'completed' }, dispatchOnly)).toBe('/pdv/expedicao?pedido=order-11');
    expect(pdvFlowCardDestination(card, dispatchOnly)).toBeNull();
    expect(pdvFlowCardDestination({ ...card, stage: 'draft' }, dispatchOnly)).toBeNull();
  });

  it('em duas etapas consulta pedido concluído sem criar retirada', () => {
    expect(pdvFlowCardDestination({ ...card, stage: 'completed', fulfillmentMode: 'cashier' }, all)).toBe('/pdv/pedidos?pedido=order-11');
  });

  it('não cria navegação para tela que o perfil não pode abrir', () => {
    expect(pdvFlowCardDestination(card, { pdv: false, orders: false, dispatch: false })).toBeNull();
  });
});
