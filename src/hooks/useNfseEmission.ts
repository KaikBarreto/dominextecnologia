import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

/**
 * Hook para buscar uma única emissão de NFS-e por id.
 * Usado para hidratar o `NovaNotaModal` com `initialDraft` ao "Continuar preenchendo".
 *
 * RLS permite SELECT das linhas da própria empresa — sem necessidade de SECURITY DEFINER.
 * Fronteira do Supabase: o componente nunca chama supabase direto.
 */
export type NfseEmissionFull = Tables<'nfse_emissions'> & {
  /**
   * Tipo de serviço escolhido no seletor da nota (migration
   * `20260903190000_nfse_vinculo_tipo_servico`). Declarado aqui enquanto o
   * `types.ts` gerado não é atualizado — some sozinho na próxima regeneração
   * (a interseção com a coluna real é inofensiva). Nunca `as any`.
   * `null` = serviço apagado depois: a nota segue válida, só o seletor abre
   * vazio (os códigos ficam congelados nas colunas da própria nota).
   */
  service_type_id?: string | null;
};

export function useNfseEmission(id: string | null) {
  const query = useQuery({
    queryKey: ['nfse-emission', id],
    enabled: !!id,
    staleTime: 0,
    queryFn: async (): Promise<NfseEmissionFull | null> => {
      const { data, error } = await supabase
        .from('nfse_emissions')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as NfseEmissionFull | null;
    },
  });

  return {
    emission: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
