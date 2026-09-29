import { format } from 'date-fns';
import { Calendar, CirclePause, Clock3, PlayCircle, TrendingUp, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatedTaskAgenda } from '@/components/tasks/DatedTaskAgenda';
import { cn } from '@/lib/utils';

export type CrmTaskStatus = 'pendente' | 'em_andamento' | 'pausada' | 'concluida';

export interface CrmOpportunityTask {
  id: string;
  task_title: string | null;
  description?: string | null;
  status: string;
  scheduled_date?: string | null;
  lead_id: string | null;
  customer?: { name?: string | null } | null;
  _assignee_user_ids?: string[];
}

interface ProfileSummary {
  user_id: string;
  full_name?: string | null;
  avatar_url?: string | null;
}

interface CrmTaskViewProps {
  tasks: CrmOpportunityTask[];
  leadTitleMap: Map<string, string>;
  profileMap: Map<string, ProfileSummary>;
  onOpen: (task: CrmOpportunityTask) => void;
  onStatusChange: (task: CrmOpportunityTask, status: CrmTaskStatus) => void;
}

type CrmTaskItemProps = Omit<CrmTaskViewProps, 'tasks'> & { task: CrmOpportunityTask };

const COLUMNS: Array<{ id: CrmTaskStatus; title: string; color: string; accepts: string[] }> = [
  { id: 'pendente', title: 'A FAZER', color: 'bg-blue-500', accepts: ['pendente', 'agendada'] },
  { id: 'em_andamento', title: 'EM ANDAMENTO', color: 'bg-amber-500', accepts: ['em_andamento', 'a_caminho'] },
  { id: 'pausada', title: 'PAUSADO', color: 'bg-orange-500', accepts: ['pausada', 'cancelada'] },
  { id: 'concluida', title: 'CONCLUÍDO', color: 'bg-emerald-500', accepts: ['concluida'] },
];

function normalizedStatus(status: string): CrmTaskStatus {
  return COLUMNS.find(column => column.accepts.includes(status))?.id ?? 'pendente';
}

function statusLabel(status: string) {
  switch (normalizedStatus(status)) {
    case 'em_andamento': return 'Em andamento';
    case 'pausada': return 'Pausado';
    case 'concluida': return 'Concluído';
    default: return 'A fazer';
  }
}

function statusClass(status: string) {
  switch (normalizedStatus(status)) {
    case 'em_andamento': return 'bg-amber-600 text-white';
    case 'pausada': return 'bg-orange-600 text-white';
    case 'concluida': return 'bg-emerald-600 text-white';
    default: return 'bg-blue-600 text-white';
  }
}

function isOverdue(task: CrmOpportunityTask) {
  return normalizedStatus(task.status) !== 'concluida' && !!task.scheduled_date && task.scheduled_date.slice(0, 10) < format(new Date(), 'yyyy-MM-dd');
}

export function CrmTaskKanbanBoard({ tasks, leadTitleMap, profileMap, onOpen, onStatusChange }: CrmTaskViewProps) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-2">
      <div className="grid min-w-[860px] grid-cols-4 gap-3 lg:min-w-0 lg:gap-4">
        {COLUMNS.map(column => {
          const columnTasks = tasks.filter(task => normalizedStatus(task.status) === column.id);
          return (
            <section
              key={column.id}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                const id = event.dataTransfer.getData('text/plain');
                const task = tasks.find(item => item.id === id);
                if (task && normalizedStatus(task.status) !== column.id) onStatusChange(task, column.id);
              }}
              className="flex min-h-[300px] flex-col rounded-xl border bg-muted/20"
            >
              <header className="flex items-center justify-between border-b px-3 py-2.5">
                <span className="flex items-center gap-2 text-xs font-semibold"><span className={cn('h-2.5 w-2.5 rounded-full', column.color)} />{column.title}</span>
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">{columnTasks.length}</Badge>
              </header>
              <div className="flex-1 space-y-2 p-2">
                {columnTasks.map(task => (
                  <CrmKanbanCard key={task.id} task={task} leadTitleMap={leadTitleMap} profileMap={profileMap} onOpen={onOpen} onStatusChange={onStatusChange} />
                ))}
                {columnTasks.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">Nenhuma tarefa</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CrmKanbanCard({ task, leadTitleMap, profileMap, onOpen, onStatusChange }: CrmTaskItemProps) {
  const assignee = task._assignee_user_ids?.[0] ? profileMap.get(task._assignee_user_ids[0]) : null;
  const overdue = isOverdue(task);
  return (
    <article draggable onDragStart={event => event.dataTransfer.setData('text/plain', task.id)} className={cn('rounded-lg border bg-card p-3 shadow-sm', normalizedStatus(task.status) === 'concluida' && 'opacity-65')}>
      <button type="button" onClick={() => onOpen(task)} className="w-full space-y-2 text-left">
        <p className={cn('line-clamp-2 text-sm font-medium', normalizedStatus(task.status) === 'concluida' && 'line-through')}>{task.task_title || 'Tarefa sem título'}</p>
        <p className="flex items-center gap-1 truncate text-xs font-medium text-primary"><TrendingUp className="h-3 w-3 shrink-0" />{leadTitleMap.get(task.lead_id || '') || 'Oportunidade'}</p>
        {task.scheduled_date && <p className={cn('flex items-center gap-1 text-xs', overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}><Calendar className="h-3 w-3" />{format(new Date(`${task.scheduled_date}T12:00:00`), 'dd/MM/yyyy')}{overdue && ' · Atrasada'}</p>}
        {assignee && <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><User className="h-3 w-3" />{assignee.full_name}</p>}
      </button>
      <Select value={normalizedStatus(task.status)} onValueChange={value => onStatusChange(task, value as CrmTaskStatus)}>
        <SelectTrigger aria-label="Alterar status da tarefa" className="mt-2 h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {COLUMNS.map(column => <SelectItem key={column.id} value={column.id}>{column.title.charAt(0) + column.title.slice(1).toLowerCase()}</SelectItem>)}
        </SelectContent>
      </Select>
    </article>
  );
}

export function CrmTaskAgendaView({ tasks, leadTitleMap, profileMap, onOpen, onStatusChange }: CrmTaskViewProps) {
  return (
    <DatedTaskAgenda
      items={tasks}
      getId={task => task.id}
      getDate={task => task.scheduled_date}
      storageKey="crm-tasks-agenda-mode"
      renderItem={(task, { compact }) => compact ? (
        <button type="button" onClick={() => onOpen(task)} className={cn('flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white hover:opacity-90', statusClass(task.status), normalizedStatus(task.status) === 'concluida' && 'opacity-60 line-through', isOverdue(task) && 'ring-1 ring-destructive')}>
          <span className="truncate">{task.task_title || 'Tarefa sem título'}</span>
        </button>
      ) : (
        <CrmAgendaCard task={task} leadTitleMap={leadTitleMap} profileMap={profileMap} onOpen={onOpen} onStatusChange={onStatusChange} tasks={tasks} />
      )}
    />
  );
}

function CrmAgendaCard({ task, leadTitleMap, profileMap, onOpen, onStatusChange }: CrmTaskItemProps) {
  const assignee = task._assignee_user_ids?.[0] ? profileMap.get(task._assignee_user_ids[0]) : null;
  const done = normalizedStatus(task.status) === 'concluida';
  return (
    <div className={cn('flex items-center gap-3 bg-card px-3 py-2.5', done && 'opacity-65', isOverdue(task) && 'border-l-2 border-destructive')}>
      {assignee ? <Avatar className="h-9 w-9"><AvatarImage src={assignee.avatar_url || undefined} /><AvatarFallback className="bg-primary/10 text-xs text-primary">{assignee.full_name?.charAt(0)?.toUpperCase() || '?'}</AvatarFallback></Avatar> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><User className="h-4 w-4" /></span>}
      <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
        <p className={cn('truncate text-sm font-medium', done && 'line-through')}>{task.task_title || 'Tarefa sem título'}</p>
        <p className="truncate text-xs font-medium text-primary">{leadTitleMap.get(task.lead_id || '') || 'Oportunidade'}</p>
        {task.customer?.name && <p className="truncate text-xs text-muted-foreground">{task.customer.name}</p>}
      </button>
      <Select value={normalizedStatus(task.status)} onValueChange={value => onStatusChange(task, value as CrmTaskStatus)}>
        <SelectTrigger aria-label="Alterar status da tarefa" className={cn('h-8 w-[132px] border-0 text-xs', statusClass(task.status))}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="pendente"><span className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />A fazer</span></SelectItem>
          <SelectItem value="em_andamento"><span className="flex items-center gap-2"><PlayCircle className="h-3.5 w-3.5" />Em andamento</span></SelectItem>
          <SelectItem value="pausada"><span className="flex items-center gap-2"><CirclePause className="h-3.5 w-3.5" />Pausado</span></SelectItem>
          <SelectItem value="concluida">Concluído</SelectItem>
        </SelectContent>
      </Select>
      <span className="sr-only">{statusLabel(task.status)}</span>
    </div>
  );
}
