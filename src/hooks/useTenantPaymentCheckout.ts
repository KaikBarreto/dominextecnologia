import { useCallback, useState } from 'react';
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
  /** true → o cartão é processado no NOSSO checkout (formulário nesta página).
   *  false/ausente → só o link hospedado da Asaas (fallback). Decidido server-side. */
  allow_card?: boolean;
}

export interface CheckoutPayload {
  company: CheckoutCompany;
  charge: CheckoutCharge;
}

export interface UseTenantPaymentCheckoutOptions {
  /**
   * Intervalo (ms) de revalidação. Usado DEPOIS de um pagamento no cartão pra
   * confirmar o estado REAL da cobrança (a baixa definitiva vem do webhook —
   * nunca confiamos no retorno otimista). 0/undefined = sem polling.
   */
  pollMs?: number;
}

export function useTenantPaymentCheckout(
  shortCode: string | undefined,
  options?: UseTenantPaymentCheckoutOptions,
) {
  const pollMs = options?.pollMs ?? 0;
  return useQuery({
    queryKey: ['tenant-payment-checkout', shortCode],
    enabled: !!shortCode,
    refetchInterval: pollMs > 0 ? pollMs : false,
    refetchIntervalInBackground: false,
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

// ─────────────────────────────────────────────────────────────────────────────
// usePayTenantChargeWithCard — pagamento com CARTÃO no nosso próprio checkout.
//
// Fronteira única com a edge `tenant-asaas-pay-charge-card` (anon-safe, gateada
// pelo public_short_code). O componente NUNCA chama a edge direto.
//
// SEGURANÇA (regras desta tela):
//   • Os dados do cartão são usados SÓ nesta chamada e vivem apenas na variável
//     local do submit — não vão pra estado do hook, cache do react-query,
//     localStorage nem log. Nada de console.log aqui.
//   • O VALOR não é enviado: quem define quanto é cobrado é a cobrança já criada
//     na Asaas, resolvida no servidor pelo short_code.
// ─────────────────────────────────────────────────────────────────────────────

/** Resultado normalizado da tentativa (espelha a allowlist da edge). */
export type CardPayStatus = 'approved' | 'processing' | 'already_paid';

/** Dados que o CardPaymentForm entrega no onSubmit (subconjunto usado aqui). */
export interface CheckoutCardInput {
  holderName: string;
  holderEmail: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
  holderCpf: string;
  holderPhone: string;
  holderPostalCode: string;
  holderAddressNumber: string;
}

export interface CardPayResult {
  status: CardPayStatus;
  message: string;
}

/** Lê a mensagem PT-BR da edge (corpo não-2xx vem em error.context). */
async function extractCheckoutError(
  error: unknown,
  data: unknown,
  fallback: string,
): Promise<string> {
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    return String((data as { error: string }).error);
  }
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx === 'object' && typeof (ctx as Response).json === 'function') {
    try {
      const body = await (ctx as Response).clone().json();
      if (body?.error) return String(body.error);
    } catch {
      /* corpo não-JSON — ignora */
    }
  }
  return fallback;
}

export function usePayTenantChargeWithCard(shortCode: string | undefined) {
  const [isPaying, setIsPaying] = useState(false);

  const payWithCard = useCallback(
    async (card: CheckoutCardInput, fallbackError: string): Promise<CardPayResult> => {
      if (!shortCode) throw new Error(fallbackError);
      setIsPaying(true);
      try {
        const { data, error } = await supabase.functions.invoke(
          'tenant-asaas-pay-charge-card',
          {
            body: {
              short_code: shortCode,
              card: {
                holder_name: card.holderName,
                number: card.number,
                expiry_month: card.expiryMonth,
                expiry_year: card.expiryYear,
                ccv: card.ccv,
              },
              holder: {
                name: card.holderName,
                email: card.holderEmail,
                cpf_cnpj: card.holderCpf,
                phone: card.holderPhone,
                postal_code: card.holderPostalCode,
                address_number: card.holderAddressNumber,
              },
            },
          },
        );
        if (error) throw new Error(await extractCheckoutError(error, data, fallbackError));
        const body = (data ?? {}) as { status?: string; message?: string; error?: string };
        if (body.error) throw new Error(body.error);
        const status = body.status;
        if (status !== 'approved' && status !== 'processing' && status !== 'already_paid') {
          throw new Error(fallbackError);
        }
        return { status, message: body.message ?? '' };
      } finally {
        setIsPaying(false);
      }
    },
    [shortCode],
  );

  return { payWithCard, isPaying };
}
