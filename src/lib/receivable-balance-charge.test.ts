import { describe, it, expect } from 'vitest';
import {
  getReceivableBalance,
  getReceivableChargeAvailability,
  getReceivableChargeTone,
  isLiveReceivableChargeStatus,
  resolveReceivableChargeDueDate,
  survivesChargeCancellation,
  type ReceivableChargeCandidate,
} from './receivable-balance-charge';

const CUSTOMER = '11111111-1111-1111-1111-111111111111';

function receivable(over: Partial<ReceivableChargeCandidate> = {}): ReceivableChargeCandidate {
  return {
    is_paid: false,
    cancelled_at: null,
    amount: 352.6,
    amount_received: 253.6,
    transaction_type: 'entrada',
    parent_transaction_id: null,
    customer_id: CUSTOMER,
    ...over,
  };
}

describe('getReceivableBalance', () => {
  it('é o saldo em aberto, arredondado em 2 casas', () => {
    // O caso do chamado: 352.60 - 253.60 dá 98.99999999999999 em float. Sem o
    // arredondamento, esse número viaja pro servidor e cai em value_mismatch.
    expect(getReceivableBalance(receivable())).toBe(99);
  });

  it('aceita numeric como string (PostgREST)', () => {
    expect(getReceivableBalance(receivable({ amount: '1000.00', amount_received: '250.50' }))).toBe(749.5);
  });

  it('trata amount_received ausente como zero', () => {
    expect(getReceivableBalance(receivable({ amount: 480, amount_received: null }))).toBe(480);
  });
});

describe('getReceivableChargeAvailability', () => {
  it('libera a cobrança do saldo, travada no saldo', () => {
    const verdict = getReceivableChargeAvailability(receivable());
    expect(verdict).toEqual({ kind: 'chargeable', customerId: CUSTOMER, balance: 99 });
  });

  it('com cobrança viva, vira substituição (nunca cria por cima)', () => {
    const verdict = getReceivableChargeAvailability(receivable(), { hasLiveCharge: true });
    expect(verdict).toEqual({ kind: 'replace', customerId: CUSTOMER, balance: 99 });
  });

  it('linha de saída não é conta a receber (motivo já visível)', () => {
    expect(getReceivableChargeAvailability(receivable({ transaction_type: 'saida' }))).toMatchObject({
      kind: 'blocked',
      reason: 'notReceivable',
      silent: true,
    });
  });

  it('filha de recebimento parcial não vira cobrança', () => {
    expect(getReceivableChargeAvailability(receivable({ parent_transaction_id: 'mother-id' }))).toMatchObject({
      kind: 'blocked',
      reason: 'notReceivable',
      silent: true,
    });
  });

  it('conta cancelada não cobra', () => {
    expect(getReceivableChargeAvailability(receivable({ cancelled_at: '2026-10-01' }))).toMatchObject({
      kind: 'blocked',
      reason: 'cancelled',
      silent: true,
    });
  });

  it('conta já recebida não cobra', () => {
    expect(getReceivableChargeAvailability(receivable({ is_paid: true }))).toMatchObject({
      kind: 'blocked',
      reason: 'paid',
      silent: true,
    });
  });

  it('sem saldo em aberto, bloqueia com motivo VISÍVEL', () => {
    const verdict = getReceivableChargeAvailability(
      receivable({ amount: 352.6, amount_received: 352.6 }),
    );
    expect(verdict).toEqual({ kind: 'blocked', reason: 'noBalance', silent: false, balance: 0 });
  });

  it('sem cliente, bloqueia antes de falar de cobrança viva', () => {
    // Cancelar a cobrança atual não resolveria: continua sem ninguém pra cobrar.
    const verdict = getReceivableChargeAvailability(
      receivable({ customer_id: null }),
      { hasLiveCharge: true },
    );
    expect(verdict).toMatchObject({ kind: 'blocked', reason: 'noCustomer', silent: false });
  });
});

describe('substituir a cobrança x apagar a conta', () => {
  // A régua `keep_it` do banco apaga o espelho financeiro de uma cobrança
  // cancelada quando não há dinheiro, nota, orçamento ou contrato em cima.
  // Substituir nesse estado sumiria com a própria conta que se quer cobrar.
  it('bloqueia a substituição quando a conta é o espelho da cobrança e nada entrou', () => {
    const verdict = getReceivableChargeAvailability(
      receivable({ amount: 352.6, amount_received: 0 }),
      { hasLiveCharge: true, liveChargeIsReceivableMirror: true },
    );
    expect(verdict).toMatchObject({
      kind: 'blocked',
      reason: 'chargeOwnsReceivable',
      silent: false,
    });
  });

  it('libera a substituição quando já houve recebimento parcial (a conta sobrevive)', () => {
    const verdict = getReceivableChargeAvailability(
      receivable({ amount: 352.6, amount_received: 253.6 }),
      { hasLiveCharge: true, liveChargeIsReceivableMirror: true },
    );
    expect(verdict).toMatchObject({ kind: 'replace', balance: 99 });
  });

  it('libera quando a cobrança viva não é a que a conta espelha', () => {
    // Cobrança de origem 'receivable' apontando pra conta: cancelar não mexe na
    // conta, porque a classificação do banco só olha `tenant_charge_id`.
    const verdict = getReceivableChargeAvailability(
      receivable({ amount_received: 0 }),
      { hasLiveCharge: true, liveChargeIsReceivableMirror: false },
    );
    expect(verdict).toMatchObject({ kind: 'replace' });
  });

  it('conta de contrato sobrevive ao cancelamento', () => {
    expect(survivesChargeCancellation(receivable({ amount_received: 0, contract_id: 'c1' }))).toBe(true);
    expect(survivesChargeCancellation(receivable({ amount_received: 0 }))).toBe(false);
    expect(survivesChargeCancellation(receivable({ amount_received: 10 }))).toBe(true);
    expect(survivesChargeCancellation(receivable({ amount_received: 0, is_paid: true }))).toBe(true);
  });
});

describe('isLiveReceivableChargeStatus', () => {
  it.each(['CANCELLED', 'CANCELED', 'REFUNDED', 'CHARGEBACK', 'DELETED', 'deleted'])(
    '%s não é cobrança viva',
    (status) => {
      expect(isLiveReceivableChargeStatus(status)).toBe(false);
    },
  );

  it.each(['PENDING', 'OVERDUE', 'RECEIVED', 'CONFIRMED'])('%s é cobrança viva', (status) => {
    expect(isLiveReceivableChargeStatus(status)).toBe(true);
  });

  it('status ilegível conta como viva (evita duas cobranças pro mesmo dinheiro)', () => {
    expect(isLiveReceivableChargeStatus(null)).toBe(true);
    expect(isLiveReceivableChargeStatus('')).toBe(true);
  });
});

describe('getReceivableChargeTone', () => {
  it('separa pago, vencido, em aberto e encerrado', () => {
    expect(getReceivableChargeTone('RECEIVED')).toBe('paid');
    expect(getReceivableChargeTone('CONFIRMED')).toBe('paid');
    expect(getReceivableChargeTone('OVERDUE')).toBe('overdue');
    expect(getReceivableChargeTone('PENDING')).toBe('open');
    expect(getReceivableChargeTone('CANCELLED')).toBe('dead');
    expect(getReceivableChargeTone('DELETED')).toBe('dead');
  });
});

describe('resolveReceivableChargeDueDate', () => {
  it('mantém o vencimento da conta quando ainda não venceu', () => {
    expect(resolveReceivableChargeDueDate('2026-11-05', '2026-10-21')).toBe('2026-11-05');
  });

  it('usa hoje quando a conta já venceu (a edge recusa data no passado)', () => {
    expect(resolveReceivableChargeDueDate('2026-09-30', '2026-10-21')).toBe('2026-10-21');
  });

  it('sem vencimento, usa hoje', () => {
    expect(resolveReceivableChargeDueDate(null, '2026-10-21')).toBe('2026-10-21');
  });
});
