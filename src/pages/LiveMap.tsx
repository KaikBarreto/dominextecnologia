import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, RefreshCw, Moon, Sun } from 'lucide-react';
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

const eventLabels: Record<string, { emoji: string; label: string }> = {
  check_in: { emoji: '🟢', label: 'Executando OS' },
  en_route: { emoji: '🔵', label: 'A Caminho' },
  tracking: { emoji: '📍', label: 'Em deslocamento' },
  check_out: { emoji: '🔴', label: 'Check-out' },
};

const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png';
const TILE_LABELS_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png';
const TILE_LABELS_DARK = 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png';

function buildTooltipHtml(tech: TechMarker) {
  const lastUpdate = new Date(tech.updated_at);
  const timeAgo = Math.round((Date.now() - lastUpdate.getTime()) / 60000);
  const ev = eventLabels[tech.event_type] || eventLabels.tracking;
  const color = eventColors[tech.event_type] || '#3b82f6';

  return `
    <div style="min-width:180px;font-family:system-ui,sans-serif;line-height:1.4">
      <div style="font-weight:700;font-size:13px;margin-bottom:4px">${tech.full_name}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></span>
        <span style="font-size:12px;color:#555">${ev.emoji} ${ev.label}</span>
      </div>
      ${tech.service_order_id ? `<div style="font-size:11px;color:#888">OS vinculada</div>` : ''}
      <div style="font-size:11px;color:#aaa;margin-top:2px">Há ${timeAgo < 1 ? 'menos de 1' : timeAgo} min</div>
    </div>
  `;
}

export default function LiveMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const polylinesRef = useRef<Map<string, any>>(new Map());
  const tileLayerRef = useRef<any>(null);
  const labelsLayerRef = useRef<any>(null);
  const [technicians, setTechnicians] = useState<TechMarker[]>([]);
  const [trails, setTrails] = useState<Map<string, TrackingPoint[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const fetchLatestLocations = useCallback(async () => {
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
  }, []);

  // Toggle dark/light tiles
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    if (labelsLayerRef.current) map.removeLayer(labelsLayerRef.current);

    const L = (window as any).L;
    if (!L) return;

    tileLayerRef.current = L.tileLayer(darkMode ? TILE_DARK : TILE_LIGHT, {
      attribution: '© CartoDB © OSM',
    }).addTo(map);

    labelsLayerRef.current = L.tileLayer(darkMode ? TILE_LABELS_DARK : TILE_LABELS_LIGHT, {
      attribution: '',
      pane: 'overlayPane',
    }).addTo(map);
  }, [darkMode]);

  // Initialize map
  useEffect(() => {
    const initMap = async () => {
      const L = await import('leaflet');
      (window as any).L = L;

      if (!mapRef.current || leafletMapRef.current) return;

      const map = L.map(mapRef.current).setView([-15.7801, -47.9292], 4);

      tileLayerRef.current = L.tileLayer(TILE_LIGHT, {
        attribution: '© CartoDB © OSM',
      }).addTo(map);

      labelsLayerRef.current = L.tileLayer(TILE_LABELS_LIGHT, {
        attribution: '',
        pane: 'overlayPane',
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

  // Update markers and trails
  useEffect(() => {
    const updateMarkers = async () => {
      const L = await import('leaflet');
      const map = leafletMapRef.current;
      if (!map) return;

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
          html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);cursor:pointer"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        const marker = L.marker([tech.lat, tech.lng], { icon }).addTo(map);

        // Bind persistent tooltip on hover
        marker.bindTooltip(buildTooltipHtml(tech), {
          direction: 'top',
          offset: [0, -12],
          opacity: 1,
          className: 'leaflet-tooltip-custom',
        });

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
        () => fetchLatestLocations()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchLatestLocations]);

  return (
    <div className="space-y-4">
      <style>{`
        .leaflet-tooltip-custom {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px 12px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.12);
          font-size: 13px;
        }
        .leaflet-tooltip-custom::before {
          border-top-color: #e2e8f0 !important;
        }
      `}</style>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mapa ao Vivo</h1>
          <p className="text-muted-foreground">Posição em tempo real dos técnicos em campo</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDarkMode(d => !d)} title={darkMode ? 'Modo claro' : 'Modo escuro'}>
            {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>
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
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> Executando OS</div>
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
