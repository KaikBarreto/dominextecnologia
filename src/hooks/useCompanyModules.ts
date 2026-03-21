import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type ModuleCode =
  | 'basic'
  | 'rh'
  | 'crm'
  | 'nfe'
  | 'finance_advanced'
  | 'pricing_advanced'
  | 'customer_portal'
  | 'white_label'
  | 'extra_user';

interface CompanyModule {
  module_code: string;
  quantity: number;
  activated_at: string;
}

export function useCompanyModules() {
  const { profile, hasRole } = useAuth();
  const companyId = profile?.company_id;

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['company-modules', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('company_modules')
        .select('module_code, quantity, activated_at')
        .eq('company_id', companyId);
      if (error) throw error;
      return (data || []) as CompanyModule[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const hasModule = (code: ModuleCode): boolean => {
    // Super admins always have access to everything
    if (hasRole('super_admin')) return true;
    return modules.some((m) => m.module_code === code);
  };

  const moduleCodes = modules.map((m) => m.module_code);

  return { modules, moduleCodes, hasModule, isLoading };
}
