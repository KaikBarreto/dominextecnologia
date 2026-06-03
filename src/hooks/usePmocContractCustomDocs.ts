import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserCompanyId } from '@/hooks/useUserCompany';
import { getErrorMessage } from '@/utils/errorMessages';

/**
 * Leitura/edição dos textos rich-text dos documentos PMOC do contrato (Onda C).
 *
 * Tabela `pmoc_contract_documents_custom` armazena, por contrato:
 *  - `termo_rt_content` — HTML editado do Termo de Responsabilidade Técnica.
 *  - `certificado_content` — HTML editado do Certificado de Conformidade.
 *
 * Quando a coluna correspondente é `NULL`, a edge function de geração de PDF
 * usa o template padrão. "Restaurar texto padrão" no UI corresponde a
 * `NULL` aqui.
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §1.1a / §4.1 / §5.3
 */

export interface PmocCustomDocs {
  contract_id: string;
  company_id: string;
  termo_rt_content: string | null;
  certificado_content: string | null;
  termo_rt_updated_at: string | null;
  certificado_updated_at: string | null;
  updated_by: string | null;
  created_at: string;
}

export function usePmocContractCustomDocs(contractId: string | null | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['pmoc-contract-custom-docs', contractId],
    enabled: !!contractId,
    staleTime: 10_000,
    queryFn: async (): Promise<PmocCustomDocs | null> => {
      if (!contractId) return null;
      const { data, error } = await supabase
        .from('pmoc_contract_documents_custom')
        .select('*')
        .eq('contract_id', contractId)
        .maybeSingle();

      if (error) {
        const code = (error as { code?: string }).code;
        if (code === '42P01' || /relation .* does not exist/i.test(error.message)) {
          return null;
        }
        console.warn('[usePmocContractCustomDocs] erro:', error.message);
        return null;
      }
      return (data as PmocCustomDocs | null) ?? null;
    },
  });

  /**
   * Upsert do campo informado. `field` mapeia para a coluna no banco.
   * - field='termo_rt' → atualiza `termo_rt_content` + `termo_rt_updated_at`.
   * - field='certificado' → atualiza `certificado_content` + `certificado_updated_at`.
   */
  async function upsertField(
    field: 'termo_rt' | 'certificado',
    html: string | null,
  ): Promise<void> {
    if (!contractId) throw new Error('Contrato não identificado.');
    const company_id = await getCurrentUserCompanyId();
    const nowIso = new Date().toISOString();

    const payload: Record<string, unknown> = {
      contract_id: contractId,
      company_id,
      updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    };

    if (field === 'termo_rt') {
      payload.termo_rt_content = html;
      payload.termo_rt_updated_at = html === null ? null : nowIso;
    } else {
      payload.certificado_content = html;
      payload.certificado_updated_at = html === null ? null : nowIso;
    }

    const { error } = await supabase
      .from('pmoc_contract_documents_custom')
      .upsert(payload as never, { onConflict: 'contract_id' });

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === '42P01') {
        throw new Error('Recurso em deploy. Aguarde a próxima atualização para editar os textos.');
      }
      throw error;
    }
  }

  const saveTermoRTMutation = useMutation({
    mutationFn: (html: string) => upsertField('termo_rt', html),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pmoc-contract-custom-docs', contractId] });
      toast({ title: 'Termo de Responsabilidade Técnica salvo!' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: getErrorMessage(err) });
    },
  });

  const saveCertificadoMutation = useMutation({
    mutationFn: (html: string) => upsertField('certificado', html),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pmoc-contract-custom-docs', contractId] });
      toast({ title: 'Certificado de Conformidade salvo!' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: getErrorMessage(err) });
    },
  });

  const resetTermoRTMutation = useMutation({
    mutationFn: () => upsertField('termo_rt', null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pmoc-contract-custom-docs', contractId] });
      toast({ title: 'Termo restaurado ao texto padrão' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao restaurar', description: getErrorMessage(err) });
    },
  });

  const resetCertificadoMutation = useMutation({
    mutationFn: () => upsertField('certificado', null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pmoc-contract-custom-docs', contractId] });
      toast({ title: 'Certificado restaurado ao texto padrão' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao restaurar', description: getErrorMessage(err) });
    },
  });

  return {
    customDocs: query.data ?? null,
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
