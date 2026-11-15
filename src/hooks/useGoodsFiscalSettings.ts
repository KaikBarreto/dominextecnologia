import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';

export interface GoodsFiscalSettings {
  nfe: { enabled: boolean; series: number; nextNumber: number; homologationApproved: boolean; productionApproved: boolean; defaultOperationNature: string };
  nfce: { enabled: boolean; series: number; nextNumber: number; homologationApproved: boolean; productionApproved: boolean; uf: string };
}

const EMPTY: GoodsFiscalSettings = {
  nfe: { enabled: false, series: 1, nextNumber: 1, homologationApproved: false, productionApproved: false, defaultOperationNature: '' },
  nfce: { enabled: false, series: 1, nextNumber: 1, homologationApproved: false, productionApproved: false, uf: '' },
};

type Result = { data: unknown; error: { message?: string } | null };
type Builder = { select: (columns: string) => { eq: (column: string, value: string) => { maybeSingle: () => Promise<Result> } } };
const table = (name: string) => (supabase.from as unknown as (table: string) => Builder)(name);
const row = (value: unknown) => value && typeof value === 'object' ? value as Record<string, unknown> : {};

export function useGoodsFiscalSettings() {
  const { companyId } = useUserCompany();
  const queryClient = useQueryClient();
  const queryKey = ['goods-fiscal-settings', companyId];
  const query = useQuery({
    queryKey, enabled: !!companyId,
    queryFn: async (): Promise<GoodsFiscalSettings> => {
      const [nfeResult, nfceResult] = await Promise.all([
        table('company_nfe_settings').select('enabled, series, next_number, homologation_approved, production_approved, default_operation_nature').eq('company_id', companyId!).maybeSingle(),
        table('company_nfce_settings').select('enabled, series, next_number, homologation_approved, production_approved, uf').eq('company_id', companyId!).maybeSingle(),
      ]);
      if (nfeResult.error) throw new Error(nfeResult.error.message || 'Falha ao carregar NF-e.');
      if (nfceResult.error) throw new Error(nfceResult.error.message || 'Falha ao carregar NFC-e.');
      const nfe = row(nfeResult.data); const nfce = row(nfceResult.data);
      return {
        nfe: { enabled: nfe.enabled === true, series: Number(nfe.series || 1), nextNumber: Number(nfe.next_number || 1), homologationApproved: nfe.homologation_approved === true, productionApproved: nfe.production_approved === true, defaultOperationNature: String(nfe.default_operation_nature || '') },
        nfce: { enabled: nfce.enabled === true, series: Number(nfce.series || 1), nextNumber: Number(nfce.next_number || 1), homologationApproved: nfce.homologation_approved === true, productionApproved: nfce.production_approved === true, uf: String(nfce.uf || '') },
      };
    },
  });
  const save = useMutation({
    mutationFn: async (settings: GoodsFiscalSettings) => {
      const { data, error } = await supabase.functions.invoke('fiscal-goods-settings', { body: settings });
      if (error) throw new Error(error.message || 'Não foi possível salvar as configurações.');
      const response = row(data); if (response.error) throw new Error(String(response.message || 'Não foi possível salvar as configurações.'));
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  return { settings: query.data ?? EMPTY, isLoading: query.isLoading, isError: query.isError, save: save.mutateAsync, isSaving: save.isPending, refetch: query.refetch };
}
