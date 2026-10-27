import { describe, expect, it } from 'vitest';
import {
  getSubscriptionNfseState,
  isSubscriptionNfseProcessing,
  isSubscriptionPaymentPaid,
} from './subscriptionNfse';

describe('estado da NFS-e da assinatura', () => {
  it('só libera solicitação depois do pagamento confirmado', () => {
    expect(isSubscriptionPaymentPaid('PENDING')).toBe(false);
    expect(getSubscriptionNfseState({ paymentStatus: 'OVERDUE' })).toBe('not_paid');
    expect(getSubscriptionNfseState({ paymentStatus: 'RECEIVED' })).toBe('none');
    expect(getSubscriptionNfseState({ paymentStatus: 'confirmed' })).toBe('none');
  });

  it.each([
    'REQUESTING',
    'SCHEDULED',
    'SYNCHRONIZED',
    'AUTHORIZED',
    'PROCESSING',
    'PROCESSING_CANCELLATION',
  ])(
    'mantém %s em processamento até o PDF chegar',
    (nfseStatus) => {
      expect(getSubscriptionNfseState({ paymentStatus: 'RECEIVED', nfseStatus })).toBe('processing');
      expect(isSubscriptionNfseProcessing(nfseStatus)).toBe(true);
    },
  );

  it('libera nova tentativa quando a reserva REQUESTING ficou abandonada', () => {
    const now = Date.parse('2026-10-27T15:00:00.000Z');
    const requestedAt = '2026-10-27T14:49:59.000Z';
    expect(getSubscriptionNfseState({
      paymentStatus: 'RECEIVED',
      nfseStatus: 'REQUESTING',
      nfseRequestedAt: requestedAt,
    }, now)).toBe('error');
    expect(isSubscriptionNfseProcessing('REQUESTING', requestedAt, now)).toBe(false);
  });

  it('libera download quando o PDF existe, inclusive antes do próximo status', () => {
    expect(getSubscriptionNfseState({
      paymentStatus: 'CONFIRMED',
      nfseStatus: 'AUTHORIZED',
      nfsePdfUrl: 'https://exemplo.invalid/nota.pdf',
    })).toBe('issued');
  });

  it.each(['ERROR', 'CANCELED'])(
    'oferece nova tentativa para %s',
    (nfseStatus) => {
      expect(getSubscriptionNfseState({ paymentStatus: 'RECEIVED', nfseStatus })).toBe('error');
    },
  );

  it('não libera segunda emissão quando o cancelamento foi negado', () => {
    expect(getSubscriptionNfseState({
      paymentStatus: 'RECEIVED',
      nfseStatus: 'CANCELLATION_DENIED',
    })).toBe('processing');
  });
});

