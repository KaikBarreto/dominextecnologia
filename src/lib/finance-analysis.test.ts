import { describe, it, expect } from 'vitest';
import { buildFinanceAnalysis } from './finance-analysis';
import type { FinancialTransaction } from '@/types/database';

const HOJE = '2026-09-15';

function txn(over: Partial<FinancialTransaction> = {}): FinancialTransaction {
  return {
    id: over.id ?? `t${Math.random().toString(36).slice(2, 9)}`,
    transaction_type: 'entrada',
    description: 'Lançamento',
    amount: 100,
    transaction_date: HOJE,
    paid_date: HOJE,
    is_paid: true,
    category: 'Serviços',
    created_at: `${HOJE}T12:00:00Z`,
    updated_at: `${HOJE}T12:00:00Z`,
    ...over,
  } as FinancialTransaction;
}

const rodar = (over: Partial<Parameters<typeof buildFinanceAnalysis>[0]> = {}) =>
  buildFinanceAnalysis({
    transactions: [],
    regime: 'caixa',
    today: HOJE,
    periodMode: 'mes',
    periodCount: 3,
    ...over,
  });

describe('comparação entre períodos', () => {
  it('devolve a janela pedida mesmo com mês sem movimento (buraco mente)', () => {
    const r = rodar({ transactions: [txn({ amount: 500 })] });
    expect(r.periods.map((p) => p.key)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(r.periods.map((p) => p.revenue)).toEqual([0, 0, 500]);
  });

  it('agrupa por trimestre quando pedido', () => {
    const r = rodar({
      periodMode: 'trimestre',
      periodCount: 2,
      transactions: [
        txn({ amount: 300, transaction_date: '2026-05-10', paid_date: '2026-05-10' }),
        txn({ amount: 700 }),
      ],
    });
    expect(r.periods.map((p) => p.key)).toEqual(['2026-T2', '2026-T3']);
    expect(r.periods.map((p) => p.revenue)).toEqual([300, 700]);
  });

  it('agrupa por ano quando pedido', () => {
    const r = rodar({
      periodMode: 'ano',
      periodCount: 2,
      transactions: [
        txn({ amount: 1_000, transaction_date: '2025-03-02', paid_date: '2025-03-02' }),
        txn({ amount: 2_000 }),
      ],
    });
    expect(r.periods.map((p) => p.key)).toEqual(['2025', '2026']);
    expect(r.periods.map((p) => p.revenue)).toEqual([1_000, 2_000]);
  });

  it('a virada de ano no trimestre não embaralha', () => {
    const r = rodar({
      today: '2026-02-10',
      periodMode: 'trimestre',
      periodCount: 3,
    });
    expect(r.periods.map((p) => p.key)).toEqual(['2025-T3', '2025-T4', '2026-T1']);
  });

  it('o resultado é receita menos despesa, por período', () => {
    const r = rodar({
      transactions: [
        txn({ amount: 1_000 }),
        txn({ transaction_type: 'saida', amount: 400, category: 'Aluguel' }),
      ],
      categoryDreGroups: new Map([['Aluguel', 'opex']]),
    });
    const set = r.periods.find((p) => p.key === '2026-09')!;
    expect(set).toMatchObject({ revenue: 1_000, expense: 400, result: 600 });
  });
});

describe('ranking e margem por cliente', () => {
  const transactions = [
    // Cliente A: fatura muito, mas custa caro.
    txn({ id: 'a1', amount: 10_000, customer_id: 'A', customer: { name: 'Supermercado Bom Preço' } } as Partial<FinancialTransaction>),
    txn({ id: 'a2', transaction_type: 'saida', amount: 9_000, category: 'Material', customer_id: 'A' }),
    // Cliente B: fatura menos e sobra mais.
    txn({ id: 'b1', amount: 4_000, customer_id: 'B', customer: { name: 'Clínica Vida' } } as Partial<FinancialTransaction>),
    txn({ id: 'b2', transaction_type: 'saida', amount: 1_000, category: 'Material', customer_id: 'B' }),
    // Estrutura: não pertence a cliente nenhum.
    txn({ id: 'estrutura', transaction_type: 'saida', amount: 2_500, category: 'Aluguel' }),
  ];
  const groups = new Map([['Material', 'cmv'], ['Aluguel', 'opex']]);
  const r = rodar({ transactions, categoryDreGroups: groups });

  it('ordena pelo faturamento, do maior para o menor', () => {
    expect(r.customers.map((c) => c.name)).toEqual(['Supermercado Bom Preço', 'Clínica Vida']);
  });

  it('o cliente que mais fatura tem a PIOR margem — o ponto que o BPO levantou', () => {
    const [a, b] = r.customers;
    expect(a.revenue).toBeGreaterThan(b.revenue);
    expect(a.margin).toBe(10);   // 1.000 / 10.000
    expect(b.margin).toBe(75);   // 3.000 / 4.000
    expect(a.margin!).toBeLessThan(b.margin!);
  });

  it('despesa de estrutura fica fora do cliente e é reportada à parte', () => {
    // Sem isto, a soma das margens não bate com o resultado da empresa e
    // parece erro de conta.
    expect(r.unattributedExpense).toBe(2_500);
    expect(r.customers.reduce((s, c) => s + c.expense, 0)).toBe(10_000);
  });

  it('cliente que só gerou despesa tem margem nula, não 0% nem Infinity', () => {
    const rr = rodar({
      transactions: [txn({ transaction_type: 'saida', amount: 500, category: 'Material', customer_id: 'C' })],
      categoryDreGroups: new Map([['Material', 'cmv']]),
    });
    expect(rr.customers[0].margin).toBeNull();
    expect(rr.customers[0].result).toBe(-500);
  });

  it('faturamento total serve de base para o percentual de cada cliente', () => {
    expect(r.totalRevenue).toBe(14_000);
  });
});

describe('os cortes são os mesmos da Visão Geral e do DRE', () => {
  it('transferência entre contas não entra', () => {
    const r = rodar({ transactions: [txn({ amount: 9_999, transfer_pair_id: 'par' })] });
    expect(r.totalRevenue).toBe(0);
  });

  it('cancelado não entra', () => {
    const r = rodar({ transactions: [txn({ amount: 9_999, cancelled_at: '2026-09-01' })] });
    expect(r.totalRevenue).toBe(0);
  });

  it('categoria do grupo "outros" (aporte) fica fora', () => {
    const r = rodar({
      transactions: [txn({ amount: 8_000, category: 'Aporte de sócios' })],
      categoryDreGroups: new Map([['Aporte de sócios', 'outros']]),
    });
    expect(r.totalRevenue).toBe(0);
  });

  it('em regime de caixa, o que não foi pago não entra', () => {
    const r = rodar({ transactions: [txn({ amount: 700, is_paid: false, paid_date: null })] });
    expect(r.totalRevenue).toBe(0);
  });

  it('pagamento de fatura e ajuste de saldo ficam fora', () => {
    const r = rodar({
      transactions: [
        txn({ transaction_type: 'saida', amount: 1_000, category: 'Pagamento de Fatura' }),
        txn({ transaction_type: 'saida', amount: 1_000, category: 'Ajuste de saldo' }),
      ],
    });
    expect(r.periods.find((p) => p.key === '2026-09')!.expense).toBe(0);
  });
});
