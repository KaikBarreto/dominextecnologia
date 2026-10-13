import { describe, expect, it } from 'vitest';
import { filterInventoryForCustomer, type CustomerInventoryItem } from './useCustomerStock';

function material(id: string, customerId: string | null): CustomerInventoryItem {
  return {
    id,
    company_id: 'company-1',
    name: id,
    customer_id: customerId,
  } as CustomerInventoryItem;
}

describe('filterInventoryForCustomer', () => {
  it('mantém somente materiais próprios do cliente', () => {
    const items = [
      material('general', null),
      material('material-a', 'customer-a'),
      material('material-b', 'customer-b'),
    ];

    expect(filterInventoryForCustomer(items, 'customer-a').map((item) => item.id)).toEqual([
      'material-a',
    ]);
  });
});
