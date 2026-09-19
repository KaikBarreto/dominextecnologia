import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeSubscriptionTotals, isClosedSubscription } from './subscriptionSummary';
import { MAX_REPETITION_COUNT } from './finance-installments';

describe('computeSubscriptionTotals — por ciclo x total', () => {
  it('assinatura contínua não tem total (não inventa 12 meses)', () => {
    const r = computeSubscriptionTotals({ netPerCycle: 291, customerPerCycle: 300 });
    expect(r.isLimited).toBe(false);
    expect(r.cycles).toBeNull();
    expect(r.netTotal).toBeNull();
    expect(r.customerTotal).toBeNull();
    // O valor por cobrança continua existindo — é o que a tela mostra sempre.
    expect(r.netPerCycle).toBe(291);
    expect(r.customerPerCycle).toBe(300);
  });

  it('assinatura com fim multiplica pelo número de ciclos', () => {
    const r = computeSubscriptionTotals({ netPerCycle: 291, customerPerCycle: 300, cycles: 12 });
    expect(r.isLimited).toBe(true);
    expect(r.cycles).toBe(12);
    expect(r.netTotal).toBe(3492);
    expect(r.customerTotal).toBe(3600);
    // O por-ciclo NUNCA é substituído pelo total (é a confusão que o módulo existe pra evitar).
    expect(r.netPerCycle).toBe(291);
  });

  it('arredonda ao centavo, sem meio centavo na tela', () => {
    // O por-ciclo é arredondado PRIMEIRO (99,955 → 99,96) e o total multiplica
    // o valor já arredondado: é o número que o usuário vê na linha de cima
    // vezes a quantidade de cobranças, sem "sobrinha" inexplicável no total.
    const r = computeSubscriptionTotals({ netPerCycle: 99.955, customerPerCycle: 0, cycles: 3 });
    expect(r.netPerCycle).toBe(99.96);
    expect(r.netTotal).toBe(299.88);
  });

  it('1 ciclo é assinatura fechada (total = a própria cobrança)', () => {
    const r = computeSubscriptionTotals({ netPerCycle: 50, customerPerCycle: 55, cycles: 1 });
    expect(r.isLimited).toBe(true);
    expect(r.netTotal).toBe(50);
    expect(r.customerTotal).toBe(55);
  });

  it('valor negativo, NaN ou vazio vira zero (nunca líquido negativo na tela)', () => {
    const r = computeSubscriptionTotals({
      netPerCycle: -10,
      customerPerCycle: Number.NaN,
      cycles: 4,
    });
    expect(r.netPerCycle).toBe(0);
    expect(r.customerPerCycle).toBe(0);
    expect(r.netTotal).toBe(0);
  });

  it.each([0, -3, 1.5, Number.NaN, null, undefined])(
    'ciclos inválidos (%s) caem em contínua, sem total inventado',
    (cycles) => {
      const r = computeSubscriptionTotals({
        netPerCycle: 100,
        customerPerCycle: 100,
        cycles: cycles as number | null | undefined,
      });
      expect(r.isLimited).toBe(false);
      expect(r.netTotal).toBeNull();
    },
  );

  it('ciclos acima do teto não fecham total (o formulário já recusa o envio)', () => {
    expect(isClosedSubscription(MAX_REPETITION_COUNT)).toBe(true);
    expect(isClosedSubscription(MAX_REPETITION_COUNT + 1)).toBe(false);
    const r = computeSubscriptionTotals({
      netPerCycle: 100,
      customerPerCycle: 100,
      cycles: MAX_REPETITION_COUNT + 1,
    });
    expect(r.isLimited).toBe(false);
    expect(r.netTotal).toBeNull();
  });
});

describe('teto de ciclos — cliente e servidor não podem divergir', () => {
  // O vitest só roda `src/**` (ver vitest.config.ts), então o edge não tem
  // teste próprio. Esta asserção lê o arquivo do edge e trava o número: se
  // alguém mudar o limite só de um lado, o teste quebra aqui. É a única
  // proteção automática contra "front aceita 120, servidor aceita 999".
  it('o edge de criação usa o MESMO teto do motor de parcelamento', () => {
    const edge = readFileSync(
      resolve(process.cwd(), 'supabase/functions/tenant-asaas-create-subscription/index.ts'),
      'utf8',
    );
    const match = /MAX_PAYMENTS_CEILING\s*=\s*(\d+)/.exec(edge);
    expect(match, 'MAX_PAYMENTS_CEILING não encontrado no edge').toBeTruthy();
    expect(Number(match![1])).toBe(MAX_REPETITION_COUNT);
  });
});
