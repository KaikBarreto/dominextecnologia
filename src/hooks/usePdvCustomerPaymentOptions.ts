import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';

type RpcResult = { data: unknown; error: { details?: string; message?: string } | null };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;

export interface PdvCustomerVoucherOption {
  id: string;
  code: string;
  balance: number;
  expiresOn: string | null;
}

export interface PdvCustomerPaymentOptions {
  availableCredit: number;
  vouchers: PdvCustomerVoucherOption[];
}

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function projectPdvCustomerPaymentOptions(value: unknown): PdvCustomerPaymentOptions {
  const payload = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const vouchers = Array.isArray(payload.vouchers) ? payload.vouchers : [];
  return {
    availableCredit: safeNumber(payload.available_credit),
    vouchers: vouchers.flatMap((raw) => {
      const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      if (typeof item.id !== 'string' || typeof item.public_code !== 'string') return [];
      return [{
        id: item.id,
        code: item.public_code,
        balance: safeNumber(item.balance),
        expiresOn: typeof item.expires_on === 'string' ? item.expires_on : null,
      }];
    }),
  };
}

export function usePdvCustomerPaymentOptions(customerId: string | null | undefined, enabled = true) {
  const scope = usePdvAuthorizedQueryScope();
  return useQuery({
    queryKey: ['pdv-customer-payment-options', ...scope.key, customerId ?? null],
    enabled: enabled && scope.ready && Boolean(customerId),
    queryFn: async () => {
      const { data, error } = await rpc('pdv_get_customer_payment_options_v3', {
        p_customer_id: customerId,
      });
      if (error) throw new Error('Não foi possível carregar o saldo e os vouchers deste cliente.');
      return projectPdvCustomerPaymentOptions(data);
    },
    // A tela oferece recuperação explícita. Evita esconder o erro por vários
    // segundos enquanto o React Query repete a mesma consulta em silêncio.
    retry: false,
    staleTime: 15_000,
    gcTime: 0,
  });
}
