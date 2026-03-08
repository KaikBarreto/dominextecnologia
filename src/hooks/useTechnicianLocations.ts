import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to send periodic geolocation updates while a technician is working on an OS.
 * Starts tracking on mount (if enabled), stops on unmount.
 */
export function useGeoTracking(serviceOrderId: string | undefined, enabled: boolean) {
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const INTERVAL_MS = 30_000; // 30 seconds

  const sendLocation = useCallback(async (lat: number, lng: number, eventType: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('technician_locations' as any).insert({
      user_id: user.id,
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
      (pos) => sendLocation(pos.coords.latitude, pos.coords.longitude, 'tracking'),
      () => {},
      { enableHighAccuracy: true }
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
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
 * Record a single location event (check_in or check_out)
 */
export async function recordLocationEvent(
  serviceOrderId: string,
  lat: number,
  lng: number,
  eventType: 'check_in' | 'check_out' | 'en_route'
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('technician_locations' as any).insert({
    user_id: user.id,
    service_order_id: serviceOrderId,
    lat,
    lng,
    event_type: eventType,
  });
}
