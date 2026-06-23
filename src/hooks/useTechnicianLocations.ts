import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { reverseGeocodeShort } from '@/utils/reverseGeocode';

/**
 * In-memory cache for the current user's company_id.
 * Tracking fires every 30s — we cannot re-query `profiles` per tick.
 * Cache is per-user; invalidated when the user_id changes.
 */
let cachedCompanyId: { userId: string; companyId: string | null } | null = null;

async function fetchCompanyIdForCurrentUser(): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  if (cachedCompanyId?.userId === userId) {
    return cachedCompanyId.companyId;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[geo-tracking] failed to fetch company_id:', error.message);
    return null;
  }

  const companyId = data?.company_id ?? null;
  cachedCompanyId = { userId, companyId };
  return companyId;
}

/**
 * Hook to send periodic geolocation updates while a technician is working on an OS.
 * Starts tracking on mount (if enabled), stops on unmount.
 *
 * `onPosition` (opcional) é chamado em TODO tick do GPS (sem o throttle de envio),
 * pra que a UI possa acompanhar a posição ao vivo (ex: rota até o cliente) reusando
 * o MESMO watchPosition — sem abrir um segundo watcher e dobrar consumo de bateria.
 */
export function useGeoTracking(
  serviceOrderId: string | undefined,
  enabled: boolean,
  onPosition?: (lat: number, lng: number) => void,
) {
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const INTERVAL_MS = 30_000; // 30 seconds

  // Mantém o callback em ref pra não re-subscrever o watcher quando a identidade
  // do onPosition muda a cada render.
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;

  const sendLocation = useCallback(async (lat: number, lng: number, eventType: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const companyId = await fetchCompanyIdForCurrentUser();
    if (!companyId) {
      // Super admin sem company ou profile incompleto — tracking GPS é não-crítico.
      // Silenciosamente pula o INSERT (RLS exigiria company_id de qualquer forma).
      console.warn('[geo-tracking] skipping location: no company_id for current user');
      return;
    }

    await supabase.from('technician_locations').insert({
      user_id: user.id,
      company_id: companyId,
      service_order_id: serviceOrderId || null,
      lat,
      lng,
      event_type: eventType,
    });
  }, [serviceOrderId]);

  useEffect(() => {
    if (!enabled || !serviceOrderId || !navigator.geolocation) return;

    // Send initial location immediately
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onPositionRef.current?.(pos.coords.latitude, pos.coords.longitude);
        sendLocation(pos.coords.latitude, pos.coords.longitude, 'tracking');
      },
      () => {},
      { enableHighAccuracy: true }
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        // Posição ao vivo a cada tick (o consumidor aplica seu próprio throttle).
        onPositionRef.current?.(position.coords.latitude, position.coords.longitude);
        const now = Date.now();
        if (now - lastSentRef.current < INTERVAL_MS) return;
        lastSentRef.current = now;
        sendLocation(position.coords.latitude, position.coords.longitude, 'tracking');
      },
      (err) => console.warn('Geo tracking error:', err),
      { enableHighAccuracy: true, maximumAge: 10_000 }
    );

    // Fallback interval for when watchPosition pauses in background
    const fallbackInterval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          onPositionRef.current?.(pos.coords.latitude, pos.coords.longitude);
          const now = Date.now();
          if (now - lastSentRef.current < INTERVAL_MS) return;
          lastSentRef.current = now;
          sendLocation(pos.coords.latitude, pos.coords.longitude, 'tracking');
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 15_000 }
      );
    }, INTERVAL_MS);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      clearInterval(fallbackInterval);
    };
  }, [enabled, serviceOrderId, sendLocation]);

  return { sendLocation };
}

/**
 * Registra um evento-chave de localização (check_in / check_out / en_route).
 *
 * São POUCOS eventos por OS, então vale gravar o endereço legível. Estratégia
 * pra não bloquear o técnico:
 *   1. Insere JÁ com lat/lng (rápido) e pega o `id` do row.
 *   2. EM BACKGROUND resolve o endereço (reverseGeocodeShort, via a fila) e dá
 *      UPDATE no row. Se falhar/retornar null, `address` fica NULL — sem erro.
 *
 * O tracking contínuo (`sendLocation`, 30s) NÃO chama isto e NÃO geocoda:
 * volume alto estouraria o rate-limit; `address` fica NULL nesses pontos.
 */
export async function recordLocationEvent(
  serviceOrderId: string,
  lat: number,
  lng: number,
  eventType: 'check_in' | 'check_out' | 'en_route'
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const companyId = await fetchCompanyIdForCurrentUser();
  if (!companyId) {
    console.warn('[geo-tracking] skipping event: no company_id for current user');
    return;
  }

  const { data: inserted, error } = await supabase
    .from('technician_locations')
    .insert({
      user_id: user.id,
      company_id: companyId,
      service_order_id: serviceOrderId,
      lat,
      lng,
      event_type: eventType,
    })
    .select('id')
    .single();

  if (error || !inserted) return;

  // Geocode em background — não bloqueia o retorno (técnico já seguiu o fluxo).
  // A fila do reverseGeocodeShort serializa e dá retry; aqui só fazemos o UPDATE
  // quando (e se) o endereço resolver.
  const rowId = (inserted as { id: string }).id;
  void reverseGeocodeShort(lat, lng)
    .then((address) => {
      if (!address) return;
      return supabase
        .from('technician_locations')
        .update({ address })
        .eq('id', rowId);
    })
    .catch(() => {
      // Falha de geocode/update é não-crítica — o ponto fica só com coordenada.
    });
}
