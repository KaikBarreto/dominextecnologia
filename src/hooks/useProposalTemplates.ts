import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProposalTemplate {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  preview_color: string;
  created_at: string;
}

export function useProposalTemplates() {
  const query = useQuery({
    queryKey: ['proposal-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposal_templates')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as ProposalTemplate[];
    },
  });

  return {
    templates: query.data ?? [],
    isLoading: query.isLoading,
  };
}
