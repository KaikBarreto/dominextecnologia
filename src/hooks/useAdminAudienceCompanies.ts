import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AdminAudienceCompany } from '@/lib/adminNps';

export const ADMIN_AUDIENCE_COMPANIES_KEY = ['admin', 'audience-companies'] as const;

export function useAdminAudienceCompanies() {
  return useQuery({
    queryKey: ADMIN_AUDIENCE_COMPANIES_KEY,
    queryFn: async (): Promise<AdminAudienceCompany[]> => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, subscription_status, subscription_plan, segment, segments')
        .order('name');
      if (error) throw error;
      return (data ?? []) as AdminAudienceCompany[];
    },
    staleTime: 1000 * 60 * 5,
  });
}
/**
 * Link público canônico da própria Dominex. O admin apenas sugere esse valor
 * ao criar uma campanha; a pesquisa continua guardando um snapshot editável.
 */
export function useDominexGoogleReviewUrl() {
  return useQuery({
    queryKey: ['admin', 'dominex-google-review-url'],
    queryFn: async (): Promise<string | null> => {
      const { data: internalCompanies, error: companyError } = await supabase
        .from('companies')
        .select('id, name')
        .eq('is_internal_account', true)
        .order('name');
      if (companyError) throw companyError;

      const companies = internalCompanies ?? [];
      const company = companies.find((item) => item.name.toLocaleLowerCase('pt-BR').includes('dominex'))
        ?? companies[0];
      if (!company) return null;

      const { data, error } = await supabase
        .from('nps_settings')
        .select('google_review_url')
        .eq('company_id', company.id)
        .maybeSingle();
      if (error) throw error;
      return data?.google_review_url?.trim() || null;
    },
    staleTime: 1000 * 60 * 10,
  });
}

