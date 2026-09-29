import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, Check, MessageCircle, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { HoverCardPortal } from '@radix-ui/react-hover-card';
import { DatedTaskAgenda } from '@/components/tasks/DatedTaskAgenda';
import { SalespersonAvatar } from '@/components/admin/salesperson/SalespersonAvatar';
import { buildWhatsAppLink } from '@/utils/shareLinks';
import { getFollowupMessage } from '@/utils/followupMessages';
import { cn } from '@/lib/utils';
import {
  TASK_PRIORITY_CONFIG,
  TASK_STATUS_CONFIG,
  TASK_TYPE_CONFIG,
  type AdminTask,
} from '@/hooks/useAdminTasks';
import type { TaskAdminOption } from './TaskCreateDialog';

interface TaskAgendaViewProps {
  tasks: AdminTask[];
  adminByUserId: Map<string, TaskAdminOption>;
  onTaskClick: (task: AdminTask) => void;
  onResolve: (taskId: string) => void;
}

function isTaskOverdue(task: AdminTask) {
  return !!task.due_date && task.status !== 'resolvido' && task.due_date.slice(0, 10) < format(new Date(), 'yyyy-MM-dd');
}

export function TaskAgendaView({ tasks, adminByUserId, onTaskClick, onResolve }: TaskAgendaViewProps) {
  return (
    <DatedTaskAgenda
      items={tasks}
      getId={task => task.id}
      getDate={task => task.due_date}
      storageKey="admin-tasks-agenda-mode"
      renderItem={(task, context) => {
        const content = context.compact
          ? <AdminTaskChip task={task} onClick={() => onTaskClick(task)} />
          : <AdminTaskCard task={task} adminByUserId={adminByUserId} onClick={() => onTaskClick(task)} />;
        return context.mobile ? content : (
          <AdminTaskHover task={task} adminByUserId={adminByUserId} onResolve={onResolve}>
            {content}
          </AdminTaskHover>
        );
      }}
    />
  );
}

function AdminTaskChip({ task, onClick }: { task: AdminTask; onClick: () => void }) {
  const resolved = task.status === 'resolvido';
  const overdue = isTaskOverdue(task);
  return (
    <button
      type="button"
      onClick={onClick}
      title={overdue ? `${task.title} — atrasada` : task.title}
      className={cn(
        'flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight hover:opacity-90',
        TASK_PRIORITY_CONFIG[task.priority].className,
        resolved && 'opacity-60 line-through',
        overdue && 'ring-1 ring-destructive',
      )}
    >
      {overdue && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />}
      <span className="min-w-0 truncate">{task.title}</span>
    </button>
  );
}

function AdminTaskCard({ task, adminByUserId, onClick }: { task: AdminTask; adminByUserId: Map<string, TaskAdminOption>; onClick: () => void }) {
  const responsible = task.assigned_to ? adminByUserId.get(task.assigned_to) ?? null : null;
  const leadName = task.crm_lead?.company_name || task.crm_lead?.contact_name || task.crm_lead?.title;
  const resolved = task.status === 'resolvido';
  const overdue = isTaskOverdue(task);
  return (
    <button type="button" onClick={onClick} className={cn('flex w-full items-start gap-3 bg-card px-3 py-2.5 text-left hover:bg-muted/40', resolved && 'opacity-60', overdue && 'border-l-2 border-destructive')}>
      {responsible ? <SalespersonAvatar name={responsible.full_name} photoUrl={responsible.photo_url} size="md" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><User className="h-4 w-4" /></span>}
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn('truncate text-sm font-medium', resolved && 'line-through')}>{task.title}</p>
        {leadName && <p className="truncate text-xs font-medium text-primary">{leadName}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', TASK_TYPE_CONFIG[task.type].className)}>{TASK_TYPE_CONFIG[task.type].label}</span>
          {overdue && <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">Atrasada</span>}
          <Badge className={cn('border-0 px-2 py-0.5 text-[10px]', TASK_STATUS_CONFIG[task.status].className)}>{TASK_STATUS_CONFIG[task.status].label}</Badge>
        </div>
      </div>
    </button>
  );
}

function AdminTaskHover({ task, adminByUserId, onResolve, children }: { task: AdminTask; adminByUserId: Map<string, TaskAdminOption>; onResolve: (id: string) => void; children: React.ReactNode }) {
  const responsible = task.assigned_to ? adminByUserId.get(task.assigned_to) ?? null : null;
  const resolved = task.status === 'resolvido';
  const overdue = isTaskOverdue(task);
  const leadName = task.crm_lead?.company_name || task.crm_lead?.contact_name || task.crm_lead?.title;
  const whatsappLink = buildWhatsAppLink(task.crm_lead?.phone, getFollowupMessage(task.type, task.followup_step));
  return (
    <HoverCard openDelay={200} closeDelay={150}>
      <HoverCardTrigger asChild><div>{children}</div></HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent side="right" align="start" className="w-80 space-y-2.5 p-3.5">
          <p className={cn('text-sm font-semibold leading-snug', resolved && 'line-through')}>{task.title}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', TASK_TYPE_CONFIG[task.type].className)}>{TASK_TYPE_CONFIG[task.type].label}</span>
            <span className={cn('rounded px-1.5 py-0.5 text-[10px]', TASK_PRIORITY_CONFIG[task.priority].className)}>{TASK_PRIORITY_CONFIG[task.priority].label}</span>
            <Badge className={cn('border-0 px-2 py-0.5 text-[10px]', TASK_STATUS_CONFIG[task.status].className)}>{TASK_STATUS_CONFIG[task.status].label}</Badge>
          </div>
          {leadName && <p className="truncate text-xs font-medium text-primary">{leadName}</p>}
          {responsible && <div className="flex items-center gap-2"><SalespersonAvatar name={responsible.full_name} photoUrl={responsible.photo_url} size="sm" /><span className="truncate text-xs text-muted-foreground">{responsible.full_name}</span></div>}
          {task.due_date && <p className={cn('flex items-center gap-1.5 text-xs', overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}><CalendarDays className="h-3.5 w-3.5" />{format(parseISO(task.due_date), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}{overdue && ' — atrasada'}</p>}
          {task.description && <p className="line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{task.description}</p>}
          {(whatsappLink || !resolved) && <div className="flex items-center gap-2 pt-1">
            {whatsappLink && <Button size="sm" className="h-8 flex-1 bg-[#25D366] text-white hover:bg-[#1da851]" onClick={() => window.open(whatsappLink, '_blank', 'noopener,noreferrer')}><MessageCircle className="mr-1 h-4 w-4" /> WhatsApp</Button>}
            {!resolved && <Button size="sm" className="h-8 flex-1 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => onResolve(task.id)}><Check className="mr-1 h-4 w-4" /> Concluir</Button>}
          </div>}
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
}
