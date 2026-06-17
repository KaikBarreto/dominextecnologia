import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchOSRMRoute, geocodeAddress, buildCustomerAddress } from '@/utils/geolocation';
import type { OSRMRoute } from '@/utils/geolocation';
import 'leaflet/dist/leaflet.css';

interface CustomerLike {
  latitude?: number | string | null;
  longitude?: number | string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}

interface RouteToCustomerMapProps {
  /** Origem (técnico). Quando ausente, o mapa só centra no cliente. */
  origin: { lat: number; lng: number } | null;
  /** Destino já resolvido (cliente). Tem prioridade sobre `customer`. */
  customerCoords: { lat: number; lng: number } | null;
  /** Usado pra geocodificar quando `customerCoords` é null. */
  customer?: CustomerLike | null;
  className?: string;
  /** Quando true, o mapa preenche o container (h-full) em vez do preview slim de 260px. */
  fullHeight?: boolean;
}

/**
 * Mapa slim da rota técnico → cliente, reusado no app do técnico (a_caminho).
 *
 * Mesmo padrão do PublicTrackingMap (Leaflet dynamic import, marcadores,
 * polyline OSRM, fit bounds) mas sem realtime/RPC pública — recebe as
 * coordenadas por prop e resolve o destino por geocode quando falta.
 *
 * Se nem origem nem destino resolverem, renderiza null (o caller mostra só
 * os botões de navegação por endereço — degradação elegante).
 */
export function RouteToCustomerMap({ origin, customerCoords, customer, className, fullHeight }: RouteToCustomerMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const techMarkerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const mapInitialized = useRef(false);

  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(customerCoords);
  const [routeInfo, setRouteInfo] = useState<OSRMRoute | null>(null);

  // Resolve destino: coords explícitas > customer.latitude/longitude > geocode
  useEffect(() => {
    let cancelled = false;

    const resolveDest = async () => {
      if (customerCoords) {
        setDestCoords(customerCoords);
        return;
      }
      const lat = customer?.latitude != null ? Number(customer.latitude) : null;
      const lng = customer?.longitude != null ? Number(customer.longitude) : null;
      if (lat && lng && Number.isFinite(lat) && Number.isFinite(lng)) {
        if (!cancelled) setDestCoords({ lat, lng });
        return;
      }
      const addr = customer ? buildCustomerAddress(customer) : '';
      if (!addr) return;
      const coords = await geocodeAddress(addr);
      if (coords && !cancelled) setDestCoords(coords);
    };

    resolveDest();
    return () => { cancelled = true; };
  }, [customerCoords, customer?.latitude, customer?.longitude, customer?.address, customer?.city, customer?.state]);

  // Calcula a rota quando há os dois pontos
  useEffect(() => {
    if (!origin || !destCoords) {
      setRouteInfo(null);
      return;
    }
    fetchOSRMRoute(origin.lat, origin.lng, destCoords.lat, destCoords.lng)
      .then((r) => setRouteInfo(r));
  }, [origin?.lat, origin?.lng, destCoords?.lat, destCoords?.lng]);

  // Defesa do shell mobile: o transform da animação de entrada faz o Leaflet
  // medir o container errado. Forçar invalidateSize via rAF + timeout.
  const invalidate = useCallback(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    requestAnimationFrame(() => {
      try { map.invalidateSize(); } catch { /* noop */ }
    });
    setTimeout(() => {
      try { map.invalidateSize(); } catch { /* noop */ }
    }, 300);
  }, []);

  const fitBounds = useCallback(() => {
    const map = leafletMapRef.current;
    const L = LRef.current;
    if (!map || !L) return;
    if (origin && destCoords) {
      const bounds = L.latLngBounds([origin.lat, origin.lng], [destCoords.lat, destCoords.lng]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else if (destCoords) {
      map.setView([destCoords.lat, destCoords.lng], 15);
    } else if (origin) {
      map.setView([origin.lat, origin.lng], 15);
    }
  }, [origin, destCoords]);

  // Init map once
  useEffect(() => {
    if (mapInitialized.current || !mapRef.current) return;

    const initMap = async () => {
      const L = await import('leaflet');
      if (!mapRef.current || mapInitialized.current) return;
      LRef.current = L;
      mapInitialized.current = true;

      const center = origin
        ? [origin.lat, origin.lng]
        : destCoords
        ? [destCoords.lat, destCoords.lng]
        : [-15.78, -47.93];
      const zoom = origin || destCoords ? 14 : 4;

      const map = L.map(mapRef.current, { attributionControl: false }).setView(center as [number, number], zoom);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© CartoDB © OSM',
      }).addTo(map);
      leafletMapRef.current = map;

      fitBounds();
      invalidate();
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

  // ResizeObserver — re-mede se o container muda de tamanho (abas/transições)
  useEffect(() => {
    if (!mapRef.current) return;
    const ro = new ResizeObserver(() => invalidate());
    ro.observe(mapRef.current);
    return () => ro.disconnect();
  }, [invalidate]);

  // Atualiza marcadores quando coords chegam após o init
  useEffect(() => {
    const L = LRef.current;
    const map = leafletMapRef.current;
    if (!L || !map) return;

    if (origin) {
      if (techMarkerRef.current) {
        techMarkerRef.current.setLatLng([origin.lat, origin.lng]);
      } else {
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:18px;height:18px;border-radius:50%;background:#6366f1;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        techMarkerRef.current = L.marker([origin.lat, origin.lng], { icon }).addTo(map);
      }
    }

    if (destCoords && !destMarkerRef.current) {
      const destIcon = L.divIcon({
        className: '',
        html: `<div style="width:22px;height:22px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="#ef4444"/></svg>
        </div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      destMarkerRef.current = L.marker([destCoords.lat, destCoords.lng], { icon: destIcon }).addTo(map);
    }

    fitBounds();
    invalidate();
  }, [origin?.lat, origin?.lng, destCoords?.lat, destCoords?.lng, fitBounds, invalidate]);

  // Desenha a rota
  useEffect(() => {
    const L = LRef.current;
    const map = leafletMapRef.current;
    if (!L || !map) return;

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
    if (!routeInfo) return;

    routeLayerRef.current = L.geoJSON(routeInfo.geometry, {
      style: { color: '#6366f1', weight: 4, opacity: 0.8 },
    }).addTo(map);
  }, [routeInfo]);

  // Sem nada pra mostrar: não renderiza o container (caller mostra só os botões)
  if (!origin && !destCoords) return null;

  return (
    <div className={`${fullHeight ? 'h-full flex flex-col' : ''} ${className ?? ''}`}>
      {routeInfo && (
        <div className="bg-indigo-100 border-b border-indigo-200 px-3 py-2 flex items-center gap-2 text-sm font-semibold text-indigo-800 shrink-0">
          🕐 ~{routeInfo.durationMinutes} min até o cliente ({routeInfo.distanceKm} km)
        </div>
      )}
      <div ref={mapRef} className={fullHeight ? 'flex-1 w-full' : 'h-[260px] w-full'} />
    </div>
  );
}
