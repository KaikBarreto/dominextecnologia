import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Catálogo dos níveis de NFS-e (tabela `nfse_tiers`), fonte da verdade de
 * limite mensal e preço por nível. Usado pela tela de billing e pelo painel
 * admin pra montar o seletor de upgrade — nunca hardcode preço/limite.
 *
 * `monthly_limit === null` = ilimitado (nível topo, N4).
 */

export interface NfseTier {
  tier: number;
  name: string;
  monthlyLimit: number | null;
  price: number;
}

export function useNfseTiers() {
  const query = useQuery({
    queryKey: ['nfse-tiers'],
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<NfseTier[]> => {
      const { data, error } = await supabase
        .from('nfse_tiers')
        .select('tier, name, monthly_limit, price')
        .order('tier');
      if (error) throw error;
      return (data ?? []).map((t) => ({
        tier: t.tier,
        name: t.name,
        monthlyLimit: t.monthly_limit ?? null,
        price: Number(t.price) || 0,
      }));
    },
  });

  return { tiers: query.data ?? [], isLoading: query.isLoading };
}

/** "200 notas/mês" ou "Ilimitado". */
export function formatTierLimit(monthlyLimit: number | null): string {
  return monthlyLimit == null ? 'Ilimitado' : `${monthlyLimit.toLocaleString('pt-BR')} notas/mês`;
}
