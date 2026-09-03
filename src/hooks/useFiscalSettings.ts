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
 * municipio_ibge, fiscal_ambiente (homologacao|producao), reg_ap_trib_sn.
 *
 * Campos READ-ONLY vindos do backend (preenchidos pelas edges de onboarding):
 * fisqal_company_id, fisqal_certificate_id, certificate_expires_at, pode_emitir.
 * Nunca gravamos esses pelo client — só as edges Fisqal os escrevem.
 */

export type FiscalAmbiente = 'homologacao' | 'producao';

/**
 * Regime de apuração dos tributos no Simples Nacional (layout nacional da NFS-e).
 * '1' = tributos federais e municipal (ISS) recolhidos pelo Simples Nacional
 * '2' = tributos federais pelo Simples Nacional e ISS recolhido por fora
 * '3' = tributos federais e municipal recolhidos por fora do Simples Nacional
 * Só é exigido quando a empresa é optante do Simples Nacional.
 */
export type RegApTribSN = '1' | '2' | '3';

/** Normaliza qualquer valor para o enum '1' | '2' | '3' (default '1'). */
export function normalizeRegApTribSN(value: unknown): RegApTribSN {
  return value === '2' || value === '3' ? value : '1';
}

/**
 * CRITÉRIO ÚNICO de "empresa pronta pra emitir NFS-e".
 *
 * `pode_emitir` sozinho NÃO basta: essa flag só diz que o MUNICÍPIO está
 * coberto (é a única coisa que a checagem de cobertura sabe). Emitir de verdade
 * exige também a empresa registrada na emissão fiscal e o certificado A1 no ar.
 * Qualquer tela que pergunte "já dá pra emitir?" tem que usar isto.
 */
export function isFiscalReadyToEmit(
  s: Pick<FiscalSettings, 'pode_emitir' | 'fisqal_company_id' | 'fisqal_certificate_id'>,
): boolean {
  return !!s.pode_emitir && !!s.fisqal_company_id && !!s.fisqal_certificate_id;
}

export interface FiscalSettings {
  // Editáveis
  regime_tributario: string | null;
  inscricao_municipal: string | null;
  inscricao_estadual: string | null;
  codigo_servico_default: string | null;
  codigo_nbs_default: string | null;
  item_lc116: string | null;
  iss_aliquota: number | null;
  municipio_ibge: string | null;
  fiscal_ambiente: FiscalAmbiente;
  reg_ap_trib_sn: RegApTribSN;
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
  | 'codigo_nbs_default'
  | 'item_lc116'
  | 'iss_aliquota'
  | 'municipio_ibge'
  | 'fiscal_ambiente'
  | 'reg_ap_trib_sn'
>;

const EMPTY: FiscalSettings = {
  regime_tributario: null,
  inscricao_municipal: null,
  inscricao_estadual: null,
  codigo_servico_default: null,
  codigo_nbs_default: null,
  item_lc116: null,
  iss_aliquota: null,
  municipio_ibge: null,
  fiscal_ambiente: 'homologacao',
  reg_ap_trib_sn: '1',
  fisqal_company_id: null,
  fisqal_certificate_id: null,
  certificate_expires_at: null,
  pode_emitir: false,
};

const SELECT_COLS =
  'regime_tributario, inscricao_municipal, inscricao_estadual, codigo_servico_default, codigo_nbs_default, item_lc116, iss_aliquota, municipio_ibge, fiscal_ambiente, reg_ap_trib_sn, fisqal_company_id, fisqal_certificate_id, certificate_expires_at, pode_emitir';

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
        // `reg_ap_trib_sn` tem CHECK ('1'|'2'|'3') no banco, mas normalizamos aqui
        // também para blindar linhas antigas/nulas.
        reg_ap_trib_sn: normalizeRegApTribSN(
          (data as { reg_ap_trib_sn?: unknown }).reg_ap_trib_sn,
        ),
      } as FiscalSettings;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: Partial<FiscalSettingsEditable>) => {
      if (!companyId) throw new Error('Empresa não identificada.');
      // Normaliza o regime de apuração do Simples (CHECK '1'|'2'|'3' no banco).
      const normalized: Partial<FiscalSettingsEditable> = { ...values };
      if ('reg_ap_trib_sn' in normalized) {
        normalized.reg_ap_trib_sn = normalizeRegApTribSN(normalized.reg_ap_trib_sn);
      }
      // upsert por company_id: cria a linha se ainda não existir (1ª config).
      const { error } = await supabase
        .from('company_fiscal_settings')
        .upsert(
          {
            company_id: companyId,
            ...normalized,
          },
          { onConflict: 'company_id' },
        );
      if (error) throw new Error(getErrorMessage(error, 'Não foi possível salvar as configurações fiscais.'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const settings = query.data ?? EMPTY;

  return {
    settings,
    /** Empresa realmente apta a emitir (município + registro + certificado). */
    readyToEmit: isFiscalReadyToEmit(settings),
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    /** Invalida a query para refletir mudanças feitas pelas edges de onboarding. */
    invalidate: () => queryClient.invalidateQueries({ queryKey }),
  };
}
