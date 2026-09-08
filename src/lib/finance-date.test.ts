import { describe, it, expect } from 'vitest';

import {
  getEffectiveTransactionMonthRange,
  isTransactionInDateRange,
  type FinanceDateScope,
} from './finance-date';

/**
 * A invariante que sustenta o deep-link `/financeiro/movimentacoes?txn=<id>`:
 * o range devolvido por `getEffectiveTransactionMonthRange(txn, scope)` SEMPRE
 * faz `isTransactionInDateRange(txn, range, scope)` retornar `true`. Se isso
 * quebrar, o deep-link "funciona" (navega, filtra) mas a linha não aparece —
 * falha silenciosa, sem erro nenhum na tela.
 *
 * Por isso todo caso abaixo, além de conferir o mês esperado, roda as duas
 * funções de verdade (nada de reimplementar a lógica aqui).
 */
function expectInvariante(
  txn: Parameters<typeof getEffectiveTransactionMonthRange>[0],
  scope: FinanceDateScope
) {
  const range = getEffectiveTransactionMonthRange(txn, scope);
  expect(range).not.toBeNull();
  if (!range) return; // guarda de tipo pro TS
  expect(isTransactionInDateRange(txn, range, scope)).toBe(true);
  return range;
}

describe('getEffectiveTransactionMonthRange', () => {
  it('recebimento simples pago em 31/07 → range de julho/2026 e a transação cai dentro dele', () => {
    // Caso real que originou o recurso: orçamento aprovado com recebimento em
    // 31/07, procurado pelo cliente em setembro (tela abria em "este mês").
    const txn = { transaction_date: '2026-07-31', is_paid: true };
    const range = expectInvariante(txn, 'caixa');
    expect(range?.from.getFullYear()).toBe(2026);
    expect(range?.from.getMonth()).toBe(6); // julho (0-indexed)
    expect(range?.to.getMonth()).toBe(6);
  });

  it('último dia do mês (31/07) não escorrega pra agosto', () => {
    const txn = { transaction_date: '2026-07-31', is_paid: true };
    const range = expectInvariante(txn, 'caixa');
    // `to` precisa cobrir o próprio 31/07, não virar 01/08.
    expect(range?.to.getMonth()).toBe(6);
    expect(range?.to.getDate()).toBe(31);
  });

  it('primeiro dia do mês (01/07) não escorrega pra junho', () => {
    const txn = { transaction_date: '2026-07-01', is_paid: true };
    const range = expectInvariante(txn, 'caixa');
    // `from` precisa cobrir o próprio 01/07, não virar 30/06.
    expect(range?.from.getMonth()).toBe(6);
    expect(range?.from.getDate()).toBe(1);
  });

  it('compra de cartão: range segue o mês da FATURA, não o da compra', () => {
    // Compra em 25/08, fatura vence em 10/09 — quem manda no filtro é a fatura.
    const txn = {
      transaction_date: '2026-08-25',
      credit_card_bill_date: '2026-09-10',
    };
    const range = expectInvariante(txn, 'caixa');
    expect(range?.from.getMonth()).toBe(8); // setembro
    expect(range?.to.getMonth()).toBe(8);
  });

  it('escopo "pagar": transação não paga segue due_date, mesmo com transaction_date em outro mês', () => {
    const txn = {
      transaction_date: '2026-06-15',
      due_date: '2026-08-05',
      is_paid: false,
    };
    const range = expectInvariante(txn, 'pagar');
    expect(range?.from.getMonth()).toBe(7); // agosto
    expect(range?.to.getMonth()).toBe(7);
  });

  it('sem data utilizável → retorna null em vez de estourar ou devolver range inválido', () => {
    const txn = { transaction_date: null, due_date: null };
    expect(getEffectiveTransactionMonthRange(txn, 'caixa')).toBeNull();
    expect(getEffectiveTransactionMonthRange({}, 'pagar')).toBeNull();
  });

  /**
   * Bug reproduzido em QA: com a máquina num fuso à frente do fuso do app
   * (ex: Europe/Lisbon rodando, app formatando em America/Sao_Paulo), o rótulo
   * do deep-link `?txn=` de um lançamento de 31/07 mostrava "30/06 - 31/07" —
   * como se o período começasse em junho. A causa era `startOfMonth` ancorar
   * em meia-noite da MÁQUINA; convertido pro fuso do app, meia-noite do dia 1
   * podia cair no dia 30 do mês anterior. As bordas agora ficam ao meio-dia,
   * que fica bem longe da virada do dia (00:00) nos dois lados — os fusos
   * reais usados por máquina/app (todos entre UTC-12 e UTC+14) não têm
   * diferença suficiente pra empurrar meio-dia até 00:00 do dia seguinte
   * nem até 23:59:59 do dia anterior. Os asserts abaixo provam isso batendo
   * contra os dois extremos plausíveis: America/Sao_Paulo (fuso do app) e UTC.
   */
  describe('bordas do range não escorregam de mês quando formatadas em outro fuso', () => {
    function formatDay(d: Date, timeZone: string): number {
      return Number(
        new Intl.DateTimeFormat('en-CA', { timeZone, day: '2-digit' }).format(d)
      );
    }
    function formatMonth(d: Date, timeZone: string): number {
      return Number(
        new Intl.DateTimeFormat('en-CA', { timeZone, month: '2-digit' }).format(d)
      );
    }

    it('último dia de julho (31/07): from=01/07 e to=31/07 em America/Sao_Paulo e em UTC', () => {
      const txn = { transaction_date: '2026-07-31', is_paid: true };
      const range = expectInvariante(txn, 'caixa');
      if (!range) return;

      for (const timeZone of ['America/Sao_Paulo', 'UTC']) {
        expect(formatMonth(range.from, timeZone)).toBe(7); // julho
        expect(formatDay(range.from, timeZone)).toBe(1);
        expect(formatMonth(range.to, timeZone)).toBe(7);
        expect(formatDay(range.to, timeZone)).toBe(31);
      }
    });

    it('primeiro dia de julho (01/07): from=01/07 e to=31/07 em America/Sao_Paulo e em UTC', () => {
      const txn = { transaction_date: '2026-07-01', is_paid: true };
      const range = expectInvariante(txn, 'caixa');
      if (!range) return;

      for (const timeZone of ['America/Sao_Paulo', 'UTC']) {
        expect(formatMonth(range.from, timeZone)).toBe(7);
        expect(formatDay(range.from, timeZone)).toBe(1);
        expect(formatMonth(range.to, timeZone)).toBe(7);
        expect(formatDay(range.to, timeZone)).toBe(31);
      }
    });

    it('fevereiro (mês de 28 dias) em ano não-bissexto: to cai em 28/02, não em 01/03', () => {
      const txn = { transaction_date: '2026-02-15', is_paid: true };
      const range = expectInvariante(txn, 'caixa');
      if (!range) return;

      for (const timeZone of ['America/Sao_Paulo', 'UTC']) {
        expect(formatMonth(range.from, timeZone)).toBe(2);
        expect(formatDay(range.from, timeZone)).toBe(1);
        expect(formatMonth(range.to, timeZone)).toBe(2);
        expect(formatDay(range.to, timeZone)).toBe(28);
      }
    });
  });
});
