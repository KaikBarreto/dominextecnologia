import {
  AdminTask,
  TASK_TYPE_CONFIG,
  TASK_PRIORITY_CONFIG,
} from '@/hooks/useAdminTasks';
import type { TaskAdminOption } from './TaskCreateDialog';
import { SalespersonAvatar } from '@/components/admin/salesperson/SalespersonAvatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Building2, Check, CalendarClock } from 'lucide-react';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TaskCardProps {
  task: AdminTask;
  isDragging?: boolean;
  onClick: () => void;
  /** Quick resolve — segue o handler de status='resolvido' (intercepta follow-up). */
  onQuickResolve?: (taskId: string) => void;
  /** Responsável resolvido via salespeople_basic (usuário do admin). */
  assignee?: TaskAdminOption | null;
}

export function TaskCard({ task, isDragging, onClick, onQuickResolve, assignee }: TaskCardProps) {
  const typeConfig = TASK_TYPE_CONFIG[task.type];
  const priorityConfig = TASK_PRIORITY_CONFIG[task.priority];
  const isFollowup = task.type === 'follow-up';

  // Atrasada: due_date no passado e ainda não resolvida.
  const overdue =
    !!task.due_date &&
    task.status !== 'resolvido' &&
    isBefore(parseISO(task.due_date), startOfDay(new Date()));

  const leadName = task.crm_lead?.company_name || task.crm_lead?.contact_name || task.crm_lead?.title;

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-lg border bg-card p-3 cursor-pointer transition-all hover:shadow-md hover:border-primary/30',
        task.priority === 'urgente' && 'border-destructive',
        task.priority === 'alta' && 'border-destructive/60',
        task.priority === 'baixa' && 'opacity-80',
        isDragging && 'opacity-40 scale-95',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-foreground line-clamp-2 flex-1">{task.title}</h4>
        {assignee && (
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <span className="shrink-0">
                  <SalespersonAvatar name={assignee.full_name} photoUrl={assignee.photo_url} size="sm" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{assignee.full_name || 'Sem responsável'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full border', typeConfig.className)}>
          {typeConfig.label}
        </span>
        <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', priorityConfig.className)}>
          {priorityConfig.label}
        </span>
        {isFollowup && task.followup_step != null && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
            Follow up {task.followup_step}/10
          </span>
        )}
      </div>

      {isFollowup && leadName && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
          <Building2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{leadName}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        {task.due_date ? (
          <span className={cn('inline-flex items-center gap-1', overdue && 'text-destructive font-medium')}>
            <CalendarClock className="h-3 w-3" />
            {format(parseISO(task.due_date), 'dd MMM', { locale: ptBR })}
            {overdue && ' · atrasada'}
          </span>
        ) : (
          <span className="text-muted-foreground/60">Sem prazo</span>
        )}
      </div>

      {onQuickResolve && task.status !== 'resolvido' && (
        <div className="mt-2 pt-2 border-t flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onQuickResolve(task.id);
            }}
            className="gap-1.5 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-colors"
            title="Marcar como resolvido"
          >
            <Check className="h-4 w-4" />
            <span className="hidden md:inline">Resolver</span>
          </Button>
        </div>
      )}
    </div>
  );
}
