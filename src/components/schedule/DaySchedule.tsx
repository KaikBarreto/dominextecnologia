import { Clock, MapPin, User, Wrench, Phone, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ServiceOrder, OsType, OsStatus } from '@/types/database';

interface DayScheduleProps {
  date: Date;
  orders: (ServiceOrder & { customer: any; equipment: any })[];
  onOrderSelect?: (order: ServiceOrder & { customer: any; equipment: any }) => void;
}

const osTypeColors: Record<OsType, string> = {
  manutencao_preventiva: 'border-l-success',
  manutencao_corretiva: 'border-l-destructive',
  instalacao: 'border-l-info',
  visita_tecnica: 'border-l-warning',
};

const osTypeLabels: Record<OsType, string> = {
  manutencao_preventiva: 'Preventiva',
  manutencao_corretiva: 'Corretiva',
  instalacao: 'Instalação',
  visita_tecnica: 'Visita Técnica',
};

const statusLabels: Record<OsStatus, string> = {
  agendada: 'Agendada',
  pendente: 'Pendente',
  a_caminho: 'A Caminho',
  em_andamento: 'Em Andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

const statusVariants: Record<OsStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  agendada: 'secondary',
  pendente: 'secondary',
  a_caminho: 'default',
  em_andamento: 'default',
  concluida: 'outline',
  cancelada: 'destructive',
};

export function DaySchedule({ date, orders, onOrderSelect }: DayScheduleProps) {
  const sortedOrders = [...orders].sort((a, b) => {
    const timeA = a.scheduled_time || '00:00';
    const timeB = b.scheduled_time || '00:00';
    return timeA.localeCompare(timeB);
  });

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5 text-primary" />
          {format(date, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {sortedOrders.length} {sortedOrders.length === 1 ? 'agendamento' : 'agendamentos'}
        </p>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-6 pb-6">
          {sortedOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="text-lg font-medium">Nenhum agendamento</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Não há ordens de serviço agendadas para este dia
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedOrders.map((order) => (
                <div
                  key={order.id}
                  onClick={() => onOrderSelect?.(order)}
                  className={cn(
                    'p-4 rounded-lg border-l-4 bg-muted/50 cursor-pointer transition-all hover:bg-muted hover:shadow-sm',
                    osTypeColors[order.os_type]
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      {order.status === 'concluida' && (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                      )}
                      <span className={cn('font-semibold text-lg', order.status === 'concluida' && 'line-through')}>
                        {order.scheduled_time?.slice(0, 5) || '--:--'}
                      </span>
                      <Badge variant={statusVariants[order.status]} className="text-xs">
                        {statusLabels[order.status]}
                      </Badge>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      OS #{order.order_number}
                    </Badge>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-primary">
                      {osTypeLabels[order.os_type]}
                    </p>

                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{order.customer?.name || 'Cliente não informado'}</span>
                    </div>

                    {order.customer?.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />
                        <span>{order.customer.phone}</span>
                      </div>
                    )}

                    {order.customer?.address && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="truncate">
                          {order.customer.address}
                          {order.customer.city && `, ${order.customer.city}`}
                        </span>
                      </div>
                    )}

                    {order.equipment && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Wrench className="h-3.5 w-3.5" />
                        <span>
                          {order.equipment.name}
                          {order.equipment.brand && ` - ${order.equipment.brand}`}
                          {order.equipment.model && ` ${order.equipment.model}`}
                        </span>
                      </div>
                    )}

                    {order.description && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {order.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
