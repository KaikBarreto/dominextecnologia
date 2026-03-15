import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, MapPin, User, Wrench, Phone, FileText, ArrowLeft, ClipboardList, Navigation, ExternalLink, Link2, Check, Trash2, UsersRound, Zap, Shield, Truck, Hammer, HardHat, Settings, HeartPulse, Flame, Droplets, Wind, Thermometer, Cable, Plug, Lightbulb, Gauge } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EventCard, getStatusBadgeClass } from './EventCard';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { ServiceOrder, OsType } from '@/types/database';
import { buildCustomerAddress } from '@/utils/geolocation';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';


const osTypeLabels: Record<OsType, string> = {
  manutencao_preventiva: 'Manutenção Preventiva',
  manutencao_corretiva: 'Manutenção Corretiva',
  instalacao: 'Instalação',
  visita_tecnica: 'Visita Técnica',
};

interface AssigneeInfo {
  id: string;
  name: string;
  avatar_url?: string | null;
}

interface ScheduleDetailPanelProps {
  selectedDate: Date;
  orders: (ServiceOrder & { customer: any; equipment: any })[];
  selectedOrder: (ServiceOrder & { customer: any; equipment: any }) | null;
  onOrderSelect: (order: ServiceOrder & { customer: any; equipment: any }) => void;
  onClearSelection: () => void;
  onEdit?: () => void;
  onDelete?: (id: string) => void;
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function OrderDetail({
  order,
  onBack,
  onEdit,
  onDelete,
}: {
  order: ServiceOrder & { customer: any; equipment: any };
  onBack: () => void;
  onEdit?: () => void;
  onDelete?: (id: string) => void;
}) {
  const navigate = useNavigate();
  const statusBadge = getStatusBadgeClass(order.status, order.scheduled_date);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const assignees: AssigneeInfo[] = (order as any)._assignees ?? [];

  const handleCopyTrackingLink = async () => {
    const link = `${window.location.origin}/os-tecnico/${order.id}`;
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

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
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span className="break-words">
                  {order.customer.address}
                  {order.customer.address_number && `, ${order.customer.address_number}`}
                  {order.customer.neighborhood && ` - ${order.customer.neighborhood}`}
                  {order.customer.city && `, ${order.customer.city}`}
                  {order.customer.state && `/${order.customer.state}`}
                </span>
              </div>
            )}
            {order.customer?.address && (
              <div className="flex items-center gap-2 mt-1.5 pl-5">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(buildCustomerAddress(order.customer))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                >
                  <img src="/icons/google-maps.png" alt="Maps" className="h-3.5 w-3.5" />
                  Abrir com Maps
                </a>
                <a
                  href={`https://waze.com/ul?q=${encodeURIComponent(buildCustomerAddress(order.customer))}&navigate=yes`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                >
                  <img src="/icons/waze.png" alt="Waze" className="h-3.5 w-3.5" />
                  Abrir com Waze
                </a>
              </div>
            )}
          </div>

          {/* Assignees (technicians / team) */}
          {assignees.length > 0 && (
            <div className="space-y-1.5 p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2 text-sm font-medium">
                <UsersRound className="h-4 w-4 text-primary" />
                Responsáveis
              </div>
              <div className="flex flex-wrap gap-2 pl-6">
                {assignees.map((a) => (
                  <div key={a.id} className="flex items-center gap-1.5">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={a.avatar_url || undefined} />
                      <AvatarFallback className="text-[9px]">{getInitials(a.name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">{a.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
            {order.status === 'concluida' ? 'Relatório de Serviço' : 'Preencher OS'}
          </Button>
          {onDelete && (
            <Button
              variant="outline"
              className="w-full mt-2 border-destructive/30 text-destructive hover:bg-destructive hover:text-white"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir OS
            </Button>
          )}
          {order.customer_id && (
            <button
              onClick={handleCopyTrackingLink}
              className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5"
            >
              {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
              {linkCopied ? 'Link copiado!' : 'Copiar link de acompanhamento do cliente'}
            </button>
          )}
          <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir OS #{order.order_number}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita. A ordem de serviço será excluída permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    onDelete?.(order.id);
                    setShowDeleteConfirm(false);
                  }}
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
  onDelete,
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
        <OrderDetail order={selectedOrder} onBack={onClearSelection} onEdit={onEdit} onDelete={onDelete} />
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
