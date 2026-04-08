import { useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MapPin, Map as MapIcon, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import 'leaflet/dist/leaflet.css';

interface TechInField {
  name: string;
  avatarUrl?: string;
  lat: number;
  lng: number;
  customerName: string;
}

const DEFAULT_CENTER: [number, number] = [-22.9, -43.2];
const DEFAULT_ZOOM = 4;
const ACTIVE_ZOOM = 12;
const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getTileUrl = () =>
  document.documentElement.classList.contains('dark') ? TILE_DARK : TILE_LIGHT;

export function DashboardLiveMap({ technicians, isLoading }: { technicians: TechInField[]; isLoading: boolean }) {
  const navigate = useNavigate();
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markerRefs = useRef<any[]>([]);

  const syncMapData = useCallback(async (leafletModule?: typeof import('leaflet')) => {
    const map = leafletMapRef.current;
    if (!map) return;

    const L = leafletModule ?? await import('leaflet');

    markerRefs.current.forEach((marker) => map.removeLayer(marker));
    markerRefs.current = technicians.map((tech) => {
      const marker = L.marker([tech.lat, tech.lng]).addTo(map);
      marker.bindPopup(`
        <div style="font-family:system-ui;font-size:12px;line-height:1.4;min-width:140px;">
          <p style="margin:0 0 4px;font-weight:600;">${escapeHtml(tech.name)}</p>
          <p style="margin:0;color:hsl(var(--muted-foreground));">${escapeHtml(tech.customerName)}</p>
        </div>
      `);
      return marker;
    });

    tileLayerRef.current?.setUrl(getTileUrl());

    if (technicians.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    } else if (technicians.length === 1) {
      map.setView([technicians[0].lat, technicians[0].lng], ACTIVE_ZOOM);
    } else {
      const bounds = L.latLngBounds(technicians.map(({ lat, lng }) => [lat, lng] as [number, number]));
      map.fitBounds(bounds.pad(0.2));
    }

    requestAnimationFrame(() => map.invalidateSize());
  }, [technicians]);

  useEffect(() => {
    if (isLoading || technicians.length === 0 || leafletMapRef.current || !mapElementRef.current) return;

    let cancelled = false;

    const initMap = async () => {
      const L = await import('leaflet');
      if (cancelled || !mapElementRef.current || leafletMapRef.current) return;

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapElementRef.current, {
        scrollWheelZoom: false,
        zoomControl: false,
      }).setView([technicians[0].lat, technicians[0].lng], ACTIVE_ZOOM);

      tileLayerRef.current = L.tileLayer(getTileUrl(), {
        attribution: '&copy; <a href="https://carto.com">CARTO</a>',
      }).addTo(map);

      leafletMapRef.current = map;
      await syncMapData(L);
    };

    initMap().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isLoading, technicians, syncMapData]);

  useEffect(() => {
    if (isLoading || !leafletMapRef.current) return;
    syncMapData().catch(() => {});
  }, [isLoading, syncMapData]);

  useEffect(() => {
    if (isLoading || technicians.length > 0) return;

    markerRefs.current.forEach((marker) => marker.remove());
    markerRefs.current = [];
    tileLayerRef.current = null;

    if (leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
    }
  }, [isLoading, technicians.length]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      tileLayerRef.current?.setUrl(getTileUrl());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      tileLayerRef.current = null;

      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm lg:text-base font-semibold flex items-center gap-2">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              Equipe em Campo
            </CardTitle>
            <Badge className="bg-primary text-primary-foreground border-primary hover:bg-primary/90 gap-1 text-xs">
              <span className="h-2 w-2 rounded-full bg-primary-foreground animate-pulse" />
              Ao vivo
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-[240px] w-full rounded-lg" />
          ) : technicians.length > 0 ? (
            <>
              <div ref={mapElementRef} className="h-[240px] w-full overflow-hidden rounded-lg" />
              <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                {technicians.map((tech, i) => (
                  <div key={i} className="flex flex-col items-center gap-1 min-w-[60px]">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={tech.avatarUrl} />
                      <AvatarFallback className="text-[10px] bg-muted">{tech.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="text-[10px] text-muted-foreground text-center truncate w-full">{tech.name.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="p-3 rounded-full bg-muted mb-3">
                <MapIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhum técnico em campo agora</p>
              <button
                onClick={() => navigate('/mapa-ao-vivo')}
                className="text-xs text-primary font-medium mt-2 hover:underline flex items-center gap-1"
              >
                Abrir Mapa ao Vivo <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
