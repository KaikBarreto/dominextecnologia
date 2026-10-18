import { describe, expect, it } from 'vitest';
import {
  calculateServiceOrderBudgetTotals,
  serviceOrderBudgetSignature,
  toServiceOrderBudgetPayload,
  type ServiceOrderBudgetItem,
} from './serviceOrderBudget';

const items: ServiceOrderBudgetItem[] = [
  {
    position: 9,
    item_type: 'servico',
    description: ' Limpeza split ',
    details: ' Completa ',
    quantity: 3,
    unit_price: 380,
    total_price: 1,
    service_type_id: 'service-1',
  },
  {
    position: 2,
    item_type: 'material',
    description: 'Filtro',
    quantity: 2.5,
    unit_price: 19.99,
    total_price: 0,
    inventory_id: 'inventory-1',
  },
];

describe('serviceOrderBudget', () => {
  it('calcula serviços, materiais e total sem confiar em total_price', () => {
    expect(calculateServiceOrderBudgetTotals(items)).toEqual({
      services: 1140,
      materials: 49.98,
      total: 1189.98,
    });
  });

  it('normaliza posição, textos e vínculos opcionais para a RPC', () => {
    expect(toServiceOrderBudgetPayload(items)).toEqual([
      {
        position: 0,
        item_type: 'servico',
        description: 'Limpeza split',
        details: 'Completa',
        quantity: 3,
        unit_price: 380,
        inventory_id: null,
        service_type_id: 'service-1',
        source_quote_item_id: null,
      },
      {
        position: 1,
        item_type: 'material',
        description: 'Filtro',
        details: null,
        quantity: 2.5,
        unit_price: 19.99,
        inventory_id: 'inventory-1',
        service_type_id: null,
        source_quote_item_id: null,
      },
    ]);
  });

  it('gera assinatura estável e sensível a alterações comerciais', () => {
    expect(serviceOrderBudgetSignature(items)).toBe(serviceOrderBudgetSignature(items.map(i => ({ ...i }))));
    expect(serviceOrderBudgetSignature(items)).not.toBe(
      serviceOrderBudgetSignature([{ ...items[0], quantity: 4 }, items[1]]),
    );
  });
});
