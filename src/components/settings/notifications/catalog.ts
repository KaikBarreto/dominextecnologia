import type { CompanyNotificationRule, UserNotificationPreference } from '@/hooks/useNotificationSettings';

export type NotificationCategory = 'agenda' | 'financeiro' | 'conta' | 'operacional' | 'formularios';

export interface NotificationEventDefinition {
  eventType: string;
  title: string;
  description: string;
  category: NotificationCategory;
  defaultScheduleTime?: string;
  permissionOptions: Array<{ key: string; label: string }>;
}
export const NOTIFICATION_EVENTS: NotificationEventDefinition[] = [
  {
    eventType: 'schedule.daily_digest',
    title: 'Compromissos do dia',
    description: 'Resumo diário da agenda para responsáveis e equipes.',
    category: 'agenda',
    defaultScheduleTime: '07:00',
    permissionOptions: [
      { key: 'screen:schedule', label: 'Quem acessa a Agenda' },
      { key: 'fn:view_all_schedule', label: 'Quem vê toda a agenda' },
    ],
  },
  {
    eventType: 'billing.charge_paid',
    title: 'Cobrança paga',
    description: 'Aviso após a confirmação do pagamento no servidor.',
    category: 'financeiro',
    permissionOptions: [
      { key: 'screen:finance', label: 'Quem acessa o Financeiro' },
      { key: 'fn:manage_finance', label: 'Quem gerencia o Financeiro' },
    ],
  },
  {
    eventType: 'account.trial_expiring',
    title: 'Fim do período de teste',
    description: 'Lembretes 3 dias antes, 1 dia antes e no último dia do teste.',
    category: 'conta',
    permissionOptions: [],
  },
  {
    eventType: 'account.subscription_expiring',
    title: 'Vencimento da mensalidade',
    description: 'Lembretes 3 dias antes e no dia do vencimento da assinatura.',
    category: 'conta',
    permissionOptions: [],
  },
  {
    eventType: 'account.payment_required',
    title: 'Pagamento da mensalidade pendente',
    description: 'Aviso quando a assinatura entrar em situação de pagamento pendente.',
    category: 'conta',
    permissionOptions: [],
  },
  {
    eventType: 'portal.ticket_created',
    title: 'Novo chamado do portal',
    description: 'Aviso quando um cliente abre um chamado pelo portal.',
    category: 'operacional',
    permissionOptions: [
      { key: 'screen:service_orders', label: 'Quem acessa Ordens de Serviço' },
      { key: 'fn:manage_tasks', label: 'Quem gerencia tarefas da equipe' },
    ],
  },
  {
    eventType: 'form.submission_received',
    title: 'Formulário preenchido',
    description: 'Aviso quando uma nova resposta de formulário é recebida.',
    category: 'formularios',
    permissionOptions: [
      { key: 'screen:customers', label: 'Quem acessa Clientes e Formulários' },
    ],
  },
];

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  agenda: 'Agenda',
  financeiro: 'Financeiro',
  conta: 'Conta e assinatura',
  operacional: 'OS e chamados',
  formularios: 'Formulários',
};

type EffectiveNotificationRule = Pick<
  CompanyNotificationRule,
  'enabled' | 'in_app_enabled' | 'push_enabled' | 'recipient_policy' | 'schedule_time' | 'reminder_minutes'
>;

export function getRuleOrDefault(
  event: NotificationEventDefinition,
  rules: CompanyNotificationRule[],
): EffectiveNotificationRule {
  const rule = rules.find((item) => item.event_type === event.eventType);
  return rule ?? {
    enabled: true,
    in_app_enabled: true,
    push_enabled: true,
    recipient_policy: { include_defaults: true, user_ids: [], permission_keys: [] },
    schedule_time: event.defaultScheduleTime ?? null,
    reminder_minutes: null,
  };
}
export function getEffectiveChannels(
  rule: ReturnType<typeof getRuleOrDefault>,
  preference?: UserNotificationPreference,
) {
  return {
    inApp: rule.enabled && rule.in_app_enabled && preference?.in_app_enabled !== false,
    push: rule.enabled && rule.push_enabled && preference?.push_enabled !== false,
  };
}
