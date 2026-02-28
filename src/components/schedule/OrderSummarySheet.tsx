import { useState, useEffect } from 'react';
import { Clock, MapPin, User, Wrench, Phone, Mail, FileText, ExternalLink, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { getStatusBadgeClass } from './EventCard';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
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

function buildGoogleMapsUrl(customer: any): string | null {
  const parts: string[] = [];
  if (customer?.address) parts.push(customer.address);
  if (customer?.city) parts.push(customer.city);
  if (customer?.state) parts.push(customer.state);
  if (customer?.zip_code) parts.push(customer.zip_code);
  if (parts.length === 0) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
}

function OrderContent({ order, onEdit }: { order: ServiceOrder & { customer: any; equipment: any }; onEdit?: () => void }) {
  const statusBadge = getStatusBadgeClass(order.status, order.scheduled_date);
  const [allEquipment, setAllEquipment] = useState<any[]>([]);

  useEffect(() => {
    const fetchEquipment = async () => {
      // Fetch from service_order_equipment junction table
      const { data } = await supabase
        .from('service_order_equipment')
        .select('equipment_id, equipment:equipment(*)')
        .eq('service_order_id', order.id);
      
      if (data && data.length > 0) {
        setAllEquipment(data.map((d: any) => d.equipment));
      } else if (order.equipment) {
        // Fallback to single equipment from FK
        setAllEquipment([order.equipment]);
      } else {
        setAllEquipment([]);
      }
    };
    fetchEquipment();
  }, [order.id, order.equipment]);

  const mapsUrl = buildGoogleMapsUrl(order.customer);
  const fullAddress = [
    order.customer?.address,
    order.customer?.complement,
    order.customer?.city,
    order.customer?.state,
  ].filter(Boolean).join(', ');

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-1 overflow-hidden">
        {/* Status & Type */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={cn('text-xs', statusBadge.className)}>{statusBadge.label}</Badge>
          <Badge variant="outline" className="text-xs">{osTypeLabels[order.os_type]}</Badge>
          <Badge variant="secondary" className="text-xs">OS #{order.order_number}</Badge>
        </div>

        {/* Schedule */}
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <span>
            {order.scheduled_date
              ? format(new Date(order.scheduled_date + 'T12:00:00'), "dd 'de' MMMM", { locale: ptBR })
              : 'Sem data'}{' '}
            às {order.scheduled_time?.slice(0, 5) || '--:--'}
          </span>
        </div>

        {/* Customer Details */}
        <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <User className="h-4 w-4 text-primary shrink-0" />
            <span className="break-words min-w-0">{order.customer?.name || 'Cliente não informado'}</span>
          </div>

          {order.customer?.document && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pl-6">
              <Building2 className="h-3 w-3 shrink-0" />
              <span>{order.customer.document}</span>
            </div>
          )}

          {order.customer?.phone && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pl-6">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <a href={`tel:${order.customer.phone}`} className="hover:underline">{order.customer.phone}</a>
            </div>
          )}

          {order.customer?.email && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pl-6">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <a href={`mailto:${order.customer.email}`} className="hover:underline break-all min-w-0">{order.customer.email}</a>
            </div>
          )}

          {fullAddress && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground pl-6">
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <span className="break-words">{fullAddress}</span>
                {order.customer?.zip_code && (
                  <span className="block text-xs">CEP: {order.customer.zip_code}</span>
                )}
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Abrir no Google Maps
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Equipment List */}
        {allEquipment.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
              Equipamento{allEquipment.length > 1 ? 's' : ''} ({allEquipment.length})
            </div>
            <div className="space-y-2 pl-6">
              {allEquipment.map((eq: any) => (
                <div key={eq.id} className="p-2 rounded-md bg-muted/30 border text-sm space-y-0.5">
                  <p className="font-medium break-words min-w-0">{eq.name}</p>
                  {(eq.brand || eq.model) && (
                    <p className="text-xs text-muted-foreground">
                      {[eq.brand, eq.model].filter(Boolean).join(' ')}
                    </p>
                  )}
                  {eq.serial_number && (
                    <p className="text-xs text-muted-foreground">S/N: {eq.serial_number}</p>
                  )}
                  {eq.location && (
                    <p className="text-xs text-muted-foreground">Local: {eq.location}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {order.description && (
          <>
            <Separator />
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Descrição
              </div>
              <p className="text-sm text-muted-foreground pl-6 break-words">{order.description}</p>
            </div>
          </>
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
