import { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Cake,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  FilePlus2,
  Link2,
  Lock,
  ReceiptText,
  RotateCcw,
  Save,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { cn } from '@/lib/utils';
import type { LocaleCode } from '@/lib/i18n/locales';
import {
  DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES,
  buildWhatsappMessagePreview,
  resolveWhatsappEventTemplate,
  type WhatsappAutomationRule,
  type WhatsappAutomationEvent,
  type WhatsappAutomationPreferences,
  type WhatsappBillingEventKey,
  type WhatsappBirthdayEventKey,
  type WhatsappOsEventKey,
  type WhatsappOsReminderTiming,
  type WhatsappTemplateStyle,
} from '@/lib/whatsappAutomation';
import { parseWhatsappLine, validateWhatsappCustomText } from '@/lib/whatsappTemplateEditor';
import { WhatsappMessageEditor } from './WhatsappMessageEditor';
import type { WhatsappProvider } from '@/hooks/useWhatsappConnections';

type Domain = 'os' | 'billing' | 'birthday';

interface WhatsappAutomationSettingsProps {
  locale: LocaleCode;
  availableDomains?: Domain[];
  enabled: boolean;
  preferences: WhatsappAutomationPreferences;
  isSaving: boolean;
  isDirty: boolean;
  readOnly?: boolean;
  activeProvider?: WhatsappProvider | null;
  /** Nome, CNPJ e telefone reais da empresa (variáveis fixas). */
  companyValues?: Partial<Record<string, string>>;
  onEnabledChange: (enabled: boolean) => void;
  onPreferencesChange: (preferences: WhatsappAutomationPreferences) => void;
  onSave: () => void;
}

const COPY = {
  'pt-br': {
    title: 'Automação de mensagens',
    description: 'Defina quais avisos serão enviados e como cada mensagem será montada.',
    masterLabel: 'Ativar automações',
    masterHint: 'Os envios só começarão quando um provedor for conectado.',
    save: 'Salvar configurações',
    saving: 'Salvando…',
    saved: 'Configurações salvas',
    pending: 'Alterações não salvas',
    flowsEnabled: 'fluxos ativos',
    os: 'Ordens de serviço',
    billing: 'Cobranças',
    birthday: 'Aniversários',
    birthdayOptIn: 'Esta automação nasce desligada e só envia depois que você ativá-la.',
    birthdayProviderUnavailableTitle: 'Disponível somente na conexão por QR Code',
    birthdayProviderUnavailable: 'A API Oficial da Meta exige um modelo previamente aprovado. Por enquanto, conecte o WhatsApp por QR Code para ativar mensagens de aniversário.',
    chooseEvent: 'Escolha quando enviar',
    chooseEventHint: 'Toque em um evento da lista para editar a mensagem dele aqui embaixo.',
    editingBadge: 'Editando',
    eventEnabled: 'Enviar esta mensagem',
    template: 'Modelo da mensagem',
    templateHint: 'Escolha um modelo pronto ou escreva o seu. O texto aparece logo abaixo.',
    templates: {
      automatic: 'Rotação automática · recomendada',
      objective: 'Objetiva',
      cordial: 'Cordial',
      detailed: 'Detalhada',
      custom: 'Personalizada',
    },
    messageText: 'Texto da mensagem',
    messageTextHint: 'As etiquetas coloridas são trocadas pelos dados reais na hora do envio.',
    restoreDefault: 'Restaurar modelo padrão',
    automaticNote: 'No modo automático, o texto acima é o modelo Cordial. Os envios alternam entre os modelos prontos. Ao editar, a mensagem passa a ser Personalizada.',
    customOptionsNote: 'No texto personalizado, o link da OS, o valor e o link de pagamento aparecem só se você inserir a variável correspondente no texto.',
    fixMessages: 'Corrija a mensagem personalizada para salvar',
    noDomainsTitle: 'Nenhuma automação disponível neste plano',
    noDomainsDescription: 'O canal de WhatsApp pode continuar conectado, mas os avisos de OS exigem Ordens de serviço e os avisos financeiros exigem Cobranças.',
    osLink: 'Incluir link de acompanhamento da OS',
    billingContent: 'Informações da cobrança',
    amount: 'Valor',
    paymentLink: 'Link de pagamento',
    beforeDays: 'Quantos dias antes',
    createdHint: 'Se o vencimento estiver a mais de 10 dias, o aviso não sai na criação. O cliente é avisado pelo lembrete "Antes do vencimento", para não confundir a próxima mensalidade com a atual.',
    afterDays: 'Quantos dias depois',
    days: 'dias',
    preview: 'Prévia da mensagem',
    previewHint: 'Dados ilustrativos — nenhuma mensagem será enviada nesta etapa.',
    messageLanguageHint: 'As mensagens automáticas são enviadas em português (Brasil).',
    active: 'Ativa',
    inactive: 'Inativa',
    companyPreview: 'Sua empresa',
    illustrativePreview: 'Prévia ilustrativa',
    customerRule: 'Os destinatários de OS e financeiro são definidos na ficha de cada cliente. A autorização geral do WhatsApp também precisa estar ativa.',
    reminderWhen: 'Quando enviar o lembrete',
    reminderWindowHint: 'O envio usa o horário dos lembretes em qualquer dia. Se a visita for antes da abertura da janela, o lembrete no dia não será enviado.',
    reminderTimings: { day_before: '1 dia antes · recomendado', same_day: 'No dia' },
    criadaHint: 'Este aviso sai poucos minutos depois de a OS ser criada à mão. OS geradas por contrato, por recorrência ou por importação não disparam este aviso, para evitar envio em massa. A mensagem respeita o horário configurado para lembretes.',
    events: {
      criada: ['OS criada', 'Quando uma OS é aberta manualmente'],
      scheduled_reminder: ['Lembrete de visita agendada', 'Antes da data marcada para a visita'],
      a_caminho: ['Técnico a caminho', 'Quando o técnico inicia o deslocamento'],
      em_andamento: ['Serviço iniciado', 'Quando o atendimento começa'],
      concluida: ['OS concluída', 'Quando a ordem de serviço é finalizada'],
      created: ['Cobrança gerada', 'Manual ou criada por uma assinatura'],
      before_due: ['Antes do vencimento', 'Lembrete antecipado configurável'],
      due_today: ['No vencimento', 'No dia em que a cobrança vence'],
      after_due: ['Após o vencimento', 'Somente se a cobrança continuar pendente'],
      greeting: ['Mensagem de aniversário', 'No aniversário do cliente ou de um contato cadastrado'],
    },
  },
  en: {
    title: 'Message automation', description: 'Choose which notifications are sent and how each message is built.',
    masterLabel: 'Enable automations', masterHint: 'Messages will only start after a provider is connected.',
    save: 'Save settings', saving: 'Saving…', saved: 'Settings saved', pending: 'Unsaved changes', flowsEnabled: 'active flows',
    os: 'Work orders', billing: 'Charges', birthday: 'Birthdays', birthdayOptIn: 'This automation starts off and only sends after you enable it.', birthdayProviderUnavailableTitle: 'Available only with the QR Code connection', birthdayProviderUnavailable: 'The official Meta API requires a pre-approved template. For now, connect WhatsApp by QR Code to enable birthday messages.', chooseEvent: 'Choose when to send', chooseEventHint: 'Tap an event in the list to edit its message below.', editingBadge: 'Editing',
    eventEnabled: 'Send this message', template: 'Message template', templateHint: 'Pick a ready-made template or write your own. The text appears right below.',
    templates: { automatic: 'Automatic rotation · recommended', objective: 'Objective', cordial: 'Friendly', detailed: 'Detailed', custom: 'Custom' },
    messageText: 'Message text', messageTextHint: 'The colored tags are replaced with real data when the message is sent.',
    restoreDefault: 'Restore default template',
    automaticNote: 'In automatic mode, the text above is the Friendly template. Messages alternate between the ready-made templates. Editing it turns the message into Custom.',
    customOptionsNote: 'In a custom text, the work order link, amount and payment link only appear if you insert the matching variable in the text.',
    fixMessages: 'Fix the custom message to save',
    noDomainsTitle: 'No automations available on this plan', noDomainsDescription: 'The WhatsApp channel may stay connected, but work order notices require Work orders and financial notices require Charges.',
    osLink: 'Include work order tracking link', billingContent: 'Charge information', amount: 'Amount', paymentLink: 'Payment link',
    createdHint: 'If the due date is more than 10 days away, no message is sent on creation. The customer is notified by the "Before due date" reminder, so the next installment is not mistaken for the current one.',
    beforeDays: 'Days before', afterDays: 'Days after', days: 'days', preview: 'Message preview', previewHint: 'Illustrative data — no message will be sent at this stage.',
    messageLanguageHint: 'Automatic messages are currently sent in Brazilian Portuguese.',
    active: 'Active', inactive: 'Inactive', companyPreview: 'Your company', illustrativePreview: 'Illustrative preview',
    customerRule: 'Work order and billing recipients are configured in each customer profile. General WhatsApp authorization must also be enabled.',
    reminderWhen: 'When to send the reminder', reminderWindowHint: 'Sending uses the reminder hours on any day. If the visit is before the window opens, the same-day reminder will not be sent.',
    reminderTimings: { day_before: '1 day before · recommended', same_day: 'On the day' },
    criadaHint: 'This message is sent a few minutes after a work order is created by hand. Work orders generated by contract, recurrence or import do not trigger it, to avoid mass sending. The message follows the hours configured for reminders.',
    events: {
      criada: ['Work order created', 'When a work order is opened manually'],
      scheduled_reminder: ['Scheduled visit reminder', 'Before the scheduled visit date'],
      a_caminho: ['Technician on the way', 'When the technician starts travelling'], em_andamento: ['Service started', 'When the service begins'], concluida: ['Work order completed', 'When the work order is completed'],
      created: ['Charge created', 'Manual or created by a subscription'], before_due: ['Before due date', 'Configurable early reminder'], due_today: ['On due date', 'On the day the charge is due'], after_due: ['After due date', 'Only while the charge remains pending'],
      greeting: ['Birthday message', 'On the birthday of a customer or registered contact'],
    },
  },
  es: {
    title: 'Automatización de mensajes', description: 'Define qué avisos se envían y cómo se compone cada mensaje.',
    masterLabel: 'Activar automatizaciones', masterHint: 'Los envíos solo comenzarán cuando se conecte un proveedor.',
    save: 'Guardar configuración', saving: 'Guardando…', saved: 'Configuración guardada', pending: 'Cambios sin guardar', flowsEnabled: 'flujos activos',
    os: 'Órdenes de trabajo', billing: 'Cobros', birthday: 'Cumpleaños', birthdayOptIn: 'Esta automatización comienza desactivada y solo envía después de activarla.', birthdayProviderUnavailableTitle: 'Disponible solo con la conexión por código QR', birthdayProviderUnavailable: 'La API oficial de Meta exige una plantilla aprobada previamente. Por ahora, conecta WhatsApp por código QR para activar los mensajes de cumpleaños.', chooseEvent: 'Elige cuándo enviar', chooseEventHint: 'Toca un evento de la lista para editar su mensaje aquí abajo.', editingBadge: 'Editando',
    eventEnabled: 'Enviar este mensaje', template: 'Modelo del mensaje', templateHint: 'Elija un modelo listo o escriba el suyo. El texto aparece justo abajo.',
    templates: { automatic: 'Rotación automática · recomendada', objective: 'Objetiva', cordial: 'Cordial', detailed: 'Detallada', custom: 'Personalizada' },
    messageText: 'Texto del mensaje', messageTextHint: 'Las etiquetas de color se reemplazan por los datos reales al enviar.',
    restoreDefault: 'Restaurar modelo predeterminado',
    automaticNote: 'En modo automático, el texto de arriba es el modelo Cordial. Los envíos alternan entre los modelos listos. Al editarlo, el mensaje pasa a ser Personalizado.',
    customOptionsNote: 'En el texto personalizado, el enlace de la orden, el importe y el enlace de pago solo aparecen si insertas la variable correspondiente en el texto.',
    fixMessages: 'Corrige el mensaje personalizado para guardar',
    noDomainsTitle: 'No hay automatizaciones disponibles en este plan', noDomainsDescription: 'El canal de WhatsApp puede seguir conectado, pero los avisos de órdenes requieren Órdenes de trabajo y los avisos financieros requieren Cobros.',
    osLink: 'Incluir enlace de seguimiento de la orden', billingContent: 'Información del cobro', amount: 'Importe', paymentLink: 'Enlace de pago',
    createdHint: 'Si el vencimiento está a más de 10 días, el aviso no se envía al crear el cobro. El cliente recibe el recordatorio "Antes del vencimiento", para no confundir la próxima cuota con la actual.',
    beforeDays: 'Cuántos días antes', afterDays: 'Cuántos días después', days: 'días', preview: 'Vista previa', previewHint: 'Datos ilustrativos — no se enviará ningún mensaje en esta etapa.',
    messageLanguageHint: 'Los mensajes automáticos se envían actualmente en portugués de Brasil.',
    active: 'Activa', inactive: 'Inactiva', companyPreview: 'Tu empresa', illustrativePreview: 'Vista previa ilustrativa',
    customerRule: 'Los destinatarios de órdenes y cobros se configuran en la ficha de cada cliente. La autorización general de WhatsApp también debe estar activa.',
    reminderWhen: 'Cuándo enviar el recordatorio', reminderWindowHint: 'El envío usa el horario de recordatorios cualquier día. Si la visita es antes de la apertura, el recordatorio del mismo día no se enviará.',
    reminderTimings: { day_before: '1 día antes · recomendado', same_day: 'El mismo día' },
    criadaHint: 'Este aviso se envía pocos minutos después de crear la orden a mano. Las órdenes generadas por contrato, recurrencia o importación no lo activan, para evitar envíos masivos. El mensaje respeta el horario configurado para recordatorios.',
    events: {
      criada: ['Orden creada', 'Cuando se abre una orden manualmente'],
      scheduled_reminder: ['Recordatorio de visita programada', 'Antes de la fecha programada para la visita'],
      a_caminho: ['Técnico en camino', 'Cuando el técnico inicia el desplazamiento'], em_andamento: ['Servicio iniciado', 'Cuando comienza la atención'], concluida: ['Orden finalizada', 'Cuando se completa la orden de trabajo'],
      created: ['Cobro generado', 'Manual o creado por una suscripción'], before_due: ['Antes del vencimiento', 'Recordatorio anticipado configurable'], due_today: ['En el vencimiento', 'El día del vencimiento'], after_due: ['Después del vencimiento', 'Solo si el cobro sigue pendiente'],
      greeting: ['Mensaje de cumpleaños', 'En el cumpleaños del cliente o de un contacto registrado'],
    },
  },
  fr: {
    title: 'Automatisation des messages', description: 'Définissez les notifications envoyées et le contenu de chaque message.',
    masterLabel: 'Activer les automatisations', masterHint: 'Les envois ne commenceront qu’après la connexion d’un fournisseur.',
    save: 'Enregistrer', saving: 'Enregistrement…', saved: 'Paramètres enregistrés', pending: 'Modifications non enregistrées', flowsEnabled: 'flux actifs',
    os: 'Bons de travail', billing: 'Factures', birthday: 'Anniversaires', birthdayOptIn: 'Cette automatisation est désactivée par défaut et envoie seulement après activation.', birthdayProviderUnavailableTitle: 'Disponible uniquement avec la connexion par code QR', birthdayProviderUnavailable: 'L’API officielle de Meta exige un modèle approuvé au préalable. Pour l’instant, connectez WhatsApp par code QR pour activer les messages d’anniversaire.', chooseEvent: 'Choisir quand envoyer', chooseEventHint: 'Touchez un événement de la liste pour modifier son message ci-dessous.',
    editingBadge: 'Modification',
    eventEnabled: 'Envoyer ce message', template: 'Modèle du message', templateHint: 'Choisissez un modèle prêt ou rédigez le vôtre. Le texte apparaît juste en dessous.',
    templates: { automatic: 'Rotation automatique · recommandée', objective: 'Direct', cordial: 'Cordial', detailed: 'Détaillé', custom: 'Personnalisé' },
    messageText: 'Texte du message', messageTextHint: 'Les étiquettes colorées sont remplacées par les vraies données à l’envoi.',
    restoreDefault: 'Restaurer le modèle par défaut',
    automaticNote: 'En mode automatique, le texte ci-dessus est le modèle Cordial. Les envois alternent entre les modèles prêts. En le modifiant, le message devient Personnalisé.',
    customOptionsNote: 'Dans un texte personnalisé, le lien du bon, le montant et le lien de paiement n’apparaissent que si vous insérez la variable correspondante dans le texte.',
    fixMessages: 'Corrigez le message personnalisé pour enregistrer',
    noDomainsTitle: 'Aucune automatisation disponible avec cette offre', noDomainsDescription: 'Le canal WhatsApp peut rester connecté, mais les avis d’intervention nécessitent les Bons de travail et les avis financiers nécessitent les Encaissements.',
    osLink: 'Inclure le lien de suivi du bon', billingContent: 'Informations de facturation', amount: 'Montant', paymentLink: 'Lien de paiement',
    createdHint: 'Si l’échéance est dans plus de 10 jours, aucun message n’est envoyé à la création. Le client reçoit le rappel « Avant l’échéance », pour ne pas confondre la prochaine mensualité avec l’actuelle.',
    beforeDays: 'Jours avant', afterDays: 'Jours après', days: 'jours', preview: 'Aperçu du message', previewHint: 'Données illustratives — aucun message ne sera envoyé à ce stade.',
    messageLanguageHint: 'Les messages automatiques sont actuellement envoyés en portugais du Brésil.',
    active: 'Active', inactive: 'Inactive', companyPreview: 'Votre entreprise', illustrativePreview: 'Aperçu illustratif',
    customerRule: 'Les destinataires des interventions et factures sont configurés dans la fiche de chaque client. L’autorisation générale WhatsApp doit aussi être active.',
    reminderWhen: 'Quand envoyer le rappel', reminderWindowHint: 'L’envoi utilise les heures de rappel tous les jours. Si la visite précède l’ouverture, le rappel du jour ne sera pas envoyé.',
    reminderTimings: { day_before: '1 jour avant · recommandé', same_day: 'Le jour même' },
    criadaHint: 'Cet avis part quelques minutes après la création manuelle d’un bon. Les bons générés par contrat, récurrence ou import ne le déclenchent pas, pour éviter les envois en masse. Le message respecte les horaires configurés pour les rappels.',
    events: {
      criada: ['Bon créé', 'Quand un bon est ouvert manuellement'],
      scheduled_reminder: ['Rappel de visite planifiée', 'Avant la date prévue de la visite'],
      a_caminho: ['Technicien en route', 'Quand le technicien commence le trajet'], em_andamento: ['Intervention commencée', 'Quand le service commence'], concluida: ['Bon terminé', 'Quand le bon de travail est finalisé'],
      created: ['Facture créée', 'Manuelle ou créée par un abonnement'], before_due: ['Avant l’échéance', 'Rappel anticipé configurable'], due_today: ['À l’échéance', 'Le jour où la facture arrive à échéance'], after_due: ['Après l’échéance', 'Uniquement si la facture reste impayée'],
      greeting: ['Message d’anniversaire', 'Le jour de l’anniversaire du client ou d’un contact enregistré'],
    },
  },
} as const;

const OS_EVENTS: WhatsappOsEventKey[] = ['criada', 'scheduled_reminder', 'a_caminho', 'em_andamento', 'concluida'];
const BILLING_EVENTS: WhatsappBillingEventKey[] = ['created', 'before_due', 'due_today', 'after_due'];
const BIRTHDAY_EVENTS: WhatsappBirthdayEventKey[] = ['greeting'];
const ALL_DOMAINS: Domain[] = ['os', 'billing', 'birthday'];

function defaultEventForDomain(domain: Domain): WhatsappAutomationEvent {
  if (domain === 'os') return { domain: 'os', key: 'a_caminho' };
  if (domain === 'billing') return { domain: 'billing', key: 'created' };
  return { domain: 'birthday', key: 'greeting' };
}

function eventId(event: WhatsappAutomationEvent): string {
  return `${event.domain}.${event.key}`;
}

export function WhatsappAutomationSettings({
  locale,
  availableDomains = ALL_DOMAINS,
  enabled,
  preferences,
  isSaving,
  isDirty,
  readOnly = false,
  activeProvider = 'evolution_qr',
  companyValues,
  onEnabledChange,
  onPreferencesChange,
  onSave,
}: WhatsappAutomationSettingsProps) {
  const copy = COPY[locale];
  const normalizedDomains = ALL_DOMAINS.filter((candidate) => availableDomains.includes(candidate));
  const initialDomain = normalizedDomains[0] ?? 'os';
  const [domain, setDomain] = useState<Domain>(initialDomain);
  const [selected, setSelected] = useState<WhatsappAutomationEvent>(() => defaultEventForDomain(initialDomain));

  useEffect(() => {
    if (normalizedDomains.includes(domain)) return;
    const nextDomain = normalizedDomains[0];
    if (!nextDomain) return;
    setDomain(nextDomain);
    setSelected(defaultEventForDomain(nextDomain));
  }, [domain, normalizedDomains]);

  const events = useMemo<WhatsappAutomationEvent[]>(
    () => domain === 'os'
      ? OS_EVENTS.map((key) => ({ domain: 'os' as const, key }))
      : domain === 'billing'
        ? BILLING_EVENTS.map((key) => ({ domain: 'billing' as const, key }))
        : BIRTHDAY_EVENTS.map((key) => ({ domain: 'birthday' as const, key })),
    [domain],
  );

  const selectedRule = selected.domain === 'os'
    ? preferences.os.events[selected.key]
    : selected.domain === 'billing'
      ? preferences.billing.events[selected.key]
      : preferences.birthday.events[selected.key];
  const preview = buildWhatsappMessagePreview(selected, preferences, undefined, companyValues);
  const enabledCount = normalizedDomains.reduce((count, currentDomain) => {
    const rules = currentDomain === 'os'
      ? preferences.os.events
      : currentDomain === 'billing'
        ? preferences.billing.events
        : preferences.birthday.events;
    return count + Object.values(rules).filter((rule) => rule.enabled).length;
  }, 0);
  const controlsLocked = readOnly || isSaving;
  const birthdayProviderSupported = activeProvider === 'evolution_qr';
  const birthdayActivationLocked = (ruleEnabled: boolean) =>
    !birthdayProviderSupported && !ruleEnabled;

  // O editor sempre mostra o texto que vale para o aviso: o do próprio cliente
  // (mesmo que ainda inválido, para não apagar o que ele digita) ou o modelo pronto.
  const isCustom = selectedRule.template === 'custom';
  const editorValue = isCustom
    ? (selectedRule.customText ?? '')
    : resolveWhatsappEventTemplate(selected, preferences);

  const hasInvalidCustomText = [
    ...(normalizedDomains.includes('os')
      ? OS_EVENTS.map((key) => ({ domain: 'os' as const, rule: preferences.os.events[key] }))
      : []),
    ...(normalizedDomains.includes('billing')
      ? BILLING_EVENTS.map((key) => ({ domain: 'billing' as const, rule: preferences.billing.events[key] }))
      : []),
    ...(normalizedDomains.includes('birthday')
      ? BIRTHDAY_EVENTS.map((key) => ({ domain: 'birthday' as const, rule: preferences.birthday.events[key] }))
      : []),
  ].some(({ domain: ruleDomain, rule }) => rule.template === 'custom'
    && !validateWhatsappCustomText(rule.customText ?? '', ruleDomain).valid);

  if (normalizedDomains.length === 0) {
    return (
      <Card className="[--primary:0_0%_10%] [--primary-foreground:0_0%_100%] [--ring:0_0%_10%] dark:[--primary:0_0%_88%] dark:[--primary-foreground:0_0%_8%] dark:[--ring:0_0%_70%]">
        <CardHeader className="gap-4 border-b bg-muted/20 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
              {copy.title}
            </CardTitle>
            <CardDescription>{copy.description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <NoticeBanner variant="warning" icon={Lock} title={copy.noDomainsTitle}>
            {copy.noDomainsDescription}
          </NoticeBanner>
        </CardContent>
      </Card>
    );
  }

  const chooseDomain = (next: Domain) => {
    if (!normalizedDomains.includes(next)) return;
    setDomain(next);
    setSelected(defaultEventForDomain(next));
  };

  const rewriteSelectedRule = (
    rewrite: (rule: WhatsappAutomationRule) => WhatsappAutomationRule,
  ) => {
    if (selected.domain === 'os') {
      onPreferencesChange({
        ...preferences,
        os: {
          ...preferences.os,
          events: {
            ...preferences.os.events,
            [selected.key]: rewrite(preferences.os.events[selected.key]),
          },
        },
      });
      return;
    }
    if (selected.domain === 'birthday') {
      onPreferencesChange({
        ...preferences,
        birthday: {
          ...preferences.birthday,
          events: {
            ...preferences.birthday.events,
            [selected.key]: rewrite(preferences.birthday.events[selected.key]),
          },
        },
      });
      return;
    }
    onPreferencesChange({
      ...preferences,
      billing: {
        ...preferences.billing,
        events: {
          ...preferences.billing.events,
          [selected.key]: rewrite(preferences.billing.events[selected.key]),
        },
      },
    });
  };

  const updateSelectedRule = (patch: Partial<WhatsappAutomationRule>) => {
    rewriteSelectedRule((rule) => ({ ...rule, ...patch }));
  };

  const chooseTemplate = (value: WhatsappTemplateStyle) => {
    if (value === 'custom') {
      // Começa do texto que o cliente está vendo, ou volta ao que ele já tinha escrito.
      updateSelectedRule({
        template: 'custom',
        customText: selectedRule.customText || resolveWhatsappEventTemplate(selected, preferences),
      });
      return;
    }
    // O texto personalizado continua guardado para o cliente poder voltar a ele.
    updateSelectedRule({ template: value });
  };

  const editMessage = (text: string) => {
    if (text === editorValue) return;
    updateSelectedRule({ template: 'custom', customText: text });
  };

  const restoreDefaultTemplate = () => {
    const defaults = selected.domain === 'os'
      ? DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES.os.events[selected.key]
      : selected.domain === 'billing'
        ? DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES.billing.events[selected.key]
        : DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES.birthday.events[selected.key];
    rewriteSelectedRule((rule) => {
      const { customText: _discarded, ...rest } = rule;
      return { ...rest, template: defaults.template };
    });
  };

  const updateBilling = (
    patch: Partial<Omit<WhatsappAutomationPreferences['billing'], 'events'>>,
  ) => onPreferencesChange({
    ...preferences,
    billing: { ...preferences.billing, ...patch },
  });

  return (
    <Card className="overflow-hidden [--primary:0_0%_10%] [--primary-foreground:0_0%_100%] [--ring:0_0%_10%] dark:[--primary:0_0%_88%] dark:[--primary-foreground:0_0%_8%] dark:[--ring:0_0%_70%]">
      <CardHeader className="gap-4 border-b bg-muted/20 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
              {copy.title}
            </CardTitle>
            <Badge variant="outline" className="font-normal">
              {enabledCount} {copy.flowsEnabled}
            </Badge>
          </div>
          <CardDescription>{copy.description}</CardDescription>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <div className="text-right">
              <Label htmlFor="whatsapp-automation-master" className="text-sm">{copy.masterLabel}</Label>
              <p className="text-[11px] text-muted-foreground">{copy.masterHint}</p>
            </div>
            <Switch
              id="whatsapp-automation-master"
              checked={enabled}
              onCheckedChange={onEnabledChange}
              disabled={readOnly || isSaving}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-xs',
              hasInvalidCustomText ? 'text-destructive' : isDirty ? 'text-amber-600' : 'text-muted-foreground',
            )}>
              {hasInvalidCustomText ? copy.fixMessages : isDirty ? copy.pending : copy.saved}
            </span>
            <Button
              size="sm"
              onClick={onSave}
              disabled={readOnly || isSaving || !isDirty || hasInvalidCustomText}
              className="w-full sm:w-auto"
            >
              {isSaving ? <Clock3 className="mr-2 h-4 w-4 animate-pulse" /> : <Save className="mr-2 h-4 w-4" />}
              {isSaving ? copy.saving : copy.save}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {normalizedDomains.length > 1 && (
          <div className="border-b p-4 sm:p-5">
            <SegmentedControl
              value={domain}
              onValueChange={chooseDomain}
              className="[&_[role=radio][aria-checked=true]]:text-primary-foreground"
              aria-label={copy.chooseEvent}
              options={normalizedDomains.map((currentDomain) => currentDomain === 'os'
                ? { value: 'os', label: copy.os, icon: <Wrench className="h-4 w-4" /> }
                : currentDomain === 'billing'
                  ? { value: 'billing', label: copy.billing, icon: <ReceiptText className="h-4 w-4" /> }
                  : { value: 'birthday', label: copy.birthday, icon: <Cake className="h-4 w-4" /> })}
            />
          </div>
        )}

        <div className="grid xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 p-4 sm:p-5 xl:border-r">
            <div className="mb-3">
              <h3 className="text-sm font-semibold">{copy.chooseEvent}</h3>
              <p className="text-xs text-muted-foreground">{copy.chooseEventHint}</p>
            </div>

            <div className="overflow-hidden rounded-lg border">
              {events.map((event, index) => {
                const rule = event.domain === 'os'
                  ? preferences.os.events[event.key]
                  : event.domain === 'billing'
                    ? preferences.billing.events[event.key]
                    : preferences.birthday.events[event.key];
                const [title, description] = copy.events[event.key];
                const active = eventId(event) === eventId(selected);
                return (
                  <div
                    key={eventId(event)}
                    /* Selecao e switch sao controles irmaos: evita aninhar um
                       controle interativo dentro de outro e preserva teclado e
                       leitores de tela. */
                    className={cn(
                      'relative flex w-full items-stretch transition-colors',
                      index > 0 && 'border-t',
                      active ? 'bg-muted' : 'hover:bg-muted/50',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(event)}
                      className="relative flex min-w-0 flex-1 items-start gap-3 py-3 pl-4 text-left sm:pl-5"
                      aria-pressed={active}
                    >
                      {active && (
                        <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />
                      )}
                      <span className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}>
                        {event.domain === 'os' && event.key === 'criada'
                          ? <FilePlus2 className="h-4 w-4" />
                          : event.domain === 'birthday'
                            ? <Cake className="h-4 w-4" />
                            : event.domain === 'os' && event.key !== 'scheduled_reminder'
                            ? <Wrench className="h-4 w-4" />
                            : <CalendarClock className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{title}</span>
                          {active
                            ? <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{copy.editingBadge}</Badge>
                            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
                        </span>
                        <span className="block text-xs leading-relaxed text-muted-foreground">{description}</span>
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center px-3 sm:px-4">
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={(checked) => {
                          setSelected(event);
                          if (event.domain === 'os') {
                            onPreferencesChange({
                              ...preferences,
                              os: {
                                ...preferences.os,
                                events: {
                                  ...preferences.os.events,
                                  [event.key]: { ...rule, enabled: checked },
                                },
                              },
                            });
                          } else if (event.domain === 'billing') {
                            onPreferencesChange({
                              ...preferences,
                              billing: {
                                ...preferences.billing,
                                events: {
                                  ...preferences.billing.events,
                                  [event.key]: { ...rule, enabled: checked },
                                },
                              },
                            });
                          } else {
                            onPreferencesChange({
                              ...preferences,
                              birthday: {
                                ...preferences.birthday,
                                events: {
                                  ...preferences.birthday.events,
                                  [event.key]: { ...rule, enabled: checked },
                                },
                              },
                            });
                          }
                        }}
                        disabled={controlsLocked || (event.domain === 'birthday' && birthdayActivationLocked(rule.enabled))}
                        aria-label={`${copy.eventEnabled}: ${title}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 space-y-5">
              {selected.domain === 'birthday' && (
                <NoticeBanner
                  variant={birthdayProviderSupported ? 'neutral' : 'warning'}
                  icon={birthdayProviderSupported ? Cake : Lock}
                  title={birthdayProviderSupported ? copy.birthday : copy.birthdayProviderUnavailableTitle}
                >
                  {birthdayProviderSupported ? copy.birthdayOptIn : copy.birthdayProviderUnavailable}
                </NoticeBanner>
              )}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="whatsapp-selected-event">{copy.eventEnabled}</Label>
                  <p className="text-xs text-muted-foreground">{copy.events[selected.key][0]}</p>
                </div>
                <Switch
                  key={`${selected.domain}-${selected.key}-${selectedRule.enabled ? 'enabled' : 'disabled'}`}
                  id="whatsapp-selected-event"
                  checked={selectedRule.enabled}
                  onCheckedChange={(checked) => updateSelectedRule({ enabled: checked })}
                  disabled={controlsLocked || (selected.domain === 'birthday' && birthdayActivationLocked(selectedRule.enabled))}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="whatsapp-template">{copy.template}</Label>
                <Select
                  value={selectedRule.template}
                  onValueChange={(value) => chooseTemplate(value as WhatsappTemplateStyle)}
                  disabled={readOnly || isSaving}
                >
                  <SelectTrigger id="whatsapp-template"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(copy.templates) as WhatsappTemplateStyle[]).map((key) => (
                      <SelectItem key={key} value={key}>{copy.templates[key]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{copy.templateHint}</p>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="min-w-0">
                    <Label htmlFor="whatsapp-message-text">{copy.messageText}</Label>
                    <p className="text-xs text-muted-foreground">{copy.messageTextHint}</p>
                  </div>
                  {isCustom && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={restoreDefaultTemplate}
                      disabled={controlsLocked}
                      className="h-9 gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {copy.restoreDefault}
                    </Button>
                  )}
                </div>
                <WhatsappMessageEditor
                  key={`${selected.domain}-${locale}`}
                  id="whatsapp-message-text"
                  value={editorValue}
                  onChange={editMessage}
                  domain={selected.domain}
                  locale={locale}
                  disabled={controlsLocked}
                  validate={isCustom}
                  companyValues={companyValues}
                />
                {selectedRule.template === 'automatic' && (
                  <p className="text-xs text-muted-foreground">{copy.automaticNote}</p>
                )}
              </div>

              {selected.domain === 'os' ? (
                <>
                  {selected.key === 'criada' && (
                    <p className="text-xs text-muted-foreground">{copy.criadaHint}</p>
                  )}
                  {selected.key === 'scheduled_reminder' && (
                    <div className="space-y-2">
                      <Label>{copy.reminderWhen}</Label>
                      <SegmentedControl
                        value={preferences.os.events.scheduled_reminder.timing}
                        onValueChange={(timing) => onPreferencesChange({
                          ...preferences,
                          os: {
                            ...preferences.os,
                            events: {
                              ...preferences.os.events,
                              scheduled_reminder: {
                                ...preferences.os.events.scheduled_reminder,
                                timing: timing as WhatsappOsReminderTiming,
                              },
                            },
                          },
                        })}
                        disabled={readOnly || isSaving}
                        aria-label={copy.reminderWhen}
                        options={(Object.keys(copy.reminderTimings) as WhatsappOsReminderTiming[])
                          .map((value) => ({ value, label: copy.reminderTimings[value] }))}
                      />
                      <p className="text-xs text-muted-foreground">{copy.reminderWindowHint}</p>
                    </div>
                  )}
                  {isCustom ? (
                    <p className="text-xs text-muted-foreground">{copy.customOptionsNote}</p>
                  ) : (
                    <OptionRow
                      icon={Link2}
                      label={copy.osLink}
                      checked={preferences.os.includeLink}
                      disabled={readOnly || isSaving}
                      onCheckedChange={(includeLink) => onPreferencesChange({
                        ...preferences,
                        os: { ...preferences.os, includeLink },
                      })}
                    />
                  )}
                </>
              ) : selected.domain === 'billing' ? (
                <>
                  {selected.key === 'created' && (
                    <p className="text-xs text-muted-foreground">{copy.createdHint}</p>
                  )}

                  {(selected.key === 'before_due' || selected.key === 'after_due') && (
                    <div className="space-y-2">
                      <Label htmlFor="whatsapp-offset-days">
                        {selected.key === 'before_due' ? copy.beforeDays : copy.afterDays}
                      </Label>
                      <div className="flex items-center gap-2">
                        <NumericInput
                          id="whatsapp-offset-days"
                          value={String(selected.key === 'before_due'
                            ? preferences.billing.daysBeforeDue
                            : preferences.billing.daysAfterDue)}
                          onValueChange={(raw) => {
                            const value = Math.min(90, Math.max(1, Number(raw || 1)));
                            updateBilling(selected.key === 'before_due'
                              ? { daysBeforeDue: value }
                              : { daysAfterDue: value });
                          }}
                          className="w-24"
                          disabled={readOnly || isSaving}
                        />
                        <span className="text-sm text-muted-foreground">{copy.days}</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <Label>{copy.billingContent}</Label>
                      <p className="text-xs text-muted-foreground">{copy.events[selected.key][1]}</p>
                    </div>
                    {isCustom ? (
                      <p className="text-xs text-muted-foreground">{copy.customOptionsNote}</p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <OptionRow icon={Banknote} label={copy.amount} compact checked={preferences.billing.includeAmount} disabled={readOnly || isSaving} onCheckedChange={(includeAmount) => updateBilling({ includeAmount })} />
                        <OptionRow icon={ExternalLink} label={copy.paymentLink} compact checked={preferences.billing.includePaymentLink} disabled={readOnly || isSaving} onCheckedChange={(includePaymentLink) => updateBilling({ includePaymentLink })} />
                      </div>
                    )}
                  </div>
                </>
              ) : null}

              <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{copy.customerRule}</span>
              </div>
            </div>
          </div>

          <div className="border-t bg-muted/10 p-4 sm:p-5 xl:border-t-0">
            <div className="xl:sticky xl:top-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{copy.preview}</h3>
                  <p className="text-xs text-muted-foreground">{copy.previewHint}</p>
                  <p className="text-xs text-muted-foreground">{copy.messageLanguageHint}</p>
                </div>
                {selectedRule.enabled ? (
                  <Badge className="bg-primary text-primary-foreground hover:bg-primary">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> {copy.active}
                  </Badge>
                ) : (
                  <Badge variant="secondary">{copy.inactive}</Badge>
                )}
              </div>
              <WhatsappPreview
                text={preview}
                companyLabel={copy.companyPreview}
                previewLabel={copy.illustrativePreview}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OptionRow({
  icon: Icon,
  label,
  checked,
  onCheckedChange,
  disabled,
  compact = false,
}: {
  icon: LucideIcon;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn(
      'flex items-center justify-between gap-3 rounded-lg border bg-background',
      compact ? 'px-3 py-2.5' : 'px-4 py-3',
    )}>
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium leading-tight">{label}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

function WhatsappPreview({
  text,
  companyLabel,
  previewLabel,
}: {
  text: string;
  companyLabel: string;
  previewLabel: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-[#efeae2] shadow-sm">
      <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2.5 text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
          <WhatsAppIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{companyLabel}</span>
          <span className="block text-[10px] text-white/75">{previewLabel}</span>
        </span>
      </div>
      <div className="min-h-[250px] p-4">
        <div className="ml-auto max-w-[92%] rounded-lg rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-[13px] leading-relaxed text-slate-900 shadow-sm">
          <p className="break-words">{renderWhatsappText(text)}</p>
          <div className="mt-1 text-right text-[10px] tabular-nums text-slate-500">10:32 ✓✓</div>
        </div>
      </div>
    </div>
  );
}

function renderWhatsappText(text: string) {
  return text.split('\n').map((line, lineIndex, lines) => {
    // Linha que começa com "- " ou "* " é item de lista no WhatsApp.
    const bullet = /^[-*] (.*)$/.exec(line);
    const inline = parseWhatsappLine(bullet ? bullet[1] : line).map((segment, segmentIndex) => {
      if (segment.type !== 'text') return null;
      const parts = segment.text.split(/(https?:\/\/\S+)/g).filter(Boolean);
      let content: React.ReactNode = parts.map((part, partIndex) => (
        part.startsWith('http://') || part.startsWith('https://')
          ? (
            <a
              key={`${partIndex}-${part}`}
              href={part}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-sky-700 underline underline-offset-2"
            >
              {part}
            </a>
          )
          : part
      ));
      if (segment.marks.includes('strike')) content = <s>{content}</s>;
      if (segment.marks.includes('italic')) content = <em>{content}</em>;
      if (segment.marks.includes('bold')) content = <strong>{content}</strong>;
      return <span key={segmentIndex}>{content}</span>;
    });
    if (bullet) {
      return (
        <span key={`${lineIndex}-${line}`} className="flex gap-1.5 pl-2" data-whatsapp-bullet="true">
          <span aria-hidden="true">•</span>
          <span className="min-w-0 flex-1">{inline}</span>
        </span>
      );
    }
    return (
      <span key={`${lineIndex}-${line}`}>
        {inline}
        {lineIndex < lines.length - 1 && <br />}
      </span>
    );
  });
}
