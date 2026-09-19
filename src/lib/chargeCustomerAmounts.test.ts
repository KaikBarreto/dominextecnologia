// Conta de dinheiro mostrada ao dono antes de gerar a cobrança: multa fixa em
// R$ vs multa percentual, juros ao mês proporcionais ao atraso, desconto por
// antecipação e arredondamento ao centavo.
import { describe, it, expect } from 'vitest';
import {
  computeCustomerAmounts,
  LATE_SCENARIO_DAYS,
} from './chargeCustomerAmounts';

describe('computeCustomerAmounts — multa', () => {
  it('multa PERCENTUAL incide sobre o valor da cobrança', () => {
    const r = computeCustomerAmounts({ baseAmount: 1000, fineType: 'PERCENTAGE', finePercent: 2 });
    expect(r.fineAmount).toBe(20);
    expect(r.amountWhenLate).toBe(1020);
  });

  it('multa FIXA é o valor em R$ digitado, sem virar percentual do valor', () => {
    // O mesmo "50" nos dois modos precisa dar resultados diferentes — é
    // exatamente o risco de mandar fine.type errado pra Asaas.
    const fixed = computeCustomerAmounts({ baseAmount: 1000, fineType: 'FIXED', fineAmount: 50 });
    const percent = computeCustomerAmounts({ baseAmount: 1000, fineType: 'PERCENTAGE', finePercent: 50 });
    expect(fixed.fineAmount).toBe(50);
    expect(fixed.amountWhenLate).toBe(1050);
    expect(percent.fineAmount).toBe(500);
  });

  it('modo FIXO ignora o campo de percentual e vice-versa (nunca soma os dois)', () => {
    const fixed = computeCustomerAmounts({
      baseAmount: 1000, fineType: 'FIXED', fineAmount: 30, finePercent: 2,
    });
    expect(fixed.fineAmount).toBe(30);

    const percent = computeCustomerAmounts({
      baseAmount: 1000, fineType: 'PERCENTAGE', fineAmount: 30, finePercent: 2,
    });
    expect(percent.fineAmount).toBe(20);
  });

  it('sem fineType explícito cai em PERCENTUAL (comportamento histórico)', () => {
    const r = computeCustomerAmounts({ baseAmount: 200, finePercent: 10 });
    expect(r.fineAmount).toBe(20);
  });

  it('multa zero/vazia/negativa não gera encargo', () => {
    for (const fineAmount of [0, null, undefined, -10, NaN]) {
      const r = computeCustomerAmounts({ baseAmount: 500, fineType: 'FIXED', fineAmount });
      expect(r.fineAmount).toBe(0);
      expect(r.hasLateCharges).toBe(false);
      expect(r.amountWhenLate).toBe(500);
    }
  });
});

describe('computeCustomerAmounts — juros', () => {
  it('juros ao mês com 30 dias de atraso é exatamente a taxa digitada', () => {
    const r = computeCustomerAmounts({ baseAmount: 1000, interestPercent: 1, lateDays: 30 });
    expect(r.interestAmount).toBe(10);
    expect(r.amountWhenLate).toBe(1010);
  });

  it('juros são proporcionais aos dias de atraso (base de 30 dias por mês)', () => {
    const r = computeCustomerAmounts({ baseAmount: 1000, interestPercent: 1, lateDays: 15 });
    expect(r.interestAmount).toBe(5);
  });

  it('sem atraso não há juros, mas a multa continua sendo cobrada de uma vez', () => {
    const r = computeCustomerAmounts({
      baseAmount: 1000, fineType: 'FIXED', fineAmount: 25, interestPercent: 1, lateDays: 0,
    });
    expect(r.interestAmount).toBe(0);
    expect(r.fineAmount).toBe(25);
    expect(r.amountWhenLate).toBe(1025);
  });

  it('juros não incidem sobre a multa, só sobre o valor da cobrança', () => {
    const r = computeCustomerAmounts({
      baseAmount: 1000, fineType: 'FIXED', fineAmount: 100, interestPercent: 10, lateDays: 30,
    });
    // 10% de 1000 = 100 (não 10% de 1100 = 110).
    expect(r.interestAmount).toBe(100);
    expect(r.lateChargesTotal).toBe(200);
    expect(r.amountWhenLate).toBe(1200);
  });

  it('lateDays ausente usa o recorte declarado do resumo (30 dias)', () => {
    const r = computeCustomerAmounts({ baseAmount: 1000, interestPercent: 2 });
    expect(r.lateDays).toBe(LATE_SCENARIO_DAYS);
    expect(r.interestAmount).toBe(20);
  });
});

describe('computeCustomerAmounts — desconto', () => {
  it('desconto percentual abate do valor e marca hasDiscount', () => {
    const r = computeCustomerAmounts({ baseAmount: 1000, discountPercent: 5, discountDays: 3 });
    expect(r.discountAmount).toBe(50);
    expect(r.amountOnTime).toBe(950);
    expect(r.hasDiscount).toBe(true);
    expect(r.discountDays).toBe(3);
  });

  it('sem desconto configurado não existe cenário de desconto (nada inventado)', () => {
    const r = computeCustomerAmounts({ baseAmount: 1000, finePercent: 2 });
    expect(r.hasDiscount).toBe(false);
    expect(r.discountAmount).toBe(0);
    expect(r.amountOnTime).toBe(1000);
  });

  it('desconto acima de 100% trava no valor, nunca vira cobrança negativa', () => {
    const r = computeCustomerAmounts({ baseAmount: 1000, discountPercent: 150 });
    expect(r.discountAmount).toBe(1000);
    expect(r.amountOnTime).toBe(0);
  });

  it('discountDays negativo ou quebrado vira 0 (até o vencimento)', () => {
    expect(computeCustomerAmounts({ baseAmount: 100, discountPercent: 1, discountDays: -4 }).discountDays).toBe(0);
    expect(computeCustomerAmounts({ baseAmount: 100, discountPercent: 1, discountDays: 2.7 }).discountDays).toBe(2);
  });
});

describe('computeCustomerAmounts — bordas', () => {
  it('valor zero não gera cenário nenhum', () => {
    const r = computeCustomerAmounts({
      baseAmount: 0, fineType: 'FIXED', fineAmount: 50, interestPercent: 1, discountPercent: 5,
    });
    expect(r.base).toBe(0);
    expect(r.hasDiscount).toBe(false);
    expect(r.hasLateCharges).toBe(false);
    expect(r.fineAmount).toBe(0);
    expect(r.interestAmount).toBe(0);
    expect(r.amountWhenLate).toBe(0);
  });

  it('arredonda ao centavo, sem cauda de ponto flutuante', () => {
    // 2% de 333,33 = 6,6666 → 6,67; juros 1%/mês em 7 dias = 0,77777 → 0,78.
    const r = computeCustomerAmounts({
      baseAmount: 333.33, finePercent: 2, interestPercent: 1, lateDays: 7,
    });
    expect(r.fineAmount).toBe(6.67);
    expect(r.interestAmount).toBe(0.78);
    expect(r.lateChargesTotal).toBe(7.45);
    expect(r.amountWhenLate).toBe(340.78);
    // Nenhum valor com mais de 2 casas.
    for (const v of [r.fineAmount, r.interestAmount, r.lateChargesTotal, r.amountWhenLate, r.amountOnTime]) {
      expect(Math.round(v * 100) / 100).toBe(v);
    }
  });

  it('multa e juros juntos somam num único total de atraso', () => {
    const r = computeCustomerAmounts({
      baseAmount: 1500, fineType: 'FIXED', fineAmount: 35.5, interestPercent: 2, lateDays: 30,
    });
    expect(r.fineAmount).toBe(35.5);
    expect(r.interestAmount).toBe(30);
    expect(r.lateChargesTotal).toBe(65.5);
    expect(r.amountWhenLate).toBe(1565.5);
    expect(r.hasLateCharges).toBe(true);
  });
});
