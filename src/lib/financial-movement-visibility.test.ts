import { describe, expect, it } from 'vitest';
import { filterFinancialMovementVisibility } from './financial-movement-visibility';

const transactions = [
  { id: 'bank', account_id: 'bank-account', credit_card_bill_date: null },
  { id: 'card-a', account_id: 'card-account-a', credit_card_bill_date: '2026-09-30' },
  { id: 'card-b', account_id: 'card-account-b', credit_card_bill_date: '2026-09-30' },
];

describe('filterFinancialMovementVisibility', () => {
  it('esconde compras no cartão na visão geral quando a preferência está desligada', () => {
    expect(filterFinancialMovementVisibility(transactions, true, []).map((t) => t.id))
      .toEqual(['bank']);
  });

  it('mostra as compras do cartão escolhido explicitamente no filtro de conta', () => {
    expect(filterFinancialMovementVisibility(transactions, true, ['card-account-a']).map((t) => t.id))
      .toEqual(['bank', 'card-a']);
  });

  it('mantém todas as compras quando a preferência está ligada', () => {
    expect(filterFinancialMovementVisibility(transactions, false, []).map((t) => t.id))
      .toEqual(['bank', 'card-a', 'card-b']);
  });
});
