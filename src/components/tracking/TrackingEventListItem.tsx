import { useState, useEffect } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { MobileListItem } from '@/components/mobile/MobileListItem';
import { reverseGeocodeShort } from '@/utils/reverseGeocode';

interface TrackingEventListItemProps {
  id: string;
  lat: number;
  lng: number;
  createdAt: string;
  eventType: string;
  /** Endereço gravado no banco (eventos-chave). Quando ausente, resolvemos sob demanda. */
  address?: string | null;
  technicianName?: string;
  technicianInitials: string;
}

const eventTypeLabel: Record<string, string> = {
  check_in: 'Check-in',
  check_out: 'Check-out',
  tracking: 'Rastreamento',
  en_route: 'A Caminho',
};

const eventTypeBadgeVariant: Record<string, 'success' | 'destructive' | 'secondary'> = {
  check_in: 'success',
  check_out: 'destructive',
  tracking: 'secondary',
  en_route: 'secondary',
};

/**
 * Linha de evento de localização — exibida na lista mobile do TechnicianTracking.
 *
 * Mostra ENDEREÇO (em destaque) + COORDENADA (menor, esmaecida). Usa o `address`
 * gravado no banco quando existe (eventos-chave); senão resolve sob demanda via
 * a fila do reverseGeocodeShort (serializada, com retry). Enquanto resolve,
 * mostra só a coordenada como fallback gracioso.
 *
 * Sem ações (`actions`) porque é histórico/leitura. O único atalho é o link
 * "Ver no mapa" no trailing, que abre Google Maps em nova aba.
 */
export function TrackingEventListItem({
  lat,
  lng,
  createdAt,
  eventType,
  address,
  technicianName,
  technicianInitials,
}: TrackingEventListItemProps) {
  const time = format(new Date(createdAt), 'HH:mm:ss');
  const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const mapsHref = `https://www.google.com/maps?q=${lat},${lng}`;

  // Endereço resolvido sob demanda quando o banco não trouxe um (ex: tracking).
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(address ?? null);

  useEffect(() => {
    if (address) {
      setResolvedAddress(address);
      return;
    }
    let active = true;
    reverseGeocodeShort(lat, lng).then((addr) => {
      if (active && addr) setResolvedAddress(addr);
    });
    return () => {
      active = false;
    };
  }, [address, lat, lng]);

  const hasAddress = !!resolvedAddress;

  const title = (
    <div className="flex items-center gap-2 min-w-0">
      <span className="font-mono text-[13px] text-foreground/80 shrink-0">{time}</span>
      <Badge variant={eventTypeBadgeVariant[eventType] || 'secondary'} className="text-[10px] px-1.5 py-0.5">
        {eventTypeLabel[eventType] || eventType}
      </Badge>
    </div>
  );

  const subtitle = (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[11.5px] text-foreground/90 font-medium truncate">
        <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate">{hasAddress ? resolvedAddress : coords}</span>
        {technicianName && (
          <>
            <span className="opacity-50">•</span>
            <span className="truncate text-muted-foreground font-normal">{technicianName}</span>
          </>
        )}
      </div>
      {hasAddress && (
        <span className="block text-[10px] text-muted-foreground/70 font-mono mt-0.5 truncate">
          {coords}
        </span>
      )}
    </div>
  );

  return (
    <MobileListItem
      leading={
        <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-semibold">
          {technicianInitials}
        </div>
      }
      title={title}
      subtitle={subtitle}
      trailing={
        <a
          href={mapsHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label="Ver no mapa"
          className="inline-flex items-center justify-center h-9 w-9 rounded-full text-primary hover:bg-primary/10 active:bg-primary/15 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      }
    />
  );
}
