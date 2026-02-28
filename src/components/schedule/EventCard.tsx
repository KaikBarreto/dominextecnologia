import { MapPin, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ServiceOrder, OsType, OsStatus } from '@/types/database';

interface EventCardProps {
  order: ServiceOrder & { customer: any; equipment: any };
  compact?: boolean;
  fillHeight?: boolean;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}

const osTypeLabels: Record<OsType, string> = {
  manutencao_preventiva: 'Preventiva',
  manutencao_corretiva: 'Corretiva',
  instalacao: 'Instalação',
  visita_tecnica: 'Visita Técnica',
};

const statusConfig: Record<OsStatus, { label: string; className: string }> = {
  pendente: { label: 'Pendente', className: 'bg-info text-info-foreground' },
  em_andamento: { label: 'Em Andamento', className: 'bg-primary text-primary-foreground' },
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

export function EventCard({ order, compact = false, fillHeight = false, onClick, draggable, onDragStart }: EventCardProps) {
  const statusBadge = getStatusBadgeClass(order.status, order.scheduled_date);

  const serviceTypeColor = (order as any).service_type?.color;

  if (compact) {
    return (
      <div
        onClick={onClick}
        draggable={draggable}
        onDragStart={onDragStart}
        className={cn(
          'group flex items-start gap-1 px-1.5 py-0.5 rounded text-xs cursor-pointer transition-all hover:scale-[1.02] overflow-hidden',
          fillHeight && 'h-full',
          !serviceTypeColor && statusBadge.className
        )}
        style={serviceTypeColor ? { backgroundColor: serviceTypeColor, color: 'white' } : undefined}
      >
        <span className="font-medium shrink-0">
          {order.scheduled_time?.slice(0, 5) || '--:--'}
        </span>
        <span className="truncate">
          {order.customer?.name || 'Cliente'}
        </span>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      className={cn(
        'p-3 rounded-lg border bg-card cursor-pointer transition-all hover:shadow-md hover:border-primary/30 space-y-1.5 overflow-hidden',
        fillHeight && 'h-full'
      )}
      style={serviceTypeColor ? { borderLeftWidth: 4, borderLeftColor: serviceTypeColor } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm">
          {order.scheduled_time?.slice(0, 5) || '--:--'}
        </span>
        <Badge className={cn('text-[10px] px-1.5 h-5', statusBadge.className)}>
          {statusBadge.label}
        </Badge>
      </div>
      <p className="text-xs font-medium text-primary">{osTypeLabels[order.os_type]}</p>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <User className="h-3 w-3 shrink-0" />
        <span className="truncate">{order.customer?.name || 'Cliente'}</span>
      </div>
      {order.customer?.city && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{order.customer.city}</span>
        </div>
      )}
    </div>
  );
}
