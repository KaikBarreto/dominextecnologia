import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────────────────────
// useTenantPaymentCheckout — fronteira do Supabase para o CHECKOUT PÚBLICO do
// cliente final (/pagar/:code). Componente NUNCA chama edge direto (regra-lei).
//
// Roda TOTALMENTE deslogado: a edge `get-tenant-payment-checkout` é anon-safe,
// gateada por `public_short_code`, e devolve uma ALLOWLIST estrita (nunca
// custo/margem/net_value/refs internas — memória do incidente to_jsonb(*)).
//
// White-label do checkout: a marca vem SÓ do payload da edge (anti-FOUC).
// Tenant sem white-label → company.name/logo/cor virão Dominex (resolvido
// server-side); com white-label → marca do tenant. O hook não decide isso.
// ─────────────────────────────────────────────────────────────────────────────

export interface CheckoutCompany {
  name: string;
  logo_url: string | null;
  primary_color: string | null;
}

export interface CheckoutCharge {
  value: number;
  due_date: string | null;
  description: string | null;
  status: string;
  billing_type: string | null;
  invoice_url: string | null;
  pix_copy_paste: string | null;
  boleto_url: string | null;
  public_short_code: string;
}

export interface CheckoutPayload {
  company: CheckoutCompany;
  charge: CheckoutCharge;
}

export function useTenantPaymentCheckout(shortCode: string | undefined) {
  return useQuery({
    queryKey: ['tenant-payment-checkout', shortCode],
    enabled: !!shortCode,
    // Estado "pago/pendente" pode mudar quando o webhook baixa a cobrança —
    // revalida ao focar a aba pra o cliente ver a confirmação sem recarregar.
    refetchOnWindowFocus: true,
    staleTime: 15 * 1000,
    queryFn: async (): Promise<CheckoutPayload | null> => {
      if (!shortCode) return null;
      const { data, error } = await supabase.functions.invoke('get-tenant-payment-checkout', {
        body: { short_code: shortCode },
      });
      if (error) {
        // Corpo não-2xx vem em error.context (Response) — tenta extrair a
        // mensagem PT-BR (padrão do time: supabase-js não faz isso automaticamente).
        const ctx = (error as { context?: Response } | null)?.context;
        if (ctx && typeof (ctx as Response).json === 'function') {
          try {
            const body = await (ctx as Response).clone().json();
            // Lança fora do try pra o catch não engolir a mensagem extraída.
            if (body?.error) {
              throw new Error(String(body.error));
            }
          } catch (parseErr) {
            // Se parseErr for o nosso próprio throw acima, re-lança.
            if (parseErr instanceof Error && parseErr !== error) throw parseErr;
            // Senão é erro de parse JSON — ignora e cai no throw genérico.
          }
        }
        throw error;
      }
      if (!data || typeof data !== 'object') return null;
      const payload = data as { company?: CheckoutCompany; charge?: CheckoutCharge };
      if (!payload.company || !payload.charge) return null;
      return { company: payload.company, charge: payload.charge };
    },
  });
}
