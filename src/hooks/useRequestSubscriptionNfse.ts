import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

async function edgeErrorMessage(error: unknown): Promise<string> {
  const fallback = 'Não foi possível solicitar a nota fiscal. Tente novamente.';
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.clone === 'function') {
    try {
      const body = await context.clone().json();
      if (typeof body?.error === 'string' && body.error.trim()) return body.error.trim();
    } catch {
      // O fallback abaixo evita expor resposta técnica ou HTML do gateway.
    }
  }
  return fallback;
}

export function useRequestSubscriptionNfse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (paymentId: string) => {
      const { data, error } = await supabase.functions.invoke('request-subscription-nfse', {
        body: { payment_id: paymentId },
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      return data as { status: 'processing' | 'recovered' | 'already' };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['subscription-payment-history'] });
    },
  });
}

