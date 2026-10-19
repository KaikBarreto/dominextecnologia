import { describe, it, expect } from 'vitest';
import {
  buildCashFlowForecast,
  UNASSIGNED_ACCOUNT_ID,
  type ForecastAccount,
  type CashFlowForecastInput,
} from './cash-flow-forecast';
import type { ForecastEvent } from './cash-flow-forecast-sources';

const HOJE = '2026-10-18';

function conta(id: string, over: Partial<ForecastAccount> = {}): ForecastAccount {
  return { id, name: `Conta ${id}`, type: 'banco', isCashAccount: true, ...over };
}

function evento(over: Partial<ForecastEvent> = {}): ForecastEvent {
  return {
    id: `e${Math.random().toString(36).slice(2, 9)}`,
    direction: 'out',
    amountCents: 10_000,
    dueDate: HOJE,
    accountId: 'A',
    label: 'Evento',
    categoryName: null,
    isEstimate: false,
    ...over,
  };
}

function rodar(over: Partial<CashFlowForecastInput> = {}) {
  return buildCashFlowForecast({
    events: [],
    accounts: [conta('A')],
    openingBalances: new Map([['A', 0]]),
    today: HOJE,
    horizonDays: 15,
    ...over,
  });
}

/* ───────────────────────────────────────────────────────────────
 * O teste que define a feature. É o cenário literal que o BPO
 * levantou na reunião e que motivou a flag de perímetro:
 * "você vê R$ 50 mil, mas cada conta tem R$ 25 mil, uma pode estar
 * negativa, o débito automático falha e você só descobre amanhã."
 * Se este passa, a feature cumpre o que foi prometido.
 * ─────────────────────────────────────────────────────────────── */
describe('o alerta que motivou a reunião: total positivo escondendo conta negativa', () => {
  const r = rodar({
    accounts: [conta('A'), conta('B')],
    openingBalances: new Map([['A', 25_000], ['B', 25_000]]),
    events: [evento({ id: 'debito', amountCents: 3_000_000, dueDate: '2026-10-22', accountId: 'A' })],
  });

  it('o total consolidado NUNCA fica negativo, que é justamente a armadilha', () => {
    expect(r.startingBalance).toBe(50_000);
    for (const dia of r.days) expect(dia.closing).toBeGreaterThan(0);
  });

  it('mas a conta A fecha negativa no dia do débito', () => {
    const dia22 = r.days.find((d) => d.date === '2026-10-22')!;
    const contaA = dia22.byAccount.find((c) => c.accountId === 'A')!;
    expect(contaA.closing).toBe(-5_000);
    expect(dia22.negativeAccountIds).toContain('A');
  });

  it('e o alerta aponta a conta e o dia exatos', () => {
    expect(r.firstNegativeDay).toEqual({ date: '2026-10-22', accountId: 'A' });
  });

  it('a conta B segue intacta, provando que a quebra é por conta e não rateada', () => {
    const dia22 = r.days.find((d) => d.date === '2026-10-22')!;
    expect(dia22.byAccount.find((c) => c.accountId === 'B')!.closing).toBe(25_000);
  });
});

describe('invariantes (tornam contagem dupla impossível por construção)', () => {
  const r = rodar({
    accounts: [conta('A'), conta('B')],
    openingBalances: new Map([['A', 1_000], ['B', 500]]),
    events: [
      evento({ id: 'x1', direction: 'in', amountCents: 20_000, dueDate: '2026-10-20' }),
      evento({ id: 'x2', amountCents: 5_000, dueDate: '2026-10-20', accountId: 'B' }),
      evento({ id: 'x3', amountCents: 7_000, dueDate: '2026-10-25' }),
      evento({ id: 'vencido', amountCents: 9_000, dueDate: '2026-10-10' }),
    ],
  });

  it('nenhum evento aparece em dois dias', () => {
    const ids = r.days.flatMap((d) => d.events.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('o vencido não aparece em dia nenhum (ele é estoque, não fluxo)', () => {
    const ids = r.days.flatMap((d) => d.events.map((e) => e.id));
    expect(ids).not.toContain('vencido');
  });

  it('conservação: último saldo = saldo inicial + tudo que entrou - tudo que saiu', () => {
    const movimento = r.days.reduce((acc, d) => acc + d.inflow - d.outflow, 0);
    expect(r.days.at(-1)!.closing).toBeCloseTo(r.startingBalance + movimento, 2);
  });

  it('a grade de dias é contígua e tem horizonte + 1 linhas', () => {
    expect(r.days).toHaveLength(16);
    expect(r.days[0].date).toBe(HOJE);
    expect(r.days.at(-1)!.date).toBe('2026-11-02');
    for (let i = 1; i < r.days.length; i += 1) {
      expect(r.days[i].date > r.days[i - 1].date).toBe(true);
    }
  });

  it('o saldo inicial de cada dia é o saldo final do dia anterior (régua do BPO)', () => {
    for (let i = 1; i < r.days.length; i += 1) {
      expect(r.days[i].opening).toBeCloseTo(r.days[i - 1].closing, 2);
    }
  });
});

describe('dívida: estoque, não fluxo', () => {
  const r = rodar({
    openingBalances: new Map([['A', 100_000]]),
    events: [
      evento({ id: 'luz', amountCents: 80_000, dueDate: '2026-10-15', label: 'Conta de luz' }),
      evento({ id: 'cliente', direction: 'in', amountCents: 50_000, dueDate: '2026-10-10' }),
    ],
  });

  it('o saldo NÃO desconta a dívida (conferido na aritmética do painel do BPO)', () => {
    for (const dia of r.days) expect(dia.closing).toBe(100_000);
  });

  it('a dívida aparece separada, dos dois lados', () => {
    expect(r.openingDebt.payable).toBe(800);
    expect(r.openingDebt.receivable).toBe(500);
  });

  it('a linha de dívida é PLANA ao longo do horizonte, como o BPO confirmou', () => {
    for (const dia of r.days) {
      expect(dia.carriedDebtPayable).toBe(800);
      expect(dia.carriedDebtReceivable).toBe(500);
    }
  });

  it('cada atraso informa há quantos dias arrasta, do mais antigo pro mais novo', () => {
    expect(r.openingDebt.events.map((e) => [e.id, e.daysLate])).toEqual([
      ['cliente', 8],
      ['luz', 3],
    ]);
  });

  it('no modo reschedule a dívida vira saída de hoje e a linha zera', () => {
    const rr = rodar({
      openingBalances: new Map([['A', 100_000]]),
      overdueTreatment: 'reschedule',
      events: [evento({ id: 'luz', amountCents: 80_000, dueDate: '2026-10-15' })],
    });
    expect(rr.days[0].outflow).toBe(800);
    expect(rr.days[0].closing).toBe(99_200);
    for (const dia of rr.days) expect(dia.carriedDebtPayable).toBe(0);
    expect(rr.days[0].events.map((e) => e.id)).toEqual(['luz']);
  });
});

describe('perímetro do caixa (a transferência pra poupança)', () => {
  const contas = [conta('CAIXA'), conta('POUP', { isCashAccount: false, name: 'Poupança' })];
  const saldos = new Map([['CAIXA', 10_000], ['POUP', 50_000]]);

  it('caixa → poupança: só a perna de saída conta, vira saída real', () => {
    const r = rodar({
      accounts: contas,
      openingBalances: saldos,
      events: [
        evento({ id: 'ida', amountCents: 300_000, dueDate: '2026-10-20', accountId: 'CAIXA' }),
        evento({ id: 'volta', direction: 'in', amountCents: 300_000, dueDate: '2026-10-20', accountId: 'POUP' }),
      ],
    });
    const dia = r.days.find((d) => d.date === '2026-10-20')!;
    expect(dia.outflow).toBe(3_000);
    expect(dia.inflow).toBe(0);
    expect(dia.closing).toBe(7_000);
  });

  it('poupança → caixa: só a entrada conta, é o aporte de volta', () => {
    const r = rodar({
      accounts: contas,
      openingBalances: saldos,
      events: [
        evento({ id: 'saiu', amountCents: 300_000, dueDate: '2026-10-20', accountId: 'POUP' }),
        evento({ id: 'entrou', direction: 'in', amountCents: 300_000, dueDate: '2026-10-20', accountId: 'CAIXA' }),
      ],
    });
    const dia = r.days.find((d) => d.date === '2026-10-20')!;
    expect(dia.inflow).toBe(3_000);
    expect(dia.outflow).toBe(0);
  });

  it('entre duas contas do caixa cancela no total, mas aparece nas duas contas', () => {
    const r = rodar({
      accounts: [conta('A'), conta('B')],
      openingBalances: new Map([['A', 10_000], ['B', 10_000]]),
      events: [
        evento({ id: 'ab-out', amountCents: 400_000, dueDate: '2026-10-20', accountId: 'A' }),
        evento({ id: 'ab-in', direction: 'in', amountCents: 400_000, dueDate: '2026-10-20', accountId: 'B' }),
      ],
    });
    const dia = r.days.find((d) => d.date === '2026-10-20')!;
    expect(dia.closing).toBe(20_000);
    expect(dia.byAccount.find((c) => c.accountId === 'A')!.closing).toBe(6_000);
    expect(dia.byAccount.find((c) => c.accountId === 'B')!.closing).toBe(14_000);
  });

  it('a poupança não entra no saldo de partida do caixa', () => {
    const r = rodar({ accounts: contas, openingBalances: saldos });
    expect(r.startingBalance).toBe(10_000);
  });

  it('cartão nunca compõe o caixa, mesmo marcado como caixa', () => {
    const r = rodar({
      accounts: [conta('A'), conta('CARD', { type: 'cartao', isCashAccount: true })],
      openingBalances: new Map([['A', 1_000], ['CARD', 99_999]]),
    });
    expect(r.startingBalance).toBe(1_000);
  });
});

describe('obrigação sem conta definida (48% da base em produção)', () => {
  const r = rodar({
    openingBalances: new Map([['A', 10_000]]),
    events: [
      evento({ id: 'sem-conta', amountCents: 200_000, dueDate: '2026-10-20', accountId: null }),
      evento({ id: 'com-conta', amountCents: 100_000, dueDate: '2026-10-20', accountId: 'A' }),
    ],
  });

  it('conta no consolidado, senão metade do previsto ficaria invisível', () => {
    const dia = r.days.find((d) => d.date === '2026-10-20')!;
    expect(dia.outflow).toBe(3_000);
    expect(dia.closing).toBe(7_000);
  });

  it('fica num balde próprio e é reportado no topo do resultado', () => {
    expect(r.unassignedTotal.outflow).toBe(2_000);
    const dia = r.days.find((d) => d.date === '2026-10-20')!;
    expect(dia.byAccount.find((c) => c.accountId === UNASSIGNED_ACCOUNT_ID)!.outflow).toBe(2_000);
  });

  it('o balde sem conta NÃO dispara alerta de conta negativa (seria alarme falso)', () => {
    const dia = r.days.find((d) => d.date === '2026-10-20')!;
    expect(dia.negativeAccountIds).not.toContain(UNASSIGNED_ACCOUNT_ID);
    expect(r.firstNegativeDay).toBeNull();
  });

  it('avisa que o alerta de conta negativa pode não refletir a realidade', () => {
    // Afirma a SUBSTÂNCIA do aviso, não a frase exata: o texto é copy e vai
    // mudar; o que não pode mudar é o leitor ser avisado de que o alerta de
    // conta negativa fica menos confiável quando há dinheiro sem conta.
    expect(r.warnings.some((w) => w.includes('conta negativa'))).toBe(true);
  });
});

describe('bordas do horizonte', () => {
  const casos: Array<[string, string, boolean]> = [
    ['vence hoje', HOJE, true],
    ['vence no último dia', '2026-11-02', true],
    ['vence um dia depois do horizonte', '2026-11-03', false],
  ];

  it.each(casos)('%s → entra no fluxo: %s', (_rotulo, data, deveEntrar) => {
    const r = rodar({ events: [evento({ id: 'alvo', dueDate: data })] });
    const ids = r.days.flatMap((d) => d.events.map((e) => e.id));
    expect(ids.includes('alvo')).toBe(deveEntrar);
  });

  it('data ilegível é descartada COM aviso, nunca em silêncio', () => {
    const r = rodar({ events: [evento({ id: 'ruim', dueDate: '2026-02-31', label: 'Aluguel' })] });
    const ids = r.days.flatMap((d) => d.events.map((e) => e.id));
    expect(ids).not.toContain('ruim');
    expect(r.warnings.some((w) => w.includes('Aluguel'))).toBe(true);
  });
});

describe('fuso e aritmética de data', () => {
  it('o horizonte atravessa virada de mês sem perder nem duplicar dia', () => {
    const r = rodar({ today: '2026-10-25', horizonDays: 15 });
    expect(r.days).toHaveLength(16);
    expect(r.days.at(-1)!.date).toBe('2026-11-09');
    expect(new Set(r.days.map((d) => d.date)).size).toBe(16);
  });

  it('atravessa o fim do horário de verão europeu sem desalinhar', () => {
    // Último domingo de outubro: o padrão `new Date(y, m, d+1)` duplicaria um dia.
    const r = rodar({ today: '2026-10-20', horizonDays: 15 });
    expect(new Set(r.days.map((d) => d.date)).size).toBe(16);
    expect(r.days.at(-1)!.date).toBe('2026-11-04');
  });

  it('recusa data de hoje inválida em vez de inventar um resultado', () => {
    expect(() => rodar({ today: '18/10/2026' })).toThrow(TypeError);
  });
});

describe('dinheiro guardado fora do caixa continua visível', () => {
  const r = rodar({
    accounts: [conta('CAIXA'), conta('POUP', { isCashAccount: false, name: 'Poupança' })],
    openingBalances: new Map([['CAIXA', 10_000], ['POUP', 30_000]]),
  });

  it('a poupança NÃO entra no saldo do caixa', () => {
    expect(r.startingBalance).toBe(10_000);
  });

  it('mas aparece separada, com o saldo dela', () => {
    // Sem isto, marcar a conta como "fora do caixa" faria o dinheiro sumir da
    // tela, e a mensagem do cadastro ("o saldo continua guardado e aparece
    // separado") viraria mentira. Achado no QA de 18/10/2026.
    expect(r.outOfPerimeter).toEqual([
      { accountId: 'POUP', name: 'Poupança', balance: 30_000 },
    ]);
  });

  it('cartão não aparece nessa lista (não é dinheiro guardado)', () => {
    const rr = rodar({
      accounts: [conta('A'), conta('CARD', { type: 'cartao', isCashAccount: false })],
      openingBalances: new Map([['A', 100]]),
    });
    expect(rr.outOfPerimeter).toEqual([]);
  });
});
