import { describe, expect, it } from 'vitest';
import { buildReceivableChargeRequests } from './finance-installment-charges';

describe('buildReceivableChargeRequests', () => {
  it('liga cada cobrança à conta a receber da mesma parcela', () => {
    const requests = buildReceivableChargeRequests({
      transactionIds: ['receivable-1', 'receivable-2', 'receivable-3', 'receivable-4'],
      plan: [
        { number: 1, date: '2026-11-02', amount: 250 },
        { number: 2, date: '2026-12-02', amount: 250 },
        { number: 3, date: '2027-01-02', amount: 250 },
        { number: 4, date: '2027-02-02', amount: 250 },
      ],
      customerId: 'customer-kgie',
      description: 'HIT SKY CLUB',
      billingType: 'BOLETO',
    });

    expect(requests).toHaveLength(4);
    expect(requests.map((request) => request.source_id)).toEqual([
      'receivable-1',
      'receivable-2',
      'receivable-3',
      'receivable-4',
    ]);
    expect(requests.map((request) => request.value)).toEqual([250, 250, 250, 250]);
    expect(requests.map((request) => request.due_date)).toEqual([
      '2026-11-02',
      '2026-12-02',
      '2027-01-02',
      '2027-02-02',
    ]);
    expect(requests.every((request) => request.source_type === 'receivable')).toBe(true);
    expect(requests.map((request) => request.description)).toEqual([
      'HIT SKY CLUB (1/4)',
      'HIT SKY CLUB (2/4)',
      'HIT SKY CLUB (3/4)',
      'HIT SKY CLUB (4/4)',
    ]);
  });

  it('recusa lote sem cliente', () => {
    expect(() => buildReceivableChargeRequests({
      transactionIds: ['receivable-1'],
      plan: [{ number: 1, date: '2026-11-02', amount: 250 }],
      customerId: '',
      description: 'Serviço',
      billingType: 'PIX',
    })).toThrow('Selecione o cliente');
  });

  it('recusa quando a quantidade de ids não corresponde às parcelas', () => {
    expect(() => buildReceivableChargeRequests({
      transactionIds: ['receivable-1'],
      plan: [
        { number: 1, date: '2026-11-02', amount: 250 },
        { number: 2, date: '2026-12-02', amount: 250 },
      ],
      customerId: 'customer-1',
      description: 'Serviço',
      billingType: 'BOLETO',
    })).toThrow('não foi possível relacioná-las');
  });
});
