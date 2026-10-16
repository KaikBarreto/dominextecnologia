import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES,
  buildWhatsappMessagePreview,
  countEnabledWhatsappAutomations,
  normalizeWhatsappAutomationPreferences,
} from './whatsappAutomation';

describe('whatsappAutomation', () => {
  it('preenche campos ausentes com defaults e preserva escolhas válidas', () => {
    const normalized = normalizeWhatsappAutomationPreferences({
      os: {
        includeLink: false,
        events: { a_caminho: { enabled: false, template: 'objective' } },
      },
      billing: { daysBeforeDue: 7 },
    });

    expect(normalized.os.includeLink).toBe(false);
    expect(normalized.os.events.a_caminho).toEqual({ enabled: false, template: 'objective' });
    expect(normalized.os.events.concluida).toEqual(
      DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES.os.events.concluida,
    );
    expect(normalized.billing.daysBeforeDue).toBe(7);
  });

  it('limita dias inválidos e descarta template desconhecido', () => {
    const normalized = normalizeWhatsappAutomationPreferences({
      billing: {
        daysAfterDue: 999,
        events: { created: { enabled: true, template: 'inexistente' } },
      },
    });

    expect(normalized.billing.daysAfterDue).toBe(90);
    expect(normalized.billing.events.created.template).toBe('automatic');
  });

  it('reflete as opções de conteúdo na prévia da cobrança', () => {
    const preferences = normalizeWhatsappAutomationPreferences({
      billing: {
        includeAmount: false,
        includeDescription: false,
        includeCreatedBy: true,
        includePaymentLink: true,
      },
    });
    const preview = buildWhatsappMessagePreview(
      { domain: 'billing', key: 'created' },
      preferences,
    );

    expect(preview).not.toContain('*Valor:*');
    expect(preview).not.toContain('*Descrição:*');
    expect(preview).toContain('*Gerada por:*');
    expect(preview).toContain('*Pagar agora:* https://www.dominex.app/pagar/8F2K9Q');
  });

  it('nasce com duas janelas: OS larga e cobrança comercial', () => {
    const normalized = normalizeWhatsappAutomationPreferences({});

    expect(normalized.sendWindow.transactional).toEqual({
      startHour: 6,
      endHour: 23,
      days: [1, 2, 3, 4, 5, 6, 7],
    });
    expect(normalized.sendWindow.reminders).toEqual({
      startHour: 8,
      endHour: 20,
      days: [1, 2, 3, 4, 5, 6],
    });
    expect(normalized.humanBehavior.simulateTyping).toBe(true);
    expect(normalized.humanBehavior.markAsReadBeforeReply).toBe(false);
  });

  it('o shape plano antigo vira a janela de cobrança, não a de OS', () => {
    const normalized = normalizeWhatsappAutomationPreferences({
      sendWindow: { startHour: 9, endHour: 18, days: [1, 2, 3, 4, 5] },
    });

    expect(normalized.sendWindow.reminders).toEqual({
      startHour: 9,
      endHour: 18,
      days: [1, 2, 3, 4, 5],
    });
    expect(normalized.sendWindow.transactional).toEqual(
      DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES.sendWindow.transactional,
    );
  });

  it('aceita OS em 24 horas e preserva cada grupo isoladamente', () => {
    const normalized = normalizeWhatsappAutomationPreferences({
      sendWindow: {
        transactional: { startHour: 0, endHour: 24, days: [5, 1, 1, 3] },
      },
    });

    expect(normalized.sendWindow.transactional).toEqual({
      startHour: 0,
      endHour: 24,
      days: [1, 3, 5],
    });
    expect(normalized.sendWindow.reminders).toEqual(
      DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES.sendWindow.reminders,
    );
  });

  it('descarta janela invertida e dias fora de 1..7 por grupo', () => {
    const normalized = normalizeWhatsappAutomationPreferences({
      sendWindow: {
        transactional: { startHour: 23, endHour: 6, days: [2] },
        reminders: { startHour: 7, endHour: 21, days: [0, 9, 'sabado'] },
      },
    });

    expect(normalized.sendWindow.transactional.startHour).toBe(6);
    expect(normalized.sendWindow.transactional.endHour).toBe(23);
    expect(normalized.sendWindow.transactional.days).toEqual([2]);

    expect(normalized.sendWindow.reminders.startHour).toBe(7);
    expect(normalized.sendWindow.reminders.endHour).toBe(21);
    expect(normalized.sendWindow.reminders.days).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('prende as horas nas bordas do dia', () => {
    const normalized = normalizeWhatsappAutomationPreferences({
      sendWindow: { reminders: { startHour: -5, endHour: 99, days: [7] } },
    });

    expect(normalized.sendWindow.reminders.startHour).toBe(0);
    expect(normalized.sendWindow.reminders.endHour).toBe(24);
    expect(normalized.sendWindow.reminders.days).toEqual([7]);
  });

  it('conta os sete fluxos ativos por padrão', () => {
    expect(countEnabledWhatsappAutomations(DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES)).toBe(7);
  });
});
