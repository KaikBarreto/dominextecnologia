import { useState, useEffect, useRef } from 'react';
import { MapPin, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

interface TrackingPoint {
  lat: number;
  lng: number;
  event_type: string;
  created_at: string;
}

const eventColors: Record<string, string> = {
  check_in: '#22c55e',
  en_route: '#6366f1',
  tracking: '#3b82f6',
  check_out: '#ef4444',
};

export default function LiveMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const polylinesRef = useRef<Map<string, any>>(new Map());
  const [technicians, setTechnicians] = useState<TechMarker[]>([]);
  const [trails, setTrails] = useState<Map<string, TrackingPoint[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchLatestLocations = async () => {
    const { data: profiles } = await supabase.from('profiles').select('user_id, full_name');
    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));

    const twoHoursAgo = new Date(Date.now() - 7200_000).toISOString();
    const { data: locations }: { data: any[] | null } = await supabase
      .from('technician_locations' as any)
      .select('*')
      .gte('created_at', twoHoursAgo)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (!locations) {
      setTechnicians([]);
      setTrails(new Map());
      setLoading(false);
      return;
    }

    // Deduplicate: keep latest per user
    const latestByUser = new Map<string, any>();
    const trailsByUser = new Map<string, TrackingPoint[]>();

    for (const loc of locations) {
      if (!latestByUser.has(loc.user_id)) {
        latestByUser.set(loc.user_id, loc);
      }
      if (!trailsByUser.has(loc.user_id)) {
        trailsByUser.set(loc.user_id, []);
      }
      trailsByUser.get(loc.user_id)!.push({
        lat: loc.lat,
        lng: loc.lng,
        event_type: loc.event_type,
        created_at: loc.created_at,
      });
    }

    // Reverse trails to chronological order
    trailsByUser.forEach((pts) => pts.reverse());

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
    setTrails(trailsByUser);
    setLoading(false);
  };

  // Initialize map
  useEffect(() => {
    const initMap = async () => {
      const L = await import('leaflet');

      if (!mapRef.current || leafletMapRef.current) return;

      const map = L.map(mapRef.current).setView([-15.7801, -47.9292], 4);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© CartoDB © OpenStreetMap',
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

  // Update markers and trails when technicians change
  useEffect(() => {
    const updateMarkers = async () => {
      const L = await import('leaflet');
      const map = leafletMapRef.current;
      if (!map) return;

      // Clear old markers and polylines
      markersRef.current.forEach((marker) => map.removeLayer(marker));
      markersRef.current.clear();
      polylinesRef.current.forEach((line) => map.removeLayer(line));
      polylinesRef.current.clear();

      if (technicians.length === 0) return;

      const bounds: [number, number][] = [];

      technicians.forEach((tech) => {
        const color = eventColors[tech.event_type] || '#3b82f6';

        const icon = L.divIcon({
          className: '',
          html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        const marker = L.marker([tech.lat, tech.lng], { icon }).addTo(map);
        const lastUpdate = new Date(tech.updated_at);
        const timeAgo = Math.round((Date.now() - lastUpdate.getTime()) / 60000);
        const eventLabel = tech.event_type === 'check_in' ? '🟢 Check-in'
          : tech.event_type === 'en_route' ? '🔵 A Caminho'
          : tech.event_type === 'check_out' ? '🔴 Check-out'
          : '📍 Em deslocamento';

        marker.bindPopup(`
          <div style="min-width:150px">
            <strong>${tech.full_name}</strong><br/>
            <span style="font-size:12px;color:#666">${eventLabel}</span><br/>
            <span style="font-size:11px;color:#999">Há ${timeAgo < 1 ? 'menos de 1' : timeAgo} min</span>
          </div>
        `);

        markersRef.current.set(tech.user_id, marker);
        bounds.push([tech.lat, tech.lng]);

        // Draw trail polyline
        const userTrail = trails.get(tech.user_id);
        if (userTrail && userTrail.length > 1) {
          const latlngs = userTrail.map(p => [p.lat, p.lng] as [number, number]);
          const polyline = L.polyline(latlngs, {
            color,
            weight: 3,
            opacity: 0.5,
            dashArray: '6 4',
          }).addTo(map);
          polylinesRef.current.set(tech.user_id, polyline);
        }
      });

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      }
    };

    updateMarkers();
  }, [technicians, trails]);

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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchLatestLocations()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Atualizar
          </Button>
          <Badge variant="secondary" className="gap-1">
            <MapPin className="h-3 w-3" />
            {technicians.length} técnico{technicians.length !== 1 ? 's' : ''} ativo{technicians.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> Check-in</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-indigo-500"></span> A Caminho</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500"></span> Em deslocamento</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500"></span> Check-out</div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div ref={mapRef} className="h-[calc(100vh-260px)] min-h-[400px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
