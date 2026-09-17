import { useState, useEffect } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Loader2 } from 'lucide-react';
import { AssigneeMultiSelect } from '@/components/schedule/AssigneeMultiSelect';
import { CustomerSelectField } from '@/components/customers/CustomerSelectField';
import { useProfiles } from '@/hooks/useProfiles';
import { useTaskTypes } from '@/hooks/useTaskTypes';
import { useTeams } from '@/hooks/useTeams';
import { useCustomers } from '@/hooks/useCustomers';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { resolveEditingWeekdays } from '@/lib/taskRecurrence';

export interface TaskFormData {
  task_title: string;
  customer_id?: string;
  task_type_id?: string;
  service_type_id?: string;
  technician_id?: string;
  team_id?: string;
  assignee_user_ids?: string[];
  assignee_team_ids?: string[];
  scheduled_date?: string;
  scheduled_time?: string;
  duration_minutes?: number;
  description?: string;
  recurrence_type?: string;
  recurrence_interval?: number;
  recurrence_end_date?: string;
  recurrence_weekdays?: number[];
  /** true = "Contínua" (sem data para acabar). Ver src/lib/taskRecurrence.ts. */
  recurrence_indeterminate?: boolean;
  // ── Onda E do overhaul do CRM — vínculo com o card da oportunidade ──
  // `null`/undefined = tarefa comum (nascida na Agenda), comportamento
  // idêntico ao de sempre pra todo chamador que não passa `defaultLeadId`.
  // Sempre repassado pra useTaskSubmit (criação E "esta e as futuras" da
  // série), pra editar uma série não apagar o vínculo em silêncio — ver o
  // aviso em useTaskSubmit.ts.
  lead_id?: string | null;
  /** Checkbox "Mostrar na agenda". Default true — nunca muda o que já existe. */
  show_in_schedule?: boolean;
}

// `resolveEditingWeekdays` foi extraída pra `src/lib/taskRecurrence.ts`
// (mesma regra vale pra tarefa e pra OS — as duas vivem em `service_orders`,
// ver ServiceOrderFormDialog). Teste correspondente mudou junto para lá.

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TaskFormData) => Promise<void>;
  isLoading?: boolean;
  defaultDate?: string;
  defaultTime?: string;
  defaultCustomerId?: string;
  /** Título pré-preenchido (ex: título da oportunidade, ao criar tarefa a partir do CRM). Só criação. */
  defaultTitle?: string;
  /** Descrição pré-preenchida. Só criação. */
  defaultDescription?: string;
  /** Responsáveis pré-selecionados (ex: vendedor da oportunidade). Só criação. */
  defaultAssigneeUserIds?: string[];
  /**
   * Oportunidade do CRM (Onda E) a que esta tarefa deve ficar vinculada. Só
   * criação — em edição, o vínculo vem do próprio `task.lead_id`. Presente
   * (criação) ou truthy (edição) é o que decide se o bloco "Mostrar na
   * agenda" aparece: tarefa comum (Schedule/CustomerDetail/Assinatura) nunca
   * passa isso e continua 100% igual a antes.
   */
  defaultLeadId?: string;
  task?: any | null;
}

export function TaskFormDialog({
  open, onOpenChange, onSubmit, isLoading, defaultDate, defaultTime, defaultCustomerId, defaultTitle,
  defaultDescription, defaultAssigneeUserIds, defaultLeadId, task,
}: TaskFormDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.taskForm;
  const { data: profiles = [] } = useProfiles();
  const { taskTypes } = useTaskTypes();
  const { teamsWithMembers } = useTeams();
  const { customers } = useCustomers();

  const isEditing = !!task;
  const isRecurringSeries = !!(task && task.recurrence_group_id);

  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [taskTypeId, setTaskTypeId] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [description, setDescription] = useState('');
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState('weekly');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [recurrenceIndeterminate, setRecurrenceIndeterminate] = useState(false);
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([]);
  // true = a tarefa em edição é uma série "Personalizada" cujos dias da semana
  // nunca foram gravados (série criada antes da coluna `recurrence_weekdays`
  // existir). Não dá pra adivinhar quais eram — mostramos um aviso em vez do
  // seletor abrir vazio sem explicação nenhuma.
  const [legacyCustomWithoutWeekdays, setLegacyCustomWithoutWeekdays] = useState(false);
  // ── Onda E do overhaul do CRM ──────────────────────────────────────────
  // `leadId` nunca é editado pelo usuário aqui — só espelha `task.lead_id`
  // (edição) ou `defaultLeadId` (criação a partir do card). É ele que decide
  // se o bloco "Mostrar na agenda" aparece (`isCrmTask` abaixo) e é sempre
  // repassado no onSubmit, pra editar uma série nunca apagar o vínculo com o
  // card em silêncio (ver useTaskSubmit.ts).
  const [leadId, setLeadId] = useState<string | null>(null);
  const [showInSchedule, setShowInSchedule] = useState(true);
  const isCrmTask = !!leadId;

  useEffect(() => {
    if (open) {
      if (task) {
        setTitle(task.task_title || '');
        setCustomerId(task.customer_id || '');
        setTaskTypeId(task.task_type_id || '');
        setSelectedUserIds(task._assignee_user_ids || (task.technician_id ? [task.technician_id] : []));
        setSelectedTeamIds(task.team_id ? [task.team_id] : []);
        // Tarefa sem data (Onda E — fora da agenda) preserva vazio: nunca
        // inventamos "hoje" pra uma data que o usuário deliberadamente não
        // escolheu (diferente da criação, onde não há data anterior nenhuma
        // pra respeitar).
        setScheduledDate(task.scheduled_date || '');
        setScheduledTime(task.scheduled_time || '08:00');
        setDuration(task.duration_minutes || 60);
        setDescription(task.description || '');
        setLeadId(task.lead_id ?? null);
        setShowInSchedule(task.show_in_schedule ?? true);
        // Pré-preenche recorrência a partir da série (se a tarefa pertencer a uma).
        const hasSeries = !!task.recurrence_group_id;
        setRecurrenceEnabled(hasSeries);
        setRecurrenceType(task.recurrence_type || 'weekly');
        setRecurrenceInterval(task.recurrence_interval || 1);
        setRecurrenceEndDate(task.recurrence_end_date || '');
        setRecurrenceIndeterminate(!!task.recurrence_indeterminate);
        // Remonta os dias marcados a partir do que foi gravado na própria série.
        // `recurrence_weekdays` nulo/vazio = série antiga, criada antes dessa
        // coluna existir: não há de onde tirar os dias, então abre vazio (nunca
        // inventamos um dia) e sinalizamos o caso pro aviso abaixo do seletor.
        const { weekdays, legacyCustomWithoutWeekdays: isLegacy } = resolveEditingWeekdays(task);
        setRecurrenceWeekdays(weekdays);
        setLegacyCustomWithoutWeekdays(isLegacy);
      } else {
        setTitle(defaultTitle || '');
        setCustomerId(defaultCustomerId || '');
        setTaskTypeId('');
        setSelectedUserIds(defaultAssigneeUserIds && defaultAssigneeUserIds.length > 0 ? defaultAssigneeUserIds : []);
        setSelectedTeamIds([]);
        setScheduledDate(defaultDate || format(new Date(), 'yyyy-MM-dd'));
        setScheduledTime(defaultTime || '08:00');
        setDuration(60);
        setDescription(defaultDescription || '');
        setLeadId(defaultLeadId || null);
        // Nasce ligado (mesmo default do banco) — desligar é escolha do usuário.
        setShowInSchedule(true);
        setRecurrenceEnabled(false);
        setRecurrenceType('weekly');
        setRecurrenceInterval(1);
        setRecurrenceEndDate('');
        setRecurrenceIndeterminate(false);
        // Ancorado ao meio-dia local: `new Date('2026-03-02')` seria lido em UTC
        // e, no fuso -03, cairia no domingo anterior — marcando o dia errado
        // agora que a repetição semanal honra os dias marcados.
        const baseDateStr = defaultDate || format(new Date(), 'yyyy-MM-dd');
        const dayOfWeek = new Date(`${baseDateStr}T12:00:00`).getDay();
        setRecurrenceWeekdays([dayOfWeek]);
        setLegacyCustomWithoutWeekdays(false);
      }
    }
  }, [open, defaultDate, defaultTime, defaultCustomerId, defaultLeadId, task]);

  const toggleWeekday = (day: number) => {
    setRecurrenceWeekdays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    // Onda E — data só é obrigatória pra tarefa do CRM quando "Mostrar na
    // agenda" está ligado (tarefa comum sempre teve data pré-preenchida, então
    // este bloqueio nunca alcança os outros chamadores).
    if (isCrmTask && showInSchedule && !scheduledDate) return;

    await onSubmit({
      task_title: title.trim(),
      customer_id: customerId || undefined,
      task_type_id: taskTypeId || undefined,
      technician_id: selectedUserIds[0] || undefined,
      team_id: selectedTeamIds[0] || undefined,
      assignee_user_ids: selectedUserIds,
      assignee_team_ids: selectedTeamIds,
      scheduled_date: scheduledDate || undefined,
      scheduled_time: scheduledTime || undefined,
      duration_minutes: duration,
      description: description || undefined,
      recurrence_type: recurrenceEnabled ? recurrenceType : undefined,
      recurrence_interval: recurrenceEnabled ? recurrenceInterval : undefined,
      // "Contínua" ignora a data final (o motor materializa até o horizonte).
      recurrence_end_date: recurrenceEnabled && !recurrenceIndeterminate && recurrenceEndDate ? recurrenceEndDate : undefined,
      recurrence_indeterminate: recurrenceEnabled ? recurrenceIndeterminate : undefined,
      // Semanal também usa os dias marcados (a cada N semanas, em cada dia).
      // Nenhum dia marcado = 1 por semana no dia da data inicial, como sempre foi.
      recurrence_weekdays:
        recurrenceEnabled && (recurrenceType === 'custom' || recurrenceType === 'weekly')
          ? recurrenceWeekdays
          : undefined,
      // Onda E — sempre repassados (não só quando isCrmTask): tarefa comum
      // nunca teve leadId, então isso vira `lead_id: null` sem efeito nenhum.
      // Ver aviso em useTaskSubmit.ts sobre por que os dois têm que viajar
      // juntos em toda chamada, inclusive na regeneração de série.
      lead_id: leadId,
      show_in_schedule: showInSchedule,
    });
    onOpenChange(false);
  };

  // Recorrência exige uma data-base pra ancorar a série (generateRecurrenceDates).
  // Tarefa sem data (só possível numa tarefa do CRM com "Mostrar na agenda"
  // desligado) desliga a recorrência sozinha em vez de deixar o usuário topar
  // com a mensagem genérica de "informe a data final" do findRecurrenceIssue.
  useEffect(() => {
    if (!scheduledDate && recurrenceEnabled) {
      setRecurrenceEnabled(false);
    }
  }, [scheduledDate, recurrenceEnabled]);

  const technicianOptions = profiles.map(p => ({
    user_id: p.user_id,
    full_name: p.full_name,
    avatar_url: p.avatar_url,
  }));

  const footer = (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t.btnCancel}</Button>
      <Button
        type="submit"
        form="task-form"
        disabled={isLoading || !title.trim() || (isCrmTask && showInSchedule && !scheduledDate)}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isEditing ? t.btnSave : t.btnCreate}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={isEditing ? t.titleEdit : t.titleCreate} footer={footer}>
      <form id="task-form" onSubmit={handleSubmit} className="space-y-4 p-1">
        <div className="space-y-2">
          <Label>{t.labelTitle}</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.placeholderTitle}
            required
          />
        </div>

        <div className="space-y-2">
          <Label>{t.labelCustomer}</Label>
          <CustomerSelectField
            customers={customers}
            value={customerId || '_none'}
            onValueChange={(v) => setCustomerId(v === '_none' ? '' : v)}
            placeholder={t.placeholderSelectCustomer}
            emptyMessage={t.emptyCustomer}
            allowNone
            noneValue="_none"
            noneLabel={t.optionNone}
          />
        </div>

        <div className="space-y-2">
          <Label>{t.labelTaskType}</Label>
          <Select value={taskTypeId || '_none'} onValueChange={(v) => setTaskTypeId(v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder={t.placeholderTaskType} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">{t.optionNone}</SelectItem>
              {taskTypes.filter(tt => tt.is_active).map(tt => (
                <SelectItem key={tt.id} value={tt.id}>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: tt.color }} />
                    {tt.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <AssigneeMultiSelect
          technicians={technicianOptions}
          teams={teamsWithMembers}
          selectedUserIds={selectedUserIds}
          selectedTeamIds={selectedTeamIds}
          onChangeUsers={setSelectedUserIds}
          onChangeTeams={setSelectedTeamIds}
          label={t.labelAssignees}
        />

        {/* Onda E do overhaul do CRM — só aparece pra tarefa vinculada a uma
            oportunidade (criação a partir do card ou edição de uma tarefa que
            já nasceu lá). Tarefa comum (Agenda, ficha do cliente, assinatura)
            nunca vê este bloco. */}
        {isCrmTask && (
          <div className="rounded-lg border p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <Switch
                checked={showInSchedule}
                onCheckedChange={(checked) => {
                  setShowInSchedule(checked);
                  // Desligar limpa a data (ela vira opcional); religar reoferece
                  // hoje como ponto de partida, sem forçar o usuário a redigitar.
                  if (!checked) setScheduledDate('');
                  else if (!scheduledDate) setScheduledDate(format(new Date(), 'yyyy-MM-dd'));
                }}
              />
              <Label className="cursor-pointer">{t.labelShowInSchedule}</Label>
            </div>
            <p className="text-xs text-muted-foreground">{t.showInScheduleHint}</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>
              {t.labelDate}
              {isCrmTask && showInSchedule && <span className="text-destructive"> *</span>}
              {isCrmTask && !showInSchedule && (
                <span className="text-muted-foreground font-normal"> {t.dateOptionalHint}</span>
              )}
            </Label>
            <Input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              required={isCrmTask && showInSchedule}
              aria-invalid={isCrmTask && showInSchedule && !scheduledDate}
            />
          </div>
          <div className="space-y-2">
            <Label>{t.labelTime}</Label>
            <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t.labelDuration}</Label>
            <NumericInput value={String(duration ?? '')} onValueChange={(v) => setDuration(Number(v) || 0)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t.labelDescription}</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t.placeholderDescription}
            rows={2}
          />
        </div>

        {/* Recorrência — disponível ao criar e ao editar uma tarefa. Exige data
            (o motor de recorrência ancora nela) — sem data (Onda E, tarefa
            fora da agenda) o switch fica desabilitado com uma explicação em
            vez de deixar o usuário esbarrar na mensagem genérica de "informe
            a data final" só depois de tentar salvar. */}
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={recurrenceEnabled}
              onCheckedChange={setRecurrenceEnabled}
              disabled={!scheduledDate}
            />
            <Label className={cn('cursor-pointer', !scheduledDate && 'text-muted-foreground')}>{t.labelRecurrence}</Label>
          </div>
          {!scheduledDate && (
            <p className="text-xs text-muted-foreground">{t.recurrenceNeedsDateHint}</p>
          )}
          {isEditing && (
            <p className="text-xs text-muted-foreground">
              {isRecurringSeries ? t.recurrenceSeriesNote : t.recurrenceActivateNote}
            </p>
          )}
          {recurrenceEnabled && (
            <div className="space-y-3 pt-1">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.labelFrequency}</Label>
                  <Select value={recurrenceType} onValueChange={setRecurrenceType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['daily', 'weekly', 'biweekly', 'monthly', 'yearly', 'custom'] as const).map(key => (
                        <SelectItem key={key} value={key}>{t.recurrenceOptions[key]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.labelEvery}</Label>
                  <div className="flex items-center gap-1.5">
                    <NumericInput value={String(recurrenceInterval ?? '')} onValueChange={(v) => setRecurrenceInterval(Number(v) || 0)} />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {recurrenceType === 'daily' ? t.unitDays :
                       recurrenceType === 'monthly' ? t.unitMonths :
                       recurrenceType === 'yearly' ? t.unitYears :
                       t.unitWeeks}
                    </span>
                  </div>
                </div>
              </div>

              {/* flex-col (não space-y): o Label do shadcn é inline e o
                  LabeledSwitch é inline-flex — num container de fluxo normal os
                  dois colam na mesma linha ("DuraçãoAté uma data"). */}
              <div className="flex flex-col items-start gap-1.5">
                <Label className="text-xs">{t.labelRecurrenceDuration}</Label>
                <LabeledSwitch
                  value={recurrenceIndeterminate ? 'indeterminate' : 'until'}
                  onChange={(v) => setRecurrenceIndeterminate(v === 'indeterminate')}
                  off={{ value: 'until', label: t.durationUntilDate }}
                  on={{ value: 'indeterminate', label: t.durationContinuous }}
                  aria-label={t.labelRecurrenceDuration}
                />
              </div>

              {recurrenceIndeterminate ? (
                <p className="text-xs text-muted-foreground rounded-md bg-muted/50 p-2.5">
                  {t.indeterminateHint}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {/* Obrigatório quando a recorrência está ligada e não é
                      "Contínua": sem data final não existe série
                      (useTaskSubmit barra com mensagem). */}
                  <Label className="text-xs">
                    {t.labelUntil} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={recurrenceEndDate}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    aria-invalid={!recurrenceEndDate}
                  />
                </div>
              )}

              {/* Weekday picker for custom / weekly */}
              {(recurrenceType === 'custom' || recurrenceType === 'weekly') && (
                <div className="space-y-1.5">
                  {recurrenceType === 'custom' && legacyCustomWithoutWeekdays && recurrenceWeekdays.length === 0 && (
                    <p className="text-xs text-muted-foreground rounded-md bg-muted/50 p-2.5">
                      {t.legacyCustomWeekdaysHint}
                    </p>
                  )}
                  <Label className="text-xs">{t.labelRepeatOn}</Label>
                  <div className="flex gap-1">
                    {t.weekdayLabels.map((label, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleWeekday(idx)}
                        className={cn(
                          'h-8 w-8 rounded-md text-xs font-medium transition-colors border',
                          recurrenceWeekdays.includes(idx)
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted text-muted-foreground border-border hover:bg-accent'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </form>
    </ResponsiveModal>
  );
}
