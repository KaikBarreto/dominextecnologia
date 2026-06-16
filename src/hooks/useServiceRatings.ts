import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export interface ServiceRating {
  id: string;
  service_order_id: string;
  nps_score: number | null;
  quality_rating: number | null;
  punctuality_rating: number | null;
  professionalism_rating: number | null;
  comment: string | null;
  rated_by_name: string | null;
  rated_at: string | null;
  token: string;
  created_at: string;
  /** Técnico responsável pela OS avaliada (resolvido via profiles.user_id). */
  technician_id: string | null;
  technician_name: string | null;
  service_order?: {
    id: string;
    order_number: number;
    scheduled_date: string | null;
    technician_id: string | null;
    customer: { id: string; name: string } | null;
  };
}

// Shape do campo `rating` devolvido por get_public_os (SEM token).
export interface PublicOsRating {
  is_concluded: boolean;
  already_rated: boolean;
  rated_at: string | null;
  nps_score: number | null;
  quality_rating: number | null;
  punctuality_rating: number | null;
  professionalism_rating: number | null;
  comment: string | null;
  rated_by_name: string | null;
}

// Config de NPS da empresa que get_public_os devolve junto da OS pública.
export interface PublicNpsConfig {
  question: string;
  require_stars: boolean;
  generate_on_finish: boolean;
}

// Critério dinâmico de estrelas configurado pela empresa (1–5).
// get_public_os devolve só os critérios ATIVOS, já ordenados.
export interface PublicNpsCriterion {
  id: string;
  label: string;
}

// Item de critério avaliado que vai pra RPC (p_criteria).
export interface SubmitCriterionValue {
  criterion_id: string;
  value: number; // 1..5
}

export interface SubmitPublicOsRatingInput {
  nps_score: number;
  // Critérios dinâmicos avaliados pelo cliente (enviar só os tocados).
  criteria?: SubmitCriterionValue[];
  comment?: string;
  rated_by_name?: string;
}

/**
 * Canal único de gravação de avaliação pública (anon ou autenticado).
 * Grava via RPC SECURITY DEFINER `submit_public_os_rating` — nunca por
 * update/insert direto em service_ratings (escrita anônima direta foi removida).
 * Lança o erro do supabase pra quem chama tratar (check/unique/range).
 */
export async function submitPublicOsRating(
  osId: string,
  input: SubmitPublicOsRatingInput,
  client: typeof supabase = supabase,
) {
  const { error } = await client.rpc('submit_public_os_rating', {
    p_os_id: osId,
    p_nps: input.nps_score,
    p_comment: input.comment ?? null,
    p_name: input.rated_by_name ?? null,
    p_criteria: (input.criteria ?? []) as unknown as Json,
  });
  if (error) throw error;
}

/** True quando o erro do RPC indica "já avaliado" (unique_violation). */
export function isAlreadyRatedError(err: any): boolean {
  return err?.code === '23505' || /already|já avaliad|unique/i.test(err?.message || '');
}

export type NpsClassification = 'promoter' | 'passive' | 'detractor';

export function classifyNps(score: number): NpsClassification {
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'passive';
  return 'detractor';
}

export function calculateNps(ratings: { nps_score: number | null }[]) {
  const scored = ratings.filter((r) => r.nps_score !== null) as { nps_score: number }[];
  if (scored.length === 0) return { nps: 0, promoters: 0, passives: 0, detractors: 0, total: 0 };

  const promoters = scored.filter((r) => r.nps_score >= 9).length;
  const detractors = scored.filter((r) => r.nps_score <= 6).length;
  const passives = scored.length - promoters - detractors;
  const nps = Math.round(((promoters - detractors) / scored.length) * 100);

  return { nps, promoters, passives, detractors, total: scored.length };
}

export function useServiceRatings() {
  const ratingsQuery = useQuery({
    queryKey: ['service-ratings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_ratings')
        .select(`
          *,
          service_order:service_orders(id, order_number, scheduled_date, technician_id, customer:customers(id, name))
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as unknown as ServiceRating[];

      // technician_id da OS aponta pra auth.users (não há FK embutível pra
      // profiles), então resolvemos os nomes num segundo passo — mesmo padrão
      // do useServiceOrders. RLS escopa as duas leituras ao tenant.
      const techIds = Array.from(
        new Set(
          rows
            .map((r) => r.service_order?.technician_id)
            .filter((id): id is string => !!id),
        ),
      );

      const nameById = new Map<string, string | null>();
      if (techIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', techIds);
        (profiles ?? []).forEach((p: { user_id: string; full_name: string | null }) =>
          nameById.set(p.user_id, p.full_name),
        );
      }

      return rows.map((r) => {
        const techId = r.service_order?.technician_id ?? null;
        return {
          ...r,
          technician_id: techId,
          technician_name: techId ? nameById.get(techId) ?? null : null,
        };
      });
    },
  });

  return {
    ratings: ratingsQuery.data ?? [],
    isLoading: ratingsQuery.isLoading,
  };
}
