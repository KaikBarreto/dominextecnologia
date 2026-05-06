import { useMemo, useState } from 'react';
import { PauseCircle, Search, MapPin, Play, Eye, AlertCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import type { ServiceOrder } from '@/types/database';
import { usePausedOrders } from '@/hooks/usePausedOrders';

interface PausedOrdersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewDetails: (order: ServiceOrder & { customer: any; equipment: any }) => void;
  onResume: (order: ServiceOrder & { customer: any; equipment: any }) => void;
}

function buildAddressShort(customer: any): string {
  const parts: string[] = [];
  if (customer?.address) {
    const num = customer?.address_number ? `, ${customer.address_number}` : '';
    parts.push(`${customer.address}${num}`);
  }
  if (customer?.neighborhood) parts.push(customer.neighborhood);
  if (customer?.city) parts.push(customer.city);
  return parts.join(' • ');
}

export function PausedOrdersDialog({ open, onOpenChange, onViewDetails, onResume }: PausedOrdersDialogProps) {
  const { pausedOrders, isLoading } = usePausedOrders();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return pausedOrders;
    return pausedOrders.filter((o: any) => {
      const number = String(o.order_number ?? '').toLowerCase();
      const customer = (o.customer?.name ?? '').toLowerCase();
      const company = (o.customer?.company_name ?? '').toLowerCase();
      const address = buildAddressShort(o.customer).toLowerCase();
      return (
        number.includes(term) ||
        customer.includes(term) ||
        company.includes(term) ||
        address.includes(term)
      );
    });
  }, [pausedOrders, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <PauseCircle className="h-5 w-5 text-amber-600" />
            OS Pausadas
            {pausedOrders.length > 0 && (
              <Badge variant="secondary" className="ml-1">{pausedOrders.length}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Todas as ordens de serviço pausadas, independente da data.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nº OS, cliente ou endereço…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 max-h-[60vh]">
          <div className="px-6 py-4 space-y-3">
            {isLoading && (
              <>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-lg border p-4 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </>
            )}

            {!isLoading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center py-10">
                <PauseCircle className="h-12 w-12 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">
                  {pausedOrders.length === 0
                    ? 'Nenhuma OS pausada no momento.'
                    : 'Nenhuma OS encontrada com esse termo.'}
                </p>
                {pausedOrders.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Quando você pausar uma OS, ela aparece aqui pra não se perder na agenda.
                  </p>
                )}
              </div>
            )}

            {!isLoading && filtered.map((order: any) => {
              const customerLabel = order.customer?.name || order.customer?.company_name || 'Cliente sem nome';
              const addressLabel = buildAddressShort(order.customer);
              const scheduledLabel = order.scheduled_date
                ? format(new Date(order.scheduled_date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })
                : 'Sem data agendada';
              // Usa paused_at real (preenchido por trigger ao pausar a OS).
              // Fallback defensivo pra updated_at caso alguma OS não tenha paused_at
              // (não deve acontecer após o backfill, mas mantém UI coerente).
              const pausedTimestamp = order.paused_at || order.updated_at;
              const pausedSince = pausedTimestamp
                ? formatDistanceToNow(new Date(pausedTimestamp), { addSuffix: false, locale: ptBR })
                : null;

              const isOldPaused = pausedTimestamp &&
                (Date.now() - new Date(pausedTimestamp).getTime()) > 7 * 24 * 60 * 60 * 1000; // > 7 dias

              return (
                <div
                  key={order.id}
                  className="rounded-lg border p-4 hover:border-amber-500/40 transition-colors space-y-3"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">OS #{order.order_number}</Badge>
                        <span className="font-medium text-sm break-words">{customerLabel}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
                        <p>
                          <span className="font-medium text-foreground/70">Agendada para:</span> {scheduledLabel}
                          {order.scheduled_time && ` às ${String(order.scheduled_time).slice(0, 5)}`}
                        </p>
                        {pausedSince && (
                          <p className={isOldPaused ? 'text-amber-600 font-medium' : ''}>
                            {isOldPaused && <AlertCircle className="inline h-3 w-3 mr-1 -mt-0.5" />}
                            Pausada há {pausedSince}
                          </p>
                        )}
                        {addressLabel && (
                          <p className="flex items-start gap-1">
                            <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                            <span className="break-words">{addressLabel}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewDetails(order)}
                      className="flex-1 sm:flex-initial"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      Ver detalhes
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onResume(order)}
                      className="flex-1 sm:flex-initial bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                      Retomar agora
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
