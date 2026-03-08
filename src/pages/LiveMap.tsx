import { useState, useEffect, useRef } from 'react';
import { MapPin, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import 'leaflet/dist/leaflet.css';

interface TechMarker {
  user_id: string;
  full_name: string;
  lat: number;
  lng: number;
  event_type: string;
  service_order_id: string | null;
  updated_at: string;
}

export default function LiveMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const [technicians, setTechnicians] = useState<TechMarker[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch latest location per technician
  const fetchLatestLocations = async () => {
    // Get all profiles to map user_id -> name
    const { data: profiles } = await supabase.from('profiles').select('user_id, full_name');
    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));

    // Get latest location per user (we fetch recent and deduplicate)
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { data: locations }: { data: any[] | null } = await supabase
      .from('technician_locations' as any)
      .select('*')
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: false })
      .limit(500);

    if (!locations) {
      setTechnicians([]);
      setLoading(false);
      return;
    }

    // Deduplicate: keep latest per user
    const latestByUser = new Map<string, any>();
    for (const loc of locations) {
      if (!latestByUser.has(loc.user_id)) {
        latestByUser.set(loc.user_id, loc);
      }
    }

    const markers: TechMarker[] = Array.from(latestByUser.values()).map((loc: any) => ({
      user_id: loc.user_id,
      full_name: profileMap.get(loc.user_id) || 'Técnico',
      lat: loc.lat,
      lng: loc.lng,
      event_type: loc.event_type,
      service_order_id: loc.service_order_id,
      updated_at: loc.created_at,
    }));

    setTechnicians(markers);
    setLoading(false);
  };

  // Initialize map
  useEffect(() => {
    let L: any;
    const initMap = async () => {
      L = await import('leaflet');

      // Fix default marker icons
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      if (!mapRef.current || leafletMapRef.current) return;

      const map = L.map(mapRef.current).setView([-15.7801, -47.9292], 4); // Brazil center
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      leafletMapRef.current = map;
      await fetchLatestLocations();
    };

    initMap();

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // Update markers when technicians change
  useEffect(() => {
    const updateMarkers = async () => {
      const L = await import('leaflet');
      const map = leafletMapRef.current;
      if (!map) return;

      // Clear old markers
      markersRef.current.forEach((marker) => map.removeLayer(marker));
      markersRef.current.clear();

      if (technicians.length === 0) return;

      const bounds: [number, number][] = [];

      technicians.forEach((tech) => {
        const marker = L.marker([tech.lat, tech.lng]).addTo(map);
        const lastUpdate = new Date(tech.updated_at);
        const timeAgo = Math.round((Date.now() - lastUpdate.getTime()) / 60000);

        marker.bindPopup(`
          <div style="min-width:150px">
            <strong>${tech.full_name}</strong><br/>
            <span style="font-size:12px;color:#666">
              ${tech.event_type === 'check_in' ? '🟢 Check-in' : tech.event_type === 'check_out' ? '🔴 Check-out' : '📍 Em deslocamento'}
            </span><br/>
            <span style="font-size:11px;color:#999">
              Há ${timeAgo < 1 ? 'menos de 1' : timeAgo} min
            </span>
          </div>
        `);

        markersRef.current.set(tech.user_id, marker);
        bounds.push([tech.lat, tech.lng]);
      });

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      }
    };

    updateMarkers();
  }, [technicians]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('live-map-locations')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'technician_locations' },
        () => {
          fetchLatestLocations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mapa ao Vivo</h1>
          <p className="text-muted-foreground">Posição em tempo real dos técnicos em campo</p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <MapPin className="h-3 w-3" />
          {technicians.length} técnico{technicians.length !== 1 ? 's' : ''} ativo{technicians.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div ref={mapRef} className="h-[calc(100vh-220px)] min-h-[400px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
