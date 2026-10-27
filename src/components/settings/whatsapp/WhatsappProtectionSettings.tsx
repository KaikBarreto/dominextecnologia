import { CalendarClock, Clock, ShieldCheck, Wrench } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { LocaleCode } from '@/lib/i18n/locales';
import type {
  WhatsappAutomationPreferences,
  WhatsappSendWindow,
  WhatsappSendWindowGroup,
} from '@/lib/whatsappAutomation';
import { cn } from '@/lib/utils';

interface WhatsappProtectionSettingsProps {
  locale: LocaleCode;
  preferences: WhatsappAutomationPreferences;
  readOnly?: boolean;
  isSaving?: boolean;
  onPreferencesChange: (preferences: WhatsappAutomationPreferences) => void;
}

const COPY = {
  'pt-br': {
    title: 'Proteção do número',
    description:
      'Regras que fazem os avisos saírem no ritmo de uma pessoa, e não de um robô. Reduzem o risco de bloqueio e de reclamação do cliente.',
    windowsTitle: 'Horários de envio',
    transactionalTitle: 'Avisos de serviço',
    transactionalHint:
      'Técnico a caminho, serviço iniciado e serviço concluído. O cliente está esperando essa mensagem no momento em que ela acontece, então o horário aqui acompanha a operação da empresa, não o comercial.',
    remindersTitle: 'Lembretes de cobrança',
    remindersHint:
      'Cobrança gerada, lembrete de vencimento e aviso de atraso. Evite madrugada e domingo: são horários que geram mais reclamações.',
    startLabel: 'Começa às',
    endLabel: 'Termina às',
    daysLabel: 'Dias da semana',
    daysRequired: 'Mantenha pelo menos um dia marcado para esta janela.',
    queueHint: 'Fora do horário, a mensagem fica na fila e sai na próxima abertura.',
    behaviorTitle: 'Comportamento humano',
    typingLabel: 'Mostrar "digitando" antes de enviar',
    typingHint: 'Alguns segundos de digitação, proporcionais ao tamanho da mensagem.',
    readLabel: 'Marcar a conversa como lida antes de responder',
    readHint:
      'Isso remove o aviso de mensagem não lida no celular da sua equipe. Deixe desligado se alguém acompanha as conversas pelo aparelho.',
    timezoneNote: 'Fuso horário configurado para a empresa.',
    days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
  },
  en: {
    title: 'Number protection',
    description:
      'Rules that make notifications go out at a human pace instead of a robotic one. They lower the risk of blocking and of customer complaints.',
    windowsTitle: 'Sending hours',
    transactionalTitle: 'Service updates',
    transactionalHint:
      'Technician on the way, job started and job finished. The customer is waiting for this message as it happens, so these hours follow the company operation, not office hours.',
    remindersTitle: 'Billing reminders',
    remindersHint:
      'Created charges, due date reminders and overdue notices. Avoid late nights and Sundays, when complaints are more likely.',
    startLabel: 'Starts at',
    endLabel: 'Ends at',
    daysLabel: 'Days of the week',
    daysRequired: 'Keep at least one day selected for this window.',
    queueHint: 'Outside these hours the message waits in the queue and goes out at the next opening.',
    behaviorTitle: 'Human behavior',
    typingLabel: 'Show "typing" before sending',
    typingHint: 'A few seconds of typing, proportional to the message length.',
    readLabel: 'Mark the chat as read before replying',
    readHint:
      'This clears the unread badge on your team phone. Leave it off if someone follows the chats on the device.',
    timezoneNote: 'Uses the company’s configured time zone.',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
  es: {
    title: 'Protección del número',
    description:
      'Reglas que hacen que los avisos salgan al ritmo de una persona y no de un robot. Reducen el riesgo de bloqueo y de queja del cliente.',
    windowsTitle: 'Horarios de envío',
    transactionalTitle: 'Avisos de servicio',
    transactionalHint:
      'Técnico en camino, servicio iniciado y servicio concluido. El cliente espera ese mensaje en el momento en que ocurre, así que el horario aquí sigue la operación de la empresa, no el comercial.',
    remindersTitle: 'Recordatorios de cobro',
    remindersHint:
      'Cobros generados, recordatorios de vencimiento y avisos de atraso. Evita la madrugada y los domingos, cuando hay más riesgo de quejas.',
    startLabel: 'Comienza a las',
    endLabel: 'Termina a las',
    daysLabel: 'Días de la semana',
    daysRequired: 'Mantén al menos un día marcado para este horario.',
    queueHint: 'Fuera del horario, el mensaje queda en la cola y sale en la próxima apertura.',
    behaviorTitle: 'Comportamiento humano',
    typingLabel: 'Mostrar "escribiendo" antes de enviar',
    typingHint: 'Algunos segundos de escritura, proporcionales al tamaño del mensaje.',
    readLabel: 'Marcar la conversación como leída antes de responder',
    readHint:
      'Esto quita el aviso de mensaje no leído en el celular de tu equipo. Déjalo apagado si alguien sigue las conversaciones en el aparato.',
    timezoneNote: 'Usa la zona horaria configurada para la empresa.',
    days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
  },
  fr: {
    title: 'Protection du numéro',
    description:
      'Des règles qui font partir les avis au rythme d`une personne et non d`un robot. Elles réduisent le risque de blocage et de plainte du client.',
    windowsTitle: 'Horaires d`envoi',
    transactionalTitle: 'Avis de service',
    transactionalHint:
      'Technicien en route, service commencé et service terminé. Le client attend ce message au moment où il se produit, donc ces horaires suivent l`activité de l`entreprise, pas les heures de bureau.',
    remindersTitle: 'Rappels de facturation',
    remindersHint:
      'Factures créées, rappels d`échéance et avis de retard. Évitez la nuit et le dimanche, périodes plus propices aux plaintes.',
    startLabel: 'Commence à',
    endLabel: 'Termine à',
    daysLabel: 'Jours de la semaine',
    daysRequired: 'Conservez au moins un jour sélectionné pour cette plage.',
    queueHint: 'En dehors de ces horaires, le message reste en file et part à la prochaine ouverture.',
    behaviorTitle: 'Comportement humain',
    typingLabel: 'Afficher « en train d`écrire » avant d`envoyer',
    typingHint: 'Quelques secondes de saisie, proportionnelles à la longueur du message.',
    readLabel: 'Marquer la conversation comme lue avant de répondre',
    readHint:
      'Cela enlève le badge de message non lu sur le téléphone de votre équipe. Laissez désactivé si quelqu`un suit les conversations sur l`appareil.',
    timezoneNote: 'Utilise le fuseau horaire configuré pour l`entreprise.',
    days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
  },
} satisfies Record<LocaleCode, Record<string, unknown>>;

type ProtectionCopy = (typeof COPY)['pt-br'];

/** Dias da semana ISO: 1 = segunda … 7 = domingo, na mesma ordem do rótulo. */
const ISO_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function WhatsappProtectionSettings({
  locale,
  preferences,
  readOnly,
  isSaving,
  onPreferencesChange,
}: WhatsappProtectionSettingsProps) {
  const copy = COPY[locale];
  const { sendWindow } = preferences;

  const updateWindow = (group: WhatsappSendWindowGroup, patch: Partial<WhatsappSendWindow>) => {
    onPreferencesChange({
      ...preferences,
      sendWindow: {
        ...sendWindow,
        [group]: { ...sendWindow[group], ...patch },
      },
    });
  };


  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-1.5 border-b bg-muted/20">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          {copy.title}
        </CardTitle>
        <CardDescription className="max-w-3xl">{copy.description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-sky-600" />
            <h3 className="text-sm font-semibold">{copy.windowsTitle}</h3>
            <span className="text-xs text-muted-foreground">{copy.timezoneNote}</span>
          </div>

          {/* Lado a lado no desktop: são duas configurações irmãs e comparáveis,
              e empilhadas gastavam uma tela inteira de rolagem. */}
          <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
            <WindowEditor
              icon={Wrench}
              idPrefix="whatsapp-window-os"
              title={copy.transactionalTitle}
              hint={copy.transactionalHint}
              copy={copy}
              window={sendWindow.transactional}
              readOnly={readOnly || isSaving}
              onChange={(patch) => updateWindow('transactional', patch)}
            />

            <WindowEditor
              icon={CalendarClock}
              idPrefix="whatsapp-window-reminders"
              title={copy.remindersTitle}
              hint={copy.remindersHint}
              copy={copy}
              window={sendWindow.reminders}
              readOnly={readOnly || isSaving}
              onChange={(patch) => updateWindow('reminders', patch)}
            />
          </div>

          <p className="text-xs text-muted-foreground">{copy.queueHint}</p>
        </section>

      </CardContent>
    </Card>
  );
}

function WindowEditor({
  icon: Icon,
  idPrefix,
  title,
  hint,
  copy,
  window: value,
  readOnly,
  onChange,
}: {
  icon: typeof Wrench;
  idPrefix: string;
  title: string;
  hint: string;
  copy: ProtectionCopy;
  window: WhatsappSendWindow;
  readOnly?: boolean;
  onChange: (patch: Partial<WhatsappSendWindow>) => void;
}) {
  const toggleDay = (day: number) => {
    if (value.days.includes(day) && value.days.length === 1) return;
    const next = value.days.includes(day)
      ? value.days.filter((current) => current !== day)
      : [...value.days, day].sort((a, b) => a - b);
    onChange({ days: next });
  };

  // A janela precisa ter ao menos uma hora de largura, senão a fila nunca abre.
  const startOptions = Array.from({ length: 24 }, (_, index) => index).filter(
    (hour) => hour < value.endHour,
  );
  const endOptions = Array.from({ length: 24 }, (_, index) => index + 1).filter(
    (hour) => hour > value.startHour,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h4 className="text-sm font-semibold leading-tight">{title}</h4>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">{hint}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-start`} className="text-xs text-muted-foreground">
            {copy.startLabel}
          </Label>
          <Select
            value={String(value.startHour)}
            disabled={readOnly}
            onValueChange={(selected) => onChange({ startHour: Number(selected) })}
          >
            <SelectTrigger id={`${idPrefix}-start`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {startOptions.map((hour) => (
                <SelectItem key={hour} value={String(hour)}>
                  {hourLabel(hour)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-end`} className="text-xs text-muted-foreground">
            {copy.endLabel}
          </Label>
          <Select
            value={String(value.endHour)}
            disabled={readOnly}
            onValueChange={(selected) => onChange({ endHour: Number(selected) })}
          >
            <SelectTrigger id={`${idPrefix}-end`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {endOptions.map((hour) => (
                <SelectItem key={hour} value={String(hour)}>
                  {hourLabel(hour)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <span className="block text-xs text-muted-foreground">{copy.daysLabel}</span>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
          {ISO_DAYS.map((day, index) => {
            const active = value.days.includes(day);
            return (
              <button
                key={day}
                type="button"
                disabled={readOnly || (active && value.days.length === 1)}
                aria-pressed={active}
                aria-label={`${title}: ${copy.days[index]}`}
                onClick={() => toggleDay(day)}
                className={cn(
                  'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                  active
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-border bg-background hover:bg-muted',
                )}
              >
                {copy.days[index]}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{copy.daysRequired}</p>
      </div>
    </div>
  );
}
