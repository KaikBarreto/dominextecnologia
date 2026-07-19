import { useState, useEffect } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { AssigneeMultiSelect } from '@/components/schedule/AssigneeMultiSelect';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useProfiles } from '@/hooks/useProfiles';
import { useTaskTypes } from '@/hooks/useTaskTypes';
import { useTeams } from '@/hooks/useTeams';
import { useCustomers } from '@/hooks/useCustomers';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

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
}

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TaskFormData) => Promise<void>;
  isLoading?: boolean;
  defaultDate?: string;
  defaultTime?: string;
  defaultCustomerId?: string;
  task?: any | null;
}

export function TaskFormDialog({ open, onOpenChange, onSubmit, isLoading, defaultDate, defaultTime, defaultCustomerId, task }: TaskFormDialogProps) {
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
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([]);

  useEffect(() => {
    if (open) {
      if (task) {
        setTitle(task.task_title || '');
        setCustomerId(task.customer_id || '');
        setTaskTypeId(task.task_type_id || '');
        setSelectedUserIds(task._assignee_user_ids || (task.technician_id ? [task.technician_id] : []));
        setSelectedTeamIds(task.team_id ? [task.team_id] : []);
        setScheduledDate(task.scheduled_date || format(new Date(), 'yyyy-MM-dd'));
        setScheduledTime(task.scheduled_time || '08:00');
        setDuration(task.duration_minutes || 60);
        setDescription(task.description || '');
        // Pré-preenche recorrência a partir da série (se a tarefa pertencer a uma).
        const hasSeries = !!task.recurrence_group_id;
        setRecurrenceEnabled(hasSeries);
        setRecurrenceType(task.recurrence_type || 'weekly');
        setRecurrenceInterval(task.recurrence_interval || 1);
        setRecurrenceEndDate(task.recurrence_end_date || '');
        const baseDay = new Date((task.scheduled_date || format(new Date(), 'yyyy-MM-dd')) + 'T12:00:00').getDay();
        setRecurrenceWeekdays(hasSeries ? [baseDay] : []);
      } else {
        setTitle('');
        setCustomerId(defaultCustomerId || '');
        setTaskTypeId('');
        setSelectedUserIds([]);
        setSelectedTeamIds([]);
        setScheduledDate(defaultDate || format(new Date(), 'yyyy-MM-dd'));
        setScheduledTime(defaultTime || '08:00');
        setDuration(60);
        setDescription('');
        setRecurrenceEnabled(false);
        setRecurrenceType('weekly');
        setRecurrenceInterval(1);
        setRecurrenceEndDate('');
        const dayOfWeek = new Date(defaultDate || new Date()).getDay();
        setRecurrenceWeekdays([dayOfWeek]);
      }
    }
  }, [open, defaultDate, defaultTime, defaultCustomerId, task]);

  const toggleWeekday = (day: number) => {
    setRecurrenceWeekdays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

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
      recurrence_end_date: recurrenceEnabled && recurrenceEndDate ? recurrenceEndDate : undefined,
      recurrence_weekdays: recurrenceEnabled && recurrenceType === 'custom' ? recurrenceWeekdays : undefined,
    });
    onOpenChange(false);
  };

  const technicianOptions = profiles.map(p => ({
    user_id: p.user_id,
    full_name: p.full_name,
    avatar_url: p.avatar_url,
  }));

  const footer = (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t.btnCancel}</Button>
      <Button type="submit" form="task-form" disabled={isLoading || !title.trim()}>
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
          <SearchableSelect
            options={[{ value: '_none', label: t.optionNone }, ...customers.map(c => ({ value: c.id, label: c.name }))]}
            value={customerId || '_none'}
            onValueChange={(v) => setCustomerId(v === '_none' ? '' : v)}
            placeholder={t.placeholderSelectCustomer}
            emptyMessage={t.emptyCustomer}
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

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>{t.labelDate}</Label>
            <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
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

        {/* Recorrência — disponível ao criar e ao editar uma tarefa */}
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Switch checked={recurrenceEnabled} onCheckedChange={setRecurrenceEnabled} />
            <Label className="cursor-pointer">{t.labelRecurrence}</Label>
          </div>
          {isEditing && (
            <p className="text-xs text-muted-foreground">
              {isRecurringSeries ? t.recurrenceSeriesNote : t.recurrenceActivateNote}
            </p>
          )}
          {recurrenceEnabled && (
            <div className="space-y-3 pt-1">
              <div className="grid gap-3 sm:grid-cols-3">
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
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.labelUntil}</Label>
                  <Input type="date" value={recurrenceEndDate} onChange={(e) => setRecurrenceEndDate(e.target.value)} />
                </div>
              </div>

              {/* Weekday picker for custom / weekly */}
              {(recurrenceType === 'custom' || recurrenceType === 'weekly') && (
                <div className="space-y-1.5">
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
