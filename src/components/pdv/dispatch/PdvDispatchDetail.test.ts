import { describe, expect, it } from 'vitest';
import { hasPdvDispatchConflict, shouldShowPdvDispatchActions } from './dispatchRules';
import type { PdvDispatchDetail as Detail } from '@/hooks/usePdvDispatch';

function item(overrides: Partial<Detail['items'][number]>): Detail['items'][number] {
  return {
    id: 'item-1',
    description: 'Cimento',
    itemType: 'material',
    unit: 'sc',
    orderedQuantity: 2,
    deliveredQuantity: 0,
    remainingQuantity: 2,
    reservations: [{ id: 'reservation-1', stockId: 'stock-1', availableQuantity: 2, hasConflict: false }],
    ...overrides,
  };
}

describe('conflito da expedição', () => {
  it('ignora material já totalmente entregue sem reserva e libera os demais itens', () => {
    expect(hasPdvDispatchConflict([
      item({ id: 'completed', deliveredQuantity: 2, remainingQuantity: 0, reservations: [] }),
      item({ id: 'pending' }),
    ])).toBe(false);
  });

  it('continua bloqueando material pendente sem reserva válida', () => {
    expect(hasPdvDispatchConflict([
      item({ id: 'pending', reservations: [] }),
    ])).toBe(true);
  });

  it('oculta ações de retirada depois que o pedido foi entregue', () => {
    expect(shouldShowPdvDispatchActions('entregue')).toBe(false);
    expect(shouldShowPdvDispatchActions('liberado_retirada')).toBe(true);
    expect(shouldShowPdvDispatchActions('retirada_parcial')).toBe(true);
  });
});
