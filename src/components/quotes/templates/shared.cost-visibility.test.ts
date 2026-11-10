import { describe, expect, it } from 'vitest';

import type { QuoteItem } from '@/hooks/useQuotes';
import { getProposalItemCostDetails } from './shared';

const item: QuoteItem = {
  id: 'service-1',
  position: 0,
  item_type: 'servico',
  description: 'Higienização',
  quantity: 1,
  unit_price: 500,
  total_price: 500,
  unit_labor_cost: 180,
  unit_materials_cost: 75,
};

const money = (value: number) => `R$ ${value.toFixed(2)}`;

describe('visibilidade da composição na proposta', () => {
  it('não expõe custos quando os toggles estão desligados ou ausentes', () => {
    expect(getProposalItemCostDetails({}, item, money, 'pt-br')).toEqual([]);
    expect(getProposalItemCostDetails({
      show_labor_cost_in_proposal: false,
      show_inputs_cost_in_proposal: false,
    }, item, money, 'pt-br')).toEqual([]);
  });

  it('expõe apenas as categorias autorizadas pelo orçamento', () => {
    expect(getProposalItemCostDetails({
      show_labor_cost_in_proposal: true,
      show_inputs_cost_in_proposal: false,
    }, item, money, 'pt-br')).toEqual([
      { label: 'Mão de obra / un.', value: 'R$ 180.00' },
    ]);

    expect(getProposalItemCostDetails({
      show_labor_cost_in_proposal: true,
      show_inputs_cost_in_proposal: true,
    }, item, money, 'pt-br')).toEqual([
      { label: 'Mão de obra / un.', value: 'R$ 180.00' },
      { label: 'Insumos / un.', value: 'R$ 75.00' },
    ]);
  });

  it('nunca exibe a composição interna em itens de material externo', () => {
    expect(getProposalItemCostDetails({
      show_labor_cost_in_proposal: true,
      show_inputs_cost_in_proposal: true,
    }, { ...item, item_type: 'material' }, money, 'pt-br')).toEqual([]);
  });
});
