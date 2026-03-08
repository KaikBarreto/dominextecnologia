import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  service_order?: {
    id: string;
    order_number: number;
    scheduled_date: string | null;
    customer: { id: string; name: string } | null;
  };
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const ratingsQuery = useQuery({
    queryKey: ['service-ratings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_ratings')
        .select(`
          *,
          service_order:service_orders(id, order_number, scheduled_date, customer:customers(id, name))
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as ServiceRating[];
    },
  });

  const createRatingToken = useMutation({
    mutationFn: async (serviceOrderId: string) => {
      const { data, error } = await supabase
        .from('service_ratings')
        .insert({ service_order_id: serviceOrderId })
        .select()
        .single();

      if (error) {
        // Already exists — fetch existing
        if (error.code === '23505') {
          const { data: existing } = await supabase
            .from('service_ratings')
            .select('*')
            .eq('service_order_id', serviceOrderId)
            .single();
          return existing;
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-ratings'] });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao criar avaliação', description: error.message });
    },
  });

  return {
    ratings: ratingsQuery.data ?? [],
    isLoading: ratingsQuery.isLoading,
    createRatingToken,
  };
}

// Hook for public rating page (no auth)
export function usePublicRating(token: string | undefined) {
  const ratingQuery = useQuery({
    queryKey: ['public-rating', token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_ratings')
        .select(`
          *,
          service_order:service_orders(id, order_number, scheduled_date, customer:customers(id, name))
        `)
        .eq('token', token!)
        .single();

      if (error) throw error;
      return data as unknown as ServiceRating;
    },
  });

  const submitRating = async (input: {
    nps_score: number;
    quality_rating: number;
    punctuality_rating: number;
    professionalism_rating: number;
    comment?: string;
    rated_by_name?: string;
  }) => {
    const { error } = await supabase
      .from('service_ratings')
      .update({
        ...input,
        rated_at: new Date().toISOString(),
      })
      .eq('token', token!);

    if (error) throw error;
  };

  return {
    rating: ratingQuery.data,
    isLoading: ratingQuery.isLoading,
    error: ratingQuery.error,
    submitRating,
  };
}
