// Prova do lote de cobrança online de parcelas de contrato.
//
// O que não pode regredir, e por quê (cada volta do laço é dinheiro real na
// Asaas, sem desfazer):
//   • parcela PAGA nunca entra;
//   • parcela com cobrança VIVA nunca entra (a edge devolveria a mesma e o
//     usuário acharia que gerou uma segunda);
//   • o valor é o da parcela, travado;
//   • a elegibilidade vem da função que espelha a edge, não de uma cópia;
//   • o teto corta o MENOS urgente e diz quantas ficaram, nunca some com elas;
//   • os números da confirmação são os mesmos que a execução vai usar.
import { describe, it, expect } from 'vitest';
import {
  CONSECUTIVE_FAILURES_TO_ABORT,
  MAX_CHARGES_PER_BATCH,
  batchFailureLabel,
  countSkipReasons,
  partitionInstallmentsForBatch,
  shouldAbortBatch,
} from './contractChargeBatch';
import { getInstallmentChargeAvailability } from './contract-installment-charge';

const CUSTOMER = 'cust-1';

function tx(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'tx-1',
    transaction_type: 'entrada',
    parent_transaction_id: null,
    is_paid: false,
    amount: 450,
    amount_received: 0,
    customer_id: CUSTOMER,
    due_date: '2026-10-10',
    description: 'Mensalidade - out/2026',
    ...over,
  } as any;
}

const noLiveCharge = () => false;

describe('partitionInstallmentsForBatch — quem entra no lote', () => {
  it('parcela normal entra, com o cliente e o valor da própria parcela', () => {
    const p = partitionInstallmentsForBatch([tx()], {
      contractCustomerId: CUSTOMER,
      hasLiveCharge: noLiveCharge,
    });
    expect(p.queue).toHaveLength(1);
    expect(p.queue[0].customerId).toBe(CUSTOMER);
    expect(p.queue[0].value).toBe(450);
    expect(p.skipped).toHaveLength(0);
  });

  it('parcela PAGA nunca entra', () => {
    const p = partitionInstallmentsForBatch([tx({ is_paid: true })], {
      contractCustomerId: CUSTOMER,
      hasLiveCharge: noLiveCharge,
    });
    expect(p.queue).toHaveLength(0);
    expect(p.skipped[0].reason).toBe('paid');
  });

  it('parcela com cobrança VIVA nunca entra', () => {
    const p = partitionInstallmentsForBatch([tx({ id: 'tx-live' })], {
      contractCustomerId: CUSTOMER,
      hasLiveCharge: (t) => t.id === 'tx-live',
    });
    expect(p.queue).toHaveLength(0);
    expect(p.skipped[0].reason).toBe('alreadyCharged');
  });

  it('recebimento parcial nunca entra (a baixa quitaria a parcela inteira)', () => {
    const p = partitionInstallmentsForBatch([tx({ amount_received: 100 })], {
      contractCustomerId: CUSTOMER,
      hasLiveCharge: noLiveCharge,
    });
    expect(p.skipped[0].reason).toBe('partiallyReceived');
  });

  it('valor zerado ou negativo nunca entra', () => {
    const p = partitionInstallmentsForBatch([tx({ amount: 0 }), tx({ id: 'b', amount: -10 })], {
      contractCustomerId: CUSTOMER,
      hasLiveCharge: noLiveCharge,
    });
    expect(p.queue).toHaveLength(0);
    expect(p.skipped.map((s) => s.reason)).toEqual(['invalidAmount', 'invalidAmount']);
  });

  it('linha que não é parcela a receber (saída, filha de recebimento) nunca entra', () => {
    const p = partitionInstallmentsForBatch(
      [tx({ transaction_type: 'saida' }), tx({ id: 'b', parent_transaction_id: 'pai' })],
      { contractCustomerId: CUSTOMER, hasLiveCharge: noLiveCharge },
    );
    expect(p.queue).toHaveLength(0);
    expect(p.skipped.map((s) => s.reason)).toEqual(['notReceivable', 'notReceivable']);
  });

  it('parcela de outro cliente nunca entra', () => {
    const p = partitionInstallmentsForBatch([tx({ customer_id: 'outro' })], {
      contractCustomerId: CUSTOMER,
      hasLiveCharge: noLiveCharge,
    });
    expect(p.skipped[0].reason).toBe('otherCustomer');
  });

  it('parcela sem cliente usa o cliente do contrato', () => {
    const p = partitionInstallmentsForBatch([tx({ customer_id: null })], {
      contractCustomerId: CUSTOMER,
      hasLiveCharge: noLiveCharge,
    });
    expect(p.queue[0].customerId).toBe(CUSTOMER);
  });

  it('sem cliente nenhum, não entra', () => {
    const p = partitionInstallmentsForBatch([tx({ customer_id: null })], {
      contractCustomerId: null,
      hasLiveCharge: noLiveCharge,
    });
    expect(p.skipped[0].reason).toBe('noCustomer');
  });

  it('a elegibilidade é a MESMA de getInstallmentChargeAvailability, parcela a parcela', () => {
    // Trava anti-cópia: se alguém escrever uma segunda regra aqui dentro, este
    // teste diverge. É a função da edge que manda, não este módulo.
    const rows = [
      tx(),
      tx({ id: 'b', is_paid: true }),
      tx({ id: 'c', amount: 0 }),
      tx({ id: 'd', amount_received: 5 }),
      tx({ id: 'e', transaction_type: 'saida' }),
      tx({ id: 'f', customer_id: 'outro' }),
    ];
    const p = partitionInstallmentsForBatch(rows, {
      contractCustomerId: CUSTOMER,
      hasLiveCharge: noLiveCharge,
    });
    const queued = new Set(p.queue.map((q) => q.installment.id));
    for (const row of rows) {
      const expected =
        getInstallmentChargeAvailability(row, { contractCustomerId: CUSTOMER }).kind === 'chargeable';
      expect(queued.has(row.id)).toBe(expected);
    }
  });

  it('nenhuma parcela some: fila + puladas = o que foi escolhido', () => {
    const rows = [tx(), tx({ id: 'b', is_paid: true }), tx({ id: 'c', amount: 0 })];
    const p = partitionInstallmentsForBatch(rows, {
      contractCustomerId: CUSTOMER,
      hasLiveCharge: noLiveCharge,
    });
    expect(p.queue.length + p.skipped.length).toBe(rows.length);
  });
});

describe('total e ordem', () => {
  it('o total é a soma exata da fila (o "R$ X" da confirmação)', () => {
    const p = partitionInstallmentsForBatch(
      [tx({ id: 'a', amount: 450.55 }), tx({ id: 'b', amount: 120.45 }), tx({ id: 'c', is_paid: true, amount: 999 })],
      { contractCustomerId: CUSTOMER, hasLiveCharge: noLiveCharge },
    );
    // A paga NÃO entra no total: prometer R$ 1.570 e cobrar R$ 571 seria a
    // divergência tela x gateway que este módulo existe pra evitar.
    expect(p.total).toBe(571);
  });

  it('aceita valor em string (numeric do PostgREST) sem virar NaN', () => {
    const p = partitionInstallmentsForBatch([tx({ amount: '450.00' })], {
      contractCustomerId: CUSTOMER,
      hasLiveCharge: noLiveCharge,
    });
    expect(p.total).toBe(450);
  });

  it('a fila sai do vencimento mais antigo pro mais novo', () => {
    const p = partitionInstallmentsForBatch(
      [
        tx({ id: 'c', due_date: '2026-12-10' }),
        tx({ id: 'a', due_date: '2026-10-10' }),
        tx({ id: 'b', due_date: '2026-11-10' }),
      ],
      { contractCustomerId: CUSTOMER, hasLiveCharge: noLiveCharge },
    );
    expect(p.queue.map((q) => q.installment.id)).toEqual(['a', 'b', 'c']);
  });

  it('parcela sem vencimento vai pro fim da fila', () => {
    const p = partitionInstallmentsForBatch(
      [tx({ id: 'sem', due_date: null }), tx({ id: 'com', due_date: '2026-10-10' })],
      { contractCustomerId: CUSTOMER, hasLiveCharge: noLiveCharge },
    );
    expect(p.queue.map((q) => q.installment.id)).toEqual(['com', 'sem']);
  });
});

describe('teto da rodada', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      tx({ id: `tx-${i}`, due_date: `2026-${String((i % 12) + 1).padStart(2, '0')}-10` }),
    );

  it('o teto padrão é 24, o mesmo lote por rodada do cron', () => {
    expect(MAX_CHARGES_PER_BATCH).toBe(24);
  });

  it('120 parcelas viram 24 na rodada, e as 96 ficam registradas como "fica pra depois"', () => {
    const p = partitionInstallmentsForBatch(many(120), {
      contractCustomerId: CUSTOMER,
      hasLiveCharge: noLiveCharge,
    });
    expect(p.queue).toHaveLength(24);
    expect(p.deferredCount).toBe(96);
    // Nada some em silêncio.
    expect(p.queue.length + p.skipped.length).toBe(120);
    expect(countSkipReasons(p.skipped).overCap).toBe(96);
  });

  it('o teto corta o MENOS urgente: sobram os vencimentos mais antigos', () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      tx({ id: `tx-${i}`, due_date: `2026-1${i}-10` }),
    );
    const p = partitionInstallmentsForBatch(rows, {
      contractCustomerId: CUSTOMER,
      hasLiveCharge: noLiveCharge,
      cap: 2,
    });
    expect(p.queue.map((q) => q.installment.id)).toEqual(['tx-0', 'tx-1']);
    expect(p.skipped.filter((s) => s.reason === 'overCap').map((s) => s.installment.id))
      .toEqual(['tx-2', 'tx-3', 'tx-4']);
  });

  it('o teto conta só quem é elegível: parcela paga não ocupa vaga', () => {
    const rows = [
      tx({ id: 'paga-1', is_paid: true, due_date: '2026-01-10' }),
      tx({ id: 'paga-2', is_paid: true, due_date: '2026-02-10' }),
      tx({ id: 'a', due_date: '2026-03-10' }),
      tx({ id: 'b', due_date: '2026-04-10' }),
    ];
    const p = partitionInstallmentsForBatch(rows, {
      contractCustomerId: CUSTOMER,
      hasLiveCharge: noLiveCharge,
      cap: 2,
    });
    expect(p.queue.map((q) => q.installment.id)).toEqual(['a', 'b']);
    expect(p.deferredCount).toBe(0);
  });

  it('cap inválido não zera a rodada nem explode', () => {
    const p = partitionInstallmentsForBatch(many(3), {
      contractCustomerId: CUSTOMER,
      hasLiveCharge: noLiveCharge,
      cap: 0,
    });
    expect(p.queue).toHaveLength(1);
  });

  it('lista vazia devolve rodada vazia, sem total fantasma', () => {
    const p = partitionInstallmentsForBatch([], {
      contractCustomerId: CUSTOMER,
      hasLiveCharge: noLiveCharge,
    });
    expect(p.queue).toHaveLength(0);
    expect(p.total).toBe(0);
    expect(p.deferredCount).toBe(0);
  });
});

describe('falha no meio: continua, menos quando o gateway caiu', () => {
  it('uma falha isolada não aborta', () => {
    expect(shouldAbortBatch(1)).toBe(false);
    expect(shouldAbortBatch(2)).toBe(false);
  });

  it('três seguidas abortam (não é azar de parcela, é conta/gateway)', () => {
    expect(shouldAbortBatch(CONSECUTIVE_FAILURES_TO_ABORT)).toBe(true);
    expect(shouldAbortBatch(CONSECUTIVE_FAILURES_TO_ABORT + 5)).toBe(true);
  });

  it('o contador zera no sucesso: falhas alternadas nunca abortam', () => {
    // Simula a regra que a tela aplica: sucesso zera o consecutivo.
    let consecutive = 0;
    let aborted = false;
    for (const ok of [false, true, false, true, false, true, false]) {
      consecutive = ok ? 0 : consecutive + 1;
      if (shouldAbortBatch(consecutive)) aborted = true;
    }
    expect(aborted).toBe(false);
  });
});

describe('countSkipReasons e batchFailureLabel', () => {
  it('agrupa os motivos pra a confirmação explicar em uma linha por motivo', () => {
    const p = partitionInstallmentsForBatch(
      [tx({ id: 'a', is_paid: true }), tx({ id: 'b', is_paid: true }), tx({ id: 'c', amount: 0 })],
      { contractCustomerId: CUSTOMER, hasLiveCharge: noLiveCharge },
    );
    expect(countSkipReasons(p.skipped)).toEqual({ paid: 2, invalidAmount: 1 });
  });

  it('o rótulo da falha usa a descrição, cai no vencimento, e nunca fica vazio', () => {
    expect(batchFailureLabel({ description: 'Mensalidade - out/2026' }, 'Parcela')).toBe('Mensalidade - out/2026');
    expect(batchFailureLabel({ description: '  ', due_date: '2026-10-10' }, 'Parcela')).toBe('2026-10-10');
    expect(batchFailureLabel({}, 'Parcela')).toBe('Parcela');
  });
});
