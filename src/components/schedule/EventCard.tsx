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
  colorShift?: number;
  isMoving?: boolean;
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

function getShiftedColor(hex: string, shift: number): string {
  if (!shift) return hex;
  // Parse hex color and adjust lightness
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const factor = 1 + shift * 0.15; // lighten by 15% per step
  const clamp = (v: number) => Math.min(255, Math.round(v * factor + (255 - v * factor) * 0.1 * shift));
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
}

export function EventCard({ order, compact = false, fillHeight = false, onClick, draggable, onDragStart, colorShift = 0, isMoving = false }: EventCardProps) {
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
        style={serviceTypeColor ? { backgroundColor: colorShift ? getShiftedColor(serviceTypeColor, colorShift) : serviceTypeColor, color: 'white' } : undefined}
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

  const bgColor = serviceTypeColor
    ? (colorShift ? getShiftedColor(serviceTypeColor, colorShift) : serviceTypeColor)
    : undefined;

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      className={cn(
        'p-3 rounded-lg cursor-pointer transition-all hover:shadow-md space-y-1.5 overflow-hidden',
        fillHeight && 'h-full',
        !bgColor && 'border bg-card hover:border-primary/30'
      )}
      style={bgColor ? { backgroundColor: bgColor, color: 'white' } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm">
          {order.scheduled_time?.slice(0, 5) || '--:--'}
        </span>
        <Badge className={cn('text-[10px] px-1.5 h-5 shadow-sm shadow-black/20', statusBadge.className)}>
          {statusBadge.label}
        </Badge>
      </div>
      <p className={cn('text-xs font-medium', bgColor ? 'text-white/90' : 'text-primary')}>{osTypeLabels[order.os_type]}</p>
      <div className={cn('flex items-center gap-1.5 text-xs', bgColor ? 'text-white/80' : 'text-muted-foreground')}>
        <User className="h-3 w-3 shrink-0" />
        <span className="truncate">{order.customer?.name || 'Cliente'}</span>
      </div>
      {order.customer?.city && (
        <div className={cn('flex items-center gap-1.5 text-xs', bgColor ? 'text-white/80' : 'text-muted-foreground')}>
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{order.customer.city}</span>
        </div>
      )}
    </div>
  );
}
