import { MapPin, User, UsersRound, Wrench, Zap, Shield, Truck, Hammer, HardHat, Settings, HeartPulse, Flame, Droplets, Wind, Thermometer, Cable, Plug, Lightbulb, Gauge, CheckSquare, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ServiceOrder, OsType, OsStatus } from '@/types/database';

const ICON_MAP: Record<string, any> = {
  UsersRound, Wrench, Zap, Shield, Truck, Hammer, HardHat, Settings,
  HeartPulse, Flame, Droplets, Wind, Thermometer, Cable, Plug, Lightbulb, Gauge,
};

interface AssigneeInfo {
  id: string;
  name: string;
  avatar_url?: string | null;
}

interface TeamBadgeInfo {
  id: string;
  name: string;
  color: string;
  photo_url?: string | null;
  icon_name?: string | null;
}

interface EventCardProps {
  order: ServiceOrder & { customer: any; equipment: any };
  compact?: boolean;
  fillHeight?: boolean;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  colorShift?: number;
  isMoving?: boolean;
  assignees?: AssigneeInfo[];
}

const osTypeLabels: Record<OsType, string> = {
  manutencao_preventiva: 'Preventiva',
  manutencao_corretiva: 'Corretiva',
  instalacao: 'Instalação',
  visita_tecnica: 'Visita Técnica',
};

const statusConfig: Record<OsStatus, { label: string; className: string }> = {
  agendada: { label: 'Agendada', className: 'bg-violet-500 text-white' },
  pendente: { label: 'Pendente', className: 'bg-info text-info-foreground' },
  a_caminho: { label: 'A Caminho', className: 'bg-indigo-500 text-white' },
  em_andamento: { label: 'Em Andamento', className: 'bg-primary text-primary-foreground' },
  pausada: { label: 'Pausada', className: 'bg-amber-600 text-white' },
  concluida: { label: 'Concluída', className: 'bg-success text-success-foreground' },
  cancelada: { label: 'Cancelada', className: 'bg-destructive text-destructive-foreground' },
};

export function getStatusBadgeClass(status: OsStatus, scheduledDate?: string | null) {
  if (status === 'pendente' && scheduledDate) {
    const today = new Date().toISOString().split('T')[0];
    if (scheduledDate < today) {
      return { label: 'Atrasada', className: 'bg-destructive text-destructive-foreground' };
    }
  }
  return statusConfig[status];
}

function getShiftedColor(hex: string, shift: number): string {
  if (!shift) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const factor = 1 + shift * 0.15;
  const clamp = (v: number) => Math.min(255, Math.round(v * factor + (255 - v * factor) * 0.1 * shift));
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function TeamAvatar({ team, light }: { team: TeamBadgeInfo; light?: boolean }) {
  const IconComp = ICON_MAP[team.icon_name || ''] || UsersRound;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {team.photo_url ? (
          <Avatar className={cn('h-5 w-5 border', light ? 'border-white/50' : 'border-background')}>
            <AvatarImage src={team.photo_url} />
            <AvatarFallback style={{ backgroundColor: team.color }} className="text-[8px] text-white">
              <IconComp className="h-3 w-3" />
            </AvatarFallback>
          </Avatar>
        ) : (
          <div
            className={cn('h-5 w-5 rounded-full flex items-center justify-center border shrink-0', light ? 'border-white/50' : 'border-background')}
            style={{ backgroundColor: team.color }}
          >
            <IconComp className="h-3 w-3 text-white" />
          </div>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">{team.name}</TooltipContent>
    </Tooltip>
  );
}

function AssigneeAvatars({ assignees, team, light }: { assignees: AssigneeInfo[]; team?: TeamBadgeInfo; light?: boolean }) {
  if ((!assignees || assignees.length === 0) && !team) return null;
  return (
    <div className="flex items-center -space-x-1.5">
      {team && <TeamAvatar team={team} light={light} />}
      {assignees.slice(0, 3).map((a) => (
        <Tooltip key={a.id}>
          <TooltipTrigger asChild>
            <Avatar className={cn('h-5 w-5 border', light ? 'border-white/50' : 'border-background')}>
              <AvatarImage src={a.avatar_url || undefined} />
              <AvatarFallback className="text-[8px] bg-muted">{getInitials(a.name)}</AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">{a.name}</TooltipContent>
        </Tooltip>
      ))}
      {assignees.length > 3 && (
        <span className={cn('text-[9px] ml-1', light ? 'text-white/70' : 'text-muted-foreground')}>
          +{assignees.length - 3}
        </span>
      )}
    </div>
  );
}

export function EventCard({ order, compact = false, fillHeight = false, onClick, draggable, onDragStart, colorShift = 0, isMoving = false, assignees: assigneesProp }: EventCardProps) {
  const assignees = assigneesProp ?? (order as any)._assignees;
  const team: TeamBadgeInfo | undefined = (order as any)._team;
  const statusBadge = getStatusBadgeClass(order.status, order.scheduled_date);
  const serviceTypeColor = (order as any).service_type?.color;
  const isTask = (order as any).entry_type === 'tarefa';
  const taskTitle = (order as any).task_title;
  const isDone = order.status === 'concluida';

  if (compact) {
    return (
      <div
        onClick={onClick}
        draggable={draggable}
        onDragStart={onDragStart}
        className={cn(
          'group flex items-start gap-1 px-1.5 py-0.5 rounded text-xs cursor-pointer transition-all hover:scale-[1.02] overflow-hidden',
          fillHeight && 'h-full',
          isDone && 'opacity-60',
          isTask && !serviceTypeColor && 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-300/50 dark:border-violet-600/50',
          !isTask && !serviceTypeColor && statusBadge.className,
          isMoving && 'ring-2 ring-primary ring-offset-1 animate-glow-pulse'
        )}
        style={serviceTypeColor ? { backgroundColor: colorShift ? getShiftedColor(serviceTypeColor, colorShift) : serviceTypeColor, color: 'white' } : undefined}
      >
        {isDone && <CheckCircle2 className="h-3 w-3 shrink-0 mt-px" />}
        {isTask && !isDone && <CheckSquare className="h-3 w-3 shrink-0 mt-px" />}
        <span className={cn('font-medium shrink-0', isDone && 'line-through')}>
          {order.scheduled_time?.slice(0, 5) || '--:--'}
        </span>
        <span className={cn('truncate flex-1', isDone && 'line-through')}>
          {isTask ? (taskTitle || 'Tarefa') : (order.customer?.name || 'Cliente')}
        </span>
      </div>
    );
  }

  const bgColor = serviceTypeColor
    ? (colorShift ? getShiftedColor(serviceTypeColor, colorShift) : serviceTypeColor)
    : undefined;

  const taskBorderClass = isTask && !bgColor ? 'border-l-4 border-l-violet-500' : '';

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      className={cn(
        'p-3 rounded-lg cursor-pointer transition-all hover:shadow-md space-y-1.5 overflow-hidden',
        fillHeight && 'h-full',
        !bgColor && 'border bg-card hover:border-primary/30',
        isDone && 'opacity-60',
        taskBorderClass,
        isMoving && 'ring-2 ring-primary ring-offset-1 animate-glow-pulse'
      )}
      style={bgColor ? { backgroundColor: bgColor, color: 'white' } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {isDone && <CheckCircle2 className={cn('h-4 w-4', bgColor ? 'text-white' : 'text-emerald-500')} />}
          {isTask && !isDone && <CheckSquare className={cn('h-3.5 w-3.5', bgColor ? 'text-white/80' : 'text-violet-500')} />}
          <span className={cn('font-semibold text-sm', isDone && 'line-through')}>
            {order.scheduled_time?.slice(0, 5) || '--:--'}
          </span>
        </div>
        <Badge className={cn('text-[10px] px-1.5 h-5 shadow-sm shadow-black/20', statusBadge.className)}>
          {statusBadge.label}
        </Badge>
      </div>
      {isTask ? (
        <p className={cn('text-xs font-medium', bgColor ? 'text-white/90' : 'text-violet-600 dark:text-violet-400')}>
          {taskTitle || 'Tarefa'}
        </p>
      ) : (
        <p className={cn('text-xs font-medium', bgColor ? 'text-white/90' : 'text-primary')}>{osTypeLabels[order.os_type]}</p>
      )}
      {!isTask && (
        <div className={cn('flex items-center gap-1.5 text-xs', bgColor ? 'text-white/80' : 'text-muted-foreground')}>
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{order.customer?.name || 'Cliente'}</span>
        </div>
      )}
      {!isTask && order.customer?.city && (
        <div className={cn('flex items-center gap-1.5 text-xs', bgColor ? 'text-white/80' : 'text-muted-foreground')}>
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{order.customer.city}</span>
        </div>
      )}
      {isTask && order.description && (
        <div className={cn('text-xs truncate', bgColor ? 'text-white/70' : 'text-muted-foreground')}>
          {order.description}
        </div>
      )}
      {(assignees?.length > 0 || team) && (
        <div className="flex justify-end pt-0.5">
          <AssigneeAvatars assignees={assignees || []} team={team} light={!!bgColor} />
        </div>
      )}
    </div>
  );
}
