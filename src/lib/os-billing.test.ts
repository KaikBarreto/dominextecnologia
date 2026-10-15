import { describe, it, expect } from 'vitest';
import {
  getOsBillingStatus,
  getRevenueOptionDecision,
  getChargeOptionDecision,
  isOsRevenueBlockedByChargeError,
  OS_REVENUE_BLOCKED_BY_CHARGE_PG_CODE,
  type OsBillingSnapshot,
} from './os-billing';

function snapshot(over: Partial<OsBillingSnapshot> = {}): OsBillingSnapshot {
  return {
    hasRevenue: false,
    hasCharge: false,
    revenueTotal: 0,
    chargeValue: null,
    chargeDueDate: null,
    chargeId: null,
    chargeStatus: null,
    ...over,
  };
}

describe('getOsBillingStatus', () => {
  it('devolve "none" quando a OS ainda não foi faturada', () => {
    expect(getOsBillingStatus(snapshot())).toEqual({ kind: 'none' });
  });

  it('devolve "none" quando o snapshot ainda não carregou', () => {
    expect(getOsBillingStatus(null)).toEqual({ kind: 'none' });
  });

  it('devolve "revenue" quando há receita manual e nenhuma cobrança', () => {
    expect(getOsBillingStatus(snapshot({ hasRevenue: true, revenueTotal: 500 }))).toEqual({
      kind: 'revenue',
      total: 500,
    });
  });

  it('cobrança tem precedência sobre receita (o recebível da cobrança também conta como receita)', () => {
    expect(
      getOsBillingStatus(
        snapshot({
          hasRevenue: true,
          revenueTotal: 500,
          hasCharge: true,
          chargeValue: 500,
          chargeDueDate: '2026-11-01',
          chargeId: 'charge-1',
          chargeStatus: 'PENDING',
        }),
      ),
    ).toEqual({
      kind: 'charge',
      value: 500,
      dueDate: '2026-11-01',
      chargeId: 'charge-1',
      status: 'PENDING',
    });
  });
});

describe('getRevenueOptionDecision', () => {
  it('libera quando a OS ainda não tem nada faturado', () => {
    expect(getRevenueOptionDecision(snapshot())).toEqual({ enabled: true, reason: null });
  });

  it('libera quando o snapshot ainda não carregou', () => {
    expect(getRevenueOptionDecision(null)).toEqual({ enabled: true, reason: null });
  });

  it('bloqueia por cobrança viva (trava do banco, ERRCODE 23001)', () => {
    expect(getRevenueOptionDecision(snapshot({ hasCharge: true }))).toEqual({
      enabled: false,
      reason: 'hasCharge',
    });
  });

  it('bloqueia por já ter receita manual lançada (evita duplicar a venda)', () => {
    expect(getRevenueOptionDecision(snapshot({ hasRevenue: true }))).toEqual({
      enabled: false,
      reason: 'hasRevenue',
    });
  });

  it('cobrança viva vence sobre receita quando os dois são verdadeiros', () => {
    expect(getRevenueOptionDecision(snapshot({ hasCharge: true, hasRevenue: true }))).toEqual({
      enabled: false,
      reason: 'hasCharge',
    });
  });
});

describe('getChargeOptionDecision', () => {
  it('libera quando há cliente e nada foi faturado ainda', () => {
    expect(getChargeOptionDecision(snapshot(), { hasCustomer: true })).toEqual({ enabled: true, reason: null });
  });

  it('bloqueia OS avulsa (sem cliente) — a Asaas cobra pessoa, não serviço', () => {
    expect(getChargeOptionDecision(snapshot(), { hasCustomer: false })).toEqual({
      enabled: false,
      reason: 'noCustomer',
    });
  });

  it('bloqueia quando já existe cobrança viva (idempotência visível na tela)', () => {
    expect(getChargeOptionDecision(snapshot({ hasCharge: true }), { hasCustomer: true })).toEqual({
      enabled: false,
      reason: 'hasCharge',
    });
  });

  it('bloqueia quando já existe receita manual (a edge recusaria mesmo assim)', () => {
    expect(getChargeOptionDecision(snapshot({ hasRevenue: true }), { hasCustomer: true })).toEqual({
      enabled: false,
      reason: 'hasRevenue',
    });
  });

  it('sem cliente vence sobre qualquer outro motivo', () => {
    expect(
      getChargeOptionDecision(snapshot({ hasCharge: true, hasRevenue: true }), { hasCustomer: false }),
    ).toEqual({ enabled: false, reason: 'noCustomer' });
  });
});

describe('isOsRevenueBlockedByChargeError', () => {
  it('reconhece o ERRCODE do trigger (23001)', () => {
    expect(isOsRevenueBlockedByChargeError({ code: OS_REVENUE_BLOCKED_BY_CHARGE_PG_CODE })).toBe(true);
  });

  it('ignora qualquer outro código', () => {
    expect(isOsRevenueBlockedByChargeError({ code: '23505' })).toBe(false);
  });

  it('nunca casa pelo TEXTO da mensagem (só o texto, sem código, não conta)', () => {
    expect(
      isOsRevenueBlockedByChargeError({ message: 'Esta OS já tem uma cobrança ativa.' }),
    ).toBe(false);
  });

  it('é resiliente a erro nulo/indefinido/sem shape de objeto', () => {
    expect(isOsRevenueBlockedByChargeError(null)).toBe(false);
    expect(isOsRevenueBlockedByChargeError(undefined)).toBe(false);
    expect(isOsRevenueBlockedByChargeError('boom')).toBe(false);
  });
});
