// Prova das regras da cobrança de contrato CONTÍNUA (janela rolante).
//
// O que não pode regredir, e por quê:
//   • a contagem que a tela PROMETE é a que ela GERA (e a que o cron espera
//     achar no dia seguinte — senão o usuário cria 24 e vê 25 de manhã);
//   • a descrição da parcela contínua NÃO leva "(n/total)" e usa exatamente o
//     mesmo rótulo de mês que o Postgres escreve;
//   • os três campos da regra NUNCA saem separados (o CHECK do banco recusa a
//     flag sem passo e âncora);
//   • ligar a cobrança num contrato antigo não gera parcela retroativa.
import { describe, it, expect } from 'vitest';
import {
  CONTINUOUS_BILLING_HORIZON_MONTHS,
  FINANCE_FREQUENCY_MONTHS,
  billingMonthLabel,
  buildContractFinanceRule,
  continuousInitialCount,
  continuousLastDueDate,
  contractInstallmentDescription,
  nextNonRetroactiveDue,
  resolveContractBillingRule,
} from './contract-billing';
import { buildRepetitionPlan } from './finance-installments';

describe('continuousInitialCount — o lote inicial concorda com o cron', () => {
  it('mensal 25, bimestral 13, trimestral 9, semestral 5, anual 3', () => {
    expect(continuousInitialCount(1)).toBe(25);
    expect(continuousInitialCount(2)).toBe(13);
    expect(continuousInitialCount(3)).toBe(9);
    expect(continuousInitialCount(6)).toBe(5);
    expect(continuousInitialCount(12)).toBe(3);
  });

  it('é floor(24/passo)+1 para todo passo válido, nunca "24/passo" seco', () => {
    for (const step of [1, 2, 3, 6, 12]) {
      expect(continuousInitialCount(step)).toBe(
        Math.floor(CONTINUOUS_BILLING_HORIZON_MONTHS / step) + 1,
      );
    }
  });

  it('o +1 é o que cobre o horizonte do cron: a última parcela cai EM hoje+24 meses, não antes', () => {
    // O cron materializa até hoje+24 meses. Ancorando hoje, a grade do lote
    // inicial tem que alcançar esse ponto — senão o cron insere na 1a rodada.
    for (const step of [1, 2, 3, 6, 12]) {
      const count = continuousInitialCount(step);
      const last = continuousLastDueDate('2026-09-19', step, count);
      expect(last).toBe('2028-09-19');
    }
  });

  it('passo inválido (frequência única) não explode: devolve 1', () => {
    expect(continuousInitialCount(0)).toBe(1);
    expect(continuousInitialCount(Number.NaN)).toBe(1);
  });
});

describe('a contagem prometida é a contagem gerada', () => {
  it('o plano do motor tem exatamente o tamanho anunciado, em toda frequência', () => {
    for (const step of [1, 2, 3, 6, 12]) {
      const count = continuousInitialCount(step);
      const plan = buildRepetitionPlan({
        firstDate: '2026-09-19',
        amount: 450,
        count,
        intervalMonths: step,
      });
      expect(plan).toHaveLength(count);
      expect(plan[plan.length - 1].date).toBe(continuousLastDueDate('2026-09-19', step, count));
    }
  });

  it('nenhuma frequência estoura o teto físico de 120', () => {
    for (const step of Object.values(FINANCE_FREQUENCY_MONTHS)) {
      expect(continuousInitialCount(step)).toBeLessThanOrEqual(120);
    }
  });
});

describe('continuousLastDueDate — mês de calendário com clamp, medido desde a âncora', () => {
  it('31/01 mensal não escorrega pro dia 3 de março', () => {
    expect(continuousLastDueDate('2026-01-31', 1, 2)).toBe('2026-02-28');
    expect(continuousLastDueDate('2026-01-31', 1, 3)).toBe('2026-03-31');
    expect(continuousLastDueDate('2026-01-31', 1, 4)).toBe('2026-04-30');
  });

  it('volta ao dia 31 depois de fevereiro (passo medido da âncora, não cumulativo)', () => {
    // Se o passo fosse cumulativo (28/02 + 1 mês), a série ficaria presa no 28.
    expect(continuousLastDueDate('2026-01-31', 1, 13)).toBe('2027-01-31');
  });

  it('fevereiro bissexto', () => {
    expect(continuousLastDueDate('2028-01-31', 1, 2)).toBe('2028-02-29');
  });

  it('anual mantém o dia', () => {
    expect(continuousLastDueDate('2026-09-19', 12, 3)).toBe('2028-09-19');
  });
});

describe('contractInstallmentDescription', () => {
  it('série contínua NÃO numera (total é desconhecido)', () => {
    expect(
      contractInstallmentDescription({
        base: 'Mensalidade do contrato',
        date: '2026-09-30',
        number: 1,
        total: 25,
        continuous: true,
      }),
    ).toBe('Mensalidade do contrato - set/2026');
  });

  it('série contínua leva o mês já na PRIMEIRA parcela, mesmo se o lote tiver 1 só', () => {
    expect(
      contractInstallmentDescription({
        base: 'Mensalidade',
        date: '2026-12-05',
        number: 1,
        total: 1,
        continuous: true,
      }),
    ).toBe('Mensalidade - dez/2026');
  });

  it('série fechada numera (n/total)', () => {
    expect(
      contractInstallmentDescription({
        base: 'Mensalidade',
        date: '2026-09-30',
        number: 3,
        total: 12,
        continuous: false,
      }),
    ).toBe('Mensalidade - set/2026 (3/12)');
  });

  it('lançamento único fechado não ganha mês nem numeração', () => {
    expect(
      contractInstallmentDescription({
        base: 'Taxa de adesão',
        date: '2026-09-30',
        number: 1,
        total: 1,
        continuous: false,
      }),
    ).toBe('Taxa de adesão');
  });

  it('rótulo de mês em pt-BR minúsculo e sem ponto, igual ao array do Postgres', () => {
    const abbr = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    abbr.forEach((expected, i) => {
      const month = String(i + 1).padStart(2, '0');
      expect(billingMonthLabel(`2026-${month}-15`)).toBe(`${expected}/2026`);
    });
  });

  it('a descrição contínua casa com o regex que o cron usa pra extrair a base', () => {
    // regexp_replace(desc, '\s+-\s+[A-Za-z]{3}\.?/[0-9]{4}\s*$', '') no SQL.
    const desc = contractInstallmentDescription({
      base: 'Mensalidade do contrato',
      date: '2026-09-30',
      number: 1,
      total: 25,
      continuous: true,
    });
    expect(desc.replace(/\s+-\s+[A-Za-z]{3}\.?\/[0-9]{4}\s*$/, '')).toBe('Mensalidade do contrato');
  });
});

describe('buildContractFinanceRule — os 3 campos nunca viajam separados', () => {
  it('ligado devolve flag + passo + âncora, sempre os três', () => {
    const rule = buildContractFinanceRule({
      indeterminate: true,
      intervalMonths: 1,
      anchorDate: '2026-09-30',
    });
    expect(rule).toEqual({
      finance_indeterminate: true,
      finance_interval_months: 1,
      finance_anchor_date: '2026-09-30',
    });
    // O CHECK do banco: flag ligada exige os outros dois preenchidos.
    expect(rule.finance_interval_months).not.toBeNull();
    expect(rule.finance_anchor_date).not.toBeNull();
  });

  it('desligado devolve a flag em false (o CHECK não exige mais nada)', () => {
    expect(buildContractFinanceRule({ indeterminate: false })).toEqual({
      finance_indeterminate: false,
      finance_interval_months: null,
      finance_anchor_date: null,
    });
  });

  it('recusa ligar sem passo que se repita (frequência única) antes de bater no banco', () => {
    expect(() =>
      buildContractFinanceRule({ indeterminate: true, intervalMonths: 0, anchorDate: '2026-09-30' }),
    ).toThrow(/frequência de cobrança/i);
  });

  it('recusa passo fora de 1..12 (o CHECK do banco também recusaria)', () => {
    expect(() =>
      buildContractFinanceRule({ indeterminate: true, intervalMonths: 24, anchorDate: '2026-09-30' }),
    ).toThrow();
  });

  it('recusa ligar sem âncora, ou com âncora que não é dia de calendário', () => {
    expect(() =>
      buildContractFinanceRule({ indeterminate: true, intervalMonths: 1, anchorDate: '' }),
    ).toThrow(/primeiro vencimento/i);
    expect(() =>
      buildContractFinanceRule({ indeterminate: true, intervalMonths: 1, anchorDate: '30/09/2026' }),
    ).toThrow();
  });

  it('toda frequência que a tela oferece (menos "única") produz uma regra válida', () => {
    for (const [value, months] of Object.entries(FINANCE_FREQUENCY_MONTHS)) {
      if (value === 'unica') continue;
      const rule = buildContractFinanceRule({
        indeterminate: true,
        intervalMonths: months,
        anchorDate: '2026-09-30',
      });
      expect(rule.finance_indeterminate).toBe(true);
      expect(rule.finance_interval_months).toBe(months);
      expect(rule.finance_anchor_date).toBe('2026-09-30');
    }
  });
});

describe('resolveContractBillingRule — a decisão que as telas usam', () => {
  it('frequência "única" NUNCA vira contínuo, mesmo com o interruptor ligado', () => {
    // Caso real de rascunho: o usuário liga o contínuo em mensal, volta e troca
    // pra "única". O estado de UI pode ficar pra trás, a regra não pode.
    const rule = resolveContractBillingRule({
      generate: true,
      continuous: true,
      frequency: 'unica',
      firstDue: '2026-09-30',
    });
    expect(rule.finance_indeterminate).toBe(false);
  });

  it('não gerar parcela nenhuma nunca marca o contrato como contínuo', () => {
    expect(
      resolveContractBillingRule({
        generate: false,
        continuous: true,
        frequency: 'mensal',
        firstDue: '2026-09-30',
      }).finance_indeterminate,
    ).toBe(false);
  });

  it('sem primeiro vencimento não marca contínuo (em vez de estourar na gravação)', () => {
    expect(
      resolveContractBillingRule({
        generate: true,
        continuous: true,
        frequency: 'mensal',
        firstDue: '',
      }).finance_indeterminate,
    ).toBe(false);
  });

  it('frequência desconhecida não vira contínuo', () => {
    expect(
      resolveContractBillingRule({
        generate: true,
        continuous: true,
        frequency: 'quinzenal',
        firstDue: '2026-09-30',
      }).finance_indeterminate,
    ).toBe(false);
  });

  it('ligado e válido devolve os três campos juntos', () => {
    expect(
      resolveContractBillingRule({
        generate: true,
        continuous: true,
        frequency: 'trimestral',
        firstDue: '2026-09-30',
      }),
    ).toEqual({
      finance_indeterminate: true,
      finance_interval_months: 3,
      finance_anchor_date: '2026-09-30',
    });
  });

  it('nenhuma combinação que a tela consegue produzir grava a flag sozinha', () => {
    // Varredura do espaço inteiro de estados possíveis das duas telas.
    for (const generate of [true, false]) {
      for (const continuous of [true, false]) {
        for (const frequency of [...Object.keys(FINANCE_FREQUENCY_MONTHS), 'quinzenal']) {
          for (const firstDue of ['', '2026-09-30', '2026-01-31']) {
            const rule = resolveContractBillingRule({ generate, continuous, frequency, firstDue });
            // A invariante do CHECK do banco, em uma linha.
            if (rule.finance_indeterminate) {
              expect(rule.finance_interval_months).toBeGreaterThanOrEqual(1);
              expect(rule.finance_anchor_date).toBe(firstDue);
            }
          }
        }
      }
    }
  });

  it('nunca estoura: a guarda de "única" vem ANTES do throw do construtor', () => {
    expect(() =>
      resolveContractBillingRule({
        generate: true,
        continuous: true,
        frequency: 'unica',
        firstDue: '',
      }),
    ).not.toThrow();
  });
});

describe('nextNonRetroactiveDue — ligar a cobrança hoje não cobra o passado', () => {
  it('contrato de 2 anos atrás: o primeiro vencimento cai à frente de hoje, no mesmo dia do mês', () => {
    const due = nextNonRetroactiveDue({
      startDate: '2024-03-10',
      intervalMonths: 1,
      today: '2026-09-19',
    });
    expect(due >= '2026-09-19').toBe(true);
    expect(due).toBe('2026-10-10');
  });

  it('não pula mais do que o necessário (a primeira data válida, não a seguinte)', () => {
    expect(
      nextNonRetroactiveDue({ startDate: '2024-03-10', intervalMonths: 1, today: '2026-10-10' }),
    ).toBe('2026-10-10');
  });

  it('contrato anual respeita o passo de 12 meses', () => {
    expect(
      nextNonRetroactiveDue({ startDate: '2020-05-04', intervalMonths: 12, today: '2026-09-19' }),
    ).toBe('2027-05-04');
  });

  it('dia 31 com clamp: nunca escorrega pro mês seguinte', () => {
    const due = nextNonRetroactiveDue({
      startDate: '2024-01-31',
      intervalMonths: 1,
      today: '2026-02-05',
    });
    expect(due).toBe('2026-02-28');
  });

  it('contrato que começa no futuro mantém a data de início', () => {
    expect(
      nextNonRetroactiveDue({ startDate: '2027-01-15', intervalMonths: 1, today: '2026-09-19' }),
    ).toBe('2027-01-15');
  });

  it('frequência única cai em hoje (não existe grade pra avançar)', () => {
    expect(
      nextNonRetroactiveDue({ startDate: '2024-03-10', intervalMonths: 0, today: '2026-09-19' }),
    ).toBe('2026-09-19');
  });
});
