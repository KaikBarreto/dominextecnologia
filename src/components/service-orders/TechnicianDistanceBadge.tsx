import { useState, useEffect } from 'react';
import { MapPin, Navigation, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  haversineDistance,
  formatDistance,
  buildGoogleMapsDirectionsUrl,
  buildWazeUrl,
  buildCustomerAddress,
} from '@/utils/geolocation';

interface TechnicianDistanceBadgeProps {
  technicianId: string | null;
  customer: any;
}

export function TechnicianDistanceBadge({ technicianId, customer }: TechnicianDistanceBadgeProps) {
  const [techLocation, setTechLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!technicianId) return;
    setLoading(true);

    supabase
      .from('technician_locations' as any)
      .select('lat, lng, created_at')
      .eq('user_id', technicianId)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setTechLocation({ lat: data[0].lat, lng: data[0].lng });
        }
        setLoading(false);
      });
  }, [technicianId]);

  if (!technicianId || loading || !techLocation) return null;

  const customerAddress = buildCustomerAddress(customer);
  if (!customerAddress) return null;

  // We don't have customer lat/lng, so we show the tech location and routing buttons
  const directionsUrl = buildGoogleMapsDirectionsUrl(techLocation.lat, techLocation.lng, customerAddress);
  const wazeUrl = buildWazeUrl(techLocation.lat, techLocation.lng);

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-muted/50 border">
      <div className="flex items-center gap-2 text-sm">
        <Navigation className="h-4 w-4 text-primary shrink-0" />
        <span className="font-medium">Localização do Técnico</span>
      </div>
      <p className="text-xs text-muted-foreground pl-6">
        Última posição: {techLocation.lat.toFixed(4)}, {techLocation.lng.toFixed(4)}
      </p>
      <div className="flex gap-2 pl-6 flex-wrap">
        <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1">
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3" />
            Google Maps
          </a>
        </Button>
        <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1">
          <a href={wazeUrl} target="_blank" rel="noopener noreferrer">
            <Navigation className="h-3 w-3" />
            Waze
          </a>
        </Button>
      </div>
    </div>
  );
}
