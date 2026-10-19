export type WhatsappTemplateStyle = 'automatic' | 'objective' | 'cordial' | 'detailed';

export type WhatsappOsEventKey = 'a_caminho' | 'em_andamento' | 'concluida';
export type WhatsappBillingEventKey = 'created' | 'before_due' | 'due_today' | 'after_due';

export interface WhatsappAutomationRule {
  enabled: boolean;
  template: WhatsappTemplateStyle;
}

/**
 * Janela em que os avisos podem sair, no fuso de Brasília.
 * `days` usa dia da semana ISO: 1 = segunda … 7 = domingo.
 */
export interface WhatsappSendWindow {
  startHour: number;
  endHour: number;
  days: number[];
}

/**
 * São DUAS janelas, porque os dois tipos de aviso têm naturezas opostas:
 *
 * - `transactional` (OS): o técnico acabou de agir e o cliente está esperando
 *   aquela mensagem naquele minuto, porque foi ele quem chamou o técnico.
 *   Manutenção de ar-condicionado acontece fora do horário comercial, então
 *   travar um "técnico a caminho" das 22h até as 8h é pior que inútil.
 *   Nasce largo: 06:00 às 23:00, todos os dias. O tenant pode abrir 24 h.
 * - `reminders` (cobrança): gerado por cron, ninguém pediu pra receber. É aqui
 *   que a janela de verdade importa, porque aviso de madrugada é o que mais
 *   gera denúncia do cliente final, e denúncia é o que de fato derruba número.
 *   Nasce restrito: 08:00 às 20:00, segunda a sábado.
 *
 * Não unifique de volta numa janela só.
 */
export interface WhatsappSendWindows {
  transactional: WhatsappSendWindow;
  reminders: WhatsappSendWindow;
}

export type WhatsappSendWindowGroup = keyof WhatsappSendWindows;

/** Sinais que fazem o envio parecer uma pessoa operando o celular. */
export interface WhatsappHumanBehavior {
  /** Mostra "digitando…" por alguns segundos, proporcional ao tamanho do texto. */
  simulateTyping: boolean;
  /**
   * Marca a conversa como lida antes de responder. Nasce DESLIGADO porque o
   * número é o WhatsApp real da empresa: marcar como lida apaga o aviso de
   * não-lida no celular da equipe, que pode perder uma pergunta do cliente.
   */
  markAsReadBeforeReply: boolean;
}

export interface WhatsappAutomationPreferences {
  version: 1;
  sendWindow: WhatsappSendWindows;
  humanBehavior: WhatsappHumanBehavior;
  os: {
    includeLink: boolean;
    events: Record<WhatsappOsEventKey, WhatsappAutomationRule>;
  };
  billing: {
    includeAmount: boolean;
    includePaymentLink: boolean;
    /** @deprecated Campo legado: dados internos nunca saem na mensagem. */
    includeCreatedBy: boolean;
    /** @deprecated Campo legado: a descrição interna nunca sai na mensagem. */
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
  sendWindow: {
    transactional: { startHour: 6, endHour: 23, days: [1, 2, 3, 4, 5, 6, 7] },
    reminders: { startHour: 8, endHour: 20, days: [1, 2, 3, 4, 5, 6] },
  },
  humanBehavior: {
    simulateTyping: true,
    markAsReadBeforeReply: true,
  },
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
    includeDescription: false,
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

function readHour(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Espelha a sanitização feita em `public.whatsapp_send_window` no banco: as duas
 * pontas precisam concordar, porque a fila decide pelo SQL e a tela mostra pelo
 * TypeScript. Janela vazia ou invertida cai inteira no default.
 */
function normalizeSendWindow(value: unknown, fallback: WhatsappSendWindow): WhatsappSendWindow {
  const input = isRecord(value) ? value : {};
  const startHour = readHour(input.startHour, fallback.startHour, 0, 23);
  const endHour = readHour(input.endHour, fallback.endHour, 1, 24);
  const days = Array.isArray(input.days)
    ? Array.from(
        new Set(
          input.days
            .filter((day): day is number => typeof day === 'number' && Number.isFinite(day))
            .map((day) => Math.round(day))
            .filter((day) => day >= 1 && day <= 7),
        ),
      ).sort((a, b) => a - b)
    : [];

  return {
    startHour: endHour > startHour ? startHour : fallback.startHour,
    endHour: endHour > startHour ? endHour : fallback.endHour,
    days: days.length > 0 ? days : fallback.days,
  };
}

/**
 * Shape antigo (`sendWindow` com `startHour`/`endHour`/`days` na raiz) vira a
 * janela de LEMBRETE, não a transacional: ele era o mais restritivo, é o que a
 * tela antiga oferecia, e o significado dele era "não incomode o cliente fora
 * disso" — que é o significado de lembrete. A transacional recebe o default
 * largo. Mesma regra do `public.whatsapp_send_window` no banco.
 */
function normalizeSendWindows(
  value: unknown,
  fallback: WhatsappSendWindows,
): WhatsappSendWindows {
  const input = isRecord(value) ? value : {};
  const isLegacyFlat = input.startHour !== undefined || input.endHour !== undefined
    || Array.isArray(input.days);

  if (isLegacyFlat) {
    return {
      transactional: fallback.transactional,
      reminders: normalizeSendWindow(input, fallback.reminders),
    };
  }

  return {
    transactional: normalizeSendWindow(input.transactional, fallback.transactional),
    reminders: normalizeSendWindow(input.reminders, fallback.reminders),
  };
}

/**
 * Decisão do CEO (16/10/2026): os dois sinais ficam SEMPRE ligados e saem da
 * tela. Não existe mais escolha do tenant, nem respeito a valor já gravado.
 *
 * Por isso a função ignora `value` de propósito: uma empresa que salvou
 * `markAsReadBeforeReply: false` antes desta mudança ficaria presa no desligado
 * para sempre, já que o interruptor que religaria não existe mais na interface.
 *
 * Consequência conhecida e aceita: marcar a conversa como lida apaga o aviso de
 * mensagem não lida no celular da equipe do tenant.
 */
function normalizeHumanBehavior(
  _value: unknown,
  _fallback: WhatsappHumanBehavior,
): WhatsappHumanBehavior {
  return { simulateTyping: true, markAsReadBeforeReply: true };
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
    sendWindow: normalizeSendWindows(input.sendWindow, defaults.sendWindow),
    humanBehavior: normalizeHumanBehavior(input.humanBehavior, defaults.humanBehavior),
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
      // Decisão de produto (19/10/2026): estes campos são internos e não
      // podem reaparecer por causa de uma preferência antiga salva no JSONB.
      includeCreatedBy: false,
      includeDescription: false,
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
  company: string;
  customer: string;
  technician: string;
  service: string;
  osNumber: string;
  osLink: string;
  amount: string;
  dueDate: string;
  paymentLink: string;
}

export const WHATSAPP_PREVIEW_FIXTURE: PreviewFixture = {
  company: 'Clima Forte Serviços',
  customer: 'Mariana',
  technician: 'Carlos',
  service: 'Manutenção preventiva',
  osNumber: '#1048',
  osLink: 'https://www.dominex.app/os/1048',
  amount: 'R$ 480,00',
  dueDate: '18/10/2026',
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
  const company = `*${fixture.company}*`;
  const opening = {
    created: {
      objective: `Você recebeu uma nova cobrança da ${company}.`,
      cordial: `Passando para avisar que você recebeu uma nova cobrança da ${company}.`,
      detailed: `Uma nova cobrança da ${company} foi gerada para você.`,
    },
    before_due: {
      objective: `Uma cobrança da ${company} vence em ${preferences.daysBeforeDue} dias.`,
      cordial: `A ${company} lembra que sua cobrança vence em ${preferences.daysBeforeDue} dias.`,
      detailed: `Você possui uma cobrança da ${company} com vencimento em ${preferences.daysBeforeDue} dias.`,
    },
    due_today: {
      objective: `Uma cobrança da ${company} vence hoje.`,
      cordial: `A ${company} lembra que sua cobrança vence hoje.`,
      detailed: `Você possui uma cobrança da ${company} com vencimento hoje.`,
    },
    after_due: {
      objective: `Uma cobrança da ${company} venceu há ${preferences.daysAfterDue} dias.`,
      cordial: `A ${company} lembra que sua cobrança venceu há ${preferences.daysAfterDue} dias.`,
      detailed: `Você possui uma cobrança da ${company} vencida há ${preferences.daysAfterDue} dias.`,
    },
  }[key][resolved];

  const details = [
    preferences.includeAmount ? `*Valor:* ${fixture.amount}` : null,
    `*Vencimento:* ${fixture.dueDate}`,
    preferences.includePaymentLink ? `*Pagar agora:* ${fixture.paymentLink}` : null,
  ].filter((line): line is string => Boolean(line));

  return [
    `Olá, ${fixture.customer}!`,
    '',
    opening,
    '',
    ...details,
    '',
    'Se você já realizou o pagamento, desconsidere esta mensagem.',
    '',
    'Em caso de dúvida, fale com a nossa equipe por aqui.',
  ].join('\n');
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
