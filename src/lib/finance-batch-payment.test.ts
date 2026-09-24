import { describe, it, expect } from 'vitest';
import {
  getBatchPayIneligibility,
  isBatchPayEligible,
  summarizeBatchSelection,
  buildPaymentGroupIndex,
  batchSideOf,
  type BatchPayTxnLike,
} from './finance-batch-payment';

function t(over: Partial<BatchPayTxnLike> & { id: string }): BatchPayTxnLike {
  return {
    transaction_type: 'saida',
    amount: 100,
    is_paid: false,
    cancelled_at: null,
    credit_card_bill_date: null,
    transfer_pair_id: null,
    payroll_kind: null,
    ...over,
  };
}

describe('getBatchPayIneligibility', () => {
  it('libera conta a pagar comum, pendente', () => {
    expect(getBatchPayIneligibility(t({ id: 'a' }))).toBeNull();
    expect(isBatchPayEligible(t({ id: 'a' }))).toBe(true);
  });

  it('libera conta a RECEBER comum, pendente (o lote cobre os dois lados)', () => {
    expect(getBatchPayIneligibility(t({ id: 'a', transaction_type: 'entrada' }))).toBeNull();
    expect(isBatchPayEligible(t({ id: 'a', transaction_type: 'entrada' }))).toBe(true);
  });

  it('recusa tipo que não é entrada nem saída', () => {
    // Não existe hoje no enum, mas o corte é explícito: o lote é só dinheiro a
    // pagar ou a receber. Mesmo teste da RPC.
    expect(getBatchPayIneligibility(t({ id: 'a', transaction_type: 'ajuste' }))).toBe('notPayable');
  });

  it('recusa conta a receber que é espelho de cobrança no gateway', () => {
    // Quem baixa é o webhook (`apply_tenant_charge_payment`), com o valor
    // líquido. Baixar por fora faz o extrato local divergir do Asaas em
    // silêncio. Vale pelos DOIS campos, porque o legado só tem o do Asaas.
    expect(
      getBatchPayIneligibility(t({ id: 'a', transaction_type: 'entrada', tenant_charge_id: 'chg-1' })),
    ).toBe('gatewayCharge');
    expect(
      getBatchPayIneligibility(t({ id: 'a', transaction_type: 'entrada', asaas_payment_id: 'pay_123' })),
    ).toBe('gatewayCharge');
  });

  it('gatewayCharge é só do lado do recebimento: saída com o mesmo id passa', () => {
    // Uma despesa nunca é espelho de cobrança do cliente. Bloquear aqui
    // esconderia conta a pagar legítima do lote.
    expect(
      getBatchPayIneligibility(t({ id: 'a', transaction_type: 'saida', tenant_charge_id: 'chg-1' })),
    ).toBeNull();
  });

  it('conta a receber sem vínculo com gateway continua elegível', () => {
    expect(
      getBatchPayIneligibility(t({
        id: 'a', transaction_type: 'entrada', tenant_charge_id: null, asaas_payment_id: null,
      })),
    ).toBeNull();
  });

  it('recusa conta a receber já recebida, cancelada ou com recebimento parcial', () => {
    const base = { id: 'a', transaction_type: 'entrada' } as const;
    expect(getBatchPayIneligibility(t({ ...base, is_paid: true }))).toBe('alreadyPaid');
    expect(getBatchPayIneligibility(t({ ...base, cancelled_at: '2026-09-01' }))).toBe('cancelled');
    expect(
      getBatchPayIneligibility(t({ ...base, amount_received: 40 }), { partialParentIds: new Set(['a']) }),
    ).toBe('partial');
  });

  it('recusa já quitada e cancelada', () => {
    expect(getBatchPayIneligibility(t({ id: 'a', is_paid: true }))).toBe('alreadyPaid');
    expect(getBatchPayIneligibility(t({ id: 'a', cancelled_at: '2026-09-01' }))).toBe('cancelled');
  });

  it('recusa despesa de cartão: quem quita é a fatura', () => {
    expect(getBatchPayIneligibility(t({ id: 'a', credit_card_bill_date: '2026-10-10' }))).toBe('creditCard');
  });

  it('recusa transferência entre contas e pagamento de fatura', () => {
    expect(getBatchPayIneligibility(t({ id: 'a', transfer_pair_id: 'par-1' }))).toBe('transfer');
    expect(
      getBatchPayIneligibility(t({ id: 'a' }), { cardBillPaymentIds: new Set(['a']) }),
    ).toBe('cardBillPayment');
  });

  it('recusa vale, salário e rescisão: o fluxo é o do RH', () => {
    expect(getBatchPayIneligibility(t({ id: 'a', payroll_kind: 'vale' }))).toBe('vale');
    expect(getBatchPayIneligibility(t({ id: 'a', payroll_kind: 'salary' }))).toBe('payroll');
    expect(getBatchPayIneligibility(t({ id: 'a', payroll_kind: 'rescission' }))).toBe('payroll');
  });

  it('recusa conta com baixa parcial pela FILHA, nunca por amount_received sozinho', () => {
    // Quitação total gravada por RPC antiga: amount_received = amount, sem filha.
    // Isso NÃO pode barrar o lote.
    expect(getBatchPayIneligibility(t({ id: 'a', amount_received: 100 }))).toBeNull();
    expect(
      getBatchPayIneligibility(t({ id: 'a', amount_received: 40 }), { partialParentIds: new Set(['a']) }),
    ).toBe('partial');
  });

  it('mostra o primeiro motivo da ordem da RPC quando há vários', () => {
    // Paga E cancelada E de cartão: "já quitada" é o que o servidor reporta.
    expect(
      getBatchPayIneligibility(
        t({ id: 'a', is_paid: true, cancelled_at: '2026-09-01', credit_card_bill_date: '2026-10-10' }),
      ),
    ).toBe('alreadyPaid');
    // Parcial vem ANTES de vale/folha, igual ao CASE da RPC: se a tela mostrasse
    // outro motivo, a explicação de antes do clique não seria a do servidor.
    expect(
      getBatchPayIneligibility(
        t({ id: 'a', payroll_kind: 'salary' }),
        { partialParentIds: new Set(['a']) },
      ),
    ).toBe('partial');
    // E o gateway é o ÚLTIMO: uma cobrança já recebida reporta "já recebida".
    expect(
      getBatchPayIneligibility(
        t({ id: 'a', transaction_type: 'entrada', is_paid: true, tenant_charge_id: 'chg-1' }),
      ),
    ).toBe('alreadyPaid');
  });
});

describe('batchSideOf', () => {
  it('separa os dois lados e recusa o resto', () => {
    expect(batchSideOf(t({ id: 'a', transaction_type: 'saida' }))).toBe('pay');
    expect(batchSideOf(t({ id: 'a', transaction_type: 'entrada' }))).toBe('receive');
    expect(batchSideOf(t({ id: 'a', transaction_type: 'ajuste' }))).toBeNull();
  });

  it('é o critério que impede o lote misto', () => {
    // A tela trava a seleção no lado do PRIMEIRO item marcado. Um lote que
    // somasse dinheiro que saiu com dinheiro que entrou teria um total que não
    // corresponde a nenhuma linha de extrato (a RPC também recusa).
    const selecionadas = [
      t({ id: 'a', transaction_type: 'saida' }),
      t({ id: 'b', transaction_type: 'entrada' }),
    ];
    expect(new Set(selecionadas.map(batchSideOf)).size).toBe(2);
  });
});

describe('summarizeBatchSelection', () => {
  it('soma sem dízima de ponto flutuante', () => {
    const r = summarizeBatchSelection([
      t({ id: 'a', amount: 0.1 }),
      t({ id: 'b', amount: 0.2 }),
    ]);
    expect(r.count).toBe(2);
    expect(r.total).toBe(0.3);
  });

  it('aceita numeric vindo como string do banco', () => {
    expect(summarizeBatchSelection([t({ id: 'a', amount: '1250.55' })]).total).toBe(1250.55);
  });

  it('seleção vazia soma zero', () => {
    expect(summarizeBatchSelection([])).toEqual({ count: 0, total: 0 });
  });
});

describe('buildPaymentGroupIndex', () => {
  it('agrupa por payment_group_id e deriva o total da soma das linhas', () => {
    const idx = buildPaymentGroupIndex([
      t({ id: 'a', amount: 100, payment_group_id: 'g1', paid_date: '2026-09-24', account_id: 'acc-1', is_paid: true }),
      t({ id: 'b', amount: 250.5, payment_group_id: 'g1', paid_date: '2026-09-24', account_id: 'acc-1', is_paid: true }),
      t({ id: 'c', amount: 70, payment_group_id: 'g2', paid_date: '2026-09-20', account_id: 'acc-2', is_paid: true }),
      t({ id: 'd', amount: 999, payment_group_id: null }),
    ]);
    expect(idx.size).toBe(2);
    expect(idx.get('g1')).toMatchObject({
      count: 2,
      total: 350.5,
      paidDate: '2026-09-24',
      accountId: 'acc-1',
    });
    expect(idx.get('g1')?.memberIds).toEqual(['a', 'b']);
    expect(idx.get('g2')?.count).toBe(1);
  });

  it('linha sem carimbo não entra em grupo nenhum', () => {
    expect(buildPaymentGroupIndex([t({ id: 'a' })]).size).toBe(0);
  });
});
