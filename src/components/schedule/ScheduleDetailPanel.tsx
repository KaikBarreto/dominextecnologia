import { useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, MapPin, User, Wrench, Phone, FileText, ArrowLeft, ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EventCard, getStatusBadgeClass } from './EventCard';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import type { ServiceOrder, OsType } from '@/types/database';


const osTypeLabels: Record<OsType, string> = {
  manutencao_preventiva: 'Manutenção Preventiva',
  manutencao_corretiva: 'Manutenção Corretiva',
  instalacao: 'Instalação',
  visita_tecnica: 'Visita Técnica',
};

interface ScheduleDetailPanelProps {
  selectedDate: Date;
  orders: (ServiceOrder & { customer: any; equipment: any })[];
  selectedOrder: (ServiceOrder & { customer: any; equipment: any }) | null;
  onOrderSelect: (order: ServiceOrder & { customer: any; equipment: any }) => void;
  onClearSelection: () => void;
  onEdit?: () => void;
}

function OrderDetail({
  order,
  onBack,
  onEdit,
}: {
  order: ServiceOrder & { customer: any; equipment: any };
  onBack: () => void;
  onEdit?: () => void;
}) {
  const navigate = useNavigate();
  const statusBadge = getStatusBadgeClass(order.status, order.scheduled_date);

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold">Resumo da OS</h3>
      </div>
      <ScrollArea className="h-[calc(100%-3rem)]">
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={cn('text-xs', statusBadge.className)}>{statusBadge.label}</Badge>
            <Badge variant="outline" className="text-xs">{osTypeLabels[order.os_type]}</Badge>
            <Badge variant="secondary" className="text-xs">OS #{order.order_number}</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>
              {order.scheduled_date
                ? format(new Date(order.scheduled_date + 'T12:00:00'), "dd 'de' MMMM", { locale: ptBR })
                : 'Sem data'}{' '}
              às {order.scheduled_time?.slice(0, 5) || '--:--'}
            </span>
          </div>
          <div className="space-y-1.5 p-3 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-2 text-sm font-medium">
              <User className="h-4 w-4 text-primary" />
              {order.customer?.name || 'Cliente não informado'}
            </div>
            {order.customer?.phone && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                {order.customer.phone}
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
          </div>
          {order.equipment && (
            <div className="flex items-center gap-2 text-sm">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <span>
                {order.equipment.name}
                {order.equipment.brand && ` - ${order.equipment.brand}`}
                {order.equipment.model && ` ${order.equipment.model}`}
              </span>
            </div>
          )}
          {order.description && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Descrição
              </div>
              <p className="text-sm text-muted-foreground pl-6">{order.description}</p>
            </div>
          )}
          {onEdit && (
            <Button onClick={onEdit} variant="outline" className="w-full mt-4">
              Editar OS
            </Button>
          )}
          <Button 
            onClick={() => navigate(`/os-tecnico/${order.id}`)} 
            className="w-full mt-2"
          >
            <ClipboardList className="h-4 w-4 mr-2" />
            Preencher OS
          </Button>
        </div>
      </ScrollArea>
    </>
  );
}

export function ScheduleDetailPanel({
  selectedDate,
  orders,
  selectedOrder,
  onOrderSelect,
  onClearSelection,
  onEdit,
}: ScheduleDetailPanelProps) {
  const dateKey = format(selectedDate, 'yyyy-MM-dd');

  const dayOrders = useMemo(() => {
    return orders
      .filter((o) => o.scheduled_date === dateKey)
      .sort((a, b) => (a.scheduled_time || '00:00').localeCompare(b.scheduled_time || '00:00'));
  }, [orders, dateKey]);

  return (
    <div className="bg-card rounded-xl border shadow-sm p-4 h-full">
      {selectedOrder ? (
        <OrderDetail order={selectedOrder} onBack={onClearSelection} onEdit={onEdit} />
      ) : (
        <>
          <div className="mb-4">
            <h3 className="text-base font-semibold capitalize">
              {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
            </h3>
            <p className="text-xs text-muted-foreground capitalize">
              {format(selectedDate, 'EEEE', { locale: ptBR })}
            </p>
          </div>
          <ScrollArea className="h-[calc(100%-4rem)]">
            {dayOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Clock className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Nenhum agendamento</p>
              </div>
            ) : (
              <div className="space-y-2">
                {dayOrders.map((order) => (
                  <EventCard
                    key={order.id}
                    order={order}
                    onClick={() => onOrderSelect(order)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </>
      )}
    </div>
  );
}
