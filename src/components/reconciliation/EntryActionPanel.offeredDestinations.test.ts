import { describe, it, expect } from 'vitest';
import { getOfferedDestinations } from './EntryActionPanel';

/**
 * A invariante que não pode quebrar (briefing 2026-10-18, conciliação de
 * fatura de cartão): no modo `'card'`, "dar baixa", "transferência" e
 * "criar lançamento comum" NÃO EXISTEM — as RPCs recusam, e oferecer
 * qualquer um deles na tela é dar ao cliente um botão que erra no clique.
 * Compra de cartão nunca é paga individualmente; só a FATURA quita.
 *
 * `getOfferedDestinations` é a função que a tela usa de verdade pra decidir
 * quais botões/modos aparecem (ver `CardIdleDestinations` e o `idle` de
 * banco em `EntryActionPanel.tsx`) — este teste não é um espelho que pode
 * divergir, é a prova de que o código real respeita a regra.
 */
describe('getOfferedDestinations', () => {
  it('modo cartão, DÉBITO (compra): oferece lançar compra, nunca dar baixa/transferência/criar/vale', () => {
    const destinations = getOfferedDestinations('card', false);
    expect(destinations).toContain('card_purchase_create');
    expect(destinations).not.toContain('settle');
    expect(destinations).not.toContain('transfer');
    expect(destinations).not.toContain('create');
    expect(destinations).not.toContain('employee_vale');
    expect(destinations).not.toContain('card_bill');
    expect(destinations).not.toContain('card_payment_pay');
  });

  it('modo cartão, CRÉDITO (pagamento/estorno): oferece pagamento da fatura, nunca dar baixa/transferência/criar/vale', () => {
    const destinations = getOfferedDestinations('card', true);
    expect(destinations).toContain('card_payment_pay');
    expect(destinations).not.toContain('settle');
    expect(destinations).not.toContain('transfer');
    expect(destinations).not.toContain('create');
    expect(destinations).not.toContain('employee_vale');
    expect(destinations).not.toContain('card_bill');
    expect(destinations).not.toContain('card_purchase_create');
  });

  it('modo cartão, nos dois sinais: busca, inverter sinal e ignorar continuam disponíveis', () => {
    for (const isCredit of [true, false]) {
      const destinations = getOfferedDestinations('card', isCredit);
      expect(destinations).toContain('search');
      expect(destinations).toContain('flip_sign');
      expect(destinations).toContain('ignore');
    }
  });

  it('modo banco, SAÍDA: nada muda em relação a hoje — settle/create/transfer/cardBill/vale continuam todos oferecidos', () => {
    const destinations = getOfferedDestinations('bank', false);
    expect(destinations).toEqual(
      expect.arrayContaining(['settle', 'create', 'transfer', 'card_bill', 'employee_vale', 'search', 'flip_sign', 'ignore']),
    );
    expect(destinations).not.toContain('card_purchase_create');
    expect(destinations).not.toContain('card_payment_pay');
  });

  it('modo banco, ENTRADA: nada muda em relação a hoje — cardBill e vale continuam escondidos, o resto continua oferecido', () => {
    const destinations = getOfferedDestinations('bank', true);
    expect(destinations).toEqual(expect.arrayContaining(['settle', 'create', 'transfer', 'search', 'flip_sign', 'ignore']));
    expect(destinations).not.toContain('card_bill');
    expect(destinations).not.toContain('employee_vale');
    expect(destinations).not.toContain('card_purchase_create');
    expect(destinations).not.toContain('card_payment_pay');
  });

  it('os dois modos nunca oferecem o par inverso ao mesmo tempo (compra x pagamento de fatura)', () => {
    for (const isCredit of [true, false]) {
      const destinations = getOfferedDestinations('card', isCredit);
      const hasBoth = destinations.includes('card_purchase_create') && destinations.includes('card_payment_pay');
      expect(hasBoth).toBe(false);
    }
  });
});
