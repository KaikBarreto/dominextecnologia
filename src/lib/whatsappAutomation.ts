import {
  normalizeWhatsappCustomTemplate,
  renderWhatsappTemplate,
  resolveWhatsappTemplate,
  stripWhatsappContactNoticeLines,
  type WhatsappTemplateValues,
} from './whatsappMessageTemplates';

/**
 * `custom` = texto escrito pelo cliente no editor, guardado em `customText`.
 * Os outros quatro são os modelos prontos do sistema.
 */
export type WhatsappTemplateStyle = 'automatic' | 'objective' | 'cordial' | 'detailed' | 'custom';

/**
 * `criada` é o aviso de OS aberta. O nome é em português (como os demais
 * status de OS) de propósito: `created` já é a chave do aviso de cobrança
 * gerada e as duas convivem nos mesmos dicionários de tela.
 */
export type WhatsappOsEventKey =
  | 'criada'
  | 'scheduled_reminder'
  | 'a_caminho'
  | 'em_andamento'
  | 'concluida';
export type WhatsappBillingEventKey = 'created' | 'before_due' | 'due_today' | 'after_due';
export type WhatsappOsReminderTiming = 'day_before' | 'same_day';

export interface WhatsappAutomationRule {
  enabled: boolean;
  template: WhatsappTemplateStyle;
  /**
   * Texto personalizado, no formato do WhatsApp (`*negrito*`, `_itálico_`,
   * `~riscado~`) com variáveis `{{os.numero}}`. Só existe quando é válido; fica
   * guardado mesmo se o cliente voltar para um modelo pronto, para ele não
   * perder o que escreveu.
   */
  customText?: string;
}

export interface WhatsappOsScheduledReminderRule extends WhatsappAutomationRule {
  timing: WhatsappOsReminderTiming;
}

export interface WhatsappOsEventRules {
  criada: WhatsappAutomationRule;
  scheduled_reminder: WhatsappOsScheduledReminderRule;
  a_caminho: WhatsappAutomationRule;
  em_andamento: WhatsappAutomationRule;
  concluida: WhatsappAutomationRule;
}

/**
 * Janela em que os avisos podem sair, no fuso configurado para a empresa.
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
 * - `reminders` (cobranças e visitas agendadas): gerado por cron. É aqui que a
 *   janela de verdade importa, porque aviso de madrugada é o que mais gera
 *   denúncia do cliente final, e denúncia é o que de fato derruba número.
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
    events: WhatsappOsEventRules;
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
      // Nasce desligado: é o cliente que decide avisar na abertura da OS.
      criada: { enabled: false, template: 'automatic' },
      scheduled_reminder: { enabled: false, template: 'automatic', timing: 'day_before' },
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
  'custom',
];

const OS_REMINDER_TIMINGS: WhatsappOsReminderTiming[] = ['day_before', 'same_day'];

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

function readOsReminderTiming(
  value: unknown,
  fallback: WhatsappOsReminderTiming,
): WhatsappOsReminderTiming {
  return typeof value === 'string' && OS_REMINDER_TIMINGS.includes(value as WhatsappOsReminderTiming)
    ? (value as WhatsappOsReminderTiming)
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
 * janela de LEMBRETES, não a transacional: ele era o mais restritivo, é o que a
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
  const customText = normalizeWhatsappCustomTemplate(input.customText);
  const template = readTemplate(input.template, fallback.template);
  return {
    enabled: readBoolean(input.enabled, fallback.enabled),
    // "Personalizada" sem texto válido não existe: volta para o modelo padrão
    // em vez de deixar o aviso apontando para um texto vazio.
    template: template === 'custom' && !customText ? fallback.template : template,
    ...(customText ? { customText } : {}),
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
        criada: normalizeRule(osEvents.criada, defaults.os.events.criada),
        scheduled_reminder: {
          ...normalizeRule(osEvents.scheduled_reminder, defaults.os.events.scheduled_reminder),
          timing: readOsReminderTiming(
            isRecord(osEvents.scheduled_reminder) ? osEvents.scheduled_reminder.timing : undefined,
            defaults.os.events.scheduled_reminder.timing,
          ),
        },
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
  equipment: string;
  osNumber: string;
  osLink: string;
  amount: string;
  dueDate: string;
  scheduledDate: string;
  scheduledTime: string;
  paymentLink: string;
}

export const WHATSAPP_PREVIEW_FIXTURE: PreviewFixture = {
  company: 'Clima Forte Serviços',
  customer: 'Mariana',
  technician: 'Carlos',
  service: 'Manutenção preventiva',
  equipment: 'Split 12.000 BTUs da sala',
  osNumber: '#1048',
  osLink: 'https://www.dominex.app/os/1048',
  amount: 'R$ 480,00',
  dueDate: '18/10/2026',
  scheduledDate: '28/10/2026',
  scheduledTime: '09:00',
  paymentLink: 'https://www.dominex.app/pagar/8F2K9Q',
};

/** Valores ilustrativos da prévia, no mesmo formato que o enviador monta. */
export function buildWhatsappPreviewValues(
  preferences: WhatsappAutomationPreferences,
  fixture: PreviewFixture = WHATSAPP_PREVIEW_FIXTURE,
  companyValues: WhatsappTemplateValues = {},
): WhatsappTemplateValues {
  // Dado real da empresa vence o ilustrativo: a prévia mostra o nome que o
  // cliente final vai ler de verdade.
  const realCompanyValues = Object.fromEntries(
    Object.entries(companyValues).filter(([, value]) => String(value ?? '').trim().length > 0),
  );
  return {
    'empresa.cnpj': '12.345.678/0001-90',
    'empresa.telefone': '(62) 3333-4444',
    'destinatario.nome': fixture.customer,
    'cliente.nome': fixture.customer,
    'empresa.nome': fixture.company,
    'aviso.cliente': '',
    'os.numero': fixture.osNumber,
    'os.agendamento': `${fixture.scheduledDate}, às ${fixture.scheduledTime}`,
    'os.data': fixture.scheduledDate,
    'os.horario': fixture.scheduledTime,
    'os.servico': fixture.service,
    'os.tecnico': fixture.technician,
    'os.equipamentos': fixture.equipment,
    'os.link': fixture.osLink,
    'cobranca.valor': fixture.amount,
    'cobranca.vencimento': fixture.dueDate,
    'cobranca.link': fixture.paymentLink,
    'cobranca.dias_antes': preferences.billing.daysBeforeDue,
    'cobranca.dias_depois': preferences.billing.daysAfterDue,
    ...realCompanyValues,
  };
}

/**
 * Texto (ainda com as variáveis) que vale para um aviso: o personalizado ou o
 * modelo pronto. "Automático" aparece como cordial; no envio real o sistema
 * alterna entre os três modelos.
 */
export function resolveWhatsappEventTemplate(
  event: WhatsappAutomationEvent,
  preferences: WhatsappAutomationPreferences,
  choice?: WhatsappTemplateStyle,
): string {
  const rule = event.domain === 'os'
    ? preferences.os.events[event.key]
    : preferences.billing.events[event.key];
  const effectiveChoice = choice ?? rule.template;
  const template = resolveWhatsappTemplate({
    domain: event.domain,
    event: event.key,
    choice: effectiveChoice,
    customText: rule.customText,
    automaticStyle: 'cordial',
    options: {
      includeOsLink: preferences.os.includeLink,
      includeAmount: preferences.billing.includeAmount,
      includePaymentLink: preferences.billing.includePaymentLink,
    },
  }) ?? '';
  // O modelo pronto carrega uma linha que só aparece quando o aviso vai para um
  // contato do cliente. Na tela ela só confunde; no envio a identificação
  // continua entrando sozinha, inclusive no texto personalizado.
  return effectiveChoice === 'custom' && rule.customText
    ? template
    : stripWhatsappContactNoticeLines(template);
}

export function buildWhatsappMessagePreview(
  event: WhatsappAutomationEvent,
  preferences: WhatsappAutomationPreferences,
  fixture: PreviewFixture = WHATSAPP_PREVIEW_FIXTURE,
  companyValues: WhatsappTemplateValues = {},
): string {
  return renderWhatsappTemplate(
    resolveWhatsappEventTemplate(event, preferences),
    buildWhatsappPreviewValues(preferences, fixture, companyValues),
  );
}
