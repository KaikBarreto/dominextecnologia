import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserCompanyId } from '@/hooks/useUserCompany';
import { getErrorMessage } from '@/utils/errorMessages';
import type { DocArtConfig } from '@/lib/docArt/types';

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
  /**
   * Slug do template visual (arte) do Certificado deste CONTRATO, sobrepondo
   * o padrão da empresa. `null` = herda o que a empresa configurou em
   * `company_pmoc_document_templates` (ou texto puro, se a empresa também
   * não configurou nada). Ver `resolveEffectiveArt` na edge function.
   */
  certificado_art_slug: string | null;
  /** Config da arte deste contrato. `null` junto de `certificado_art_slug: null` = herda da empresa. */
  certificado_art_config: DocArtConfig | null;
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

  /**
   * Upsert da ARTE do Certificado (slug + config) deste CONTRATO — sobrepõe o
   * padrão da empresa. `slug: null` + `config: null` volta a HERDAR o que a
   * empresa tiver configurado (ver `resolveEffectiveArt` na edge function).
   */
  async function upsertCertificadoArt(
    slug: string | null,
    config: DocArtConfig | null,
  ): Promise<void> {
    if (!contractId) throw new Error('Contrato não identificado.');
    const company_id = await getCurrentUserCompanyId();

    const { error } = await supabase
      .from('pmoc_contract_documents_custom')
      .upsert(
        {
          contract_id: contractId,
          company_id,
          updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
          certificado_art_slug: slug,
          certificado_art_config: config as never,
        } as never,
        { onConflict: 'contract_id' },
      );

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === '42P01') {
        throw new Error('Recurso em deploy. Aguarde a próxima atualização para configurar a arte do certificado.');
      }
      throw error;
    }
  }

  const saveCertificadoArtMutation = useMutation({
    mutationFn: ({ slug, config }: { slug: string | null; config: DocArtConfig | null }) =>
      upsertCertificadoArt(slug, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pmoc-contract-custom-docs', contractId] });
      toast({ title: 'Modelo visual do Certificado salvo!' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao salvar o modelo visual', description: getErrorMessage(err) });
    },
  });

  const resetCertificadoArtMutation = useMutation({
    mutationFn: () => upsertCertificadoArt(null, null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pmoc-contract-custom-docs', contractId] });
      toast({ title: 'Modelo visual restaurado ao padrão da empresa' });
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
    saveCertificadoArt: (slug: string | null, config: DocArtConfig | null) =>
      saveCertificadoArtMutation.mutateAsync({ slug, config }),
    resetCertificadoArtToDefault: () => resetCertificadoArtMutation.mutateAsync(),
    isSavingCertificadoArt: saveCertificadoArtMutation.isPending || resetCertificadoArtMutation.isPending,
    isSaving:
      saveTermoRTMutation.isPending ||
      saveCertificadoMutation.isPending ||
      resetTermoRTMutation.isPending ||
      resetCertificadoMutation.isPending,
  };
}
