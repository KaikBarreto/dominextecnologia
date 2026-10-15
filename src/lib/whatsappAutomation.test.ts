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

  it('conta os sete fluxos ativos por padrão', () => {
    expect(countEnabledWhatsappAutomations(DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES)).toBe(7);
  });
});
