import { describe, expect, it } from 'vitest';
import { getEffectiveChannels, getRuleOrDefault, NOTIFICATION_EVENTS } from './catalog';

describe('catálogo de notificações', () => {
  it('aplica os padrões do evento quando a empresa ainda não salvou regra', () => {
    const rule = getRuleOrDefault(NOTIFICATION_EVENTS[0], []);
    expect(rule.enabled).toBe(true);
    expect(rule.schedule_time).toBe('07:00');
    expect(rule.recipient_policy.include_defaults).toBe(true);
  });

  it('nunca deixa a preferência pessoal reativar um canal bloqueado pela empresa', () => {
    const rule = { ...getRuleOrDefault(NOTIFICATION_EVENTS[1], []), push_enabled: false };
    expect(getEffectiveChannels(rule, { push_enabled: true } as never).push).toBe(false);
  });

  it('permite que a pessoa silencie um canal opcional', () => {
    const rule = getRuleOrDefault(NOTIFICATION_EVENTS[1], []);
    expect(getEffectiveChannels(rule, { in_app_enabled: false } as never).inApp).toBe(false);
  });

  it('só amplia destinatários de formulário para quem acessa Clientes', () => {
    const formEvent = NOTIFICATION_EVENTS.find((event) => event.eventType === 'form.submission_received');
    expect(formEvent?.permissionOptions).toEqual([
      { key: 'screen:customers', label: 'Quem acessa Clientes e Formulários' },
    ]);
  });
});
