import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import 'leaflet/dist/leaflet.css';

interface PublicTrackingMapProps {
  serviceOrderId: string;
}

export function PublicTrackingMap({ serviceOrderId }: PublicTrackingMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [latestLoc, setLatestLoc] = useState<{ lat: number; lng: number } | null>(null);

  const fetchLatest = async () => {
    const { data }: { data: any[] | null } = await supabase
      .from('technician_locations' as any)
      .select('*')
      .eq('service_order_id', serviceOrderId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      setLatestLoc({ lat: data[0].lat, lng: data[0].lng });
    }
  };

  useEffect(() => {
    fetchLatest();
  }, [serviceOrderId]);

  // Init map
  useEffect(() => {
    const initMap = async () => {
      const L = await import('leaflet');
      if (!mapRef.current || leafletMapRef.current) return;

      const map = L.map(mapRef.current).setView(
        latestLoc ? [latestLoc.lat, latestLoc.lng] : [-15.78, -47.93],
        latestLoc ? 15 : 4
      );
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© CartoDB © OSM',
      }).addTo(map);
      leafletMapRef.current = map;

      if (latestLoc) {
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:16px;height:16px;border-radius:50%;background:#6366f1;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        markerRef.current = L.marker([latestLoc.lat, latestLoc.lng], { icon }).addTo(map);
      }
    };

    if (latestLoc !== null || mapRef.current) {
      initMap();
    }

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [latestLoc?.lat, latestLoc?.lng]);

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
            setLatestLoc(newLoc);

            if (leafletMapRef.current && markerRef.current) {
              markerRef.current.setLatLng([newLoc.lat, newLoc.lng]);
              leafletMapRef.current.panTo([newLoc.lat, newLoc.lng]);
            }
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
        <div ref={mapRef} className="h-[250px] w-full" />
      </CardContent>
    </Card>
  );
}
