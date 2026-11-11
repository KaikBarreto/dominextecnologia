import { describe, expect, it } from 'vitest';
import { isSafeNotificationActionUrl } from './notificationAction';

describe('isSafeNotificationActionUrl', () => {
  it.each([
    '/agenda',
    '/financeiro/cobrancas?charge=abc',
    '/ordens-servico?aba=chamados&os=123',
    '/configuracoes?tab=notificacoes#regras',
  ])('aceita rota interna %s', (value) => {
    expect(isSafeNotificationActionUrl(value)).toBe(true);
  });

  it.each([
    null,
    undefined,
    '',
    'agenda',
    'https://example.com/phishing',
    '//example.com/phishing',
    '/\\example.com/phishing',
    'javascript:alert(1)',
  ])('rejeita destino inseguro %s', (value) => {
    expect(isSafeNotificationActionUrl(value)).toBe(false);
  });
});
