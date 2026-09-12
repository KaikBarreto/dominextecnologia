import { describe, it, expect } from 'vitest';
import {
  addMonthsISO,
  buildInstallmentDates,
  splitInstallmentAmounts,
  buildInstallmentPlan,
  buildCardReceivablePlan,
  receivableInstallmentCount,
  buildRepetitionPlan,
  repetitionTotal,
} from './finance-installments';

/**
 * Regressão do bug do passo mensal: `Date.setMonth` nativo não faz clamp de fim
 * de mês, então 4 parcelas a partir de 31/01/2026 saíam
 * `31/01, 03/03, 31/03, 01/05`. O certo é `31/01, 28/02, 31/03, 30/04`.
 */
describe('addMonthsISO — passo mensal com clamp', () => {
  it('31/01 avança para 28/02 (ano comum), 31/03 e 30/04', () => {
    expect(buildInstallmentDates('2026-01-31', 4)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('30/01 avança para 28/02 (clamp, nunca 02/03)', () => {
    expect(addMonthsISO('2026-01-30', 1)).toBe('2026-02-28');
  });

  it('29/01 avança para 28/02 em ano comum e 29/02 em bissexto', () => {
    expect(addMonthsISO('2026-01-29', 1)).toBe('2026-02-28');
    expect(addMonthsISO('2028-01-29', 1)).toBe('2028-02-29');
  });

  it('31/01/2028 (bissexto) avança para 29/02', () => {
    expect(addMonthsISO('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('mês de 31 seguido de mês de 30 também faz clamp', () => {
    expect(addMonthsISO('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonthsISO('2026-05-31', 1)).toBe('2026-06-30');
  });

  it('vira o ano corretamente', () => {
    expect(addMonthsISO('2026-12-31', 1)).toBe('2027-01-31');
    expect(addMonthsISO('2026-12-31', 2)).toBe('2027-02-28');
  });

  it('dia "seguro" (<=28) nunca desloca', () => {
    expect(buildInstallmentDates('2026-01-15', 6)).toEqual([
      '2026-01-15', '2026-02-15', '2026-03-15',
      '2026-04-15', '2026-05-15', '2026-06-15',
    ]);
  });

  it('offset 0 devolve a própria data', () => {
    expect(addMonthsISO('2026-01-31', 0)).toBe('2026-01-31');
  });
});

describe('splitInstallmentAmounts — rateio ao centavo', () => {
  const soma = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

  it('1000 em 3x soma exatamente 1000', () => {
    const parts = splitInstallmentAmounts(1000, 3);
    expect(parts).toEqual([333.33, 333.33, 333.34]);
    expect(soma(parts)).toBe(1000);
  });

  it('0,01 em 2x soma exatamente 0,01 (sobra na última)', () => {
    const parts = splitInstallmentAmounts(0.01, 2);
    expect(soma(parts)).toBe(0.01);
  });

  it('8557,99 em 7x soma exatamente 8557,99', () => {
    const parts = splitInstallmentAmounts(8557.99, 7);
    expect(parts).toHaveLength(7);
    expect(soma(parts)).toBe(8557.99);
  });

  it('soma bate ao centavo para uma varredura de valores e parcelas', () => {
    const valores = [0.01, 0.03, 1, 9.99, 100, 1000, 1234.56, 8557.99, 99999.99];
    for (const total of valores) {
      for (let n = 1; n <= 12; n++) {
        expect(soma(splitInstallmentAmounts(total, n))).toBe(Math.round(total * 100) / 100);
      }
    }
  });

  it('à vista (1x) devolve o total inteiro', () => {
    expect(splitInstallmentAmounts(1234.56, 1)).toEqual([1234.56]);
  });
});

describe('buildInstallmentPlan', () => {
  it('casa data e valor por parcela', () => {
    expect(buildInstallmentPlan('2026-01-31', 1000, 3)).toEqual([
      { number: 1, date: '2026-01-31', amount: 333.33 },
      { number: 2, date: '2026-02-28', amount: 333.33 },
      { number: 3, date: '2026-03-31', amount: 333.34 },
    ]);
  });
});

/**
 * Bug relatado pelo sócio: receita de R$ 789,00 que o cliente paga em 10x no
 * crédito virava 10 recebíveis de R$ 78,90 no Contas a Receber, mesmo quando a
 * empresa antecipa e recebe tudo de uma vez.
 *
 * A trava mais importante aqui é a ÚLTIMA: nenhum dos dois modos pode somar
 * mais (nem menos) que o valor da venda. Se algum dia alguém somar a linha
 * cheia + as parcelas, a receita dobra.
 */
describe('crédito parcelado: como o cliente paga ≠ como o dinheiro entra', () => {
  const VENDA = 789;
  const DATA = '2026-09-12';

  it('sem antecipação: 10 recebíveis de R$ 78,90 (comportamento de hoje)', () => {
    const rows = buildCardReceivablePlan({
      firstDate: DATA, total: VENDA, installmentCount: 10, mode: 'as_customer_pays',
    });
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.amount === 78.9)).toBe(true);
    expect(rows[0].date).toBe('2026-09-12');
    expect(rows[9].date).toBe('2027-06-12');
  });

  it('com antecipação: 1 recebível só, com o valor cheio da venda', () => {
    const rows = buildCardReceivablePlan({
      firstDate: DATA, total: VENDA, installmentCount: 10, mode: 'anticipated',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ number: 1, date: DATA, amount: 789 });
  });

  it('os dois modos somam exatamente o valor da venda, uma vez só', () => {
    const soma = (mode: 'anticipated' | 'as_customer_pays') =>
      buildCardReceivablePlan({ firstDate: DATA, total: VENDA, installmentCount: 10, mode })
        .reduce((acc, r) => acc + r.amount, 0);
    expect(soma('anticipated')).toBeCloseTo(789, 2);
    expect(soma('as_customer_pays')).toBeCloseTo(789, 2);
  });

  it('antecipado ainda fecha ao centavo quando o rateio não divide redondo', () => {
    const rows = buildCardReceivablePlan({
      firstDate: DATA, total: 1000, installmentCount: 3, mode: 'anticipated',
    });
    expect(rows).toEqual([{ number: 1, date: DATA, amount: 1000 }]);
  });

  it('antecipado não empurra a data: o dinheiro entra na data do lançamento', () => {
    const rows = buildCardReceivablePlan({
      firstDate: '2026-01-31', total: 500, installmentCount: 12, mode: 'anticipated',
    });
    expect(rows[0].date).toBe('2026-01-31');
  });
});

describe('receivableInstallmentCount — o que é gravado no banco', () => {
  it('antecipado grava 1 parcela, não importa em quantas vezes o cliente pagou', () => {
    expect(receivableInstallmentCount({ installmentCount: 10, mode: 'anticipated' })).toBe(1);
    expect(receivableInstallmentCount({ installmentCount: 21, mode: 'anticipated' })).toBe(1);
  });

  it('sem antecipação grava as N parcelas', () => {
    expect(receivableInstallmentCount({ installmentCount: 10, mode: 'as_customer_pays' })).toBe(10);
  });

  it('pergunta que não se aplica (mode null) não muda nada', () => {
    expect(receivableInstallmentCount({ installmentCount: 10, mode: null })).toBe(10);
    expect(receivableInstallmentCount({ installmentCount: 1, mode: null })).toBe(1);
  });

  it('nunca devolve menos que 1', () => {
    expect(receivableInstallmentCount({ installmentCount: 0, mode: null })).toBe(1);
    expect(receivableInstallmentCount({ installmentCount: -3, mode: 'as_customer_pays' })).toBe(1);
  });
});

/**
 * REPETIÇÃO ≠ PARCELAMENTO. O contrato PMOC de 48 mensalidades de R$ 180 gera
 * 48 lançamentos de R$ 180 (total R$ 8.640). Se por engano ele passasse pelo
 * motor de PARCELAMENTO, viraria 48 pedaços de R$ 3,75 (total R$ 180) — que é
 * exatamente o estrago que estes testes existem pra travar.
 */
describe('buildRepetitionPlan — repetição não divide valor', () => {
  it('48 mensalidades de R$ 180 continuam valendo R$ 180 cada', () => {
    const plan = buildRepetitionPlan({
      firstDate: '2026-01-10', amount: 180, count: 48, intervalMonths: 1,
    });
    expect(plan).toHaveLength(48);
    expect(plan.every((p) => p.amount === 180)).toBe(true);
    expect(repetitionTotal(180, 48)).toBe(8640);
  });

  it('NÃO se comporta como parcelamento (contraste explícito)', () => {
    const repeticao = buildRepetitionPlan({
      firstDate: '2026-01-10', amount: 180, count: 48, intervalMonths: 1,
    });
    const parcelamento = buildInstallmentPlan('2026-01-10', 180, 48);
    expect(repeticao[0].amount).toBe(180);
    expect(parcelamento[0].amount).toBe(3.75);
  });

  it('numera de 1 a N', () => {
    const plan = buildRepetitionPlan({
      firstDate: '2026-01-10', amount: 100, count: 3, intervalMonths: 1,
    });
    expect(plan.map((p) => p.number)).toEqual([1, 2, 3]);
  });

  it('passo mensal faz clamp de fim de mês (31/01 nunca vira 03/03)', () => {
    const plan = buildRepetitionPlan({
      firstDate: '2026-01-31', amount: 180, count: 4, intervalMonths: 1,
    });
    expect(plan.map((p) => p.date)).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    ]);
  });

  it('fevereiro de ano bissexto também faz clamp', () => {
    const plan = buildRepetitionPlan({
      firstDate: '2028-01-31', amount: 180, count: 2, intervalMonths: 1,
    });
    expect(plan[1].date).toBe('2028-02-29');
  });

  it('trimestral anda de 3 em 3 meses', () => {
    const plan = buildRepetitionPlan({
      firstDate: '2026-01-15', amount: 500, count: 4, intervalMonths: 3,
    });
    expect(plan.map((p) => p.date)).toEqual([
      '2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15',
    ]);
  });

  it('anual vira o ano certo', () => {
    const plan = buildRepetitionPlan({
      firstDate: '2026-02-28', amount: 1200, count: 2, intervalMonths: 12,
    });
    expect(plan[1].date).toBe('2027-02-28');
  });

  it('frequência única: 1 ocorrência, passo 0', () => {
    const plan = buildRepetitionPlan({
      firstDate: '2026-05-10', amount: 180, count: 1, intervalMonths: 0,
    });
    expect(plan).toEqual([{ number: 1, date: '2026-05-10', amount: 180 }]);
  });

  it('nunca devolve menos de 1 ocorrência', () => {
    expect(buildRepetitionPlan({ firstDate: '2026-05-10', amount: 180, count: 0, intervalMonths: 1 })).toHaveLength(1);
    expect(buildRepetitionPlan({ firstDate: '2026-05-10', amount: 180, count: -5, intervalMonths: 1 })).toHaveLength(1);
  });

  it('arredonda o valor ao centavo, sem espalhar sobra (não há sobra em repetição)', () => {
    const plan = buildRepetitionPlan({
      firstDate: '2026-01-10', amount: 180.005, count: 3, intervalMonths: 1,
    });
    expect(plan.map((p) => p.amount)).toEqual([180.01, 180.01, 180.01]);
    expect(repetitionTotal(180.01, 3)).toBe(540.03);
  });
});
