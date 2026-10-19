import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { supabaseAnon } from '@/integrations/supabase/anonClient';
import { fetchOSRMRoute, geocodeAddress, buildCustomerAddress } from '@/utils/geolocation';
import type { OSRMRoute } from '@/utils/geolocation';
import { addBaseLayer, type MapBaseLayer } from '@/lib/mapTiles';
import 'leaflet/dist/leaflet.css';

/**
 * Ultima posicao do tecnico, exatamente como vem de
 * `get_public_os.technician_location` e da RPC irma
 * `get_public_os_technician_location`.
 *
 * O visitante anonimo recebe SO estes 4 campos: nao vem `address` (o logradouro
 * reverso de onde o tecnico esta, que seria entregar endereco de funcionario de
 * graca), nem `user_id`, `company_id` ou `id`.
 */
type TechnicianLocation = {
  lat: number;
  lng: number;
  event_type: string;
  created_at: string;
};

/** Subset de `get_public_os` que este mapa consome. */
type PublicOsMapPayload = {
  customer_geo?: Record<string, unknown> | null;
  technician_location?: TechnicianLocation | null;
};

/**
 * `event_type` que significa "o tecnico esta vindo". Só estes acendem o banner
 * de ETA. `check_in`/`check_out` entram na mesma tabela e NAO sao deslocamento.
 */
const EN_ROUTE_EVENTS = ['en_route', 'tracking'];

/**
 * Intervalo do poll da posicao. 20 s, escolhido pela cadencia REAL do dado e
 * pelo 4G de quem esta esperando o tecnico na porta, nao por ser redondo:
 *
 *  - o app do tecnico empurra posicao a cada 30 s (`INTERVAL_MS` em
 *    `useTechnicianLocations`), e a mediana medida em producao nos ultimos
 *    60 dias bate: 30,5 s (p25 28 s, p75 35 s, n=1934). Pollar mais rapido que
 *    isso nao traz informacao nova, so consome dado do cliente final;
 *  - pollar a 30 s alinharia com a escrita e, no pior caso de fase, deixaria a
 *    posicao ~60 s velha na tela. 20 s garante pelo menos um poll dentro de cada
 *    janela de escrita e limita o atraso visivel a ~50 s;
 *  - a RPC irma devolve 129 bytes. Pollar o `get_public_os` inteiro no mesmo
 *    ritmo custaria 136 KB por ciclo (~1.055x mais) — foi o motivo de existir
 *    uma RPC so pra isso.
 *
 * A janela ja e curta por construcao: o mapa so monta com a OS em `a_caminho`.
 */
const POLL_INTERVAL_MS = 20_000;

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
  const baseLayerRef = useRef<MapBaseLayer | null>(null);
  const [latestLoc, setLatestLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [routeInfo, setRouteInfo] = useState<OSRMRoute | null>(null);
  const [isEnRoute, setIsEnRoute] = useState(false);
  const mapInitialized = useRef(false);

  // Aplica a última posição vinda do servidor. Único ponto que escreve
  // `latestLoc`/`isEnRoute`, usado tanto pela carga inicial quanto pelo poll.
  const applyLocation = useCallback((loc: TechnicianLocation | null | undefined) => {
    if (!loc || loc.lat == null || loc.lng == null) return;
    setLatestLoc({ lat: Number(loc.lat), lng: Number(loc.lng) });
    setIsEnRoute(EN_ROUTE_EVENTS.includes(loc.event_type));
  }, []);

  // CARGA INICIAL: UMA chamada da RPC SECURITY DEFINER `get_public_os` traz o
  // destino (`customer_geo`) E a última posição do técnico
  // (`technician_location`). Antes eram duas idas: esta RPC mais um
  // `supabase.from('technician_locations')` direto, que morreu na varredura de
  // 18/10/2026 com `42501 permission denied for table service_ratings` — a
  // policy de anon em technician_locations cita service_ratings no EXISTS, e o
  // Postgres exige privilégio na tabela citada DENTRO da expressão.
  //
  // Devolver o GRANT não resolveria: a MESMA policy também cita
  // service_orders, que não tem policy nenhuma pra anon, então o EXISTS externo
  // nunca é verdadeiro e a leitura direta devolve zero linha em silêncio (pior
  // que o erro, porque ninguém percebe). Por isso a posição vem por RPC.
  useEffect(() => {
    let cancelled = false;

    const loadInitial = async () => {
      const { data, error } = await supabaseAnon.rpc('get_public_os', { p_os_id: serviceOrderId });
      if (cancelled || error || !data) return;
      const payload = data as PublicOsMapPayload;

      // Posição primeiro: é de graça (já veio no payload) e põe o técnico no
      // mapa na hora, sem esperar o geocode do destino, que pode entrar na
      // fila do Nominatim.
      applyLocation(payload.technician_location);

      const geo = payload.customer_geo as Record<string, any> | null | undefined;
      if (!geo) return;

      let lat = geo.lat ? Number(geo.lat) : null;
      let lng = geo.lng ? Number(geo.lng) : null;

      // Sem coordenadas salvas: geocodifica o endereço só no client (sem
      // write-back — anon não tem permissão de UPDATE em customers).
      if (!lat || !lng) {
        const addr = buildCustomerAddress(geo);
        if (!addr) return;
        const coords = await geocodeAddress(addr);
        if (cancelled || !coords) return;
        lat = coords.lat;
        lng = coords.lng;
      }

      if (!cancelled) setCustomerCoords({ lat, lng });
    };

    loadInitial();
    return () => { cancelled = true; };
  }, [serviceOrderId, applyLocation]);

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

    // Cancela a montagem do fundo se a tela sair antes do chunk do mapa chegar
    // (3G do técnico em campo): sem isso, sobra contexto WebGL órfão.
    const controller = new AbortController();

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
      leafletMapRef.current = map;
      addBaseLayer(map, { signal: controller.signal })
        .then((layer) => {
          if (controller.signal.aborted) {
            layer.remove();
            return;
          }
          baseLayerRef.current = layer;
        })
        .catch(() => { /* mapa segue com os marcadores, sem fundo */ });

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
      controller.abort();
      baseLayerRef.current?.remove();
      baseLayerRef.current = null;

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

  // ATUALIZAÇÃO CONTÍNUA: poll da RPC irmã, não Realtime.
  //
  // Aqui havia um canal `postgres_changes` em technician_locations. Ele não
  // entrega nada pro visitante anônimo: o Realtime avalia a MESMA policy da
  // leitura direta, sob o MESMO papel `anon`, então cai no mesmo buraco (citação
  // de service_ratings e de service_orders dentro da expressão). Como o
  // anônimo não pode depender de policy aninhada, a posição passa a vir por
  // RPC SECURITY DEFINER, e a atualização vira poll.
  //
  // Sem `tick()` imediato de propósito: a carga inicial acima já trouxe a
  // posição no mesmo payload, então disparar agora seria uma ida repetida.
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const { data, error } = await supabaseAnon.rpc(
        'get_public_os_technician_location',
        { p_os_id: serviceOrderId },
      );
      // Falha de rede/servidor não apaga o técnico do mapa: mantém a última
      // posição conhecida e tenta no próximo ciclo.
      if (cancelled || error) return;
      applyLocation(data as TechnicianLocation | null);
    };

    const timer = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [serviceOrderId, applyLocation]);

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
