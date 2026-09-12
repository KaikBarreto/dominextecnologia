import { describe, it, expect } from 'vitest';
import {
  getDreEffectiveDate,
  isInDreRange,
  getDreAmount,
  isPartialReceiptChild,
  isPayrollAdvance,
  parseDreDate,
  type DreTransactionLike,
} from './dre-regime';

const txn = (over: Partial<DreTransactionLike> = {}): DreTransactionLike => ({
  transaction_date: '2026-01-10',
  paid_date: null,
  amount: 1000,
  ...over,
});

describe('getDreEffectiveDate', () => {
  it('caixa usa paid_date', () => {
    expect(getDreEffectiveDate(txn({ paid_date: '2026-03-05' }), 'caixa')).toBe('2026-03-05');
  });

  it('competência usa transaction_date mesmo com paid_date preenchido', () => {
    expect(getDreEffectiveDate(txn({ paid_date: '2026-03-05' }), 'competencia')).toBe('2026-01-10');
  });

  it('caixa cai pra transaction_date quando paid_date é nulo', () => {
    expect(getDreEffectiveDate(txn({ paid_date: null }), 'caixa')).toBe('2026-01-10');
  });

  it('caixa cai pra transaction_date quando paid_date é string vazia', () => {
    expect(getDreEffectiveDate(txn({ paid_date: '' }), 'caixa')).toBe('2026-01-10');
  });

  it('devolve null quando não há data nenhuma', () => {
    expect(getDreEffectiveDate({ transaction_date: null, paid_date: null }, 'caixa')).toBeNull();
    expect(getDreEffectiveDate({ transaction_date: null, paid_date: null }, 'competencia')).toBeNull();
  });

  it('competência ignora paid_date e devolve null sem transaction_date', () => {
    expect(getDreEffectiveDate({ transaction_date: null, paid_date: '2026-03-05' }, 'competencia')).toBeNull();
  });
});

describe('isInDreRange', () => {
  const from = new Date(2026, 1, 1, 0, 0, 0); // 01/02/2026 00:00 local
  const to = new Date(2026, 1, 28, 23, 59, 59); // 28/02/2026 23:59 local

  it('range vazio passa tudo', () => {
    expect(isInDreRange('2020-01-01', {})).toBe(true);
    expect(isInDreRange('2020-01-01', undefined)).toBe(true);
  });

  it('data dentro do range passa', () => {
    expect(isInDreRange('2026-02-15', { from, to })).toBe(true);
  });

  it('data antes do range não passa', () => {
    expect(isInDreRange('2026-01-31', { from, to })).toBe(false);
  });

  it('data depois do range não passa', () => {
    expect(isInDreRange('2026-03-01', { from, to })).toBe(false);
  });

  it('bordas do range são inclusivas (primeiro e último dia)', () => {
    expect(isInDreRange('2026-02-01', { from, to })).toBe(true);
    expect(isInDreRange('2026-02-28', { from, to })).toBe(true);
  });

  it('só `from` funciona como "a partir de"', () => {
    expect(isInDreRange('2026-01-31', { from })).toBe(false);
    expect(isInDreRange('2026-12-31', { from })).toBe(true);
  });

  it('só `to` funciona como "até"', () => {
    expect(isInDreRange('2020-01-01', { to })).toBe(true);
    expect(isInDreRange('2026-03-01', { to })).toBe(false);
  });

  it('data nula fora de range vazio não passa', () => {
    expect(isInDreRange(null, { from, to })).toBe(false);
  });

  it('data inválida não passa', () => {
    expect(isInDreRange('não-é-data', { from, to })).toBe(false);
  });

  it('YYYY-MM-DD é ancorado ao meio-dia local (não vira o dia por fuso)', () => {
    expect(parseDreDate('2026-02-01').getDate()).toBe(1);
    expect(parseDreDate('2026-02-01').getHours()).toBe(12);
  });
});

describe('getDreAmount', () => {
  it('linha comum devolve o amount cheio nos dois regimes', () => {
    const t = txn({ amount: 1000 });
    expect(getDreAmount(t, 'caixa')).toBe(1000);
    expect(getDreAmount(t, 'competencia')).toBe(1000);
  });

  it('amount_received = 0 não muda nada', () => {
    const t = txn({ amount: 1000, amount_received: 0 });
    expect(getDreAmount(t, 'caixa')).toBe(1000);
  });

  it('competência ignora amount_received (a mãe é o fato gerador cheio)', () => {
    const t = txn({ amount: 1000, amount_received: 300 });
    expect(getDreAmount(t, 'competencia')).toBe(1000);
  });

  it('caixa desconta o que já veio por filha de recebimento parcial', () => {
    const t = txn({ amount: 1000, amount_received: 300 });
    expect(getDreAmount(t, 'caixa')).toBe(700);
  });

  it('caixa zera a mãe quando as filhas cobrem o total (senão dobraria)', () => {
    const t = txn({ amount: 1000, amount_received: 1000 });
    expect(getDreAmount(t, 'caixa')).toBe(0);
  });

  it('caixa nunca devolve negativo em recebimento a maior', () => {
    const t = txn({ amount: 1000, amount_received: 1200 });
    expect(getDreAmount(t, 'caixa')).toBe(0);
  });

  it('aceita numeric vindo como string do Postgres', () => {
    const t = txn({ amount: '1000.00', amount_received: '250.50' });
    expect(getDreAmount(t, 'caixa')).toBe(749.5);
  });

  // --- Folha: `amount` é caixa, `accrual_amount` é competência ---

  it('competência lê accrual_amount da folha paga (o bruto do ciclo)', () => {
    const folha = txn({ amount: 2200, accrual_amount: 3000, payroll_kind: 'salary' });
    expect(getDreAmount(folha, 'competencia')).toBe(3000);
  });

  it('caixa ignora accrual_amount (o que saiu da conta foi o líquido)', () => {
    const folha = txn({ amount: 2200, accrual_amount: 3000, payroll_kind: 'salary' });
    expect(getDreAmount(folha, 'caixa')).toBe(2200);
  });

  it('folha pendente (sem accrual_amount) vale o amount nos dois regimes', () => {
    const folha = txn({ amount: 3000, payroll_kind: 'salary' });
    expect(getDreAmount(folha, 'competencia')).toBe(3000);
    expect(getDreAmount(folha, 'caixa')).toBe(3000);
  });

  it('accrual_amount nulo ou zero cai de volta no amount', () => {
    expect(getDreAmount(txn({ amount: 2200, accrual_amount: null }), 'competencia')).toBe(2200);
    expect(getDreAmount(txn({ amount: 2200, accrual_amount: 0 }), 'competencia')).toBe(2200);
  });

  it('aceita accrual_amount numeric como string do Postgres', () => {
    expect(getDreAmount(txn({ amount: '2200.00', accrual_amount: '3000.00' }), 'competencia')).toBe(3000);
  });

  it('accrual_amount não contamina linha comum de despesa', () => {
    const t = txn({ amount: 500 });
    expect(getDreAmount(t, 'competencia')).toBe(500);
    expect(getDreAmount(t, 'caixa')).toBe(500);
  });
});

describe('isPayrollAdvance', () => {
  it('reconhece o vale (payroll_kind + saída)', () => {
    expect(isPayrollAdvance({ payroll_kind: 'vale', transaction_type: 'saida' })).toBe(true);
  });

  it('folha não é vale', () => {
    expect(isPayrollAdvance({ payroll_kind: 'salary', transaction_type: 'saida' })).toBe(false);
  });

  it('linha sem payroll_kind não é vale', () => {
    expect(isPayrollAdvance({ transaction_type: 'saida' })).toBe(false);
    expect(isPayrollAdvance({ payroll_kind: null, transaction_type: 'saida' })).toBe(false);
  });

  it('entrada nunca é vale (adiantamento é sempre saída de caixa)', () => {
    expect(isPayrollAdvance({ payroll_kind: 'vale', transaction_type: 'entrada' })).toBe(false);
  });
});

/**
 * Cenário fechado do achado 7 — vale + folha contando em dobro.
 * Salário 3.000, vale de 800 em outubro, folha paga em novembro.
 * Reproduz o MESMO par de regras que a FinanceDRE aplica: exclui o vale em
 * Competência (`isPayrollAdvance`) e valora cada linha com `getDreAmount`.
 */
describe('vale + folha: custo total do ciclo fecha em 3.000 nos dois regimes', () => {
  const vale: DreTransactionLike = {
    transaction_date: '2026-10-14', paid_date: '2026-10-14',
    amount: 800, transaction_type: 'saida', payroll_kind: 'vale',
  };

  const somar = (linhas: DreTransactionLike[], regime: 'caixa' | 'competencia') =>
    linhas
      .filter((t) => !(regime === 'competencia' && isPayrollAdvance(t)))
      .reduce((acc, t) => acc + getDreAmount(t, regime), 0);

  it('antes do pagamento: competência conta só a folha bruta pendente', () => {
    const folhaPendente: DreTransactionLike = {
      transaction_date: '2026-11-05', paid_date: null,
      amount: 3000, transaction_type: 'saida', payroll_kind: 'salary',
    };
    expect(somar([vale, folhaPendente], 'competencia')).toBe(3000);
  });

  it('depois do pagamento: competência segue 3.000 (não encolhe pro líquido)', () => {
    const folhaPaga: DreTransactionLike = {
      transaction_date: '2026-11-05', paid_date: '2026-11-05',
      amount: 2200, accrual_amount: 3000, transaction_type: 'saida', payroll_kind: 'salary',
    };
    expect(somar([vale, folhaPaga], 'competencia')).toBe(3000);
  });

  it('caixa: 800 em outubro + 2.200 em novembro = 3.000', () => {
    const folhaPaga: DreTransactionLike = {
      transaction_date: '2026-11-05', paid_date: '2026-11-05',
      amount: 2200, accrual_amount: 3000, transaction_type: 'saida', payroll_kind: 'salary',
    };
    expect(somar([vale, folhaPaga], 'caixa')).toBe(3000);
  });

  it('sem vale nenhum (100% do uso atual) nada muda', () => {
    const folhaPaga: DreTransactionLike = {
      transaction_date: '2026-11-05', paid_date: '2026-11-05',
      amount: 3000, accrual_amount: 3000, transaction_type: 'saida', payroll_kind: 'salary',
    };
    expect(somar([folhaPaga], 'competencia')).toBe(3000);
    expect(somar([folhaPaga], 'caixa')).toBe(3000);
  });
});

describe('isPartialReceiptChild', () => {
  it('reconhece a filha pelo predicado triplo do gatilho', () => {
    expect(isPartialReceiptChild({
      parent_transaction_id: 'mae',
      category: 'Recebimento parcial',
      transaction_type: 'entrada',
    })).toBe(true);
  });

  it('mãe com a mesma categoria não conta (não tem parent)', () => {
    expect(isPartialReceiptChild({
      parent_transaction_id: null,
      category: 'Recebimento parcial',
      transaction_type: 'entrada',
    })).toBe(false);
  });

  it('filha de tarifa não conta', () => {
    expect(isPartialReceiptChild({
      parent_transaction_id: 'mae',
      category: 'Tarifas e Taxas',
      transaction_type: 'saida',
    })).toBe(false);
  });

  it('saída com a categoria de parcial não conta', () => {
    expect(isPartialReceiptChild({
      parent_transaction_id: 'mae',
      category: 'Recebimento parcial',
      transaction_type: 'saida',
    })).toBe(false);
  });
});
