import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { WHATSAPP_NUMBERS } from '@/components/landing/whatsappNumbers';

/**
 * Hook público (sem auth) que busca os números do rodízio de vendas via RPC.
 *
 * A RPC `get_landing_whatsapp_numbers()` retorna text[] com os telefones DDI 55
 * dos vendedores ativos no rodízio, ordenados por nome. GRANT anon + authenticated.
 *
 * Fallback de segurança: se a RPC falhar ou retornar vazio, usa WHATSAPP_NUMBERS
 * (array fixo em whatsappNumbers.ts — hoje só o Maicon). O botão NUNCA fica
 * sem número.
 */
export function useLandingWhatsAppNumbers() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['landing-whatsapp-numbers'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc('get_landing_whatsapp_numbers');
      if (error) throw error;
      // Garante que chegou um array não-vazio de strings
      const result = Array.isArray(data) ? (data as string[]).filter(Boolean) : [];
      if (result.length === 0) throw new Error('RPC retornou lista vazia');
      return result;
    },
    staleTime: 5 * 60 * 1000, // 5 minutos
    retry: 1,
  });

  // Lista efetiva: RPC ao vivo quando disponível, fallback fixo quando não.
  const numbers: string[] = data && data.length > 0 ? data : WHATSAPP_NUMBERS;

  /** Sorteia um número aleatório da lista (por clique, não por render). */
  function getRandom(): string {
    const idx = Math.floor(Math.random() * numbers.length);
    return numbers[idx];
  }

  return { numbers, getRandom, isLoading, isError };
}
