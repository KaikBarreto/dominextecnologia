import { describe, expect, it } from 'vitest';
import { buildFinanceReportOverview } from './finance-report-overview';
import type { FinancialTransaction } from '@/types/database';

const transaction = (
  id: string,
  overrides: Partial<FinancialTransaction> = {},
): FinancialTransaction => ({
  id,
  transaction_type: 'entrada',
  description: id,
  amount: 100,
  transaction_date: '2026-09-10',
  paid_date: '2026-09-10',
  is_paid: true,
  category: 'Serviços',
  created_at: '2026-09-10T12:00:00Z',
  updated_at: '2026-09-10T12:00:00Z',
  ...overrides,
});

describe('buildFinanceReportOverview', () => {
  it('faz KPIs, categorias, meses e centros fecharem no mesmo conjunto em centavos', () => {
    const transactions = [
      transaction('receita', { amount: 1000.1, cost_center_id: 'obra-a' }),
      transaction('imposto', { transaction_type: 'saida', amount: 100.05, category: 'ISS', cost_center_id: 'obra-a' }),
      transaction('custo', { transaction_type: 'saida', amount: 200.15, category: 'Material', cost_center_id: 'obra-b' }),
      transaction('opex', { transaction_type: 'saida', amount: 50.2, category: 'Aluguel', cost_center_id: null }),
      transaction('transferencia', { amount: 50_000, transfer_pair_id: 'par-interno' }),
      transaction('pendente', { amount: 99_999, is_paid: false, paid_date: null }),
      transaction('antes-do-corte', { amount: 75, transaction_date: '2026-08-31', paid_date: '2026-08-31' }),
    ];
    const groups = new Map([
      ['ISS', 'impostos'],
      ['Material', 'cmv'],
      ['Aluguel', 'opex'],
    ]);

    const result = buildFinanceReportOverview({
      transactions,
      regime: 'caixa',
      today: '2026-09-28',
      dreStartDate: '2026-09-01',
      categoryDreGroups: groups,
      costCenterOrder: ['obra-a', 'obra-b'],
    });

    expect(result.totals).toEqual({
      grossRevenue: 1000.1,
      expenses: 350.4,
      taxes: 100.05,
      netRevenue: 900.05,
      grossProfit: 699.9,
      result: 649.7,
      // Margem LÍQUIDA: result 649,70 ÷ grossRevenue 1000,10.
      // Era 69,983% quando a conta usava grossProfit (margem bruta); mudou em
      // 18/10/2026 — ver a nota grande em `finance-report-overview.ts`.
      margin: expect.closeTo(64.96350364963503),
    });
    expect(result.monthly).toEqual([{ key: '2026-09', revenue: 1000.1, expense: 350.4 }]);
    expect(result.revenueCategories).toEqual([{ name: 'Serviços', value: 1000.1 }]);
    expect(result.expenseCategories.map((row) => row.name)).toEqual(['Material', 'ISS', 'Aluguel']);
    expect(result.costCenters.reduce((total, row) => total + row.result, 0)).toBeCloseTo(649.7, 2);
    expect(result.movementCount).toBe(4);
  });

  it('respeita regime, datas futuras e recebimento parcial sem duplicar receita', () => {
    const transactions = [
      transaction('mae', { amount: 1000, amount_received: 300, paid_date: '2026-09-20' }),
      transaction('filha', {
        amount: 300,
        category: 'Recebimento parcial',
        parent_transaction_id: 'mae',
        paid_date: '2026-09-05',
      }),
      transaction('futura', { amount: 500, paid_date: '2026-10-01' }),
    ];

    const cash = buildFinanceReportOverview({
      transactions,
      regime: 'caixa',
      today: '2026-09-28',
    });
    expect(cash.totals.grossRevenue).toBe(1000);

    const accrual = buildFinanceReportOverview({
      transactions,
      regime: 'competencia',
      today: '2026-09-28',
    });
    expect(accrual.totals.grossRevenue).toBe(1500);
    expect(accrual.revenueCategories).toEqual([{ name: 'Serviços', value: 1500 }]);
  });

  it('não transforma aporte, empréstimo ou compra de ativo em resultado do DRE', () => {
    const result = buildFinanceReportOverview({
      transactions: [
        transaction('servico', { amount: 2_000 }),
        transaction('aporte', { amount: 20_000, category: 'Aporte de Sócios' }),
        transaction('emprestimo', { amount: 30_000, category: 'Empréstimo Bancário' }),
        transaction('ativo', {
          transaction_type: 'saida',
          amount: 8_000,
          category: 'Aquisição de Imobilizado',
        }),
      ],
      regime: 'caixa',
      today: '2026-09-28',
      categoryDreGroups: new Map([
        ['Serviços', 'opex'],
        ['Aporte de Sócios', 'outros'],
        ['Empréstimo Bancário', 'outros'],
        ['Aquisição de Imobilizado', 'outros'],
      ]),
    });

    expect(result.totals.grossRevenue).toBe(2_000);
    expect(result.totals.expenses).toBe(0);
    expect(result.totals.result).toBe(2_000);
    expect(result.movementCount).toBe(1);
  });
});

describe('margem é LÍQUIDA (resultado ÷ faturamento), não bruta', () => {
  /**
   * Caso real do BPO financeiro, 18/10/2026. Ele lançou exatamente estes
   * quatro valores e a tela mostrou 80%, que é só "100% menos o imposto" e
   * não diz nada. Numa empresa de serviço, que quase nunca cadastra CMV, a
   * margem BRUTA é inútil porque o lucro bruto vira a própria receita líquida.
   */
  const transactions = [
    transaction('faturamento', { amount: 5000 }),
    transaction('imposto', { transaction_type: 'saida', amount: 1000, category: 'ISS' }),
    transaction('aluguel', { transaction_type: 'saida', amount: 2500, category: 'Aluguel' }),
    transaction('alimentacao', { transaction_type: 'saida', amount: 125, category: 'Alimentação' }),
  ];
  const groups = new Map([
    ['ISS', 'impostos'],
    ['Aluguel', 'opex'],
    ['Alimentação', 'opex'],
  ]);

  const r = buildFinanceReportOverview({
    transactions,
    regime: 'caixa',
    today: '2026-09-28',
    categoryDreGroups: groups,
    costCenterOrder: [],
  });

  it('faturamento é tudo que entrou, sem descontar imposto', () => {
    expect(r.totals.grossRevenue).toBe(5000);
  });

  it('o resultado continua certo', () => {
    expect(r.totals.result).toBe(1375);
  });

  it('a margem é 27,5% e NÃO 80%', () => {
    expect(r.totals.margin).toBeCloseTo(27.5, 4);
  });

  it('sem faturamento no período, a margem é zero em vez de dividir por zero', () => {
    const vazio = buildFinanceReportOverview({
      transactions: [transaction('so-despesa', { transaction_type: 'saida', amount: 300, category: 'Aluguel' })],
      regime: 'caixa',
      today: '2026-09-28',
      categoryDreGroups: new Map([['Aluguel', 'opex']]),
      costCenterOrder: [],
    });
    expect(vazio.totals.margin).toBe(0);
  });
});

describe('agrupar subcategorias na categoria pai', () => {
  // Pedido do BPO: "agrupar as categorias" para não ler 30 linhas de centavo.
  const transactions = [
    transaction('r1', { amount: 1_000, category: 'Manutenção' }),
    transaction('r2', { amount: 500, category: 'Instalação' }),
    transaction('d1', { transaction_type: 'saida', amount: 300, category: 'Combustível' }),
    transaction('d2', { transaction_type: 'saida', amount: 200, category: 'Pneus' }),
    transaction('d3', { transaction_type: 'saida', amount: 120, category: 'Aluguel' }),
  ];
  const groups = new Map([
    ['Combustível', 'opex'],
    ['Pneus', 'opex'],
    ['Aluguel', 'opex'],
  ]);
  const parents = new Map([
    ['Manutenção', 'Serviços'],
    ['Instalação', 'Serviços'],
    ['Combustível', 'Frota'],
    ['Pneus', 'Frota'],
  ]);
  const run = (groupCategories: boolean) => buildFinanceReportOverview({
    transactions,
    regime: 'caixa',
    today: '2026-09-28',
    categoryDreGroups: groups,
    costCenterOrder: [],
    categoryParents: parents,
    groupCategories,
  });

  it('desligado, cada subcategoria é uma linha (comportamento de antes)', () => {
    const r = run(false);
    expect(r.expenseCategories.map((row) => row.name)).toEqual(['Combustível', 'Pneus', 'Aluguel']);
    expect(r.revenueCategories.map((row) => row.name)).toEqual(['Manutenção', 'Instalação']);
  });

  it('ligado, as filhas somam dentro do pai e a categoria sem pai fica como está', () => {
    const r = run(true);
    expect(r.expenseCategories).toEqual([
      { name: 'Frota', value: 500 },
      { name: 'Aluguel', value: 120 },
    ]);
    expect(r.revenueCategories).toEqual([{ name: 'Serviços', value: 1500 }]);
  });

  it('agrupar não cria nem some dinheiro: o total é idêntico nas duas visões', () => {
    const soma = (rows: Array<{ value: number }>) => rows.reduce((t, row) => t + row.value, 0);
    expect(soma(run(true).expenseCategories)).toBe(soma(run(false).expenseCategories));
    expect(soma(run(true).revenueCategories)).toBe(soma(run(false).revenueCategories));
  });

  it('agrupar NÃO mexe nos KPIs nem na classificação do DRE', () => {
    // A filha pode ter `dre_group` diferente do pai; quem classifica é a
    // categoria do lançamento, não o rótulo exibido.
    const comGrupo = run(true);
    const semGrupo = run(false);
    expect(comGrupo.totals).toEqual(semGrupo.totals);
    expect(comGrupo.monthly).toEqual(semGrupo.monthly);
  });

  it('subcategoria de outro grupo do DRE não migra de grupo ao ser agrupada', () => {
    const r = buildFinanceReportOverview({
      transactions: [
        transaction('filha-cmv', { transaction_type: 'saida', amount: 400, category: 'Peças' }),
      ],
      regime: 'caixa',
      today: '2026-09-28',
      // "Peças" é CMV, mas o pai "Frota" é despesa operacional.
      categoryDreGroups: new Map([['Peças', 'cmv'], ['Frota', 'opex']]),
      costCenterOrder: [],
      categoryParents: new Map([['Peças', 'Frota']]),
      groupCategories: true,
    });
    expect(r.expenseCategories).toEqual([{ name: 'Frota', value: 400 }]);
    expect(r.totals.grossProfit).toBe(-400); // entrou como CMV, não como opex
  });
});
