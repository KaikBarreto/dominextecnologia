import { describe, it, expect } from 'vitest';
import {
  getInstallmentChargeAvailability,
  getInstallmentValueEditPolicy,
  isLiveChargeStatus,
  resolveChargeDueDate,
  splitInstallmentsByValueLock,
  type InstallmentChargeCandidate,
} from './contract-installment-charge';

const CUSTOMER = '11111111-1111-1111-1111-111111111111';
const OTHER_CUSTOMER = '22222222-2222-2222-2222-222222222222';

function installment(over: Partial<InstallmentChargeCandidate> = {}): InstallmentChargeCandidate {
  return {
    is_paid: false,
    amount: 500,
    amount_received: 0,
    transaction_type: 'entrada',
    parent_transaction_id: null,
    customer_id: CUSTOMER,
    ...over,
  };
}

describe('getInstallmentChargeAvailability', () => {
  it('libera a parcela a receber em aberto e devolve o cliente da parcela', () => {
    expect(getInstallmentChargeAvailability(installment(), { contractCustomerId: CUSTOMER })).toEqual({
      kind: 'chargeable',
      customerId: CUSTOMER,
    });
  });

  it('usa o cliente do contrato quando a parcela nasceu sem cliente', () => {
    expect(
      getInstallmentChargeAvailability(installment({ customer_id: null }), { contractCustomerId: CUSTOMER }),
    ).toEqual({ kind: 'chargeable', customerId: CUSTOMER });
  });

  it('bloqueia (em silêncio) linha de saída', () => {
    expect(
      getInstallmentChargeAvailability(installment({ transaction_type: 'saida' }), { contractCustomerId: CUSTOMER }),
    ).toEqual({ kind: 'blocked', reason: 'notReceivable', silent: true });
  });

  it('bloqueia (em silêncio) linha filha de recebimento parcial', () => {
    expect(
      getInstallmentChargeAvailability(installment({ parent_transaction_id: 'mae' }), {
        contractCustomerId: CUSTOMER,
      }),
    ).toEqual({ kind: 'blocked', reason: 'notReceivable', silent: true });
  });

  it('bloqueia (em silêncio) parcela já recebida', () => {
    expect(
      getInstallmentChargeAvailability(installment({ is_paid: true }), { contractCustomerId: CUSTOMER }),
    ).toEqual({ kind: 'blocked', reason: 'paid', silent: true });
  });

  it('bloqueia com motivo visível quando há recebimento parcial', () => {
    expect(
      getInstallmentChargeAvailability(installment({ amount_received: 100 }), { contractCustomerId: CUSTOMER }),
    ).toEqual({ kind: 'blocked', reason: 'partiallyReceived', silent: false });
  });

  it('enxerga recebimento parcial vindo como string do PostgREST', () => {
    expect(
      getInstallmentChargeAvailability(installment({ amount_received: '0.01' }), { contractCustomerId: CUSTOMER }),
    ).toEqual({ kind: 'blocked', reason: 'partiallyReceived', silent: false });
  });

  it('bloqueia com motivo visível quando o valor da parcela é zero', () => {
    expect(
      getInstallmentChargeAvailability(installment({ amount: 0 }), { contractCustomerId: CUSTOMER }),
    ).toEqual({ kind: 'blocked', reason: 'invalidAmount', silent: false });
  });

  it('bloqueia com motivo visível quando a parcela é de outro cliente', () => {
    expect(
      getInstallmentChargeAvailability(installment({ customer_id: OTHER_CUSTOMER }), {
        contractCustomerId: CUSTOMER,
      }),
    ).toEqual({ kind: 'blocked', reason: 'otherCustomer', silent: false });
  });

  it('bloqueia com motivo visível quando não há cliente nenhum', () => {
    expect(
      getInstallmentChargeAvailability(installment({ customer_id: null }), { contractCustomerId: null }),
    ).toEqual({ kind: 'blocked', reason: 'noCustomer', silent: false });
  });

  it('cobrança viva vira estado "charged", inclusive com a parcela já paga', () => {
    expect(
      getInstallmentChargeAvailability(installment({ is_paid: true }), {
        contractCustomerId: CUSTOMER,
        hasLiveCharge: true,
      }),
    ).toEqual({ kind: 'charged' });
  });

  it('cobrança viva NÃO reabilita linha que nem é parcela a receber', () => {
    expect(
      getInstallmentChargeAvailability(installment({ transaction_type: 'saida' }), {
        contractCustomerId: CUSTOMER,
        hasLiveCharge: true,
      }),
    ).toEqual({ kind: 'blocked', reason: 'notReceivable', silent: true });
  });
});

describe('isLiveChargeStatus', () => {
  it('considera viva a cobrança pendente/vencida/paga', () => {
    for (const s of ['PENDING', 'OVERDUE', 'RECEIVED', 'CONFIRMED', 'AWAITING_PAYMENT']) {
      expect(isLiveChargeStatus(s)).toBe(true);
    }
  });

  it('considera morta a cobrança cancelada, estornada ou em chargeback', () => {
    for (const s of ['CANCELLED', 'CANCELED', 'REFUNDED', 'CHARGEBACK', 'refunded']) {
      expect(isLiveChargeStatus(s)).toBe(false);
    }
  });

  it('sem status conhecido, trata como viva (nunca arrisca cobrança dobrada)', () => {
    expect(isLiveChargeStatus(null)).toBe(true);
    expect(isLiveChargeStatus('')).toBe(true);
  });
});

describe('resolveChargeDueDate', () => {
  it('mantém o vencimento da parcela quando ele é futuro', () => {
    expect(resolveChargeDueDate('2026-12-10', '2026-09-18')).toBe('2026-12-10');
  });

  it('mantém o vencimento de hoje', () => {
    expect(resolveChargeDueDate('2026-09-18', '2026-09-18')).toBe('2026-09-18');
  });

  it('empurra para hoje quando a parcela já venceu (a edge recusa data no passado)', () => {
    expect(resolveChargeDueDate('2026-01-05', '2026-09-18')).toBe('2026-09-18');
  });

  it('aceita timestamp e usa só a parte da data', () => {
    expect(resolveChargeDueDate('2026-12-10T00:00:00Z', '2026-09-18')).toBe('2026-12-10');
  });

  it('cai para hoje quando a data é inválida ou ausente', () => {
    expect(resolveChargeDueDate(null, '2026-09-18')).toBe('2026-09-18');
    expect(resolveChargeDueDate('10/12/2026', '2026-09-18')).toBe('2026-09-18');
  });
});

describe('getInstallmentValueEditPolicy', () => {
  it('libera mudar o valor quando não há cobrança viva', () => {
    expect(getInstallmentValueEditPolicy({ hasLiveCharge: false })).toEqual({
      canEditValue: true,
      reason: null,
    });
    expect(getInstallmentValueEditPolicy()).toEqual({ canEditValue: true, reason: null });
  });

  it('trava o valor quando a parcela já tem cobrança viva', () => {
    expect(getInstallmentValueEditPolicy({ hasLiveCharge: true })).toEqual({
      canEditValue: false,
      reason: 'liveCharge',
    });
  });
});

describe('splitInstallmentsByValueLock', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('separa as parcelas com cobrança viva das demais', () => {
    const { editable, valueLocked } = splitInstallmentsByValueLock(rows, (r) => r.id === 'b');
    expect(editable.map((r) => r.id)).toEqual(['a', 'c']);
    expect(valueLocked.map((r) => r.id)).toEqual(['b']);
  });

  it('sem cobrança nenhuma, todas continuam editáveis', () => {
    const { editable, valueLocked } = splitInstallmentsByValueLock(rows, () => false);
    expect(editable).toHaveLength(3);
    expect(valueLocked).toHaveLength(0);
  });

  it('todas com cobrança viva, nenhuma aceita mudança de valor', () => {
    const { editable, valueLocked } = splitInstallmentsByValueLock(rows, () => true);
    expect(editable).toHaveLength(0);
    expect(valueLocked).toHaveLength(3);
  });

  it('lista vazia devolve os dois lados vazios', () => {
    expect(splitInstallmentsByValueLock([], () => true)).toEqual({ editable: [], valueLocked: [] });
  });
});
