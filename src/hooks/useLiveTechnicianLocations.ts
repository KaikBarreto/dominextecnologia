import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';

/**
 * Última posição GPS conhecida de um técnico (a fonte da verdade do "ao vivo").
 */
export interface LiveTechMarker {
  user_id: string;
  full_name: string;
  lat: number;
  lng: number;
  event_type: string;
  service_order_id: string | null;
  updated_at: string;
}

/**
 * Ponto bruto do histórico recente — usado pra desenhar o rastro (trail) no mapa.
 */
export interface LiveTrackingPoint {
  lat: number;
  lng: number;
  event_type: string;
  created_at: string;
}

interface UseLiveTechnicianLocationsResult {
  /** Última posição por técnico (1 marcador por user_id). */
  technicians: LiveTechMarker[];
  /** Rastro recente por técnico (ordem cronológica crescente). */
  trails: Map<string, LiveTrackingPoint[]>;
  loading: boolean;
  /** Recarrega manualmente (ex: botão "Atualizar"). */
  refetch: () => Promise<void>;
}

/**
 * Fonte única das posições GPS AO VIVO dos técnicos.
 *
 * Faz a carga inicial da última posição por técnico em `technician_locations`
 * (janela de 2h) E assina o canal realtime (postgres_changes / INSERT) filtrado
 * por company_id. Cada INSERT recarrega o conjunto. Cleanup remove o canal.
 *
 * Extraído do LiveMap pra ser reusado no mini-mapa do Dashboard e na tela de
 * Rastreamento — sem duplicar a lógica nem abrir canais redundantes (cada
 * componente que monta o hook tem 1 canal só, com nome único por instância).
 *
 * RLS protege o SELECT por tenant; o filtro server-side no canal evita receber
 * INSERTs de technician_locations de outras companies.
 */
export function useLiveTechnicianLocations(): UseLiveTechnicianLocationsResult {
  const { companyId } = useUserCompany();
  const [technicians, setTechnicians] = useState<LiveTechMarker[]>([]);
  const [trails, setTrails] = useState<Map<string, LiveTrackingPoint[]>>(new Map());
  const [loading, setLoading] = useState(true);

  // Nome de canal único e estável por instância do hook — evita colisão de
  // canais quando dois componentes montam o hook ao mesmo tempo.
  const channelIdRef = useRef(`live-tech-locations-${Math.random().toString(36).slice(2)}`);

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
    const trailsByUser = new Map<string, LiveTrackingPoint[]>();

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

    // Veio ordenado desc; invertemos pra cronológico crescente (trail desenhável).
    trailsByUser.forEach((pts) => pts.reverse());

    const markers: LiveTechMarker[] = Array.from(latestByUser.values()).map((loc: any) => ({
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

  // Carga inicial assim que sabemos a empresa.
  useEffect(() => {
    if (!companyId) return;
    fetchLatestLocations();
  }, [companyId, fetchLatestLocations]);

  // Assinatura realtime — 1 canal por instância, cleanup com removeChannel.
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`${channelIdRef.current}-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'technician_locations',
          filter: `company_id=eq.${companyId}`,
        },
        () => fetchLatestLocations()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, fetchLatestLocations]);

  return { technicians, trails, loading, refetch: fetchLatestLocations };
}
