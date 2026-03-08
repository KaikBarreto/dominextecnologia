import { useState, useEffect } from 'react';
import { Clock, MapPin, User, Wrench, Phone, Mail, FileText, ExternalLink, Building2, Link2, Check } from 'lucide-react';
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
import { TechnicianDistanceBadge } from '@/components/service-orders/TechnicianDistanceBadge';

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
  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyTrackingLink = async () => {
    const link = `${window.location.origin}/os-tecnico/${order.id}`;
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  useEffect(() => {
    const fetchEquipment = async () => {
      const { data: links } = await supabase
        .from('service_order_equipment')
        .select('equipment_id')
        .eq('service_order_id', order.id);

      const linkIds = (links || []).map((l: any) => l.equipment_id).filter(Boolean);
      const fallbackIds = order.equipment?.id ? [order.equipment.id] : [];
      const uniqueIds = Array.from(new Set([...linkIds, ...fallbackIds]));

      if (uniqueIds.length === 0) {
        setAllEquipment([]);
        return;
      }

      const { data: equipmentRows } = await supabase
        .from('equipment')
        .select('*')
        .in('id', uniqueIds);

      const byId = new Map((equipmentRows || []).map((eq: any) => [eq.id, eq]));
      setAllEquipment(uniqueIds.map((id) => byId.get(id)).filter(Boolean));
    };

    fetchEquipment();
  }, [order.id, order.equipment?.id]);

  const mapsUrl = buildGoogleMapsUrl(order.customer);
  const fullAddress = [
    order.customer?.address,
    order.customer?.complement,
    order.customer?.city,
    order.customer?.state,
  ].filter(Boolean).join(', ');

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-1 pr-2 overflow-hidden max-w-full">
        {/* Status & Type */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={cn('text-xs shadow-sm shadow-black/15', statusBadge.className)}>{statusBadge.label}</Badge>
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

          {(order.customer?.company_name || order.customer?.customer_type) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pl-6">
              <Building2 className="h-3 w-3 shrink-0" />
              <span>
                {order.customer?.company_name || 'Pessoa Física'}
                {order.customer?.customer_type && ` • ${String(order.customer.customer_type).toUpperCase()}`}
              </span>
            </div>
          )}

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
                <div className="flex items-center gap-3 mt-1.5">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                  >
                    <img src="/icons/google-maps.png" alt="Maps" className="h-3.5 w-3.5" />
                    Abrir com Maps
                  </a>
                  <a
                    href={`https://waze.com/ul?q=${encodeURIComponent(fullAddress)}&navigate=yes`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                  >
                    <img src="/icons/waze.png" alt="Waze" className="h-3.5 w-3.5" />
                    Abrir com Waze
                  </a>
                </div>
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

        {/* Technician Location & Routing */}
        {order.technician_id && order.status !== 'concluida' && order.status !== 'cancelada' && (
          <TechnicianDistanceBadge
            technicianId={order.technician_id}
            customer={order.customer}
          />
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
        {order.customer_id && (
          <button
            onClick={handleCopyTrackingLink}
            className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5"
          >
            {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
            {linkCopied ? 'Link copiado!' : 'Copiar link de acompanhamento do cliente'}
          </button>
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
      <SheetContent className="w-[480px] sm:w-[540px] max-w-[92vw]">
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
