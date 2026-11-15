import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';

type RpcResult = { data: unknown; error: { message?: string } | null };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;

export function projectPdvSupplierCredit(value: unknown): number {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return typeof row.available_credit === 'number' && Number.isFinite(row.available_credit)
    ? row.available_credit
    : 0;
}

export function usePdvSupplierCredit(supplierId: string | null | undefined) {
  const scope = usePdvAuthorizedQueryScope();
  return useQuery({
    queryKey: ['pdv-supplier-credit', ...scope.key, supplierId ?? null],
    enabled: scope.ready && Boolean(supplierId),
    queryFn: async () => {
      const { data, error } = await rpc('pdv_get_supplier_payment_option_v3', { p_supplier_id: supplierId });
      if (error) throw new Error('Não foi possível consultar o saldo do fornecedor.');
      return projectPdvSupplierCredit(data);
    },
    retry: false,
    staleTime: 15_000,
    gcTime: 0,
  });
}
