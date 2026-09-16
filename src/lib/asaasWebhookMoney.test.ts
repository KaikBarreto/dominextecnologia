import { describe, expect, it } from 'vitest';
import {
  isInstallmentPaymentEvent,
  resolveSafeNetForFeePosting,
  type AsaasWebhookPayment,
} from './asaasWebhookMoney';

describe('asaasWebhookMoney', () => {
  describe('cobrança avulsa (sem parcelamento) — comportamento original intacto', () => {
    it('reconhece que não é parcela', () => {
      const payment: AsaasWebhookPayment = { id: 'pay_avulso', value: 3133.0, netValue: 2893.67 };
      expect(isInstallmentPaymentEvent(payment)).toBe(false);
    });

    it('usa o netValue do evento como base do fee (fee = value - net = 239,33)', () => {
      // Números reais que o CEO reportou pro caso "de referência": cobrança de
      // R$ 3.133,00 avulsa, líquido R$ 2.893,67 → tarifa real R$ 239,33.
      // É o cálculo feito por `apply_tenant_charge_payment` (value - net), que
      // é a peça que este arquivo NÃO deve quebrar pra cobrança sem parcelamento.
      const payment: AsaasWebhookPayment = { id: 'pay_avulso', value: 3133.0, netValue: 2893.67 };
      const net = resolveSafeNetForFeePosting(payment);
      expect(net).toBe(2893.67);
      const fee = Math.round((3133.0 - (net as number)) * 100) / 100;
      expect(fee).toBeCloseTo(239.33, 2);
    });
  });

  describe('venda parcelada no cartão — o bug real (Glacial Cold Brasil, 2026-09)', () => {
    // Payload REAL recebido pelo webhook (PAYMENT_CONFIRMED da parcela 1 de 10
    // de uma venda de R$ 3.133,00): payment.value/netValue são só da PARCELA.
    const parcela1: AsaasWebhookPayment = {
      id: 'pay_2dr8ln2id786r46c',
      value: 313.3,
      netValue: 303.9,
      installment: '2a2743c9-640f-4d06-a97a-5069fe72a1bf',
      installmentNumber: 1,
    };

    it('reconhece que É uma parcela (payment.installment presente)', () => {
      expect(isInstallmentPaymentEvent(parcela1)).toBe(true);
    });

    it('NUNCA usa o netValue da parcela como base do fee automático (retorna null)', () => {
      // Antes do fix: net = 303.90 (líquido só da parcela), e
      // apply_tenant_charge_payment calculava fee = tenant_charges.value TOTAL
      // (R$ 3.133,00) - 303,90 = R$ 2.829,10 (90% do valor virando "taxa").
      // Depois do fix: net = null → a RPC não lança tarifa nenhuma pra este
      // evento (em vez de lançar uma tarifa fabricada e enorme).
      const net = resolveSafeNetForFeePosting(parcela1);
      expect(net).toBeNull();
    });

    it('continua true pra qualquer parcela, não só a 1ª', () => {
      const parcela5: AsaasWebhookPayment = {
        ...parcela1,
        id: 'pay_gkd21fwg2mqdd7pn',
        installmentNumber: 5,
      };
      expect(isInstallmentPaymentEvent(parcela5)).toBe(true);
      expect(resolveSafeNetForFeePosting(parcela5)).toBeNull();
    });

    it('não confunde parcelamento com falta de netValue (payload sem installment)', () => {
      const semParcelamento: AsaasWebhookPayment = { id: 'pay_x', value: 100, netValue: null };
      expect(isInstallmentPaymentEvent(semParcelamento)).toBe(false);
      expect(resolveSafeNetForFeePosting(semParcelamento)).toBeNull();
    });
  });
});
