import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { GOODS_FISCAL_ROOT } from '@/hooks/useGoodsFiscalAccess';
import { goodsFiscalError } from '@/lib/fiscal/goodsErrors';

export interface GoodsFiscalSettings {
  nfe: { enabled: boolean; series: number; nextNumber: number; homologationApproved: boolean; productionApproved: boolean; defaultOperationNature: string };
  nfce: { enabled: boolean; series: number; nextNumber: number; homologationApproved: boolean; productionApproved: boolean; uf: string; afterPaymentMode: 'off' | 'ask' | 'automatic'; defaultOperationNature: string; includeIdentifiedConsumer: boolean; openDanfceAfterAuthorization: boolean; automaticCanaryApproved: boolean };
}

const EMPTY: GoodsFiscalSettings = {
  nfe: { enabled: false, series: 1, nextNumber: 1, homologationApproved: false, productionApproved: false, defaultOperationNature: '' },
  nfce: { enabled: false, series: 1, nextNumber: 1, homologationApproved: false, productionApproved: false, uf: '', afterPaymentMode: 'ask', defaultOperationNature: 'VENDA A CONSUMIDOR', includeIdentifiedConsumer: true, openDanfceAfterAuthorization: false, automaticCanaryApproved: false },
};

type Result = { data: unknown; error: { message?: string } | null };
type Builder = { select: (columns: string) => { eq: (column: string, value: string) => { maybeSingle: () => Promise<Result> } } };
const table = (name: string) => (supabase.from as unknown as (table: string) => Builder)(name);
const row = (value: unknown) => value && typeof value === 'object' ? value as Record<string, unknown> : {};

export function useGoodsFiscalSettings() {
  const { user, profile, profileLoading, permissions } = useAuth();
  const companyId = profile?.user_id === user?.id ? profile?.company_id : null;
  const queryClient = useQueryClient();
  const queryKey = [...GOODS_FISCAL_ROOT, companyId, user?.id, [...permissions].sort().join('|'), 'settings'];
  const query = useQuery({
    queryKey, enabled: !!companyId && !!user?.id && !profileLoading,
    queryFn: async (): Promise<GoodsFiscalSettings> => {
      const [nfeResult, nfceResult] = await Promise.all([
        table('company_nfe_settings').select('enabled, series, next_number, homologation_approved, production_approved, default_operation_nature').eq('company_id', companyId!).maybeSingle(),
        table('company_nfce_settings').select('enabled, series, next_number, homologation_approved, production_approved, uf, after_payment_mode, default_operation_nature, include_identified_consumer, open_danfce_after_authorization, automatic_canary_approved').eq('company_id', companyId!).maybeSingle(),
      ]);
      if (nfeResult.error) throw new Error('Não foi possível carregar a configuração de NF-e.');
      if (nfceResult.error) throw new Error('Não foi possível carregar a configuração de NFC-e.');
      const nfe = row(nfeResult.data); const nfce = row(nfceResult.data);
      return {
        nfe: { enabled: nfe.enabled === true, series: Number(nfe.series || 1), nextNumber: Number(nfe.next_number || 1), homologationApproved: nfe.homologation_approved === true, productionApproved: nfe.production_approved === true, defaultOperationNature: String(nfe.default_operation_nature || '') },
        nfce: { enabled: nfce.enabled === true, series: Number(nfce.series || 1), nextNumber: Number(nfce.next_number || 1), homologationApproved: nfce.homologation_approved === true, productionApproved: nfce.production_approved === true, uf: String(nfce.uf || ''), afterPaymentMode: nfce.after_payment_mode === 'off' ? 'off' : nfce.after_payment_mode === 'automatic' ? 'automatic' : 'ask', defaultOperationNature: String(nfce.default_operation_nature || 'VENDA A CONSUMIDOR'), includeIdentifiedConsumer: nfce.include_identified_consumer !== false, openDanfceAfterAuthorization: nfce.open_danfce_after_authorization === true, automaticCanaryApproved: nfce.automatic_canary_approved === true },
      };
    },
  });
  const save = useMutation({
    mutationFn: async (settings: GoodsFiscalSettings) => {
      const { data, error } = await supabase.functions.invoke('fiscal-goods-settings', { body: settings });
      if (error) throw new Error('Não foi possível salvar as configurações fiscais. Confira seu acesso administrativo.');
      const response = row(data); if (response.error) throw new Error(goodsFiscalError(response));
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  return { settings: companyId && user?.id && !profileLoading ? query.data ?? EMPTY : EMPTY, isLoading: query.isLoading, isError: query.isError, save: save.mutateAsync, isSaving: save.isPending, refetch: query.refetch };
}
