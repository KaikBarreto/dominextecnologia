import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserCompanyId } from '@/hooks/useUserCompany';
import { getErrorMessage } from '@/utils/errorMessages';

/**
 * Leitura/edição dos MODELOS PADRÃO de documentos PMOC a NÍVEL DE EMPRESA.
 *
 * Espelha `usePmocContractCustomDocs`, mas a chave é `company_id` (não
 * `contract_id`). A tabela `company_pmoc_document_templates` guarda, por
 * empresa, os textos rich-text usados como ponto de partida ao criar um novo
 * contrato PMOC:
 *  - `termo_rt_content` — HTML do Termo de Responsabilidade Técnica padrão.
 *  - `certificado_content` — HTML do Certificado de Conformidade padrão.
 *
 * Quando a coluna correspondente é `NULL` (ou a linha não existe ainda), o
 * sistema usa o template default de código (`buildDefaultTermoRtHtml` /
 * `buildDefaultCertificadoHtml`). "Restaurar texto padrão" no UI corresponde a
 * `NULL` aqui.
 *
 * A tabela usa `company_id` como PK e os triggers no servidor preenchem
 * `company_id`/`updated_by`/`updated_at`. O client inclui `company_id` no
 * payload do upsert só pra casar a PK no `onConflict`.
 */

export interface CompanyPmocDocTemplates {
  company_id: string;
  termo_rt_content: string | null;
  certificado_content: string | null;
  updated_at: string | null;
  updated_by: string | null;
  created_at: string;
}

export function useCompanyPmocDocTemplates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['company-pmoc-doc-templates'],
    staleTime: 10_000,
    queryFn: async (): Promise<CompanyPmocDocTemplates | null> => {
      const companyId = await getCurrentUserCompanyId();
      const { data, error } = await supabase
        .from('company_pmoc_document_templates')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) {
        const code = (error as { code?: string }).code;
        if (code === '42P01' || /relation .* does not exist/i.test(error.message)) {
          return null;
        }
        console.warn('[useCompanyPmocDocTemplates] erro:', error.message);
        return null;
      }
      return (data as CompanyPmocDocTemplates | null) ?? null;
    },
  });

  /**
   * Upsert do campo informado. `field` mapeia para a coluna no banco.
   * - field='termo_rt' → atualiza `termo_rt_content`.
   * - field='certificado' → atualiza `certificado_content`.
   *
   * `company_id` vai no payload pra casar a PK no `onConflict`. Os triggers no
   * servidor reescrevem `company_id`/`updated_by`/`updated_at` de qualquer forma.
   */
  async function upsertField(
    field: 'termo_rt' | 'certificado',
    html: string | null,
  ): Promise<void> {
    const company_id = await getCurrentUserCompanyId();

    const payload: Record<string, unknown> = { company_id };
    if (field === 'termo_rt') {
      payload.termo_rt_content = html;
    } else {
      payload.certificado_content = html;
    }

    const { error } = await supabase
      .from('company_pmoc_document_templates')
      .upsert(payload as never, { onConflict: 'company_id' });

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === '42P01') {
        throw new Error('Recurso em deploy. Aguarde a próxima atualização para editar os modelos.');
      }
      throw error;
    }
  }

  const saveTermoRTMutation = useMutation({
    mutationFn: (html: string) => upsertField('termo_rt', html),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-pmoc-doc-templates'] });
      toast({ title: 'Modelo de Termo de Responsabilidade Técnica salvo!' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: getErrorMessage(err) });
    },
  });

  const saveCertificadoMutation = useMutation({
    mutationFn: (html: string) => upsertField('certificado', html),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-pmoc-doc-templates'] });
      toast({ title: 'Modelo de Certificado de Conformidade salvo!' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: getErrorMessage(err) });
    },
  });

  const resetTermoRTMutation = useMutation({
    mutationFn: () => upsertField('termo_rt', null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-pmoc-doc-templates'] });
      toast({ title: 'Modelo restaurado ao texto padrão' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao restaurar', description: getErrorMessage(err) });
    },
  });

  const resetCertificadoMutation = useMutation({
    mutationFn: () => upsertField('certificado', null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-pmoc-doc-templates'] });
      toast({ title: 'Modelo restaurado ao texto padrão' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao restaurar', description: getErrorMessage(err) });
    },
  });

  return {
    templates: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    saveTermoRT: (html: string) => saveTermoRTMutation.mutateAsync(html),
    saveCertificado: (html: string) => saveCertificadoMutation.mutateAsync(html),
    resetTermoRTToDefault: () => resetTermoRTMutation.mutateAsync(),
    resetCertificadoToDefault: () => resetCertificadoMutation.mutateAsync(),
    isSaving:
      saveTermoRTMutation.isPending ||
      saveCertificadoMutation.isPending ||
      resetTermoRTMutation.isPending ||
      resetCertificadoMutation.isPending,
  };
}
