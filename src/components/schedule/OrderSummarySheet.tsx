import { Clock, MapPin, User, Wrench, Phone, Hash, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { getStatusBadgeClass } from './EventCard';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ServiceOrder, OsType } from '@/types/database';

interface OrderSummarySheetProps {
  order: (ServiceOrder & { customer: any; equipment: any }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
}

const osTypeLabels: Record<OsType, string> = {
  manutencao_preventiva: 'Manutenção Preventiva',
  manutencao_corretiva: 'Manutenção Corretiva',
  instalacao: 'Instalação',
  visita_tecnica: 'Visita Técnica',
};

function OrderContent({ order, onEdit }: { order: ServiceOrder & { customer: any; equipment: any }; onEdit?: () => void }) {
  const statusBadge = getStatusBadgeClass(order.status, order.scheduled_date);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-1">
        {/* Status & Type */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={cn('text-xs', statusBadge.className)}>{statusBadge.label}</Badge>
          <Badge variant="outline" className="text-xs">{osTypeLabels[order.os_type]}</Badge>
          <Badge variant="secondary" className="text-xs">OS #{order.order_number}</Badge>
        </div>

        {/* Schedule */}
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span>
            {order.scheduled_date
              ? format(new Date(order.scheduled_date + 'T12:00:00'), "dd 'de' MMMM", { locale: ptBR })
              : 'Sem data'}{' '}
            às {order.scheduled_time?.slice(0, 5) || '--:--'}
          </span>
        </div>

        {/* Customer */}
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

        {/* Equipment */}
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

        {/* Description */}
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
          <Button onClick={onEdit} className="w-full mt-4">
            Editar OS
          </Button>
        )}
      </div>
    </ScrollArea>
  );
}

export function OrderSummarySheet({ order, open, onOpenChange, onEdit }: OrderSummarySheetProps) {
  const isMobile = useIsMobile();

  if (!order) return null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>Resumo da OS</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">
            <OrderContent order={order} onEdit={onEdit} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[440px]">
        <SheetHeader>
          <SheetTitle>Resumo da OS</SheetTitle>
        </SheetHeader>
        <div className="mt-4 h-[calc(100%-3rem)]">
          <OrderContent order={order} onEdit={onEdit} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
