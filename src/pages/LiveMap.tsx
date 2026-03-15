import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, RefreshCw, Map as MapIcon, Clock } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrackingHistoryTab } from '@/components/tracking/TrackingHistoryTab';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { fetchOSRMRoute, geocodeAddress, buildCustomerAddress } from '@/utils/geolocation';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import type { OSRMRoute } from '@/utils/geolocation';
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

interface RouteInfo {
  route: OSRMRoute;
  destLat: number;
  destLng: number;
}

const eventColors: Record<string, string> = {
  check_in: '#22c55e',
  en_route: '#6366f1',
  tracking: '#6366f1',
  check_out: '#ef4444',
};

const eventLabels: Record<string, { emoji: string; label: string }> = {
  check_in: { emoji: '🟢', label: 'Executando OS' },
  en_route: { emoji: '🔵', label: 'A Caminho' },
  tracking: { emoji: '🔵', label: 'A Caminho' },
  check_out: { emoji: '🔴', label: 'Check-out' },
};

const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png';
const TILE_LABELS_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png';
const TILE_LABELS_DARK = 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png';

function buildTooltipHtml(tech: TechMarker, routeInfo?: RouteInfo) {
  const lastUpdate = new Date(tech.updated_at);
  const timeAgo = Math.round((Date.now() - lastUpdate.getTime()) / 60000);
  const ev = eventLabels[tech.event_type] || eventLabels.tracking;
  const color = eventColors[tech.event_type] || '#3b82f6';

  return `
    <div style="min-width:160px;font-family:system-ui,sans-serif;line-height:1.4">
      <div style="font-weight:700;font-size:12px;margin-bottom:2px">${tech.full_name}</div>
      <div style="display:flex;align-items:center;gap:4px">
        <span style="width:7px;height:7px;border-radius:50%;background:${color};display:inline-block"></span>
        <span style="font-size:11px;color:#555">${ev.emoji} ${ev.label}</span>
      </div>
      <div style="font-size:10px;color:#aaa;margin-top:1px">Há ${timeAgo < 1 ? 'menos de 1' : timeAgo} min</div>
    </div>
  `;
}

function buildPopupHtml(tech: TechMarker, routeInfo?: RouteInfo) {
  const lastUpdate = new Date(tech.updated_at);
  const timeAgo = Math.round((Date.now() - lastUpdate.getTime()) / 60000);
  const ev = eventLabels[tech.event_type] || eventLabels.tracking;
  const color = eventColors[tech.event_type] || '#3b82f6';

  const etaHtml = routeInfo
    ? `<div style="display:flex;align-items:center;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb">
        <span style="font-size:13px;font-weight:600;color:#6366f1">🕐 Chegada em ~${routeInfo.route.durationMinutes} min</span>
        <span style="font-size:12px;color:#888">(${routeInfo.route.distanceKm} km)</span>
      </div>`
    : '';

  return `
    <div style="min-width:260px;font-family:system-ui,sans-serif;line-height:1.5;padding:4px">
      <div style="font-weight:700;font-size:15px;margin-bottom:6px">${tech.full_name}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block"></span>
        <span style="font-size:14px;color:#555">${ev.emoji} ${ev.label}</span>
      </div>
      ${tech.service_order_id ? `<div style="font-size:12px;color:#888">OS vinculada</div>` : ''}
      <div style="font-size:12px;color:#aaa;margin-top:4px">Última atualização: há ${timeAgo < 1 ? 'menos de 1' : timeAgo} min</div>
      ${etaHtml}
    </div>
  `;
}

export default function LiveMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const polylinesRef = useRef<Map<string, any>>(new Map());
  const routeLinesRef = useRef<Map<string, any>>(new Map());
  const destMarkersRef = useRef<Map<string, any>>(new Map());
  const baseMarkerRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const labelsLayerRef = useRef<any>(null);
  const [technicians, setTechnicians] = useState<TechMarker[]>([]);
  const [trails, setTrails] = useState<Map<string, TrackingPoint[]>>(new Map());
  const [routes, setRoutes] = useState<Map<string, RouteInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const { resolvedTheme } = useTheme();
  const darkMode = resolvedTheme === 'dark';
  const [activeTab, setActiveTab] = useState('mapa');
  const { settings: companySettings } = useCompanySettings();
  const [companyCoords, setCompanyCoords] = useState<{ lat: number; lng: number } | null>(null);

  const fetchRoutesForTechs = useCallback(async (techs: TechMarker[]) => {
    const enRouteTechs = techs.filter(
      t => (t.event_type === 'en_route' || t.event_type === 'tracking') && t.service_order_id
    );
    if (enRouteTechs.length === 0) { setRoutes(new Map()); return; }

    const osIds = enRouteTechs.map(t => t.service_order_id!);
    const { data: orders } = await supabase
      .from('service_orders')
      .select('id, customer_id')
      .in('id', osIds);

    if (!orders || orders.length === 0) { setRoutes(new Map()); return; }

    const customerIds = [...new Set(orders.map((o: any) => o.customer_id).filter(Boolean))];
    const { data: customers } = await supabase
      .from('customers')
      .select('id, lat, lng, address, city, state, zip_code')
      .in('id', customerIds);

    if (!customers) { setRoutes(new Map()); return; }

    const customerMap = new Map(customers.map((c: any) => [c.id, c]));
    const osCustomerMap = new Map(orders.map((o: any) => [o.id, o.customer_id]));

    const newRoutes = new Map<string, RouteInfo>();

    await Promise.all(enRouteTechs.map(async (tech) => {
      const customerId = osCustomerMap.get(tech.service_order_id!);
      if (!customerId) return;
      const customer = customerMap.get(customerId);
      if (!customer) return;

      let custLat = customer.lat ? Number(customer.lat) : null;
      let custLng = customer.lng ? Number(customer.lng) : null;

      if (!custLat || !custLng) {
        const addr = buildCustomerAddress(customer);
        if (!addr) return;
        const coords = await geocodeAddress(addr);
        if (!coords) return;
        custLat = coords.lat;
        custLng = coords.lng;
        // Cache in DB
        await supabase.from('customers').update({ lat: custLat, lng: custLng } as any).eq('id', customer.id);
      }

      const route = await fetchOSRMRoute(tech.lat, tech.lng, custLat, custLng);
      if (route) {
        newRoutes.set(tech.user_id, { route, destLat: custLat, destLng: custLng });
      }
    }));

    setRoutes(newRoutes);
  }, []);

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
      setRoutes(new Map());
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

    // Fetch routes for en_route technicians
    await fetchRoutesForTechs(markers);
  }, [fetchRoutesForTechs]);

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

  // Geocode company address for base marker
  useEffect(() => {
    if (!companySettings) return;
    const addr = buildCustomerAddress({
      address: companySettings.address,
      city: companySettings.city,
      state: companySettings.state,
      zip_code: companySettings.zip_code,
    });
    if (!addr) return;
    geocodeAddress(addr).then((coords) => {
      if (coords) setCompanyCoords(coords);
    });
  }, [companySettings]);

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

  // Update markers, trails and routes
  useEffect(() => {
    const updateMarkers = async () => {
      const L = await import('leaflet');
      const map = leafletMapRef.current;
      if (!map) return;

      // Clear old markers/lines
      markersRef.current.forEach((marker) => map.removeLayer(marker));
      markersRef.current.clear();
      polylinesRef.current.forEach((line) => map.removeLayer(line));
      polylinesRef.current.clear();
      routeLinesRef.current.forEach((line) => map.removeLayer(line));
      routeLinesRef.current.clear();
      destMarkersRef.current.forEach((m) => map.removeLayer(m));
      destMarkersRef.current.clear();
      if (baseMarkerRef.current) { map.removeLayer(baseMarkerRef.current); baseMarkerRef.current = null; }

      const bounds: [number, number][] = [];

      // Company base marker
      if (companyCoords) {
        const baseIcon = L.divIcon({
          className: '',
          html: `<div style="width:24px;height:24px;border-radius:50%;background:#0d9488;border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;cursor:pointer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          </div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        const baseName = companySettings?.name || 'Empresa';
        baseMarkerRef.current = L.marker([companyCoords.lat, companyCoords.lng], { icon: baseIcon }).addTo(map);
        baseMarkerRef.current.bindTooltip(`<div style="font-family:system-ui;font-size:12px;font-weight:600">🏢 Base: ${baseName}</div>`, {
          direction: 'top', offset: [0, -16], className: 'leaflet-tooltip-custom',
        });
        baseMarkerRef.current.bindPopup(`
          <div style="min-width:200px;font-family:system-ui,sans-serif;padding:4px">
            <div style="font-weight:700;font-size:14px;margin-bottom:4px">🏢 ${baseName}</div>
            <div style="font-size:12px;color:#666">Base da empresa</div>
            ${companySettings?.address ? `<div style="font-size:11px;color:#888;margin-top:4px">${companySettings.address}${companySettings.address_number ? ', ' + companySettings.address_number : ''}</div>` : ''}
            ${companySettings?.city ? `<div style="font-size:11px;color:#888">${companySettings.city} - ${companySettings.state}</div>` : ''}
          </div>
        `, { minWidth: 220, maxWidth: 320, className: 'leaflet-popup-custom' });
        bounds.push([companyCoords.lat, companyCoords.lng]);
      }

      if (technicians.length === 0 && bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        return;
      }
      if (technicians.length === 0) return;

      technicians.forEach((tech) => {
        const color = eventColors[tech.event_type] || '#3b82f6';
        const routeInfo = routes.get(tech.user_id);

        const icon = L.divIcon({
          className: '',
          html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);cursor:pointer"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        const marker = L.marker([tech.lat, tech.lng], { icon }).addTo(map);
        // Tooltip for hover (small preview)
        marker.bindTooltip(buildTooltipHtml(tech, routeInfo), {
          direction: 'top',
          offset: [0, -12],
          opacity: 1,
          className: 'leaflet-tooltip-custom',
        });
        // Popup for click (larger, stays open until X)
        marker.bindPopup(buildPopupHtml(tech, routeInfo), {
          minWidth: 280,
          maxWidth: 360,
          className: 'leaflet-popup-custom',
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

        // Draw route to customer if en_route
        if (routeInfo) {
          const routeLayer = L.geoJSON(routeInfo.route.geometry, {
            style: { color: '#6366f1', weight: 4, opacity: 0.8 },
          }).addTo(map);
          routeLinesRef.current.set(tech.user_id, routeLayer);

          // Destination marker
          const destIcon = L.divIcon({
            className: '',
            html: `<div style="width:20px;height:20px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="#ef4444"/></svg>
            </div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          });
          const destMarker = L.marker([routeInfo.destLat, routeInfo.destLng], { icon: destIcon }).addTo(map);
          destMarker.bindTooltip(`<div style="font-family:system-ui;font-size:12px;font-weight:600">📍 Destino do cliente</div>`, {
            direction: 'top', offset: [0, -14], className: 'leaflet-tooltip-custom',
          });
          destMarkersRef.current.set(tech.user_id, destMarker);
          bounds.push([routeInfo.destLat, routeInfo.destLng]);
        }
      });

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      }
    };

    updateMarkers();
  }, [technicians, trails, routes, companyCoords, companySettings]);

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
        .leaflet-container { z-index: 0 !important; }
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
        .leaflet-popup-custom .leaflet-popup-content-wrapper {
          border-radius: 12px;
          padding: 6px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.18);
        }
        .leaflet-popup-custom .leaflet-popup-content {
          margin: 8px 12px;
          font-size: 14px;
        }
        .leaflet-popup-custom .leaflet-popup-tip {
          box-shadow: 0 4px 12px rgba(0,0,0,0.12);
        }
      `}</style>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mapa e Rastreamento</h1>
          <p className="text-muted-foreground text-sm">Posição em tempo real e histórico de deslocamentos</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <TabsList>
            <TabsTrigger value="mapa" className="gap-1.5">
              <MapIcon className="h-4 w-4" /> Mapa ao Vivo
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-1.5">
              <Clock className="h-4 w-4" /> Histórico
            </TabsTrigger>
          </TabsList>

          {activeTab === 'mapa' && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => fetchLatestLocations()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                <span className="hidden sm:inline">Atualizar</span>
              </Button>
              <Badge variant="secondary" className="gap-1">
                <MapPin className="h-3 w-3" />
                {technicians.length} técnico{technicians.length !== 1 ? 's' : ''} ativo{technicians.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          )}
        </div>

        <TabsContent value="mapa" className="mt-4 space-y-3">
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }}></span> Executando OS</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: '#6366f1' }}></span> A Caminho</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }}></span> Check-out</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: '#ef4444', border: '2px solid white', boxShadow: '0 0 0 1px #ef4444' }}></span> Destino cliente</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: '#0d9488' }}></span> Base da empresa</div>
          </div>

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div ref={mapRef} className="h-[calc(100vh-320px)] min-h-[400px] w-full" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <TrackingHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
