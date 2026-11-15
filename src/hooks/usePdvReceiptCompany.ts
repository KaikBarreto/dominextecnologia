import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';
import type { PdvReceiptSnapshot } from '@/lib/pdv/receipt/model';
import { PDV_RECEIPT_COMPANY_QUERY_ROOT } from '@/lib/pdv/receipt/cacheKeys';

export const PDV_RECEIPT_COMPANY_PENDING = 'Aguarde a identificação da empresa para gerar o comprovante. Se não carregar, atualize a página.';

type RpcCaller = (name: string) => Promise<{ data: unknown; error: unknown }>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;
const nullableText = (value: unknown) => typeof value === 'string' ? value : null;

/** Identidade operacional autorizada; nunca reutiliza o branding decorativo do painel master. */
export function projectPdvReceiptCompany(payload: unknown, expectedCompanyId: string): PdvReceiptSnapshot['company'] | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>;
  if (value.company_id !== expectedCompanyId || typeof value.name !== 'string' || !value.name.trim()
    || typeof value.white_label_enabled !== 'boolean') return null;
  return {
    name: value.name,
    document: nullableText(value.document),
    address: nullableText(value.address),
    phone: nullableText(value.phone),
    logoUrl: nullableText(value.logo_url),
    timeZone: nullableText(value.time_zone),
    whiteLabelEnabled: value.white_label_enabled,
  };
}

export function usePdvReceiptCompany(): PdvReceiptSnapshot['company'] | null {
  const { user, profile, loading, profileLoading } = useAuth();
  const scope = usePdvAuthorizedQueryScope();
  const companyId = profile?.company_id;
  const ready = scope.ready && Boolean(user?.id && profile?.user_id === user.id && companyId && loading === false && profileLoading === false);
  const query = useQuery({
    queryKey: [...PDV_RECEIPT_COMPANY_QUERY_ROOT, ...scope.key],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await rpc('pdv_get_receipt_company_v3');
      if (error) throw new Error(PDV_RECEIPT_COMPANY_PENDING);
      const company = projectPdvReceiptCompany(data, companyId!);
      if (!company) throw new Error(PDV_RECEIPT_COMPANY_PENDING);
      return company;
    },
    staleTime: 30_000,
    gcTime: 0,
  });
  if (!ready || query.isLoading || query.isFetching || query.isError) return null;
  return query.data ?? null;
}
