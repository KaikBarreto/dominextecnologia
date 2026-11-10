import { useMemo, useState } from 'react';
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  Link2,
  ReceiptText,
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
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { cn } from '@/lib/utils';
import type { LocaleCode } from '@/lib/i18n/locales';
import {
  buildWhatsappMessagePreview,
  countEnabledWhatsappAutomations,
  type WhatsappAutomationEvent,
  type WhatsappAutomationPreferences,
  type WhatsappBillingEventKey,
  type WhatsappOsEventKey,
  type WhatsappOsReminderTiming,
  type WhatsappTemplateStyle,
} from '@/lib/whatsappAutomation';

type Domain = 'os' | 'billing';

interface WhatsappAutomationSettingsProps {
  locale: LocaleCode;
  enabled: boolean;
  preferences: WhatsappAutomationPreferences;
  isSaving: boolean;
  isDirty: boolean;
  readOnly?: boolean;
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
    chooseEvent: 'Escolha quando enviar',
    chooseEventHint: 'Toque em um evento da lista para editar a mensagem dele aqui embaixo.',
    editingBadge: 'Editando',
    eventEnabled: 'Enviar esta mensagem',
    template: 'Modelo da mensagem',
    templateHint: 'Os textos finais serão vinculados aos templates aprovados pelo provedor.',
    templates: {
      automatic: 'Rotação automática · recomendada',
      objective: 'Objetiva',
      cordial: 'Cordial',
      detailed: 'Detalhada',
    },
    osLink: 'Incluir link de acompanhamento da OS',
    billingContent: 'Informações da cobrança',
    amount: 'Valor',
    paymentLink: 'Link de pagamento',
    beforeDays: 'Quantos dias antes',
    afterDays: 'Quantos dias depois',
    days: 'dias',
    preview: 'Prévia da mensagem',
    previewHint: 'Dados ilustrativos — nenhuma mensagem será enviada nesta etapa.',
    messageLanguageHint: 'As mensagens automáticas são enviadas em português (Brasil).',
    active: 'Ativa',
    inactive: 'Inativa',
    companyPreview: 'Sua empresa',
    illustrativePreview: 'Prévia ilustrativa',
    customerRule: 'Somente clientes com a opção “Receber mensagens pelo WhatsApp” ativa serão considerados.',
    reminderWhen: 'Quando enviar o lembrete',
    reminderWindowHint: 'O envio usa o horário dos lembretes em qualquer dia. Se a visita for antes da abertura da janela, o lembrete no dia não será enviado.',
    reminderTimings: { day_before: '1 dia antes · recomendado', same_day: 'No dia' },
    events: {
      scheduled_reminder: ['Lembrete de visita agendada', 'Antes da data marcada para a visita'],
      a_caminho: ['Técnico a caminho', 'Quando o técnico inicia o deslocamento'],
      em_andamento: ['Serviço iniciado', 'Quando o atendimento começa'],
      concluida: ['OS concluída', 'Quando a ordem de serviço é finalizada'],
      created: ['Cobrança gerada', 'Manual ou criada por uma assinatura'],
      before_due: ['Antes do vencimento', 'Lembrete antecipado configurável'],
      due_today: ['No vencimento', 'No dia em que a cobrança vence'],
      after_due: ['Após o vencimento', 'Somente se a cobrança continuar pendente'],
    },
  },
  en: {
    title: 'Message automation', description: 'Choose which notifications are sent and how each message is built.',
    masterLabel: 'Enable automations', masterHint: 'Messages will only start after a provider is connected.',
    save: 'Save settings', saving: 'Saving…', saved: 'Settings saved', pending: 'Unsaved changes', flowsEnabled: 'active flows',
    os: 'Work orders', billing: 'Charges', chooseEvent: 'Choose when to send', chooseEventHint: 'Tap an event in the list to edit its message below.', editingBadge: 'Editing',
    eventEnabled: 'Send this message', template: 'Message template', templateHint: 'Final texts will be linked to templates approved by the provider.',
    templates: { automatic: 'Automatic rotation · recommended', objective: 'Objective', cordial: 'Friendly', detailed: 'Detailed' },
    osLink: 'Include work order tracking link', billingContent: 'Charge information', amount: 'Amount', paymentLink: 'Payment link',
    beforeDays: 'Days before', afterDays: 'Days after', days: 'days', preview: 'Message preview', previewHint: 'Illustrative data — no message will be sent at this stage.',
    messageLanguageHint: 'Automatic messages are currently sent in Brazilian Portuguese.',
    active: 'Active', inactive: 'Inactive', companyPreview: 'Your company', illustrativePreview: 'Illustrative preview',
    customerRule: 'Only customers with “Receive WhatsApp messages” enabled will be considered.',
    reminderWhen: 'When to send the reminder', reminderWindowHint: 'Sending uses the reminder hours on any day. If the visit is before the window opens, the same-day reminder will not be sent.',
    reminderTimings: { day_before: '1 day before · recommended', same_day: 'On the day' },
    events: {
      scheduled_reminder: ['Scheduled visit reminder', 'Before the scheduled visit date'],
      a_caminho: ['Technician on the way', 'When the technician starts travelling'], em_andamento: ['Service started', 'When the service begins'], concluida: ['Work order completed', 'When the work order is completed'],
      created: ['Charge created', 'Manual or created by a subscription'], before_due: ['Before due date', 'Configurable early reminder'], due_today: ['On due date', 'On the day the charge is due'], after_due: ['After due date', 'Only while the charge remains pending'],
    },
  },
  es: {
    title: 'Automatización de mensajes', description: 'Define qué avisos se envían y cómo se compone cada mensaje.',
    masterLabel: 'Activar automatizaciones', masterHint: 'Los envíos solo comenzarán cuando se conecte un proveedor.',
    save: 'Guardar configuración', saving: 'Guardando…', saved: 'Configuración guardada', pending: 'Cambios sin guardar', flowsEnabled: 'flujos activos',
    os: 'Órdenes de trabajo', billing: 'Cobros', chooseEvent: 'Elige cuándo enviar', chooseEventHint: 'Toca un evento de la lista para editar su mensaje aquí abajo.', editingBadge: 'Editando',
    eventEnabled: 'Enviar este mensaje', template: 'Modelo del mensaje', templateHint: 'Los textos finales se vincularán a plantillas aprobadas por el proveedor.',
    templates: { automatic: 'Rotación automática · recomendada', objective: 'Objetiva', cordial: 'Cordial', detailed: 'Detallada' },
    osLink: 'Incluir enlace de seguimiento de la orden', billingContent: 'Información del cobro', amount: 'Importe', paymentLink: 'Enlace de pago',
    beforeDays: 'Cuántos días antes', afterDays: 'Cuántos días después', days: 'días', preview: 'Vista previa', previewHint: 'Datos ilustrativos — no se enviará ningún mensaje en esta etapa.',
    messageLanguageHint: 'Los mensajes automáticos se envían actualmente en portugués de Brasil.',
    active: 'Activa', inactive: 'Inactiva', companyPreview: 'Tu empresa', illustrativePreview: 'Vista previa ilustrativa',
    customerRule: 'Solo se considerarán clientes con “Recibir mensajes por WhatsApp” activo.',
    reminderWhen: 'Cuándo enviar el recordatorio', reminderWindowHint: 'El envío usa el horario de recordatorios cualquier día. Si la visita es antes de la apertura, el recordatorio del mismo día no se enviará.',
    reminderTimings: { day_before: '1 día antes · recomendado', same_day: 'El mismo día' },
    events: {
      scheduled_reminder: ['Recordatorio de visita programada', 'Antes de la fecha programada para la visita'],
      a_caminho: ['Técnico en camino', 'Cuando el técnico inicia el desplazamiento'], em_andamento: ['Servicio iniciado', 'Cuando comienza la atención'], concluida: ['Orden finalizada', 'Cuando se completa la orden de trabajo'],
      created: ['Cobro generado', 'Manual o creado por una suscripción'], before_due: ['Antes del vencimiento', 'Recordatorio anticipado configurable'], due_today: ['En el vencimiento', 'El día del vencimiento'], after_due: ['Después del vencimiento', 'Solo si el cobro sigue pendiente'],
    },
  },
  fr: {
    title: 'Automatisation des messages', description: 'Définissez les notifications envoyées et le contenu de chaque message.',
    masterLabel: 'Activer les automatisations', masterHint: 'Les envois ne commenceront qu’après la connexion d’un fournisseur.',
    save: 'Enregistrer', saving: 'Enregistrement…', saved: 'Paramètres enregistrés', pending: 'Modifications non enregistrées', flowsEnabled: 'flux actifs',
    os: 'Bons de travail', billing: 'Factures', chooseEvent: 'Choisir quand envoyer', chooseEventHint: 'Touchez un événement de la liste pour modifier son message ci-dessous.',
    editingBadge: 'Modification',
    eventEnabled: 'Envoyer ce message', template: 'Modèle du message', templateHint: 'Les textes finaux seront liés aux modèles approuvés par le fournisseur.',
    templates: { automatic: 'Rotation automatique · recommandée', objective: 'Direct', cordial: 'Cordial', detailed: 'Détaillé' },
    osLink: 'Inclure le lien de suivi du bon', billingContent: 'Informations de facturation', amount: 'Montant', paymentLink: 'Lien de paiement',
    beforeDays: 'Jours avant', afterDays: 'Jours après', days: 'jours', preview: 'Aperçu du message', previewHint: 'Données illustratives — aucun message ne sera envoyé à ce stade.',
    messageLanguageHint: 'Les messages automatiques sont actuellement envoyés en portugais du Brésil.',
    active: 'Active', inactive: 'Inactive', companyPreview: 'Votre entreprise', illustrativePreview: 'Aperçu illustratif',
    customerRule: 'Seuls les clients ayant activé « Recevoir des messages WhatsApp » seront concernés.',
    reminderWhen: 'Quand envoyer le rappel', reminderWindowHint: 'L’envoi utilise les heures de rappel tous les jours. Si la visite précède l’ouverture, le rappel du jour ne sera pas envoyé.',
    reminderTimings: { day_before: '1 jour avant · recommandé', same_day: 'Le jour même' },
    events: {
      scheduled_reminder: ['Rappel de visite planifiée', 'Avant la date prévue de la visite'],
      a_caminho: ['Technicien en route', 'Quand le technicien commence le trajet'], em_andamento: ['Intervention commencée', 'Quand le service commence'], concluida: ['Bon terminé', 'Quand le bon de travail est finalisé'],
      created: ['Facture créée', 'Manuelle ou créée par un abonnement'], before_due: ['Avant l’échéance', 'Rappel anticipé configurable'], due_today: ['À l’échéance', 'Le jour où la facture arrive à échéance'], after_due: ['Après l’échéance', 'Uniquement si la facture reste impayée'],
    },
  },
} as const;

const OS_EVENTS: WhatsappOsEventKey[] = ['scheduled_reminder', 'a_caminho', 'em_andamento', 'concluida'];
const BILLING_EVENTS: WhatsappBillingEventKey[] = ['created', 'before_due', 'due_today', 'after_due'];

function eventId(event: WhatsappAutomationEvent): string {
  return `${event.domain}.${event.key}`;
}

export function WhatsappAutomationSettings({
  locale,
  enabled,
  preferences,
  isSaving,
  isDirty,
  readOnly = false,
  onEnabledChange,
  onPreferencesChange,
  onSave,
}: WhatsappAutomationSettingsProps) {
  const copy = COPY[locale];
  const [domain, setDomain] = useState<Domain>('os');
  const [selected, setSelected] = useState<WhatsappAutomationEvent>({ domain: 'os', key: 'a_caminho' });

  const events = useMemo<WhatsappAutomationEvent[]>(
    () => domain === 'os'
      ? OS_EVENTS.map((key) => ({ domain: 'os' as const, key }))
      : BILLING_EVENTS.map((key) => ({ domain: 'billing' as const, key })),
    [domain],
  );

  const selectedRule = selected.domain === 'os'
    ? preferences.os.events[selected.key]
    : preferences.billing.events[selected.key];
  const preview = buildWhatsappMessagePreview(selected, preferences);
  const enabledCount = countEnabledWhatsappAutomations(preferences);

  const chooseDomain = (next: Domain) => {
    setDomain(next);
    setSelected(next === 'os'
      ? { domain: 'os', key: 'a_caminho' }
      : { domain: 'billing', key: 'created' });
  };

  const updateSelectedRule = (patch: Partial<typeof selectedRule>) => {
    if (selected.domain === 'os') {
      onPreferencesChange({
        ...preferences,
        os: {
          ...preferences.os,
          events: {
            ...preferences.os.events,
            [selected.key]: { ...preferences.os.events[selected.key], ...patch },
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
          [selected.key]: { ...preferences.billing.events[selected.key], ...patch },
        },
      },
    });
  };

  const updateBilling = (
    patch: Partial<Omit<WhatsappAutomationPreferences['billing'], 'events'>>,
  ) => onPreferencesChange({
    ...preferences,
    billing: { ...preferences.billing, ...patch },
  });

  return (
    <Card className="overflow-hidden">
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
              isDirty ? 'text-amber-600' : 'text-muted-foreground',
            )}>
              {isDirty ? copy.pending : copy.saved}
            </span>
            <Button
              size="sm"
              onClick={onSave}
              disabled={readOnly || isSaving || !isDirty}
              className="w-full text-white sm:w-auto"
            >
              {isSaving ? <Clock3 className="mr-2 h-4 w-4 animate-pulse" /> : <Save className="mr-2 h-4 w-4" />}
              {isSaving ? copy.saving : copy.save}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="border-b p-4 sm:p-5">
          <SegmentedControl
            value={domain}
            onValueChange={chooseDomain}
            className="[&_[role=radio][aria-checked=true]]:text-white"
            aria-label={copy.chooseEvent}
            options={[
              { value: 'os', label: copy.os, icon: <Wrench className="h-4 w-4" /> },
              { value: 'billing', label: copy.billing, icon: <ReceiptText className="h-4 w-4" /> },
            ]}
          />
        </div>

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
                  : preferences.billing.events[event.key];
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
                        {event.domain === 'os' && event.key !== 'scheduled_reminder'
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
                          } else {
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
                          }
                        }}
                        disabled={readOnly || isSaving}
                        aria-label={`${copy.eventEnabled}: ${title}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="whatsapp-selected-event">{copy.eventEnabled}</Label>
                  <p className="text-xs text-muted-foreground">{copy.events[selected.key][0]}</p>
                </div>
                <Switch
                  id="whatsapp-selected-event"
                  checked={selectedRule.enabled}
                  onCheckedChange={(checked) => updateSelectedRule({ enabled: checked })}
                  disabled={readOnly || isSaving}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="whatsapp-template">{copy.template}</Label>
                <Select
                  value={selectedRule.template}
                  onValueChange={(value) => updateSelectedRule({ template: value as WhatsappTemplateStyle })}
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

              {selected.domain === 'os' ? (
                <>
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
                </>
              ) : (
                <>
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
                    <div className="grid gap-2 sm:grid-cols-2">
                      <OptionRow icon={Banknote} label={copy.amount} compact checked={preferences.billing.includeAmount} disabled={readOnly || isSaving} onCheckedChange={(includeAmount) => updateBilling({ includeAmount })} />
                      <OptionRow icon={ExternalLink} label={copy.paymentLink} compact checked={preferences.billing.includePaymentLink} disabled={readOnly || isSaving} onCheckedChange={(includePaymentLink) => updateBilling({ includePaymentLink })} />
                    </div>
                  </div>
                </>
              )}

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
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
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
    const parts = line.split(/(\*[^*]+\*|https?:\/\/\S+)/g).filter(Boolean);
    return (
      <span key={`${lineIndex}-${line}`}>
        {parts.map((part, partIndex) => {
          if (part.startsWith('*') && part.endsWith('*')) {
            return <strong key={`${partIndex}-${part}`}>{part.slice(1, -1)}</strong>;
          }
          if (part.startsWith('http://') || part.startsWith('https://')) {
            return (
              <a
                key={`${partIndex}-${part}`}
                href={part}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-sky-700 underline underline-offset-2"
              >
                {part}
              </a>
            );
          }
          return part;
        })}
        {lineIndex < lines.length - 1 && <br />}
      </span>
    );
  });
}
