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

interface CompanyTrialInfo {
  subscription_status: string | null;
  subscription_expires_at: string | null;
}

export function useCompanyModules() {
  const { profile, hasRole } = useAuth();
  const companyId = profile?.company_id;

  const { data: modules = [], isLoading: modulesLoading } = useQuery({
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

  // Buscamos subscription_status + subscription_expires_at em separado para
  // liberar TODOS os módulos enquanto a empresa estiver em trial ativo
  // (status === 'testing' e (sem data de expiração OU ainda não expirou)).
  // Após conversão/expiração, o gating volta a usar company_modules normalmente.
  const { data: companyTrial, isLoading: companyLoading } = useQuery({
    queryKey: ['company-trial-info', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from('companies')
        .select('subscription_status, subscription_expires_at')
        .eq('id', companyId)
        .maybeSingle();
      if (error) throw error;
      return (data as CompanyTrialInfo | null) ?? null;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const isTrialActive = (() => {
    if (!companyTrial) return false;
    if (companyTrial.subscription_status !== 'testing') return false;
    // null = trial sem data definida ⇒ tratamos como "não expirou" (libera).
    if (!companyTrial.subscription_expires_at) return true;
    return new Date(companyTrial.subscription_expires_at).getTime() > Date.now();
  })();

  const hasModule = (code: ModuleCode): boolean => {
    // Super admins always have access to everything
    if (hasRole('super_admin')) return true;
    // Trial ativo libera qualquer módulo — é benefício de teste, não promessa.
    // Quando o trial expira ou converte (status muda), cai no gate normal.
    if (isTrialActive) return true;
    return modules.some((m) => m.module_code === code);
  };

  const moduleCodes = modules.map((m) => m.module_code);

  return { modules, moduleCodes, hasModule, isLoading: modulesLoading || companyLoading };
}
