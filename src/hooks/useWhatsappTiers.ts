import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Catálogo dos níveis de WhatsApp (tabela `whatsapp_tiers`).
 * Espelha o padrão de useNfseTiers — staleTime longo (30min).
 */

export interface WhatsappTier {
  tier: number;
  name: string;
  monthlyLimit: number | null;
  price: number;
}

export function useWhatsappTiers() {
  const query = useQuery({
    queryKey: ['whatsapp-tiers'],
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<WhatsappTier[]> => {
      const { data, error } = await supabase
        .from('whatsapp_tiers')
        .select('tier, name, monthly_limit, price')
        .order('tier');
      if (error) throw error;
      return (data ?? []).map((t) => ({
        tier: (t as any).tier,
        name: (t as any).name,
        monthlyLimit: (t as any).monthly_limit ?? null,
        price: Number((t as any).price) || 0,
      }));
    },
  });

  return { tiers: query.data ?? [], isLoading: query.isLoading };
}

/** "200 avisos/mês" ou "Ilimitado". */
export function formatWhatsappTierLimit(monthlyLimit: number | null): string {
  return monthlyLimit == null
    ? 'Ilimitado'
    : `${monthlyLimit.toLocaleString('pt-BR')} avisos/mês`;
}
