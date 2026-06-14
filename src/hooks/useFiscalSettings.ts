import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import { getErrorMessage } from '@/utils/errorMessages';

/**
 * Fronteira do Supabase para a configuração fiscal (NFS-e via Fisqal) da própria
 * empresa. own-row em `company_fiscal_settings` (RLS por company_id) — padrão
 * maybeSingle + upsert otimista, igual a useUserPreferences/useCompanySettings.
 *
 * Campos EDITÁVEIS pelo tenant: regime_tributario, inscricao_municipal,
 * inscricao_estadual, codigo_servico_default, item_lc116, iss_aliquota,
 * municipio_ibge, fiscal_ambiente (homologacao|producao).
 *
 * Campos READ-ONLY vindos do backend (preenchidos pelas edges de onboarding):
 * fisqal_company_id, fisqal_certificate_id, certificate_expires_at, pode_emitir.
 * Nunca gravamos esses pelo client — só as edges Fisqal os escrevem.
 */

export type FiscalAmbiente = 'homologacao' | 'producao';

export interface FiscalSettings {
  // Editáveis
  regime_tributario: string | null;
  inscricao_municipal: string | null;
  inscricao_estadual: string | null;
  codigo_servico_default: string | null;
  item_lc116: string | null;
  iss_aliquota: number | null;
  municipio_ibge: string | null;
  fiscal_ambiente: FiscalAmbiente;
  // Read-only (backend)
  fisqal_company_id: string | null;
  fisqal_certificate_id: string | null;
  certificate_expires_at: string | null;
  pode_emitir: boolean;
}

/** Subconjunto que o tenant pode gravar pela tela. */
export type FiscalSettingsEditable = Pick<
  FiscalSettings,
  | 'regime_tributario'
  | 'inscricao_municipal'
  | 'inscricao_estadual'
  | 'codigo_servico_default'
  | 'item_lc116'
  | 'iss_aliquota'
  | 'municipio_ibge'
  | 'fiscal_ambiente'
>;

const EMPTY: FiscalSettings = {
  regime_tributario: null,
  inscricao_municipal: null,
  inscricao_estadual: null,
  codigo_servico_default: null,
  item_lc116: null,
  iss_aliquota: null,
  municipio_ibge: null,
  fiscal_ambiente: 'homologacao',
  fisqal_company_id: null,
  fisqal_certificate_id: null,
  certificate_expires_at: null,
  pode_emitir: false,
};

const SELECT_COLS =
  'regime_tributario, inscricao_municipal, inscricao_estadual, codigo_servico_default, item_lc116, iss_aliquota, municipio_ibge, fiscal_ambiente, fisqal_company_id, fisqal_certificate_id, certificate_expires_at, pode_emitir';

export function useFiscalSettings() {
  const { companyId } = useUserCompany();
  const queryClient = useQueryClient();
  const queryKey = ['fiscal-settings', companyId];

  const query = useQuery({
    queryKey,
    enabled: !!companyId,
    queryFn: async (): Promise<FiscalSettings> => {
      const { data, error } = await supabase
        .from('company_fiscal_settings')
        .select(SELECT_COLS)
        .eq('company_id', companyId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return EMPTY;
      return {
        ...EMPTY,
        ...data,
        // `fiscal_ambiente` no banco é text livre — normaliza pro union.
        fiscal_ambiente: data.fiscal_ambiente === 'producao' ? 'producao' : 'homologacao',
      } as FiscalSettings;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: Partial<FiscalSettingsEditable>) => {
      if (!companyId) throw new Error('Empresa não identificada.');
      // upsert por company_id: cria a linha se ainda não existir (1ª config).
      const { error } = await supabase
        .from('company_fiscal_settings')
        .upsert(
          {
            company_id: companyId,
            ...values,
          },
          { onConflict: 'company_id' },
        );
      if (error) throw new Error(getErrorMessage(error, 'Não foi possível salvar as configurações fiscais.'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    settings: query.data ?? EMPTY,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    /** Invalida a query para refletir mudanças feitas pelas edges de onboarding. */
    invalidate: () => queryClient.invalidateQueries({ queryKey }),
  };
}
