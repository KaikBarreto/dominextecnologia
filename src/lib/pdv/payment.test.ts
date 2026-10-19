/**
 * Testes do motor de PAGAMENTO do PDV.
 *
 * Cobertura deliberada: a soma das formas, o quanto falta, o troco, a
 * validação do fiado (cliente, vencimento, limite) e o bloqueio de dinheiro
 * sem caixa aberto. É onde erro vira dinheiro errado, então aqui é teste de
 * função pura, sem React e sem rede.
 */

import { describe, it, expect } from 'vitest';
import {
  PAYMENT_TOLERANCE,
  PDV_PAYMENT_METHODS,
  computeRemaining,
  computeRowChange,
  computeTotalChange,
  defaultFiadoDueDate,
  isBalanced,
  newPaymentRow,
  requiresAccount,
  sumFiado,
  sumPayments,
  toSettlePayload,
  validatePayments,
  type PaymentContext,
  type PaymentIssueCode,
  type PaymentRow,
} from './payment';

/** Contexto "tudo liberado": caixa aberto, cofre configurado, cliente no pedido. */
function ctx(overrides: Partial<PaymentContext> = {}): PaymentContext {
  return {
    total: 100,
    itemCount: 1,
    hasCustomer: true,
    hasOpenCashSession: true,
    hasCofreAccount: true,
    customerCreditLimit: 1000,
    customerDebt: 0,
    ...overrides,
  };
}

function row(partial: Partial<PaymentRow> & { method: PaymentRow['method']; amount: number }): PaymentRow {
  return {
    id: partial.id ?? `r-${partial.method}-${partial.amount}`,
    method: partial.method,
    amount: partial.amount,
    tendered: partial.tendered ?? 0,
    accountId: partial.accountId ?? null,
    dueDate: partial.dueDate ?? null,
  };
}

function codes(issues: Array<{ code: PaymentIssueCode }>): PaymentIssueCode[] {
  return issues.map((i) => i.code);
}

describe('pdv/payment — formas aceitas', () => {
  it('não oferece "pontos" (a RPC recusa, a funcionalidade é Onda 4)', () => {
    expect(PDV_PAYMENT_METHODS).not.toContain('pontos' as never);
    expect([...PDV_PAYMENT_METHODS].sort()).toEqual(
      ['credito', 'debito', 'dinheiro', 'fiado', 'pix', 'transferencia'],
    );
  });

  it('só Pix, transferência, débito e crédito exigem conta', () => {
    expect(requiresAccount('pix')).toBe(true);
    expect(requiresAccount('transferencia')).toBe(true);
    expect(requiresAccount('debito')).toBe(true);
    expect(requiresAccount('credito')).toBe(true);
    // Dinheiro vai SEMPRE pra conta cofre: deixar escolher furaria a gaveta.
    expect(requiresAccount('dinheiro')).toBe(false);
    expect(requiresAccount('fiado')).toBe(false);
  });
});

describe('pdv/payment — soma e quanto falta', () => {
  it('soma as formas e devolve o que falta', () => {
    const rows = [row({ method: 'dinheiro', amount: 50 }), row({ method: 'pix', amount: 30, accountId: 'a' })];
    expect(sumPayments(rows)).toBe(80);
    expect(computeRemaining(100, rows)).toBe(20);
  });

  it('pagamento misto que fecha exatamente deixa zero a faltar', () => {
    const rows = [
      row({ method: 'dinheiro', amount: 50 }),
      row({ method: 'pix', amount: 70, accountId: 'a' }),
      row({ method: 'fiado', amount: 30, dueDate: '2026-11-18' }),
    ];
    expect(sumPayments(rows)).toBe(150);
    expect(computeRemaining(150, rows)).toBe(0);
    expect(isBalanced(150, rows)).toBe(true);
  });

  it('falta negativa quando passa do total', () => {
    const rows = [row({ method: 'pix', amount: 120, accountId: 'a' })];
    expect(computeRemaining(100, rows)).toBe(-20);
    expect(isBalanced(100, rows)).toBe(false);
  });

  it('carrinho sem pagamento nenhum: falta o total inteiro', () => {
    expect(computeRemaining(100, [])).toBe(100);
    expect(sumPayments([])).toBe(0);
  });

  it('tolera 1 centavo, igual à RPC', () => {
    expect(PAYMENT_TOLERANCE).toBe(0.01);
    expect(isBalanced(100, [row({ method: 'pix', amount: 99.99, accountId: 'a' })])).toBe(true);
    expect(isBalanced(100, [row({ method: 'pix', amount: 100.01, accountId: 'a' })])).toBe(true);
    expect(isBalanced(100, [row({ method: 'pix', amount: 99.98, accountId: 'a' })])).toBe(false);
  });

  it('soma de centavos quebrados não acumula ruído binário', () => {
    const rows = [
      row({ method: 'dinheiro', amount: 0.1 }),
      row({ method: 'pix', amount: 0.2, accountId: 'a' }),
    ];
    // 0.1 + 0.2 = 0.30000000000000004 em ponto flutuante cru.
    expect(sumPayments(rows)).toBe(0.3);
    expect(computeRemaining(0.3, rows)).toBe(0);
  });
});

describe('pdv/payment — troco', () => {
  it('troco é entregue menos aplicado, nunca entra no aplicado', () => {
    const cash = row({ method: 'dinheiro', amount: 70, tendered: 100 });
    expect(computeRowChange(cash)).toBe(30);
    // O valor aplicado ao pedido segue 70: é isso que confere com o total.
    expect(sumPayments([cash])).toBe(70);
  });

  it('sem valor recebido informado, troco é zero', () => {
    expect(computeRowChange(row({ method: 'dinheiro', amount: 70 }))).toBe(0);
  });

  it('recebido igual ao aplicado não gera troco', () => {
    expect(computeRowChange(row({ method: 'dinheiro', amount: 70, tendered: 70 }))).toBe(0);
  });

  it('troco nunca é negativo', () => {
    expect(computeRowChange(row({ method: 'dinheiro', amount: 70, tendered: 50 }))).toBe(0);
  });

  it('só dinheiro tem troco', () => {
    expect(computeRowChange(row({ method: 'pix', amount: 70, tendered: 100, accountId: 'a' }))).toBe(0);
  });

  it('troco total soma as linhas de dinheiro', () => {
    const rows = [
      row({ method: 'dinheiro', amount: 40, tendered: 50 }),
      row({ method: 'dinheiro', amount: 30, tendered: 35 }),
      row({ method: 'pix', amount: 30, accountId: 'a' }),
    ];
    expect(computeTotalChange(rows)).toBe(15);
  });
});

describe('pdv/payment — vencimento do fiado (mês calendário)', () => {
  it('default é hoje + 1 mês CALENDÁRIO, nunca 30 dias', () => {
    expect(defaultFiadoDueDate(new Date(2026, 9, 18))).toBe('2026-11-18');
    // 30 dias daria 2026-03-03; mês calendário dá 2026-03-01.
    expect(defaultFiadoDueDate(new Date(2026, 1, 1))).toBe('2026-03-01');
  });

  it('clampa fim de mês igual ao Postgres (31/01 + 1 mês = 28/02)', () => {
    expect(defaultFiadoDueDate(new Date(2026, 0, 31))).toBe('2026-02-28');
    // 2028 é bissexto.
    expect(defaultFiadoDueDate(new Date(2028, 0, 31))).toBe('2028-02-29');
  });

  it('atravessa o ano sem perder o dia', () => {
    expect(defaultFiadoDueDate(new Date(2026, 11, 20))).toBe('2027-01-20');
  });

  it('a linha nova de fiado já nasce com vencimento, e as outras não', () => {
    const fiado = newPaymentRow('fiado', 30, { today: new Date(2026, 9, 18) });
    expect(fiado.dueDate).toBe('2026-11-18');
    expect(newPaymentRow('dinheiro', 30).dueDate).toBeNull();
    expect(newPaymentRow('pix', 30).dueDate).toBeNull();
  });

  it('linha nova de Pix já nasce com a conta sugerida, dinheiro nunca', () => {
    expect(newPaymentRow('pix', 30, { accountId: 'conta-1' }).accountId).toBe('conta-1');
    expect(newPaymentRow('dinheiro', 30, { accountId: 'conta-1' }).accountId).toBeNull();
  });

  it('linha nova nunca nasce com valor negativo', () => {
    expect(newPaymentRow('dinheiro', -10).amount).toBe(0);
  });
});

describe('pdv/payment — validação que bloqueia a venda', () => {
  it('venda simples em dinheiro, caixa aberto: passa', () => {
    const rows = [row({ method: 'dinheiro', amount: 100, tendered: 150 })];
    const result = validatePayments(rows, ctx());
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('sem nenhuma forma de pagamento: bloqueia', () => {
    const result = validatePayments([], ctx());
    expect(result.ok).toBe(false);
    expect(codes(result.issues)).toContain('sem_pagamento');
    // Sem pagamento nenhum NÃO reclama de "falta valor" em cima: seria ruído.
    expect(codes(result.issues)).not.toContain('falta_valor');
  });

  it('carrinho vazio: bloqueia (a RPC recusa pedido sem item)', () => {
    const result = validatePayments([row({ method: 'dinheiro', amount: 100 })], ctx({ itemCount: 0 }));
    expect(codes(result.issues)).toContain('sem_itens');
  });

  it('total zerado pelo desconto: bloqueia', () => {
    const result = validatePayments([], ctx({ total: 0 }));
    expect(codes(result.issues)).toContain('total_zero');
  });

  it('falta valor: bloqueia', () => {
    const result = validatePayments([row({ method: 'dinheiro', amount: 60 })], ctx());
    expect(result.ok).toBe(false);
    expect(codes(result.issues)).toContain('falta_valor');
  });

  it('valor acima do total: bloqueia', () => {
    const result = validatePayments([row({ method: 'dinheiro', amount: 160 })], ctx());
    expect(codes(result.issues)).toContain('valor_excede');
  });

  it('linha com valor zero: bloqueia apontando a linha', () => {
    const zero = row({ id: 'z1', method: 'dinheiro', amount: 0 });
    const result = validatePayments([zero, row({ method: 'pix', amount: 100, accountId: 'a' })], ctx());
    expect(result.issues).toEqual(
      expect.arrayContaining([{ code: 'valor_invalido', rowId: 'z1' }]),
    );
  });

  it('Pix sem conta escolhida: bloqueia apontando a linha', () => {
    const pix = row({ id: 'p1', method: 'pix', amount: 100 });
    const result = validatePayments([pix], ctx());
    expect(result.issues).toEqual(
      expect.arrayContaining([{ code: 'conta_obrigatoria', rowId: 'p1' }]),
    );
  });

  it('dinheiro recebido menor que o aplicado: bloqueia apontando a linha', () => {
    const cash = row({ id: 'c1', method: 'dinheiro', amount: 100, tendered: 80 });
    const result = validatePayments([cash], ctx());
    expect(result.issues).toEqual(
      expect.arrayContaining([{ code: 'recebido_menor', rowId: 'c1' }]),
    );
  });

  it('dinheiro sem caixa aberto: bloqueia (a RPC recusa)', () => {
    const result = validatePayments(
      [row({ method: 'dinheiro', amount: 100 })],
      ctx({ hasOpenCashSession: false }),
    );
    expect(result.ok).toBe(false);
    expect(codes(result.issues)).toContain('dinheiro_sem_caixa');
  });

  it('venda só em Pix NÃO exige caixa aberto (nada entra na gaveta)', () => {
    const result = validatePayments(
      [row({ method: 'pix', amount: 100, accountId: 'a' })],
      ctx({ hasOpenCashSession: false, hasCofreAccount: false }),
    );
    expect(result.ok).toBe(true);
  });

  it('dinheiro sem conta de cofre configurada: bloqueia', () => {
    const result = validatePayments(
      [row({ method: 'dinheiro', amount: 100 })],
      ctx({ hasCofreAccount: false }),
    );
    expect(codes(result.issues)).toContain('cofre_nao_configurado');
  });
});

describe('pdv/payment — fiado', () => {
  it('fiado sem cliente: bloqueia (sem cliente não há a quem cobrar)', () => {
    const result = validatePayments(
      [row({ method: 'fiado', amount: 100, dueDate: '2026-11-18' })],
      ctx({ hasCustomer: false }),
    );
    expect(result.ok).toBe(false);
    expect(codes(result.issues)).toContain('fiado_sem_cliente');
  });

  it('fiado sem vencimento: bloqueia apontando a linha', () => {
    const fiado = row({ id: 'f1', method: 'fiado', amount: 100 });
    const result = validatePayments([fiado], ctx());
    expect(result.issues).toEqual(
      expect.arrayContaining([{ code: 'fiado_sem_vencimento', rowId: 'f1' }]),
    );
  });

  it('fiado acima do limite de crédito: bloqueia', () => {
    const result = validatePayments(
      [row({ method: 'fiado', amount: 100, dueDate: '2026-11-18' })],
      ctx({ customerCreditLimit: 150, customerDebt: 80 }),
    );
    expect(result.ok).toBe(false);
    expect(codes(result.issues)).toContain('fiado_acima_do_limite');
  });

  it('fiado exatamente no limite: passa', () => {
    const result = validatePayments(
      [row({ method: 'fiado', amount: 100, dueDate: '2026-11-18' })],
      ctx({ customerCreditLimit: 180, customerDebt: 80 }),
    );
    expect(result.ok).toBe(true);
  });

  it('cliente sem limite definido: passa com AVISO, não bloqueia', () => {
    const result = validatePayments(
      [row({ method: 'fiado', amount: 100, dueDate: '2026-11-18' })],
      ctx({ customerCreditLimit: null }),
    );
    expect(result.ok).toBe(true);
    expect(result.warnings).toContain('cliente_sem_limite_definido');
  });

  it('o limite olha só a parte em fiado, não a venda inteira', () => {
    const rows = [
      row({ method: 'dinheiro', amount: 70 }),
      row({ method: 'fiado', amount: 30, dueDate: '2026-11-18' }),
    ];
    expect(sumFiado(rows)).toBe(30);
    const result = validatePayments(rows, ctx({ customerCreditLimit: 50, customerDebt: 10 }));
    expect(result.ok).toBe(true);
  });

  it('venda sem fiado nenhum não reclama de cliente nem de limite', () => {
    const result = validatePayments(
      [row({ method: 'dinheiro', amount: 100 })],
      ctx({ hasCustomer: false, customerCreditLimit: null }),
    );
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});

describe('pdv/payment — payload da RPC', () => {
  it('monta o payload do contrato, com troco separado do valor aplicado', () => {
    const rows = [
      row({ method: 'dinheiro', amount: 50, tendered: 55 }),
      row({ method: 'pix', amount: 70, accountId: 'conta-pix' }),
      row({ method: 'fiado', amount: 30, dueDate: '2026-11-18' }),
    ];
    expect(toSettlePayload(rows)).toEqual([
      { method: 'dinheiro', amount: 50, change_amount: 5 },
      { method: 'pix', amount: 70, account_id: 'conta-pix' },
      { method: 'fiado', amount: 30, due_date: '2026-11-18' },
    ]);
  });

  it('omite troco zero, conta do dinheiro e vencimento de quem não é fiado', () => {
    const rows = [
      row({ method: 'dinheiro', amount: 50, accountId: 'nao-vai' }),
      row({ method: 'debito', amount: 50, accountId: 'conta-banco', dueDate: '2026-11-18' }),
    ];
    expect(toSettlePayload(rows)).toEqual([
      { method: 'dinheiro', amount: 50 },
      { method: 'debito', amount: 50, account_id: 'conta-banco' },
    ]);
  });

  it('arredonda o valor em 2 casas antes de mandar', () => {
    const rows = [row({ method: 'pix', amount: 33.333, accountId: 'a' })];
    expect(toSettlePayload(rows)[0].amount).toBe(33.33);
  });
});
