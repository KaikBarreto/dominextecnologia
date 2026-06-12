import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SubscriptionModuleRow {
  code: string;
  name: string;
  price: number | null;
  description: string | null;
  sort_order: number | null;
  is_active: boolean | null;
}

/**
 * Catálogo de módulos da assinatura (subscription_modules).
 *
 * Fonte da verdade pra NOME e PREÇO de cada módulo — mudança de preço no banco
 * reflete no produto sem editar código. Descrições ricas em PT-BR continuam
 * locais (MODULE_INFO em ModuleGateModal.tsx), usadas como fallback/complemento.
 *
 * queryKey compartilhada com Billing.tsx (['subscription-modules']) — mesma
 * shape de dados, cache único.
 */
export function useModuleCatalog() {
  const { data: catalog = [], isLoading } = useQuery({
    queryKey: ['subscription-modules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_modules')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data || []) as SubscriptionModuleRow[];
    },
    staleTime: 30 * 60 * 1000,
  });

  const getModule = (code?: string | null): SubscriptionModuleRow | null =>
    code ? catalog.find((m) => m.code === code) ?? null : null;

  return { catalog, getModule, isLoading };
}
