import { useState, useEffect } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
}

const RECURRENCE_OPTIONS = [
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'custom', label: 'Personalizado' },
];

const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function TaskFormDialog({ open, onOpenChange, onSubmit, isLoading, defaultDate, defaultTime }: TaskFormDialogProps) {
  const { data: profiles = [] } = useProfiles();
  const { taskTypes } = useTaskTypes();
  const { teamsWithMembers } = useTeams();

  const [title, setTitle] = useState('');
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
      setTitle('');
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
  }, [open, defaultDate, defaultTime]);

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

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Nova Tarefa">
      <form onSubmit={handleSubmit} className="space-y-4 p-1">
        <div className="space-y-2">
          <Label>Título da Tarefa *</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Comprar materiais, Reunião com cliente..."
            required
          />
        </div>

        <div className="space-y-2">
          <Label>Tipo de Tarefa</Label>
          <Select value={taskTypeId || '_none'} onValueChange={(v) => setTaskTypeId(v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Nenhum</SelectItem>
              {taskTypes.filter(t => t.is_active).map(tt => (
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
          label="Responsáveis"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Data</Label>
            <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Horário</Label>
            <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Duração (min)</Label>
            <Input type="number" min={15} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Descrição</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalhes da tarefa..."
            rows={2}
          />
        </div>

        {/* Recurrence */}
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Switch checked={recurrenceEnabled} onCheckedChange={setRecurrenceEnabled} />
            <Label className="cursor-pointer">Recorrência</Label>
          </div>
          {recurrenceEnabled && (
            <div className="space-y-3 pt-1">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Frequência</Label>
                  <Select value={recurrenceType} onValueChange={setRecurrenceType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">A cada</Label>
                  <div className="flex items-center gap-1.5">
                    <Input type="number" min={1} max={12} value={recurrenceInterval} onChange={(e) => setRecurrenceInterval(Number(e.target.value))} />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {recurrenceType === 'daily' ? 'dia(s)' :
                       recurrenceType === 'monthly' ? 'mês(es)' :
                       'semana(s)'}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Até</Label>
                  <Input type="date" value={recurrenceEndDate} onChange={(e) => setRecurrenceEndDate(e.target.value)} />
                </div>
              </div>

              {/* Weekday picker for custom / weekly */}
              {(recurrenceType === 'custom' || recurrenceType === 'weekly') && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Repetir em:</Label>
                  <div className="flex gap-1">
                    {WEEKDAY_LABELS.map((label, idx) => (
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

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" disabled={isLoading || !title.trim()}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar Tarefa
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
