export type WhatsappTemplateStyle = 'automatic' | 'objective' | 'cordial' | 'detailed';

export type WhatsappOsEventKey = 'a_caminho' | 'em_andamento' | 'concluida';
export type WhatsappBillingEventKey = 'created' | 'before_due' | 'due_today' | 'after_due';

export interface WhatsappAutomationRule {
  enabled: boolean;
  template: WhatsappTemplateStyle;
}

export interface WhatsappAutomationPreferences {
  version: 1;
  os: {
    includeLink: boolean;
    events: Record<WhatsappOsEventKey, WhatsappAutomationRule>;
  };
  billing: {
    includeAmount: boolean;
    includePaymentLink: boolean;
    includeCreatedBy: boolean;
    includeDescription: boolean;
    events: Record<WhatsappBillingEventKey, WhatsappAutomationRule>;
    daysBeforeDue: number;
    daysAfterDue: number;
  };
}

export type WhatsappAutomationEvent =
  | { domain: 'os'; key: WhatsappOsEventKey }
  | { domain: 'billing'; key: WhatsappBillingEventKey };

export const DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES: WhatsappAutomationPreferences = {
  version: 1,
  os: {
    includeLink: true,
    events: {
      a_caminho: { enabled: true, template: 'automatic' },
      em_andamento: { enabled: true, template: 'automatic' },
      concluida: { enabled: true, template: 'automatic' },
    },
  },
  billing: {
    includeAmount: true,
    includePaymentLink: true,
    includeCreatedBy: false,
    includeDescription: true,
    events: {
      created: { enabled: true, template: 'automatic' },
      before_due: { enabled: true, template: 'cordial' },
      due_today: { enabled: true, template: 'objective' },
      after_due: { enabled: true, template: 'cordial' },
    },
    daysBeforeDue: 3,
    daysAfterDue: 2,
  },
};

const TEMPLATE_STYLES: WhatsappTemplateStyle[] = [
  'automatic',
  'objective',
  'cordial',
  'detailed',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readOffset(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(90, Math.max(1, Math.round(value)));
}

function readTemplate(value: unknown, fallback: WhatsappTemplateStyle): WhatsappTemplateStyle {
  return typeof value === 'string' && TEMPLATE_STYLES.includes(value as WhatsappTemplateStyle)
    ? (value as WhatsappTemplateStyle)
    : fallback;
}

function normalizeRule(value: unknown, fallback: WhatsappAutomationRule): WhatsappAutomationRule {
  const input = isRecord(value) ? value : {};
  return {
    enabled: readBoolean(input.enabled, fallback.enabled),
    template: readTemplate(input.template, fallback.template),
  };
}

/**
 * Normaliza preferências vindas do JSONB. Campos futuros/desconhecidos são
 * ignorados e rascunhos antigos recebem os defaults atuais sem quebrar a UI.
 */
export function normalizeWhatsappAutomationPreferences(
  value: unknown,
): WhatsappAutomationPreferences {
  const input = isRecord(value) ? value : {};
  const os = isRecord(input.os) ? input.os : {};
  const osEvents = isRecord(os.events) ? os.events : {};
  const billing = isRecord(input.billing) ? input.billing : {};
  const billingEvents = isRecord(billing.events) ? billing.events : {};
  const defaults = DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES;

  return {
    version: 1,
    os: {
      includeLink: readBoolean(os.includeLink, defaults.os.includeLink),
      events: {
        a_caminho: normalizeRule(osEvents.a_caminho, defaults.os.events.a_caminho),
        em_andamento: normalizeRule(osEvents.em_andamento, defaults.os.events.em_andamento),
        concluida: normalizeRule(osEvents.concluida, defaults.os.events.concluida),
      },
    },
    billing: {
      includeAmount: readBoolean(billing.includeAmount, defaults.billing.includeAmount),
      includePaymentLink: readBoolean(
        billing.includePaymentLink,
        defaults.billing.includePaymentLink,
      ),
      includeCreatedBy: readBoolean(
        billing.includeCreatedBy,
        defaults.billing.includeCreatedBy,
      ),
      includeDescription: readBoolean(
        billing.includeDescription,
        defaults.billing.includeDescription,
      ),
      events: {
        created: normalizeRule(billingEvents.created, defaults.billing.events.created),
        before_due: normalizeRule(
          billingEvents.before_due,
          defaults.billing.events.before_due,
        ),
        due_today: normalizeRule(
          billingEvents.due_today,
          defaults.billing.events.due_today,
        ),
        after_due: normalizeRule(
          billingEvents.after_due,
          defaults.billing.events.after_due,
        ),
      },
      daysBeforeDue: readOffset(billing.daysBeforeDue, defaults.billing.daysBeforeDue),
      daysAfterDue: readOffset(billing.daysAfterDue, defaults.billing.daysAfterDue),
    },
  };
}

export function countEnabledWhatsappAutomations(
  preferences: WhatsappAutomationPreferences,
): number {
  return [
    ...Object.values(preferences.os.events),
    ...Object.values(preferences.billing.events),
  ].filter((rule) => rule.enabled).length;
}

interface PreviewFixture {
  customer: string;
  technician: string;
  service: string;
  osNumber: string;
  osLink: string;
  amount: string;
  dueDate: string;
  description: string;
  createdBy: string;
  paymentLink: string;
}

export const WHATSAPP_PREVIEW_FIXTURE: PreviewFixture = {
  customer: 'Mariana',
  technician: 'Carlos',
  service: 'Manutenção preventiva',
  osNumber: '#1048',
  osLink: 'https://www.dominex.app/os/1048',
  amount: 'R$ 480,00',
  dueDate: '18/10/2026',
  description: 'Manutenção preventiva de outubro',
  createdBy: 'Sistema · Assinatura recorrente',
  paymentLink: 'https://www.dominex.app/pagar/8F2K9Q',
};

function resolveStyle(style: WhatsappTemplateStyle): Exclude<WhatsappTemplateStyle, 'automatic'> {
  return style === 'automatic' ? 'cordial' : style;
}

function buildOsPreview(
  key: WhatsappOsEventKey,
  style: WhatsappTemplateStyle,
  includeLink: boolean,
  fixture: PreviewFixture,
): string {
  const resolved = resolveStyle(style);
  const action = {
    a_caminho: {
      objective: `O técnico ${fixture.technician} está a caminho para atender a OS ${fixture.osNumber}.`,
      cordial: `Boas notícias: o técnico ${fixture.technician} já está a caminho para atender você na OS ${fixture.osNumber}.`,
      detailed: `O técnico ${fixture.technician} iniciou o deslocamento para o serviço de ${fixture.service}, referente à OS ${fixture.osNumber}.`,
    },
    em_andamento: {
      objective: `O atendimento da OS ${fixture.osNumber} foi iniciado.`,
      cordial: `Seu atendimento começou. O técnico ${fixture.technician} já está realizando o serviço da OS ${fixture.osNumber}.`,
      detailed: `O técnico ${fixture.technician} iniciou o serviço de ${fixture.service}, referente à OS ${fixture.osNumber}.`,
    },
    concluida: {
      objective: `A OS ${fixture.osNumber} foi concluída.`,
      cordial: `Seu atendimento foi concluído com sucesso. Agradecemos pela confiança na nossa equipe!`,
      detailed: `O serviço de ${fixture.service}, referente à OS ${fixture.osNumber}, foi concluído pelo técnico ${fixture.technician}.`,
    },
  }[key][resolved];

  return [`Olá, ${fixture.customer}!`, '', action, includeLink ? `*Acompanhe a OS:* ${fixture.osLink}` : '']
    .filter(Boolean)
    .join('\n');
}

function buildBillingPreview(
  key: WhatsappBillingEventKey,
  style: WhatsappTemplateStyle,
  preferences: WhatsappAutomationPreferences['billing'],
  fixture: PreviewFixture,
): string {
  const resolved = resolveStyle(style);
  const opening = {
    created: {
      objective: 'Uma nova cobrança foi gerada.',
      cordial: 'Passando para avisar que uma nova cobrança foi gerada para você.',
      detailed: 'Uma nova cobrança referente aos serviços contratados foi gerada.',
    },
    before_due: {
      objective: `Sua cobrança vence em ${preferences.daysBeforeDue} dias.`,
      cordial: `Este é um lembrete amigável: sua cobrança vence em ${preferences.daysBeforeDue} dias.`,
      detailed: `Lembramos que existe uma cobrança com vencimento próximo, em ${preferences.daysBeforeDue} dias.`,
    },
    due_today: {
      objective: 'Sua cobrança vence hoje.',
      cordial: 'Passando para lembrar que sua cobrança vence hoje.',
      detailed: 'A cobrança abaixo chegou à data de vencimento hoje.',
    },
    after_due: {
      objective: `Sua cobrança venceu há ${preferences.daysAfterDue} dias.`,
      cordial: `Notamos que sua cobrança venceu há ${preferences.daysAfterDue} dias. Se já pagou, desconsidere este aviso.`,
      detailed: `A cobrança abaixo está vencida há ${preferences.daysAfterDue} dias. Caso o pagamento já tenha sido realizado, desconsidere esta mensagem.`,
    },
  }[key][resolved];

  const details = [
    preferences.includeAmount ? `*Valor:* ${fixture.amount}` : null,
    `*Vencimento:* ${fixture.dueDate}`,
    preferences.includeDescription ? `*Descrição:* ${fixture.description}` : null,
    preferences.includeCreatedBy ? `*Gerada por:* ${fixture.createdBy}` : null,
    preferences.includePaymentLink ? `*Pagar agora:* ${fixture.paymentLink}` : null,
  ].filter((line): line is string => Boolean(line));

  return [`Olá, ${fixture.customer}!`, '', opening, '', ...details].join('\n');
}

export function buildWhatsappMessagePreview(
  event: WhatsappAutomationEvent,
  preferences: WhatsappAutomationPreferences,
  fixture: PreviewFixture = WHATSAPP_PREVIEW_FIXTURE,
): string {
  if (event.domain === 'os') {
    const rule = preferences.os.events[event.key];
    return buildOsPreview(event.key, rule.template, preferences.os.includeLink, fixture);
  }

  const rule = preferences.billing.events[event.key];
  return buildBillingPreview(event.key, rule.template, preferences.billing, fixture);
}
