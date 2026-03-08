import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { fetchOSRMRoute, geocodeAddress, buildCustomerAddress } from '@/utils/geolocation';
import type { OSRMRoute } from '@/utils/geolocation';
import 'leaflet/dist/leaflet.css';

interface PublicTrackingMapProps {
  serviceOrderId: string;
}

export function PublicTrackingMap({ serviceOrderId }: PublicTrackingMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const [latestLoc, setLatestLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [routeInfo, setRouteInfo] = useState<OSRMRoute | null>(null);
  const [isEnRoute, setIsEnRoute] = useState(false);
  const mapInitialized = useRef(false);

  // Fetch customer coords for this OS
  useEffect(() => {
    const fetchCustomer = async () => {
      const { data: os } = await supabase
        .from('service_orders')
        .select('customer_id')
        .eq('id', serviceOrderId)
        .single();
      if (!os?.customer_id) return;

      const { data: customer } = await supabase
        .from('customers')
        .select('id, lat, lng, address, city, state, zip_code')
        .eq('id', os.customer_id)
        .single();
      if (!customer) return;

      let lat = customer.lat ? Number(customer.lat) : null;
      let lng = customer.lng ? Number(customer.lng) : null;

      if (!lat || !lng) {
        const addr = buildCustomerAddress(customer);
        if (!addr) return;
        const coords = await geocodeAddress(addr);
        if (!coords) return;
        lat = coords.lat;
        lng = coords.lng;
        await supabase.from('customers').update({ lat, lng } as any).eq('id', customer.id);
      }

      setCustomerCoords({ lat, lng });
    };
    fetchCustomer();
  }, [serviceOrderId]);

  const fetchLatest = async () => {
    const { data }: { data: any[] | null } = await supabase
      .from('technician_locations' as any)
      .select('*')
      .eq('service_order_id', serviceOrderId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      setLatestLoc({ lat: data[0].lat, lng: data[0].lng });
      const enRoute = data[0].event_type === 'en_route' || data[0].event_type === 'tracking';
      setIsEnRoute(enRoute);
    }
  };

  useEffect(() => {
    fetchLatest();
  }, [serviceOrderId]);

  // Calculate route when tech is en_route and we have both positions
  useEffect(() => {
    if (!isEnRoute || !latestLoc || !customerCoords) {
      setRouteInfo(null);
      return;
    }
    fetchOSRMRoute(latestLoc.lat, latestLoc.lng, customerCoords.lat, customerCoords.lng)
      .then(r => setRouteInfo(r));
  }, [latestLoc?.lat, latestLoc?.lng, customerCoords?.lat, customerCoords?.lng, isEnRoute]);

  // Fit bounds helper
  const fitMapBounds = useCallback(() => {
    const map = leafletMapRef.current;
    const L = LRef.current;
    if (!map || !L) return;

    if (latestLoc && customerCoords) {
      const bounds = L.latLngBounds(
        [latestLoc.lat, latestLoc.lng],
        [customerCoords.lat, customerCoords.lng]
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else if (latestLoc) {
      map.setView([latestLoc.lat, latestLoc.lng], 15);
    } else if (customerCoords) {
      map.setView([customerCoords.lat, customerCoords.lng], 15);
    }
  }, [latestLoc, customerCoords]);

  // Init map once
  useEffect(() => {
    if (mapInitialized.current || !mapRef.current) return;

    const initMap = async () => {
      const L = await import('leaflet');
      if (!mapRef.current || mapInitialized.current) return;
      LRef.current = L;
      mapInitialized.current = true;

      const center = latestLoc
        ? [latestLoc.lat, latestLoc.lng]
        : customerCoords
        ? [customerCoords.lat, customerCoords.lng]
        : [-15.78, -47.93];
      const zoom = latestLoc || customerCoords ? 14 : 4;

      const map = L.map(mapRef.current).setView(center as [number, number], zoom);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© CartoDB © OSM',
      }).addTo(map);
      leafletMapRef.current = map;

      // Add technician marker
      if (latestLoc) {
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:18px;height:18px;border-radius:50%;background:#6366f1;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        markerRef.current = L.marker([latestLoc.lat, latestLoc.lng], { icon }).addTo(map);
      }

      // Add destination marker
      if (customerCoords) {
        const destIcon = L.divIcon({
          className: '',
          html: `<div style="width:22px;height:22px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="#ef4444"/></svg>
          </div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        destMarkerRef.current = L.marker([customerCoords.lat, customerCoords.lng], { icon: destIcon }).addTo(map);
      }

      // Fit bounds to show both
      if (latestLoc && customerCoords) {
        const bounds = L.latLngBounds(
          [latestLoc.lat, latestLoc.lng],
          [customerCoords.lat, customerCoords.lng]
        );
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    };

    initMap();

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        mapInitialized.current = false;
      }
    };
  }, []);

  // Update markers when data arrives after map init
  useEffect(() => {
    const L = LRef.current;
    const map = leafletMapRef.current;
    if (!L || !map) return;

    // Update tech marker
    if (latestLoc) {
      if (markerRef.current) {
        markerRef.current.setLatLng([latestLoc.lat, latestLoc.lng]);
      } else {
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:18px;height:18px;border-radius:50%;background:#6366f1;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        markerRef.current = L.marker([latestLoc.lat, latestLoc.lng], { icon }).addTo(map);
      }
    }

    // Update dest marker
    if (customerCoords && !destMarkerRef.current) {
      const destIcon = L.divIcon({
        className: '',
        html: `<div style="width:22px;height:22px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="#ef4444"/></svg>
        </div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      destMarkerRef.current = L.marker([customerCoords.lat, customerCoords.lng], { icon: destIcon }).addTo(map);
    }

    fitMapBounds();
  }, [latestLoc?.lat, latestLoc?.lng, customerCoords?.lat, customerCoords?.lng, fitMapBounds]);

  // Draw route
  useEffect(() => {
    const drawRoute = async () => {
      const L = LRef.current;
      const map = leafletMapRef.current;
      if (!L || !map) return;

      if (routeLayerRef.current) { map.removeLayer(routeLayerRef.current); routeLayerRef.current = null; }

      if (!routeInfo) return;

      routeLayerRef.current = L.geoJSON(routeInfo.geometry, {
        style: { color: '#6366f1', weight: 4, opacity: 0.8 },
      }).addTo(map);
    };
    drawRoute();
  }, [routeInfo]);

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel(`public-tracking-${serviceOrderId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'technician_locations' },
        (payload: any) => {
          if (payload.new?.service_order_id === serviceOrderId) {
            const newLoc = { lat: payload.new.lat, lng: payload.new.lng };
            const enRoute = payload.new.event_type === 'en_route' || payload.new.event_type === 'tracking';
            setLatestLoc(newLoc);
            setIsEnRoute(enRoute);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [serviceOrderId]);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="bg-indigo-50 border-b border-indigo-100 px-3 py-2 flex items-center gap-2 text-sm text-indigo-700">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </span>
          Localização do técnico em tempo real
        </div>

        {/* ETA Banner */}
        {isEnRoute && routeInfo && (
          <div className="bg-indigo-100 border-b border-indigo-200 px-3 py-2 flex items-center gap-2 text-sm font-semibold text-indigo-800">
            🕐 Previsão de chegada: ~{routeInfo.durationMinutes} min ({routeInfo.distanceKm} km)
          </div>
        )}

        <div ref={mapRef} className="h-[400px] w-full" />
      </CardContent>
    </Card>
  );
}
