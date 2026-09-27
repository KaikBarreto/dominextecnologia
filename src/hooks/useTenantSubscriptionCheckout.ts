import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Fronteira pública do checkout de assinatura (/assinar/:code). A edge é
// anônima e deve devolver somente esta allowlist. O parser abaixo reconstrói o
// objeto campo a campo para que IDs, documentos, contatos ou metadados extras
// nunca parem no cache do React Query por engano.

export type SubscriptionCheckoutKind = 'asaas' | 'pix_auto';

export interface TenantSubscriptionCheckoutPayload {
  checkout: {
    kind: SubscriptionCheckoutKind;
    status: string;
    expires_at: string | null;
    checkout_url: string | null;
    qr_code: string | null;
    copy_paste: string | null;
  };
  subscription: {
    description: string | null;
    value: number;
    cycle: string;
    next_due_date: string | null;
    billing_type: string;
  };
  merchant: {
    name: string;
    logo_url: string | null;
  };
  customer: {
    first_name: string | null;
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** URL externa só é aceita no ramo Asaas e apenas em HTTPS da própria Asaas. */
function safeAsaasUrl(value: unknown): string | null {
  const raw = nullableString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const trustedHost = url.hostname === 'asaas.com' || url.hostname.endsWith('.asaas.com');
    return url.protocol === 'https:' && trustedHost ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Logo pode vir do Storage/CDN do tenant, mas nunca aceita protocolo ativo. */
function safeImageUrl(value: unknown): string | null {
  const raw = nullableString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function firstNameOnly(value: unknown): string | null {
  const name = nullableString(value);
  return name ? name.split(/\s+/)[0].slice(0, 80) : null;
}

export function parseTenantSubscriptionCheckout(
  value: unknown,
): TenantSubscriptionCheckoutPayload | null {
  const root = record(value);
  const checkout = record(root?.checkout);
  const subscription = record(root?.subscription);
  const merchant = record(root?.merchant);
  const customer = record(root?.customer);
  const kind = checkout?.kind;
  const status = nullableString(checkout?.status);
  const merchantName = nullableString(merchant?.name);
  const amount = subscription?.value;
  const cycle = nullableString(subscription?.cycle);
  const billingType = nullableString(subscription?.billing_type);

  if (
    (kind !== 'asaas' && kind !== 'pix_auto') ||
    !status ||
    !merchantName ||
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    !cycle ||
    !billingType
  ) return null;

  return {
    checkout: {
      kind,
      status,
      expires_at: nullableString(checkout.expires_at),
      checkout_url: kind === 'asaas' ? safeAsaasUrl(checkout.checkout_url) : null,
      qr_code: nullableString(checkout.qr_code),
      copy_paste: nullableString(checkout.copy_paste),
    },
    subscription: {
      description: nullableString(subscription.description),
      value: amount,
      cycle,
      next_due_date: nullableString(subscription.next_due_date),
      billing_type: billingType,
    },
    merchant: {
      name: merchantName.slice(0, 160),
      logo_url: safeImageUrl(merchant.logo_url),
    },
    customer: {
      // Defesa em profundidade: mesmo se a edge errar e mandar nome completo,
      // esta rota pública guarda/exibe apenas o primeiro token.
      first_name: firstNameOnly(customer?.first_name),
    },
  };
}

async function checkoutErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.clone().json();
      if (typeof body?.error === 'string' && body.error.trim()) return body.error;
    } catch {
      // Corpo não-JSON: usa mensagem pública genérica abaixo.
    }
  }
  return 'Não foi possível carregar este link de assinatura.';
}

const LIVE_STATUSES = new Set(['pending', 'awaiting_authorization', 'created']);

export function useTenantSubscriptionCheckout(shortCode: string | undefined) {
  return useQuery({
    queryKey: ['tenant-subscription-checkout', shortCode],
    enabled: !!shortCode,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    // O consentimento acontece no app do banco. Revalida enquanto pendente para
    // a própria página virar "autorizado" sem depender de reload manual.
    refetchInterval: (query) => {
      const status = query.state.data?.checkout.status.toLowerCase();
      return status && LIVE_STATUSES.has(status) ? 5_000 : false;
    },
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<TenantSubscriptionCheckoutPayload> => {
      if (!shortCode) throw new Error('Link de assinatura inválido.');
      const { data, error } = await supabase.functions.invoke(
        'get-tenant-subscription-checkout',
        { body: { short_code: shortCode } },
      );
      if (error) throw new Error(await checkoutErrorMessage(error));

      const payload = parseTenantSubscriptionCheckout(data);
      if (!payload) throw new Error('Este link de assinatura está indisponível.');
      return payload;
    },
  });
}

